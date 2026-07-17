/*
 * API verification script — wipes the local DB, boots the server on PORT=8790
 * with TURSO_* and ENABLE_ADMIN_HINT unset, and exercises the hardened auth
 * surface. Run from the server directory: `node test-api.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8790;
const BASE = `http://127.0.0.1:${PORT}`;

/* ---------- 1. wipe local database files ---------- */
const dataDir = path.join(__dirname, "data");
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) {
    if (f.startsWith("app.db")) fs.rmSync(path.join(dataDir, f), { force: true });
  }
}
console.log("wiped server/data/app.db*");

/* ---------- 2. spawn the server ---------- */
const env = {
  ...process.env,
  PORT: String(PORT),
  JWT_SECRET: process.env.JWT_SECRET || "test-only-secret-9f8e7d6c5b4a3210-fedcba0987654321",
};
delete env.TURSO_DATABASE_URL;
delete env.TURSO_AUTH_TOKEN;
delete env.ENABLE_ADMIN_HINT;

const child = spawn(process.execPath, ["index.js"], { cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d));
child.stderr.on("data", (d) => (serverLog += d));
child.on("exit", (code) => {
  if (code !== null && code !== 0 && !shuttingDown) {
    console.error(`\nServer exited unexpectedly with code ${code}.\n--- server output ---\n${serverLog}`);
    process.exit(1);
  }
});
let shuttingDown = false;

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
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
function cookieFrom(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  const raw = list.find((c) => c && c.startsWith("gd_session="));
  return raw ? raw.split(";")[0] : null;
}
const post = (path, body, headers = {}) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

/* ---------- 3. run the assertions ---------- */
try {
  await waitForServer();

  // (a) signup -> 201 + session cookie + {username, role}
  const su = await post("/api/auth/signup", { username: "alice_1", password: "password123" });
  const suBody = await su.json();
  const suCookie = cookieFrom(su);
  check("a1 signup returns 201", su.status === 201, `got ${su.status}`);
  check("a2 signup body {username, role:'user'}", suBody.username === "alice_1" && suBody.role === "user", JSON.stringify(suBody));
  check("a3 signup sets gd_session cookie", !!suCookie);

  // (b) duplicate signup -> 409 "Username is taken"
  const dup = await post("/api/auth/signup", { username: "alice_1", password: "password123" });
  const dupBody = await dup.json();
  check("b1 duplicate signup returns 409", dup.status === 409, `got ${dup.status}`);
  check("b2 duplicate error message", dupBody.error === "Username is taken", JSON.stringify(dupBody));

  // (c) short password -> 400
  const shortPw = await post("/api/auth/signup", { username: "bob_22", password: "short" });
  const shortPwBody = await shortPw.json();
  check("c1 short password returns 400", shortPw.status === 400, `got ${shortPw.status}`);
  check("c2 short password error mentions 8 chars", /at least 8/.test(shortPwBody.error || ""), JSON.stringify(shortPwBody));

  // (c2) bad usernames -> 400
  const badChars = await post("/api/auth/signup", { username: "bad name!", password: "password123" });
  check("c3 username with illegal chars returns 400", badChars.status === 400, `got ${badChars.status}`);
  const tooShort = await post("/api/auth/signup", { username: "ab", password: "password123" });
  check("c4 username too short returns 400", tooShort.status === 400, `got ${tooShort.status}`);
  const tooLong = await post("/api/auth/signup", { username: "x".repeat(25), password: "password123" });
  check("c5 username too long returns 400", tooLong.status === 400, `got ${tooLong.status}`);

  // (d) login with the new account -> 200 + cookie
  const login = await post("/api/auth/login", { username: "alice_1", password: "password123" });
  const loginBody = await login.json();
  const loginCookie = cookieFrom(login);
  check("d1 login returns 200", login.status === 200, `got ${login.status}`);
  check("d2 login body has username/role", loginBody.username === "alice_1" && loginBody.role === "user", JSON.stringify(loginBody));
  check("d3 login sets gd_session cookie", !!loginCookie);

  // (e) /api/auth/me with cookie -> 200; without cookie -> 401
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: loginCookie || "" } });
  const meBody = await me.json();
  check("e1 /api/auth/me with cookie returns 200", me.status === 200, `got ${me.status}`);
  check("e2 /api/auth/me returns username/role", meBody.username === "alice_1" && meBody.role === "user", JSON.stringify(meBody));
  const meAnon = await fetch(`${BASE}/api/auth/me`);
  check("e3 /api/auth/me without cookie returns 401", meAnon.status === 401, `got ${meAnon.status}`);

  // (f) /api/health -> {ok:true, db:"local"}
  const health = await fetch(`${BASE}/api/health`);
  const healthBody = await health.json();
  check("f1 /api/health returns 200", health.status === 200, `got ${health.status}`);
  check("f2 /api/health body {ok:true, db:'local'}", healthBody.ok === true && healthBody.db === "local", JSON.stringify(healthBody));

  // (g) admin-hint disabled -> 404
  const hint = await fetch(`${BASE}/api/auth/admin-hint`);
  check("g1 /api/auth/admin-hint returns 404 when disabled", hint.status === 404, `got ${hint.status}`);

  // security headers present on responses
  const h = health.headers;
  check("s1 X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff", h.get("x-content-type-options"));
  check("s2 X-Frame-Options: DENY", h.get("x-frame-options") === "DENY", h.get("x-frame-options"));
  check("s3 Referrer-Policy: strict-origin-when-cross-origin", h.get("referrer-policy") === "strict-origin-when-cross-origin", h.get("referrer-policy"));
  const csp = h.get("content-security-policy") || "";
  check(
    "s4 Content-Security-Policy matches spec",
    csp === "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'",
    csp
  );
  const hintHeaders = hint.headers;
  check("s5 security headers also on 404 responses", hintHeaders.get("x-frame-options") === "DENY" && !!hintHeaders.get("content-security-policy"));

  // (h) hammer login until the shared 20 req / 10 min limiter kicks in
  let got429 = false;
  let lastStatus = 0;
  let attempts = 0;
  for (let i = 0; i < 40 && !got429; i++) {
    attempts++;
    const res = await post("/api/auth/login", { username: "alice_1", password: "wrong-password" });
    lastStatus = res.status;
    if (res.status === 429) {
      got429 = true;
      const body = await res.json();
      check("h2 429 error message", body.error === "Too many attempts. Try again later.", JSON.stringify(body));
    }
  }
  check("h1 hammering login eventually returns 429", got429, `after ${attempts} attempts, last status ${lastStatus}`);
} catch (err) {
  failures++;
  console.error("FAIL  harness error:", err.message);
} finally {
  shuttingDown = true;
  child.kill("SIGTERM");
}

/* ---------- 4. summary ---------- */
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
