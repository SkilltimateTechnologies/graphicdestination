/*
 * Editable-templates API verification — wipes the local DB, boots the server
 * on PORT=8797 with TURSO_* unset, and exercises /api/templates:
 * scope gating (global = admin-only), personal ownership, upsert-on-slug,
 * built-in override semantics, data validation.
 * Run from the server directory: `node test-templates.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8797;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "test-only-secret-9f8e7d6c5b4a3210-fedcba0987654321";
const mint = (role, sub = 1) => `gd_session=${jwt.sign({ sub, username: role + "_user", role }, SECRET, { expiresIn: "1h" })}`;

const layer = (id, type = "shape") => ({ id, type, name: id, tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, w: 100, h: 100, inT: 0, outT: null, scale: 1, rotation: 0, opacity: 1 } });
const DATA = { app: "graphic-destination-motion", v: 5, stage: { w: 1280, h: 720, dur: 5000, bg: "#101218" }, objects: [layer("a"), layer("b", "text")] };
const NESTED = { objects: [{ ...layer("c", "clip"), children: [layer("c1"), layer("c2")] }] };

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
  /* user-scope rows have an owner FK → alice/bob are REAL signups (valid
     sessions, real user ids); the admin is a minted JWT (global rows carry
     owner NULL, so no FK is touched) */
  const signup = async (name) => {
    const r = await call("POST", "/api/auth/signup", { username: name, password: "password123" });
    const list = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean);
    const raw = list.find((c) => c && c.startsWith("gd_session="));
    return raw ? raw.split(";")[0] : null;
  };
  const admin = mint("admin", 1);
  const alice = await signup("tpl_alice");
  const bob = await signup("tpl_bob");
  check("signup sessions minted", !!alice && !!bob);

  /* ---- gating ---- */
  check("anon GET → 401", (await fetch(`${BASE}/api/templates`)).status === 401);
  check("user POST global → 403", (await call("POST", "/api/templates", { scope: "global", name: "G", data: DATA }, alice)).status === 403);
  check("anon POST → 401", (await call("POST", "/api/templates", { scope: "user", name: "X", data: DATA })).status === 401);

  /* ---- validation ---- */
  check("bad scope → 400", (await call("POST", "/api/templates", { scope: "moon", name: "X", data: DATA }, alice)).status === 400);
  check("no objects array → 400", (await call("POST", "/api/templates", { scope: "user", name: "X", data: { objects: [] } }, alice)).status === 400);
  check("unknown layer type → 400", (await call("POST", "/api/templates", { scope: "user", name: "X", data: { objects: [layer("a", "blob")] } }, alice)).status === 400);
  check("stage.dur out of range → 400", (await call("POST", "/api/templates", { scope: "user", name: "X", data: { ...DATA, stage: { w: 1280, h: 720, dur: 50 } } }, alice)).status === 400);

  /* ---- personal CRUD ---- */
  let aliceTpl;
  {
    const r = await call("POST", "/api/templates", { scope: "user", name: "Alice Promo", category: "Promo", description: "mine", data: NESTED }, alice);
    const body = await r.json();
    check("user POST personal → 201", r.status === 201, `got ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
    check("the row carries scope/slug/parsed data", body.scope === "user" && typeof body.slug === "string" && Array.isArray(body.data.objects), JSON.stringify(body).slice(0, 200));
    aliceTpl = body.id;
  }
  {
    const list = await (await call("GET", "/api/templates", null, alice)).json();
    check("alice sees her personal template", list.some((t) => t.id === aliceTpl));
    const bobList = await (await call("GET", "/api/templates", null, bob)).json();
    check("bob does NOT see alice's personal template", !bobList.some((t) => t.id === aliceTpl));
    check("alice cannot PUT bob-scope violation (bob id, alice cookie) — 403/404", [403, 404].includes((await call("PUT", `/api/templates/${aliceTpl}`, { name: "hijack" }, bob)).status));
    const put = await call("PUT", `/api/templates/${aliceTpl}`, { name: "Alice Promo v2" }, alice);
    check("owner PUT renames → 200", put.status === 200 && (await put.json()).name === "Alice Promo v2");
  }

  /* ---- global: admin + built-in OVERRIDE upsert ---- */
  {
    const o1 = await call("POST", "/api/templates", { scope: "global", slug: "logo-reveal", name: "Logo Reveal (agency cut)", category: "Intros", data: DATA }, admin);
    const b1 = await o1.json();
    check("admin POST global override → 201", o1.status === 201 && b1.slug === "logo-reveal" && b1.scope === "global", `got ${o1.status}`);
    const o2 = await call("POST", "/api/templates", { scope: "global", slug: "logo-reveal", name: "Logo Reveal (agency cut v2)", category: "Intros", data: NESTED }, admin);
    const b2 = await o2.json();
    check("re-POST same global slug UPSERTS (same id, updated)", o2.status === 200 && b2.id === b1.id && b2.name.includes("v2") && b2.upserted === true, `got ${o2.status} id ${b2.id} vs ${b1.id}`);
    const list = await (await call("GET", "/api/templates", null, bob)).json();
    check("bob (non-admin) SEES the global override", list.some((t) => t.id === b1.id && t.slug === "logo-reveal"));
    check("…but the list holds exactly ONE row for that slug", list.filter((t) => t.slug === "logo-reveal").length === 1);
    check("user DELETE global → 403", (await call("DELETE", `/api/templates/${b1.id}`, null, alice)).status === 403);
    check("admin DELETE global → ok", (await call("DELETE", `/api/templates/${b1.id}`, null, admin)).status === 200);
    const after = await (await call("GET", "/api/templates", null, admin)).json();
    check("the override is gone after delete", !after.some((t) => t.slug === "logo-reveal"));
  }

  /* ---- personal delete ---- */
  check("owner DELETE personal → ok", (await call("DELETE", `/api/templates/${aliceTpl}`, null, alice)).status === 200);
  check("deleting again → 404", (await call("DELETE", `/api/templates/${aliceTpl}`, null, alice)).status === 404);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  shuttingDown = true;
  child.kill();
}

console.log(`\n${failures ? failures + " FAILURE(S)" : "all template API checks passed"}`);
process.exit(failures ? 1 : 0);
