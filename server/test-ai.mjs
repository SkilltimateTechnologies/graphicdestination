/*
 * AI Studio route verification — wipes the local DB, boots the server on
 * PORT=8799 with TURSO_* unset, a budgeted usage window (GD_AI_PER_HOUR=4,
 * GD_AI_PER_DAY=10) and NO Kimi key (the deterministic fallback path), then
 * exercises /api/ai/*:
 *   · auth gating + asset ownership + image-only enforcement
 *   · fallback spec when no key is configured (provider "fallback")
 *   · per-user hourly window + app-wide daily cap (429s)
 *   · refine input validation
 * HIT MATH (the gate runs before validation; rejected-by-gate calls don't
 * count, validation-400s DO count): alice h1-3 + bob h1-3 = d6, then
 * alice h4 (edge) → h5 429-hourly, carol h1/h2 (d8/d9) → h3 → 429-daily.
 * Run from the server directory: `node test-ai.mjs`.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* ---------- wipe local database files ---------- */
const dataDir = path.join(__dirname, "data");
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) {
    if (f.startsWith("app.db")) fs.rmSync(path.join(dataDir, f), { force: true });
  }
}
console.log("wiped server/data/app.db*");

/* ---------- spawn the server (no KIMI_API_KEY → fallback path) ---------- */
const env = {
  ...process.env,
  PORT: String(PORT),
  JWT_SECRET: process.env.JWT_SECRET || "test-only-secret-9f8e7d6c5b4a3210-fedcba0987654321",
  GD_AI_PER_HOUR: "4",
  GD_AI_PER_DAY: "10",
};
delete env.TURSO_DATABASE_URL;
delete env.TURSO_AUTH_TOKEN;
delete env.ENABLE_ADMIN_HINT;
delete env.KIMI_API_KEY;
delete env.MOONSHOT_API_KEY;

const child = spawn(process.execPath, ["index.js"], { cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d));
child.stderr.on("data", (d) => (serverLog += d));
let shuttingDown = false;
child.on("exit", (code) => {
  if (code !== null && code !== 0 && !shuttingDown) {
    console.error(`\nServer exited unexpectedly with code ${code}.\n--- server output ---\n${serverLog}`);
    process.exit(1);
  }
});

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const res = await fetch(`${BASE}/api/health`); if (res.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not become ready.\n--- server output ---\n${serverLog}`);
}

/* ---------- tiny test harness ---------- */
let failures = 0;
function check(name, cond, detail = "") {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
const call = (method, p, body, cookie) =>
  fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
const signup = async (name) => {
  const r = await call("POST", "/api/auth/signup", { username: name, password: "password123" });
  const list = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean);
  const raw = list.find((c) => c && c.startsWith("gd_session="));
  return raw ? raw.split(";")[0] : null;
};

try {
  await waitForServer();
  const alice = await signup("ai_alice");
  const bob = await signup("ai_bob");
  const carol = await signup("ai_carol");
  check("signup sessions minted", !!alice && !!bob && !!carol);

  const up = await call("POST", "/api/assets", { name: "ref", mime: "image/png", dataUrl: `data:image/png;base64,${PNG_B64}` }, alice);
  const asset = await up.json();
  check("seed image asset uploaded (hardened gate)", up.status === 201 && !!asset.id, `got ${up.status}`);

  /* ---- phase A: gates + validation (budgeted: alice h1-3, bob h1-3) ---- */
  check("anon analyze → 401", (await call("POST", "/api/ai/analyze-motion", { assetId: asset.id })).status === 401);
  check("analyze SOMEONE ELSE'S asset → 404 (bob h1)", (await call("POST", "/api/ai/analyze-motion", { assetId: asset.id }, bob)).status === 404);
  check("note too long → 400 (alice h1)", (await call("POST", "/api/ai/analyze-motion", { note: "x".repeat(501) }, alice)).status === 400);
  {
    const r = await call("POST", "/api/ai/analyze-motion", { assetId: asset.id, note: "bouncy mascot" }, alice);
    const body = await r.json();
    check("analyze without a key → 200 + DETERMINISTIC fallback spec (alice h2)", r.status === 200 && body.provider === "fallback" && body.configured === false, `got ${r.status} ${body.provider}`);
    check("fallback spec is the documented default shape (v1 · dur 3000 · bob hold)", !!body.spec && body.spec.v === 1 && body.spec.dur === 3000 && body.spec.hold?.type === "bob", JSON.stringify(body.spec));
  }
  {
    const r = await call("POST", "/api/ai/refine", { spec: { dur: 3000, hold: { type: "pulse", amp: 6, period: 900 } }, instruction: "slower" }, bob);
    const body = await r.json();
    check("refine without a key → spec unchanged, provider fallback (bob h2)", r.status === 200 && body.provider === "fallback" && body.spec.hold.type === "pulse", `got ${r.status} ${body.provider}`);
  }
  check("refine without instruction → 400 (bob h3)", (await call("POST", "/api/ai/refine", { spec: { dur: 3000 }, instruction: "" }, bob)).status === 400);
  check("refine with a JUNK current spec → 400 (alice h3)", (await call("POST", "/api/ai/refine", { spec: "nope", instruction: "slower" }, alice)).status === 400);

  /* ---- phase B: usage budget — hourly edge, then the daily cap ---- */
  check("alice's 4th hourly call → 200 (window edge, d7)", (await call("POST", "/api/ai/analyze-motion", { assetId: asset.id }, alice)).status === 200);
  {
    const r = await call("POST", "/api/ai/analyze-motion", { assetId: asset.id }, alice);
    const body = await r.json();
    check("alice's 5th → 429 per-user hourly window ('per hour')", r.status === 429 && body.error.includes("per hour"), `got ${r.status} ${JSON.stringify(body)}`);
  }
  check("carol's 1st call fits the remaining daily budget → 200 (d8)", (await call("POST", "/api/ai/refine", { spec: { dur: 3000 }, instruction: "slower" }, carol)).status === 200);
  check("carol's 2nd call → 200 (d9)", (await call("POST", "/api/ai/refine", { spec: { dur: 3000 }, instruction: "slower" }, carol)).status === 200);
  check("carol's 3rd call → 200 (at the daily edge, d10)", (await call("POST", "/api/ai/refine", { spec: { dur: 3000 }, instruction: "slower" }, carol)).status === 200);
  {
    const r = await call("POST", "/api/ai/refine", { spec: { dur: 3000 }, instruction: "slower" }, carol);
    const body = await r.json();
    check("carol's 4th → 429 app-wide DAILY cap ('Daily AI budget')", r.status === 429 && body.error.includes("Daily AI budget"), `got ${r.status} ${JSON.stringify(body)}`);
  }
} catch (e) {
  console.error(e);
  failures++;
} finally {
  shuttingDown = true;
  child.kill();
}

console.log(`\n${failures ? failures + " FAILURE(S)" : "all AI route checks passed"}`);
process.exit(failures ? 1 : 0);
