/*
 * Share-link API verification script — wipes the local DB, boots the server
 * on PORT=8793 with TURSO_* unset, and exercises the public share surface:
 * POST/DELETE /api/projects/:id/share (owner-only), GET /api/share/:token
 * (public, lenient rate bucket), and the `shared` flag on the project list.
 * Run from the server directory: `node test-share.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8793;
const BASE = `http://127.0.0.1:${PORT}`;

// Minimal but realistic v5 composition (same shape the editor saves).
const PROJECT_DATA = {
  app: "graphic-destination-motion",
  v: 5,
  stage: { w: 1280, h: 720, dur: 4000, bg: "#101218" },
  brands: [],
  brandId: null,
  objects: [
    {
      id: "ob1", type: "shape", name: "Badge",
      props: { shape: "rect", x: 640, y: 360, w: 200, h: 120, fill: "#F5A524", opacity: 1, scale: 1, rotation: 0, inT: 0 },
      tracks: { x: [{ t: 0, v: 200, ease: "linear" }, { t: 4000, v: 1080, ease: "linear" }] },
    },
    {
      id: "ob2", type: "text", name: "Title",
      props: { text: "Share me", x: 640, y: 200, fontSize: 64, fill: "#E9ECF3", fontFamily: "Inter", fontWeight: 700, opacity: 1, scale: 1, rotation: 0, inT: 0 },
      tracks: {},
    },
  ],
};

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
// Every hit on the public endpoint (any status — the limiter runs before the
// handler, so even 404s consume the bucket) is counted, so the hammer check at
// the end can assert the full 120-request allowance precisely.
let shareGets = 0;
const shareGet = (path, headers = {}) => {
  shareGets++;
  return fetch(`${BASE}${path}`, { headers });
};

/* ---------- 3. run the assertions ---------- */
try {
  await waitForServer();

  // (a) signup user A + create a project
  const suA = await post("/api/auth/signup", { username: "share_alice", password: "password123" });
  const cookieA = cookieFrom(suA);
  check("a1 signup A returns 201", suA.status === 201, `got ${suA.status}`);
  check("a2 signup A sets gd_session cookie", !!cookieA);
  const authA = { Cookie: cookieA || "" };

  const mk = await post("/api/projects", { name: "Launch teaser", data: PROJECT_DATA }, authA);
  const mkBody = await mk.json();
  check("a3 create project returns 200 with id", mk.status === 200 && typeof mkBody.id === "number", `got ${mk.status}: ${JSON.stringify(mkBody)}`);
  const pid = mkBody.id;

  // (b) auth surface: enable/disable require a session
  const anonEnable = await post(`/api/projects/${pid}/share`, {});
  check("b1 POST share without cookie returns 401", anonEnable.status === 401, `got ${anonEnable.status}`);
  const anonDisable = await fetch(`${BASE}/api/projects/${pid}/share`, { method: "DELETE" });
  check("b2 DELETE share without cookie returns 401", anonDisable.status === 401, `got ${anonDisable.status}`);

  // (c) public fetch before enabling -> 404 (and unknown tokens -> 404)
  const preShare = await shareGet(`/api/share/AAAAAAAAAAAAAAAA`);
  check("c1 public GET with unknown token returns 404", preShare.status === 404, `got ${preShare.status}`);

  // (d) owner enables -> {shareToken, url}
  const en = await post(`/api/projects/${pid}/share`, {}, authA);
  const enBody = await en.json();
  check("d1 enable returns 200", en.status === 200, `got ${en.status}: ${JSON.stringify(enBody)}`);
  check("d2 token is 16 URL-safe chars", typeof enBody.shareToken === "string" && /^[A-Za-z0-9_-]{16}$/.test(enBody.shareToken), enBody.shareToken);
  check("d3 url is /p/<token>", enBody.url === `/p/${enBody.shareToken}`, enBody.url);
  const token = enBody.shareToken;

  // (e) enabling again is idempotent — same token, no rotation
  const en2 = await post(`/api/projects/${pid}/share`, {}, authA);
  const en2Body = await en2.json();
  check("e1 second enable returns 200", en2.status === 200, `got ${en2.status}`);
  check("e2 second enable returns the SAME token", en2Body.shareToken === token, `${en2Body.shareToken} vs ${token}`);

  // (f) public fetch works WITHOUT a cookie and returns only {name, data}
  const pub = await shareGet(`/api/share/${token}`);
  const pubBody = await pub.json();
  check("f1 public GET returns 200 without cookie", pub.status === 200, `got ${pub.status}: ${JSON.stringify(pubBody).slice(0, 200)}`);
  check("f2 public body is exactly {name, data}", JSON.stringify(Object.keys(pubBody).sort()) === '["data","name"]', Object.keys(pubBody).join(","));
  check("f3 public name matches the project", pubBody.name === "Launch teaser", pubBody.name);
  check("f4 public data round-trips the saved JSON", JSON.stringify(pubBody.data) === JSON.stringify(PROJECT_DATA));
  check(
    "f5 public payload leaks no ids/owner/token/timestamps",
    !["id", "owner_id", "ownerId", "share_token", "shareToken", "updated_at", "created_at", "email"].some((k) => k in pubBody || k in (pubBody.data || {})),
    Object.keys(pubBody).join(",")
  );
  // bogus cookie must not matter — the route never consults the session
  const pubBogus = await shareGet(`/api/share/${token}`, { Cookie: "gd_session=bogus" });
  check("f6 public GET ignores even an invalid cookie", pubBogus.status === 200, `got ${pubBogus.status}`);

  // (g) project list + owner GET reflect the shared state
  const list = await (await fetch(`${BASE}/api/projects`, { headers: authA })).json();
  const mine = Array.isArray(list) && list.find((p) => p.id === pid);
  check("g1 list entry exists for the project", !!mine, JSON.stringify(list));
  check("g2 list entry has shared === true (boolean)", mine && mine.shared === true, JSON.stringify(mine));
  const ownerGet = await (await fetch(`${BASE}/api/projects/${pid}`, { headers: authA })).json();
  check("g3 owner GET includes the shareToken", ownerGet.shareToken === token, JSON.stringify(Object.keys(ownerGet)));

  // (h) isolation: user B cannot enable/disable/see A's share
  const suB = await post("/api/auth/signup", { username: "share_bob", password: "password123" });
  const cookieB = cookieFrom(suB);
  check("h1 signup B returns 201", suB.status === 201, `got ${suB.status}`);
  const authB = { Cookie: cookieB || "" };
  const enB = await post(`/api/projects/${pid}/share`, {}, authB);
  check("h2 user B enabling share on A's project returns 404", enB.status === 404 || enB.status === 403, `got ${enB.status}`);
  const delB = await fetch(`${BASE}/api/projects/${pid}/share`, { method: "DELETE", headers: authB });
  check("h3 user B disabling share on A's project returns 404", delB.status === 404 || delB.status === 403, `got ${delB.status}`);
  const getB = await fetch(`${BASE}/api/projects/${pid}`, { headers: authB });
  check("h4 user B fetching A's project returns 404", getB.status === 404, `got ${getB.status}`);
  const mkB = await post("/api/projects", { name: "Bob private", data: PROJECT_DATA }, authB);
  const mkBBody = await mkB.json();
  const listB = await (await fetch(`${BASE}/api/projects`, { headers: authB })).json();
  const bobs = Array.isArray(listB) && listB.find((p) => p.id === mkBBody.id);
  check("h5 user B's own project lists shared === false", bobs && bobs.shared === false, JSON.stringify(bobs));
  const pubStill = await shareGet(`/api/share/${token}`);
  check("h6 B's failed attempts left A's link working", pubStill.status === 200, `got ${pubStill.status}`);

  // (i) disable -> public 404, list flag clears; disabling again is harmless
  const dis = await fetch(`${BASE}/api/projects/${pid}/share`, { method: "DELETE", headers: authA });
  const disBody = await dis.json();
  check("i1 owner disable returns 200 {ok:true}", dis.status === 200 && disBody.ok === true, `got ${dis.status}: ${JSON.stringify(disBody)}`);
  const gone = await shareGet(`/api/share/${token}`);
  check("i2 public GET after disable returns 404", gone.status === 404, `got ${gone.status}`);
  const list2 = await (await fetch(`${BASE}/api/projects`, { headers: authA })).json();
  const mine2 = Array.isArray(list2) && list2.find((p) => p.id === pid);
  check("i3 list entry has shared === false after disable", mine2 && mine2.shared === false, JSON.stringify(mine2));
  const dis2 = await fetch(`${BASE}/api/projects/${pid}/share`, { method: "DELETE", headers: authA });
  check("i4 second disable still returns 200 {ok:true}", dis2.status === 200, `got ${dis2.status}`);

  // (j) re-enable after disable mints a working link again
  const en3 = await post(`/api/projects/${pid}/share`, {}, authA);
  const en3Body = await en3.json();
  const pub3 = await shareGet(`/api/share/${en3Body.shareToken}`);
  check("j1 re-enable mints a working link", en3.status === 200 && pub3.status === 200, `enable ${en3.status}, fetch ${pub3.status}`);

  // (k) lenient public bucket: 120 req / 10 min / IP, separate from auth —
  //     hammering it must eventually 429 (run LAST: it exhausts this IP's bucket)
  let got429 = false;
  let lastStatus = 0;
  let okCount = 0;
  let msg = "";
  let retryAfter = null;
  for (let i = 0; i < 130 && !got429; i++) {
    const res = await shareGet(`/api/share/${en3Body.shareToken}`);
    lastStatus = res.status;
    if (res.status === 429) {
      got429 = true;
      msg = (await res.json()).error;
      retryAfter = res.headers.get("retry-after");
    } else if (res.ok) okCount++;
  }
  check("k1 hammering the public endpoint eventually returns 429", got429, `after ${okCount} OK, last status ${lastStatus}`);
  check("k2 the 120-request allowance was fully honored", shareGets >= 120, `got ${shareGets}`);
  check("k3 429 error message is the lenient one", msg === "Too many requests. Try again later.", msg);
  check("k4 429 carries a Retry-After header", !!retryAfter && Number(retryAfter) > 0, String(retryAfter));
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
