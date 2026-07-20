/**
 * check-r8w4.mjs — R8w4 full-stack browser smoke + quality-audit regression
 * pack. Spawns the REAL Express server (serving the BUILT client), drives the
 * production app in headless Chromium through the real user flows, and
 * watches the console for errors the whole way:
 *
 *   1.  LOGIN renders (brand, form, segmented mode) + real signup lands on
 *       the dashboard.
 *   2.  DASHBOARD sticky header (the R8w4 fix): a 24-project list scrolls the
 *       page while the 44px header stays pinned to the viewport top.
 *   3.  EDITOR loads the built-in demo project at /editor (Scenes + Stats
 *       clip lanes render).
 *   4.  WIDGET SWEEP on a fresh cloud project — inserts one of each: shape,
 *       text, emoji, UI element, chart, counter, confetti, map,
 *       template-as-group; every insert adds a timeline lane.
 *   5.  CANVAS TRANSFORMS (autokey always-on): move + resize + rotate a text
 *       and a shape → timeline ◆ diamonds appear on the x/y, scale and
 *       rotation lanes.
 *   6.  CLIP LANE STABILITY (one layer per row — AE/CapCut model): a clip bar
 *       dragged horizontally with a vertical wobble retimes but keeps its own
 *       lane; two clips never share a lane, so rows never reshuffle.
 *   7.  GRID toggle mounts/unmounts the export-safe canvas overlay.
 *   8.  CAMERA card "Focus here" on a selected object writes eased camera ◆.
 *   9.  SAVE control (timeline bar) persists the project; a server-side GET
 *       confirms every inserted widget type + the transform keyframes.
 *   10. EXPORT dialog opens from the top bar and closes cleanly.
 *   11. ZERO console errors / page errors across the whole run.
 *
 * Run:  npm run build && node check-r8w4.mjs        (from client/)
 * Requires: client deps + server deps + a Chromium (Playwright's or
 * /usr/bin/chromium). The server is spawned on an ephemeral port with a
 * throwaway JWT secret + its own SQLite file, and killed at the end.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, "..", "server");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — ${detail}` : ""}`); }
}

if (!fs.existsSync(path.join(here, "dist", "index.html"))) {
  console.error("run npm run build first");
  process.exit(1);
}

/* ---------- playwright + chromium resolution (same convention as the other UI checks) ---------- */
const req = createRequire(import.meta.url);
let playwright = null;
for (const base of [path.join(here, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"]) {
  try { playwright = req(req.resolve("playwright", { paths: [base] })); break; } catch { /* next */ }
}
if (!playwright) { console.error("playwright not found"); process.exit(1); }
/* admin JWT minting for the svg-icon seed (server dep, loaded from the vendored server node_modules) */
const jwt = req(req.resolve("jsonwebtoken", { paths: [path.join(here, "..", "server", "node_modules")] }));

/* ---------- spawn the real server on an ephemeral port ---------- */
const PORT = 8300 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ["index.js"], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), JWT_SECRET: "r8w4-smoke-secret" },
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

const USER = `smoke${Date.now().toString(36)}`;
const PASS = "smoke-pass-123";

async function apiFetch(p, opts = {}, cookie) {
  const r = await fetch(`${BASE}${p}`, {
    ...opts,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  });
  return r;
}

const STAGE_RECT = `(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.style.width === "1280px" && d.style.height === "720px");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, scale: r.width / 1280 };
})()`;

async function main() {
  await waitServer();
  let browser = null;
  for (const executablePath of [process.env.CHROMIUM_PATH, "/usr/bin/chromium", null].filter((p, i, a) => p !== undefined && a.indexOf(p) === i)) {
    try { browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] }); break; } catch { /* next */ }
  }
  if (!browser) throw new Error("no usable chromium found");

  const consoleErrors = [];
  const consoleWarnings = [];
  const badResponses = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    page.on("pageerror", (e) => { consoleErrors.push(String(e)); console.log("[pageerror]", String(e).slice(0, 400)); });
    page.on("console", (m) => {
      /* "Failed to load resource" is the browser's own log for HTTP errors —
         those are tracked (and allowlisted) via the response listener below;
         anything ELSE in console.error is a real app problem. */
      if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) { consoleErrors.push(m.text()); console.log("[console.error]", m.text().slice(0, 400)); }
      if (m.type() === "warning") consoleWarnings.push(m.text());
    });
    page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
    const stageRect = async () => page.evaluate(STAGE_RECT);
    const toScreen = (r, sx, sy) => ({ x: r.left + sx * r.scale, y: r.top + sy * r.scale });
    const drag = async (from, ddx, ddy) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (ddx * i) / 6, from.y + (ddy * i) / 6);
      await page.mouse.up();
      await page.waitForTimeout(140);
    };
    const laneCount = () => page.evaluate(() => document.querySelectorAll("button.gd-tl-hide").length);
    const laneNames = () => page.evaluate(() => [...document.querySelectorAll("button.gd-tl-hide")].map((b) => b.getAttribute("aria-label").replace(/^(Hide|Show) /, "")));

    /* ==================== 1. login renders + signup ==================== */
    console.log("\n#1 login page renders + signup");
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(600);
    check("login page shows the Zwoosh brand + beta badge", await page.evaluate(() => document.body.textContent.includes("Zwoosh") && document.body.textContent.includes("beta")));
    check("username + password inputs render", await page.locator("#gd-user").count() === 1 && await page.locator("#gd-pass").count() === 1);
    check("segmented Sign in / Create account toggle renders", await page.locator('button:has-text("Sign in")').count() >= 1 && await page.locator('button:has-text("Create account")').count() >= 1);
    await page.locator('button:has-text("Create account")').first().click();
    await page.locator("#gd-user").fill(USER);
    await page.locator("#gd-pass").fill(PASS);
    await page.locator("#gd-confirm").fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    check("signup signs in and lands on the dashboard", page.url().includes("/dashboard"), page.url());
    check("dashboard greets with Your projects + the signed-in username", await page.evaluate((u) => document.body.textContent.includes("Your projects") && document.body.textContent.includes(u), USER));

    /* the session cookie for the API-side assertions below */
    const cookies = await page.context().cookies(BASE);
    const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    /* ==================== 2. dashboard sticky header ==================== */
    console.log("\n#2 dashboard — sticky 44px header over a long project list");
    for (let i = 0; i < 40; i++) {
      const r = await apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name: `Scroll filler ${String(i).padStart(2, "0")}`, data: { objects: [] } }) }, cookieHdr);
      if (!r.ok) { check("seed project via API", false, `status ${r.status}`); break; }
    }
    await page.reload();
    await page.waitForTimeout(900);
    check("long list renders 40 project cards", await page.evaluate(() => document.querySelectorAll(".gd-card").length) >= 40, `${await page.evaluate(() => document.querySelectorAll(".gd-card").length)} cards`);
    const hdrSel = 'div[style*="position: sticky"]';
    check("header carries the sticky style (the R8w4 fix)", await page.locator(hdrSel).count() >= 1);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const scrollY = await page.evaluate(() => window.scrollY);
    check("page actually scrolls with 24 cards", scrollY > 40, `scrollY=${scrollY}`);
    const hdrTop = await page.evaluate(() => { const h = [...document.querySelectorAll("div")].find((d) => d.style.position === "sticky" && d.style.height === "44px"); return h ? h.getBoundingClientRect().top : null; });
    check("scrolled to the bottom → header still pinned at viewport top", hdrTop !== null && Math.abs(hdrTop) <= 1, `top=${hdrTop} scrollY=${scrollY}`);
    check("header still shows brand + Sign out while scrolled", await page.evaluate(() => { const h = [...document.querySelectorAll("div")].find((d) => d.style.position === "sticky" && d.style.height === "44px"); return !!h && h.textContent.includes("Zwoosh") && h.textContent.includes("Sign out"); }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    /* ==================== 3. editor loads the demo project ==================== */
    console.log("\n#3 editor — built-in demo project at /editor");
    await page.goto(`${BASE}/editor`);
    await page.waitForTimeout(2500); /* fonts + first paint */
    check("demo project renders its clip lanes", await page.evaluate(() => document.body.textContent.includes("Scene 2 · Stats")));
    check("top bar shows Main breadcrumb + Export", await page.locator('button:has-text("Main")').count() >= 1 && await page.locator('button:has-text("Export")').count() >= 1);
    check("stage renders at 1280×720", (await stageRect()) !== null);

    /* ==================== 6. clip lane stability + retime (demo project) ==== */
    console.log("\n#6 demo clip — bar drag retimes; lanes never reshuffle (one layer per row, AE/CapCut)");
    const statsBar = page.locator('div[title="Scene 2 · Stats · drag to retime · dbl-click to open"]');
    const introBar = page.locator('div[title="Scene 1 · Intro · drag to retime · dbl-click to open"]');
    check("both demo clip bars render in the timeline", await statsBar.count() === 1 && await introBar.count() === 1);
    const ib0 = await introBar.boundingBox();
    const sb0 = await statsBar.boundingBox();
    /* one layer per row: two clips NEVER share a lane, so a lane shows one
       label and a time move can never reshuffle rows (the old packRows
       packing is gone — pure gap/ripple math stays guarded in check-timeline) */
    check("one layer per row: Intro and Stats get their OWN lanes (no packing)", Math.abs(ib0.y - sb0.y) > 10, `intro y ${Math.round(ib0.y)} · stats y ${Math.round(sb0.y)}`);
    /* drag the INTRO bar left ~−30px with an incidental −20px vertical wobble
       across the row boundary — the bar retimes but its lane is stable */
    await drag({ x: ib0.x + ib0.width / 2, y: ib0.y + ib0.height / 2 }, -30, -20);
    const ib1 = await introBar.boundingBox();
    const sb1 = await statsBar.boundingBox();
    check("cross-row wobble: the clip retimed left", ib1.x < ib0.x - 10, `x ${Math.round(ib0.x)} → ${Math.round(ib1.x)}`);
    check("cross-row wobble: BOTH bars kept their lanes (no reshuffle)", Math.abs(ib1.y - ib0.y) <= 2 && Math.abs(sb1.y - sb0.y) <= 2, `intro y ${Math.round(ib0.y)} → ${Math.round(ib1.y)} · stats y ${Math.round(sb0.y)} → ${Math.round(sb1.y)}`);

    /* ==================== 7. grid toggle (demo project) ==================== */
    console.log("\n#7 grid toggle — export-safe canvas overlay");
    const gridBtn = page.locator("button.gd-grid-toggle");
    await gridBtn.click();
    await page.waitForTimeout(150);
    check("grid ON → overlay on canvas + persisted", await page.locator(".gd-grid-overlay").count() === 1 && await page.evaluate(() => localStorage.getItem("gd:grid") === "1"));
    await gridBtn.click();
    await page.waitForTimeout(150);
    check("grid OFF → overlay unmounted", await page.locator(".gd-grid-overlay").count() === 0);

    /* ==================== 8. camera Focus here (demo project) ============= */
    console.log("\n#8 camera card — Focus here on a selected object");
    let r = await stageRect(page);
    /* the Mexico map is the one root layer alive at t=0 — click it on the
       canvas (218,528) to select it, then Focus here */
    await page.mouse.click(toScreen(r, 218, 528).x, toScreen(r, 218, 528).y);
    await page.waitForTimeout(300);
    const focusBtn = page.locator('button:has-text("◎ Focus here")');
    check("selecting an object shows the Camera card with Focus here", await focusBtn.count() >= 1, `count=${await focusBtn.count()}`);
    await focusBtn.first().click();
    await page.waitForTimeout(300);
    check("Focus here wrote camera ◆ (lane badge shows ◆)", await page.evaluate(() => {
      const lane = document.querySelector('div[title^="Scene camera — click to select"]');
      return !!lane && /◆/.test(lane.textContent);
    }), await page.evaluate(() => { const l = document.querySelector('div[title^="Scene camera — click to select"]'); return l ? l.textContent.trim().slice(0, 40) : "no lane"; }));

    /* ==================== 4+5. fresh project — widget sweep + transforms == */
    console.log("\n#4+#5 fresh project — widget sweep + canvas transforms");
    const cr = await apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name: "Smoke sweep", data: { objects: [] } }) }, cookieHdr);
    const { id: projId } = await cr.json();
    check("created the fresh project via API", !!projId, `id=${projId}`);
    await page.goto(`${BASE}/editor/${projId}`);
    await page.waitForTimeout(2000);
    check("blank project opens with zero lanes", (await laneCount()) === 0, `${await laneCount()} lanes`);
    r = await stageRect(page);
    check("stage renders at 1280×720 in the cloud editor too", r !== null);

    const kfCount = () => page.evaluate(() => document.querySelectorAll(".gd-kf").length);

    /* --- shape: insert (auto-selected) → move + rotate + resize → ◆◆◆ --- */
    console.log("\n#5a shape — insert, then canvas move/rotate/resize");
    await page.locator('button:has(span:text-is("Shapes"))').first().click();
    await page.waitForTimeout(260);
    await page.locator('.gd-panel button[title="Rectangle"]').first().click();
    await page.waitForTimeout(320);
    check("insert shape → 1 lane, auto-selected", (await laneCount()) === 1 && (await laneNames()).some((n) => n.includes("Rectangle")), (await laneNames()).join(" · "));
    let kf = await kfCount();
    await drag(toScreen(r, 640, 360), 90, 50); /* body move */
    let kf2 = await kfCount();
    check("shape canvas MOVE wrote ◆ diamonds (x+y)", kf2 > kf, `${kf} → ${kf2}`);
    kf = kf2;
    let grip = page.locator('div[title="Drag to rotate · Shift = 15° steps"]').first();
    check("selected shape shows the rotate grip", (await grip.count()) === 1);
    let gb = await grip.boundingBox();
    await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 60, 0);
    kf2 = await kfCount();
    check("shape canvas ROTATE wrote a ◆ diamond", kf2 > kf, `${kf} → ${kf2}`);
    kf = kf2;
    grip = page.locator('div[title="Drag to resize · Shift = keep aspect"]').first();
    check("selected shape shows resize grips", (await page.locator('div[title="Drag to resize · Shift = keep aspect"]').count()) >= 4);
    gb = await grip.boundingBox();
    await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 34, 24);
    kf2 = await kfCount();
    check("shape canvas RESIZE wrote a ◆ diamond (scale track)", kf2 > kf, `${kf} → ${kf2}`);

    /* --- text: insert (auto-selected, topmost at center) → same gestures ---
       R9w3: the Text rail button opens the presets/effects drawer; the
       "Normal text" preset performs the plain center-stage insert. */
    console.log("\n#5b text — insert, then canvas move/rotate/resize");
    await page.locator('button:has(span:text-is("Text"))').first().click();
    await page.waitForTimeout(320);
    await page.locator('[data-text-panel] button[data-preset="body"]').first().click();
    await page.waitForTimeout(320);
    check("insert text → 2 lanes, auto-selected", (await laneCount()) === 2, (await laneNames()).join(" · "));
    kf = await kfCount();
    await drag(toScreen(r, 640, 360), 70, 40); /* body move — text is topmost */
    kf2 = await kfCount();
    check("text canvas MOVE wrote ◆ diamonds (x+y)", kf2 > kf, `${kf} → ${kf2}`);
    kf = kf2;
    grip = page.locator('div[title="Drag to rotate · Shift = 15° steps"]').first();
    gb = await grip.boundingBox();
    await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 50, 0);
    kf2 = await kfCount();
    check("text canvas ROTATE wrote a ◆ diamond", kf2 > kf, `${kf} → ${kf2}`);
    kf = kf2;
    grip = page.locator('div[title="Drag to resize · Shift = keep aspect"]').first();
    gb = await grip.boundingBox();
    await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 26, 18);
    kf2 = await kfCount();
    check("text canvas RESIZE wrote a ◆ diamond (scale track)", kf2 > kf, `${kf} → ${kf2}`);

    /* --- the remaining 8 widget inserts --- */
    console.log("\n#4 remaining widget inserts");
    const insert = async (label, railLabel, pickSel, expectName) => {
      const before = await laneCount();
      await page.locator(`button:has(span:text-is("${railLabel}"))`).first().click();
      await page.waitForTimeout(260);
      if (pickSel) { await page.locator(pickSel).first().click(); await page.waitForTimeout(320); }
      const after = await laneCount();
      const names = await laneNames();
      check(`insert ${label} → new lane (${before} → ${after})`, after === before + 1 && (!expectName || names.some((n) => n.toLowerCase().includes(expectName.toLowerCase()))), names.join(" · "));
    };
    /* emoji: rail → compact teaser → right arrow (browse inline) → click a card */
    {
      const before = await laneCount();
      await page.locator('button:has(span:text-is("Emoji"))').first().click();
      await page.waitForTimeout(260);
      await page.locator('[data-emoji-browse]').first().click();
      await page.waitForTimeout(320);
      await page.locator('[data-emoji-card]').first().click();
      await page.waitForTimeout(340);
      const after = await laneCount();
      check(`insert emoji → new lane (${before} → ${after})`, after === before + 1, (await laneNames()).join(" · "));
      /* emoji is a plain IMAGE now: the standard 8-way resize grips (NOT the
         clip's 4 corner clip-scale grips) — a grip drag resizes it like any
         image and writes a scale ◆ (R8w3 contract) */
      check("selected emoji shows the STANDARD resize grips (image, not clip)",
        (await page.locator('div[title="Drag to resize · Shift = keep aspect"]').count()) >= 4
        && (await page.locator('div[title="Drag to scale the whole clip uniformly"]').count()) === 0);
      kf = await kfCount();
      grip = page.locator('div[title="Drag to resize · Shift = keep aspect"]').first();
      gb = await grip.boundingBox();
      await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 30, 22);
      kf2 = await kfCount();
      check("emoji canvas RESIZE wrote a ◆ diamond (scale track)", kf2 > kf, `${kf} → ${kf2}`);
    }
    await insert("UI element", "UI", 'button[title$="as a locked, movable kit object"]');
    await insert("chart", "Charts", 'button[title$="Click to insert."]');
    await insert("counter", "Number", '.gd-panel button:has-text("Count Up")', "Count Up");
    await insert("confetti", "Confetti", 'button[title$="Click to add at the playhead."]', "Confetti");
    /* maps panel opens on the Continents tab — switch to Countries first */
    {
      const before = await laneCount();
      await page.locator('button:has(span:text-is("Maps"))').first().click();
      await page.waitForTimeout(260);
      await page.locator('button:has-text("Countries")').first().click();
      await page.waitForTimeout(260);
      await page.locator('div[title^="Insert "][title$=" map"]').first().click();
      await page.waitForTimeout(320);
      const after = await laneCount();
      check(`insert map → new lane (${before} → ${after})`, after === before + 1 && (await laneNames()).some((n) => n.includes("map")), (await laneNames()).join(" · "));
    }
    /* the Backdrop rail button was retired (engine/backdrops.js stays for
       back-compat) — the widget insert sweep ends at the map */
    /* R8w4 fix: rail panels are mutually exclusive — open the Confetti panel,
       then the Templates rail panel must REPLACE it, not stack under it */
    await page.locator('button:has(span:text-is("Confetti"))').first().click();
    await page.waitForTimeout(260);
    check("confetti panel opens from the rail", (await page.locator('.gd-panel button[title$="Click to add at the playhead."]').count()) >= 1);
    {
      const before = await laneCount();
      await page.locator('button:has(span:text-is("Templates"))').first().click();
      await page.waitForTimeout(300);
      check("R8w4: opening Templates REPLACED the Confetti panel (mutual exclusion)", (await page.locator('.gd-panel button[title$="Click to add at the playhead."]').count()) === 0 && (await page.locator(".gd-panel").count()) === 1, `${await page.locator(".gd-panel").count()} panels`);
      check("the one open panel is the Templates panel", (await page.locator('button[title$="as a movable group at the playhead"]').count()) >= 1);
      await page.locator('button[title$="as a movable group at the playhead"]').first().click();
      await page.waitForTimeout(320);
      check(`insert template-as-group → new lane (${before} → ${before + 1})`, (await laneCount()) === before + 1, (await laneNames()).join(" · "));
    }
    check("all 9 widgets inserted → 9 lanes", (await laneCount()) === 9, `${await laneCount()} lanes: ${(await laneNames()).join(" · ")}`);

    /* ==================== 8b. SVG icon library — admin store → panel → insert ==== */
    console.log("\n#8b svg icons — admin-seeded icon inserts from the Icons panel (8-way resize)");
    {
      /* seed one icon through the ADMIN route (minted admin JWT — the route's
         requireAdmin reads the role off the session, no DB user needed) */
      const adminCookie = `gd_session=${jwt.sign({ sub: 1, username: "admin", role: "admin" }, "r8w4-smoke-secret", { expiresIn: "1h" })}`;
      const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0" fill="none" stroke="#F5A524" stroke-width="2"/></svg>';
      const iconName = `Pulse ${Date.now().toString(36)}`; /* unique per run — the dev DB keeps earlier seeds */
      const seed = await apiFetch("/api/svg-icons", { method: "POST", body: JSON.stringify({ name: iconName, category: "Indicators", tags: ["pulse"], svg: ICON_SVG }) }, adminCookie);
      check("admin seeds an SVG icon → 201 (sanitized)", seed.status === 201, `got ${seed.status}`);
      const before = await laneCount();
      await page.locator('button:has(span:text-is("Icons"))').first().click();
      await page.waitForTimeout(600); /* panel fetches /api/svg-icons */
      await page.locator('[data-icons-panel] input[placeholder="Search icons…"]').fill(iconName);
      await page.waitForTimeout(250);
      check("Icons panel lists the seeded icon (search-filtered)", (await page.locator("[data-svg-icon-card]").count()) === 1, `${await page.locator("[data-svg-icon-card]").count()} cards`);
      await page.locator("[data-svg-icon-card]").first().click();
      await page.waitForTimeout(340);
      check(`insert svg icon → new lane (${before} → ${before + 1})`, (await laneCount()) === before + 1, (await laneNames()).join(" · "));
      /* plain image layer: standard 8-way grips, resize writes a scale ◆ */
      check("selected svg icon shows the STANDARD resize grips (image, not clip)",
        (await page.locator('div[title="Drag to resize · Shift = keep aspect"]').count()) >= 4);
      kf = await kfCount();
      grip = page.locator('div[title="Drag to resize · Shift = keep aspect"]').first();
      gb = await grip.boundingBox();
      await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 26, 20);
      kf2 = await kfCount();
      check("svg icon canvas RESIZE wrote a ◆ diamond (scale track)", kf2 > kf, `${kf} → ${kf2}`);
    }

    /* ==================== 9. save control → server persistence ============ */
    console.log("\n#9 timeline save control → server persistence");
    const saveBtn = page.locator("button.gd-tl-save");
    check("save control is dirty after all the edits", (await saveBtn.getAttribute("data-state")) === "dirty", await saveBtn.textContent());
    await saveBtn.click();
    await page.waitForTimeout(900);
    check("save control settles to saved", (await saveBtn.getAttribute("data-state")) === "saved", await saveBtn.textContent());
    const gr = await apiFetch(`/api/projects/${projId}`, {}, cookieHdr);
    const saved = gr.ok ? (await gr.json()).data : null;
    const types = saved ? saved.objects.map((o) => o.type) : [];
    check("server-side GET returns the saved project", !!saved && Array.isArray(saved.objects), gr.status);
    for (const t of ["shape", "text", "image", "kit", "chart", "number", "confetti", "map", "clip"]) {
      check(`saved project contains a ${t}`, types.includes(t), types.join(","));
    }
    const savedShape = saved && saved.objects.find((o) => o.type === "shape");
    check("saved shape carries x/y keyframes from the canvas drag", !!savedShape && (savedShape.tracks.x || []).length >= 1 && (savedShape.tracks.y || []).length >= 1, JSON.stringify({ x: savedShape?.tracks.x, y: savedShape?.tracks.y }));
    check("saved shape carries rotation + scale keyframes", !!savedShape && (savedShape.tracks.rotation || []).length >= 1 && (savedShape.tracks.scale || []).length >= 1, JSON.stringify({ r: savedShape?.tracks.rotation, s: savedShape?.tracks.scale }));
    const savedText = saved && saved.objects.find((o) => o.type === "text");
    check("saved text carries canvas-drag keyframes", !!savedText && Object.keys(savedText.tracks).length >= 1, JSON.stringify(savedText?.tracks));

    /* ==================== 10. export dialog =============================== */
    console.log("\n#10 export dialog");
    await page.locator('button:has-text("Export")').first().click();
    await page.waitForTimeout(500);
    check("export dialog opens with the Export video heading", await page.evaluate(() => document.body.textContent.includes("Export video")));
    const escClose = await page.evaluate(() => document.body.textContent.includes("Export video"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const stillOpen = await page.evaluate(() => document.body.textContent.includes("Export video"));
    check("export dialog closes (Escape)", escClose && !stillOpen);

    /* ==================== 11. console watch =============================== */
    console.log("\n#11 console watch");
    check("zero page errors + app console errors across the whole run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");
    /* the only >=400 responses allowed are the two deliberate probes: the
       pre-login /api/auth/me 401 (session check) and the /api/auth/admin-hint
       404 (the endpoint is intentionally unregistered unless ENABLE_ADMIN_HINT=1) */
    const unexpected = badResponses.filter((s) => !s.includes("/api/auth/me") && !s.includes("/api/auth/admin-hint"));
    check("only the deliberate 401/404 auth probes fail over HTTP", unexpected.length === 0, unexpected.slice(0, 3).join(" | ") || `allowlisted: ${badResponses.length} probes`);
    check("the auth probes stayed within expectations (me 401 · hint 404)",
      badResponses.every((s) => (s.includes("/api/auth/me") && s.startsWith("401")) || (s.includes("/api/auth/admin-hint") && s.startsWith("404"))),
      badResponses.join(" | ") || "none");
    if (consoleWarnings.length) console.log(`  (info: ${consoleWarnings.length} console warnings — first: ${consoleWarnings[0].slice(0, 160)})`);

    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); failures++; })
  .finally(() => {
    srv.kill();
    console.log(`\n${failures ? failures + " FAILURE(S)" : "all r8w4 full-stack smoke checks passed"}`);
    process.exit(failures ? 1 : 0);
  });
