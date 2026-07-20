/**
 * check-studio.mjs — browser proof for the AI Asset Studio page (/studio):
 *   1. upload a reference through the hardened asset path → it previews
 *   2. Generate motion → the fallback provider (no API key) returns the
 *      deterministic default spec; the spec panel + clip preview appear
 *   3. direct controls PATCH the spec (hold-type select changes hold.type)
 *   4. chat refine without a key → honest "unchanged" note (no fake motion)
 *   5. Undo restores the pre-control spec
 * Full-stack: real Express (serving the built client) + headless Chromium,
 * exactly like check-r8w4. Run:  npm run build && node check-studio.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, "..", "server");
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let failures = 0;
function check(name, cond, detail = "") {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL "}${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

/* ---------- wipe the dev DB (fresh users per run) ---------- */
const dataDir = path.join(serverDir, "data");
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) if (f.startsWith("app.db")) fs.rmSync(path.join(dataDir, f), { force: true });
}

/* ---------- playwright ---------- */
const req = createRequire(import.meta.url);
let playwright = null;
for (const base of [path.join(here, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"]) {
  try { playwright = req(req.resolve("playwright", { paths: [base] })); break; } catch { /* next */ }
}
if (!playwright) { console.error("playwright not found"); process.exit(1); }

/* ---------- server on an ephemeral port (NO Kimi key → fallback path) ---------- */
const PORT = 8300 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ["index.js"], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), JWT_SECRET: "studio-smoke-secret", KIMI_API_KEY: "", MOONSHOT_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not come up");
}

async function main() {
  await waitServer();
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 800 } });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 200)));
  try {
    /* signup → the studio route opens (protected) */
    const user = `studio${Date.now().toString(36)}`;
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(700);
    await page.locator('button:has-text("Create account")').first().click();
    await page.locator("#gd-user").fill(user);
    await page.locator("#gd-pass").fill("studio-pass-123");
    await page.locator("#gd-confirm").fill("studio-pass-123");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.goto(`${BASE}/studio`);
    await page.waitForTimeout(800);
    check("the studio page renders for a signed-in user", await page.evaluate(() => document.body.textContent.includes("AI Asset Studio")));

    /* upload a reference through the hardened path */
    await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: Buffer.from(PNG_B64, "base64") });
    await page.waitForFunction(() => !document.body.textContent.includes("Uploading…") && !!document.querySelector("img"), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    check("the uploaded reference previews", (await page.locator('img[alt="ref.png"], img[alt="ref"]').count()) >= 1 || (await page.locator("img").count()) >= 1);

    /* generate → fallback provider + deterministic spec + preview */
    await page.locator("[data-studio-generate]").click();
    await page.waitForFunction(() => !!document.querySelector("[data-studio-provider]"), null, { timeout: 9000 }).catch(() => {});
    check("Generate produces a spec (fallback provider, no key)", (await page.locator("[data-studio-provider]").count()) === 1 && (await page.locator("[data-studio-provider]").textContent()).includes("Fallback"));
    check("the preview mounts the built clip", await page.evaluate(() => !document.body.textContent.includes("Generate motion — the spec plays here instantly.")));
    const specOf = (sel) => page.locator(sel).inputValue();
    check("the spec starts with bob hold motion", (await specOf("[data-studio-hold]")) === "bob");

    /* direct control patches the spec */
    await page.locator("[data-studio-hold]").selectOption("spin");
    await page.waitForTimeout(300);
    check("the Motion control patches the spec (bob → spin)", (await specOf("[data-studio-hold]")) === "spin");

    /* chat refine without a key → honest unchanged note */
    await page.locator('input[placeholder*="Refine"]').fill("make it gentler");
    await page.locator("[data-studio-refine]").click();
    await page.waitForTimeout(700);
    check("refine without a key says the spec is unchanged (no fake motion)", await page.evaluate(() => document.body.textContent.includes("spec is unchanged")));
    check("…and the spec really didn't move (still spin)", (await specOf("[data-studio-hold]")) === "spin");

    /* undo restores the pre-control spec */
    await page.locator("[data-studio-undo]").click();
    await page.waitForTimeout(300);
    check("Undo restores the pre-control spec (back to bob)", (await specOf("[data-studio-hold]")) === "bob");

    /* ==================== save to Templates → insert in the editor ========== */
    console.log("\nsave-to-templates — the spec lands as a personal template, insertable");
    const tplName = `Studio Asset ${Date.now().toString(36)}`;
    await page.locator('input[placeholder="Name it — save as a template…"]').fill(tplName);
    await page.locator("[data-studio-save]").click();
    await page.waitForFunction(() => document.body.textContent.includes("find it in the editor's Templates panel"), null, { timeout: 8000 }).catch(() => {});
    check("save-to-templates confirms in the studio", await page.evaluate(() => document.body.textContent.includes("find it in the editor's Templates panel")));
    /* server-side: the row is personal + round-trips a real clip */
    const cookies = await page.context().cookies(BASE);
    const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const apiFetch = (p, opts = {}) => fetch(`${BASE}${p}`, { ...opts, headers: { "content-type": "application/json", cookie: cookieHdr, ...(opts.headers || {}) } });
    const rows = await (await apiFetch("/api/templates")).json();
    const row = rows.find((t) => t.name === tplName);
    check("server-side: a PERSONAL template row exists", !!row && row.scope === "user", rows.map((t) => `${t.scope}:${t.name}`).join(" · "));
    check("the stored template carries the motion clip (objects + stage.dur)", !!row && Array.isArray(row.data.objects) && row.data.objects.length === 1 && row.data.objects[0].type === "image" && row.data.stage.dur === 3000);
    /* full loop: a fresh cloud project → Templates panel → the Mine card inserts */
    const cr = await apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name: "Studio loop", data: { objects: [] } }) });
    const { id: projId } = await cr.json();
    await page.goto(`${BASE}/editor/${projId}`);
    await page.waitForTimeout(2000);
    await page.locator('button:has(span:text-is("Templates"))').first().click();
    await page.waitForTimeout(800);
    check("the editor's Templates panel shows the Mine badge on the studio asset", (await page.locator('[data-tpl-badge="Mine"]').count()) >= 1);
    await page.locator('.gd-panel input[placeholder="Search templates…"]').fill(tplName);
    await page.waitForTimeout(300);
    await page.locator('.gd-panel button', { hasText: tplName }).first().click();
    await page.waitForTimeout(400);
    check("inserting the studio asset adds a lane (full loop)", await page.evaluate(() => document.querySelectorAll("button.gd-tl-hide").length === 1), `${await page.evaluate(() => document.querySelectorAll("button.gd-tl-hide").length)} lanes`);

    check("zero page errors across the studio run", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | ") || "clean");
  } finally {
    await browser.close();
    srv.kill();
  }
  console.log(`\n${failures ? failures + " FAILURE(S)" : "all studio checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
