/*
 * SVG-icon API verification — wipes the local DB, boots the server on
 * PORT=8796 with TURSO_* unset, and exercises /api/svg-icons:
 * admin-only writes, sanitizer-before-store, list reads for any user.
 * Run from the server directory: `node test-svg-icons.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "test-only-secret-9f8e7d6c5b4a3210-fedcba0987654321";
const mint = (role, sub = 1) => `gd_session=${jwt.sign({ sub, username: role + "_user", role }, SECRET, { expiresIn: "1h" })}`;

const CLEAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0" fill="none" stroke="#F5A524" stroke-width="2"/></svg>`;
const EVIL = `<svg viewBox="0 0 24 24"><script>alert(document.cookie)</script><rect width="4" height="4" onclick="steal()"/></svg>`;

/* ---------- wipe local database files ---------- */
const dataDir = path.join(__dirname, "data");
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) {
    if (f.startsWith("app.db")) fs.rmSync(path.join(dataDir, f), { force: true });
  }
}
console.log("wiped server/data/app.db*");

/* ---------- spawn the server ---------- */
const env = { ...process.env, PORT: String(PORT), JWT_SECRET: SECRET };
delete env.TURSO_DATABASE_URL;
delete env.TURSO_AUTH_TOKEN;
delete env.ENABLE_ADMIN_HINT;

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

try {
  await waitForServer();
  const admin = { "Content-Type": "application/json", Cookie: mint("admin") };
  const user = { "Content-Type": "application/json", Cookie: mint("user", 2) };

  /* ---- auth gating ---- */
  check("anon POST → 401", (await call("POST", "/api/svg-icons", { name: "x", svg: CLEAN })).status === 401);
  check("non-admin POST → 403", (await call("POST", "/api/svg-icons", { name: "x", svg: CLEAN }, user.Cookie)).status === 403);
  check("anon GET list → 401", (await fetch(`${BASE}/api/svg-icons`)).status === 401);

  /* ---- validation ---- */
  check("missing name → 400", (await call("POST", "/api/svg-icons", { svg: CLEAN }, admin.Cookie)).status === 400);
  check("missing svg → 400", (await call("POST", "/api/svg-icons", { name: "x" }, admin.Cookie)).status === 400);
  check("bad motion → 400", (await call("POST", "/api/svg-icons", { name: "x", svg: CLEAN, motion: "wild" }, admin.Cookie)).status === 400);
  {
    const r = await call("POST", "/api/svg-icons", { name: "x", svg: `<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>` }, admin.Cookie);
    check("script-only svg → 422 sanitizer rejection", r.status === 422, `got ${r.status}`);
  }

  /* ---- create: sanitizer runs BEFORE store ---- */
  let id;
  {
    const r = await call("POST", "/api/svg-icons", { name: "Pulse ring", category: "Indicators", tags: ["pulse", "ring"], svg: EVIL, motion: "engine" }, admin.Cookie);
    const body = await r.json();
    check("admin POST → 201", r.status === 201, `got ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
    check("stored svg carries NO script/handlers", !!body.svg && !/script|onclick/i.test(body.svg), body.svg);
    check("the renderable rect survived sanitization", !!body.svg && body.svg.includes("<rect"), body.svg);
    check("sanitizer report lists the drops", Array.isArray(body.sanitized) && body.sanitized.includes("script"), JSON.stringify(body.sanitized));
    check("meta round-trips (name/category/tags/motion)", body.name === "Pulse ring" && body.category === "Indicators" && body.tags.join() === "pulse,ring" && body.motion === "engine", JSON.stringify(body));
    id = body.id;
  }

  /* ---- list: any signed-in user ---- */
  {
    const r = await fetch(`${BASE}/api/svg-icons`, { headers: { Cookie: user.Cookie } });
    const list = await r.json();
    check("user GET list → 200 with the icon", r.status === 200 && Array.isArray(list) && list.some((i) => i.id === id), `got ${r.status}`);
  }

  /* ---- update: admin only, re-sanitizes ---- */
  check("non-admin PUT → 403", (await call("PUT", `/api/svg-icons/${id}`, { name: "nope" }, user.Cookie)).status === 403);
  {
    const r = await call("PUT", `/api/svg-icons/${id}`, { name: "Pulse ring v2", svg: EVIL.replace("rect", "circle") }, admin.Cookie);
    const body = await r.json();
    check("admin PUT → 200, renamed + re-sanitized", r.status === 200 && body.name === "Pulse ring v2" && !/script|onclick/i.test(body.svg), JSON.stringify(body).slice(0, 200));
  }

  /* ---- delete: admin only ---- */
  check("non-admin DELETE → 403", (await call("DELETE", `/api/svg-icons/${id}`, null, user.Cookie)).status === 403);
  {
    const r = await call("DELETE", `/api/svg-icons/${id}`, null, admin.Cookie);
    check("admin DELETE → 200 ok", r.status === 200, `got ${r.status}`);
    const list = await (await fetch(`${BASE}/api/svg-icons`, { headers: { Cookie: user.Cookie } })).json();
    check("the icon is gone from the list", !list.some((i) => i.id === id));
    check("deleting again → 404", (await call("DELETE", `/api/svg-icons/${id}`, null, admin.Cookie)).status === 404);
  }
} catch (e) {
  console.error(e);
  failures++;
} finally {
  shuttingDown = true;
  child.kill();
}

console.log(`\n${failures ? failures + " FAILURE(S)" : "all svg-icon API checks passed"}`);
process.exit(failures ? 1 : 0);
