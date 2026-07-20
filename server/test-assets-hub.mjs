/*
 * Uploads-hub hardening + scoping verification — wipes the local DB, boots
 * the server on PORT=8798 with TURSO_* unset, and exercises the hardened
 * asset pipeline:
 *   · magic-byte sniffing (declared mime is a hint; bytes must verify)
 *   · X-Content-Type-Options: nosniff on served bytes
 *   · optional project scoping (upload with projectId, ?project= filter)
 * Run from the server directory: `node test-assets-hub.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]); /* JFIF header */
const MP4_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypM4A "), Buffer.alloc(64, 1)]);
const WAV_BYTES = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVEfmt "), Buffer.alloc(32, 0)]);
const durl = (mime, bytes) => `data:${mime};base64,${Buffer.isBuffer(bytes) ? bytes.toString("base64") : bytes}`;

/* ---------- wipe local database files ---------- */
const dataDir = path.join(__dirname, "data");
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) {
    if (f.startsWith("app.db")) fs.rmSync(path.join(dataDir, f), { force: true });
  }
}
console.log("wiped server/data/app.db*");

/* ---------- spawn the server ---------- */
const env = { ...process.env, PORT: String(PORT), JWT_SECRET: process.env.JWT_SECRET || "test-only-secret-9f8e7d6c5b4a3210-fedcba0987654321" };
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
const signup = async (name) => {
  const r = await call("POST", "/api/auth/signup", { username: name, password: "password123" });
  const list = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean);
  const raw = list.find((c) => c && c.startsWith("gd_session="));
  return raw ? raw.split(";")[0] : null;
};

try {
  await waitForServer();
  const alice = await signup("hub_alice");
  check("signup session minted", !!alice);

  /* ---- magic-byte sniffing ---- */
  {
    const r = await call("POST", "/api/assets", { name: "real", mime: "image/png", dataUrl: durl("image/png", PNG_B64) }, alice);
    check("real PNG → 201, sniffed mime image/png", r.status === 201 && (await r.json()).mime === "image/png", `got ${r.status}`);
  }
  {
    const r = await call("POST", "/api/assets", { name: "mislabeled", mime: "image/png", dataUrl: durl("image/png", JPEG_BYTES) }, alice);
    const body = await r.json();
    check("declared png but JPEG bytes → stored as image/jpeg (sniffed wins)", r.status === 201 && body.mime === "image/jpeg", `${r.status} ${body.mime}`);
  }
  {
    const r = await call("POST", "/api/assets", { name: "garbage", mime: "image/png", dataUrl: durl("image/png", Buffer.from("definitely-not-an-image")) }, alice);
    check("unverifiable bytes → 415", r.status === 415, `got ${r.status}`);
  }
  {
    const r = await call("POST", "/api/assets", { name: "spoof", mime: "audio/wav", dataUrl: durl("audio/wav", PNG_B64) }, alice);
    check("cross-family spoof (audio declared, image bytes) → 415", r.status === 415, `got ${r.status}`);
  }
  {
    const fakeMp4 = Buffer.alloc(1024, 3);
    const bad = await call("POST", "/api/assets", { name: "fake", mime: "audio/mp4", dataUrl: durl("audio/mp4", fakeMp4) }, alice);
    check("audio/mp4 WITHOUT ftyp → 415", bad.status === 415, `got ${bad.status}`);
    const good = await call("POST", "/api/assets", { name: "real-mp4", mime: "audio/mp4", dataUrl: durl("audio/mp4", MP4_BYTES) }, alice);
    check("audio/mp4 WITH ftyp → 201", good.status === 201, `got ${good.status}`);
  }
  {
    const r = await call("POST", "/api/assets", { name: "beep", mime: "audio/wav", dataUrl: durl("audio/wav", WAV_BYTES) }, alice);
    check("real WAV → 201, kind audio", r.status === 201 && (await r.json()).kind === "audio", `got ${r.status}`);
  }

  /* ---- safe serving ---- */
  {
    const list = await (await call("GET", "/api/assets", null, alice)).json();
    const img = list.find((a) => a.name === "real");
    const r = await fetch(`${BASE}/api/assets/${img.id}`, { headers: { Cookie: alice } });
    check("served bytes carry X-Content-Type-Options: nosniff", r.headers.get("x-content-type-options") === "nosniff", r.headers.get("x-content-type-options"));
    check("…and the content stays the declared image type", r.headers.get("content-type") === "image/png", r.headers.get("content-type"));
  }

  /* ---- project scoping ---- */
  {
    const mk = await call("POST", "/api/projects", { name: "Hub Project", data: { objects: [] } }, alice);
    const proj = await mk.json();
    check("project created for scoping", !!proj.id, JSON.stringify(proj).slice(0, 120));
    const scoped = await call("POST", "/api/assets", { name: "scoped-png", mime: "image/png", dataUrl: durl("image/png", PNG_B64), projectId: proj.id }, alice);
    const scopedBody = await scoped.json();
    check("upload with projectId → 201 + projectId echoed", scoped.status === 201 && scopedBody.projectId === proj.id, `${scoped.status} ${JSON.stringify(scopedBody)}`);
    const inProj = await (await call("GET", `/api/assets?project=${proj.id}`, null, alice)).json();
    check("?project= filter returns only the scoped asset", inProj.length === 1 && inProj[0].name === "scoped-png", `${inProj.length} rows`);
    const all = await (await call("GET", "/api/assets", null, alice)).json();
    check("the unfiltered list still returns everything (cross-project search base)", all.length > inProj.length, `${all.length} vs ${inProj.length}`);
    const bob = await signup("hub_bob");
    const foreign = await call("POST", "/api/assets", { name: "x", mime: "image/png", dataUrl: durl("image/png", PNG_B64), projectId: proj.id }, bob);
    check("scoping to SOMEONE ELSE'S project → 403", foreign.status === 403, `got ${foreign.status}`);
  }
} catch (e) {
  console.error(e);
  failures++;
} finally {
  shuttingDown = true;
  child.kill();
}

console.log(`\n${failures ? failures + " FAILURE(S)" : "all uploads-hub checks passed"}`);
process.exit(failures ? 1 : 0);
