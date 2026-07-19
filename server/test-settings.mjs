/*
 * Settings API verification (R9w3) — wipes the local DB, boots the server on
 * PORT=8795 with TURSO_* unset, and exercises the per-user settings surface:
 *
 *   · auth: GET/PUT /api/settings reject anonymous callers (401)
 *   · defaults: a fresh account reads the empty default document
 *   · round-trip: signup → PUT (brand kits + text styles + defaultBg) → GET
 *     returns the sanitized document byte-for-byte
 *   · persistence: the document survives a full server restart (SQLite file)
 *   · schema caps: bad shapes/hex/sizes → 400, oversize document → 413,
 *     unknown keys are stripped, unknown text-style tiers dropped
 *   · isolation: a second user never sees the first user's settings
 *
 * Run from the server directory: `node test-settings.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8795;
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

let child = null;
let serverLog = "";
let shuttingDown = false;

function boot() {
  child = spawn(process.execPath, ["index.js"], { cwd: __dirname, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => (serverLog += d));
  child.stderr.on("data", (d) => (serverLog += d));
  child.on("exit", (code) => {
    if (code !== null && code !== 0 && !shuttingDown) {
      console.error(`\nServer exited unexpectedly with code ${code}.\n--- server output ---\n${serverLog}`);
      process.exit(1);
    }
  });
}

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
let count = 0;
function check(name, cond, detail = "") {
  count++;
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}
function cookieFrom(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  const raw = list.find((c) => c && c.startsWith("gd_session="));
  return raw ? raw.split(";")[0] : null;
}
const req = (method, path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const KIT_A = { id: "acme", name: "Acme Corp", primary: "#FF6B6B", accent: "#5B8CFF", textColor: "#F9F9F9", headingFont: "Space Grotesk", bodyFont: "Inter" };
const KIT_B = { id: "neon", name: "Neon Nights", primary: "#C084FC", accent: "#6EE7B7", textColor: "#FFFFFF", headingFont: "Bebas Neue", bodyFont: "Montserrat", logo: "data:image/png;base64,iVBORw0KGgo=" };
const DOC = {
  v: 1,
  brandKits: [KIT_A, KIT_B],
  textStyles: {
    heading: { fontFamily: "Space Grotesk", fontSize: 84, fontWeight: 700 },
    subheading: { fontFamily: "Oswald", fontSize: 40, fontWeight: 600 },
    body: { fontFamily: "Inter", fontSize: 24, fontWeight: 400 },
    caption: { fontFamily: "JetBrains Mono", fontSize: 14, fontWeight: 500 },
  },
  defaultBg: "#0B0E13",
};

/* ---------- 3. run the assertions ---------- */
try {
  boot();
  await waitForServer();

  // (a) auth gate
  const anonGet = await req("GET", "/api/settings");
  check("a1 GET /api/settings without auth → 401", anonGet.status === 401, `got ${anonGet.status}`);
  const anonPut = await req("PUT", "/api/settings", DOC);
  check("a2 PUT /api/settings without auth → 401", anonPut.status === 401, `got ${anonPut.status}`);

  // (b) signup → session cookie
  const su = await req("POST", "/api/auth/signup", { username: "set_user1", password: "password123" });
  const cookie = cookieFrom(su);
  check("b1 signup returns 201", su.status === 201, `got ${su.status}`);
  check("b2 signup sets gd_session cookie", !!cookie);

  // (c) fresh account reads the default document
  const d0 = await req("GET", "/api/settings", undefined, cookie);
  const d0Body = await d0.json();
  check("c1 initial GET returns 200", d0.status === 200, `got ${d0.status}`);
  check("c2 default doc shape {v:1, brandKits:[], textStyles:null, defaultBg:null}",
    d0Body.v === 1 && Array.isArray(d0Body.brandKits) && d0Body.brandKits.length === 0 && d0Body.textStyles === null && d0Body.defaultBg === null,
    JSON.stringify(d0Body));

  // (d) full round-trip: PUT the rich document → GET returns it sanitized
  const put1 = await req("PUT", "/api/settings", DOC, cookie);
  const put1Body = await put1.json();
  check("d1 PUT valid settings returns 200", put1.status === 200, `got ${put1.status}`);
  check("d2 PUT echoes {ok:true, settings}", put1Body.ok === true && !!put1Body.settings, JSON.stringify(put1Body).slice(0, 120));
  const g1 = await req("GET", "/api/settings", undefined, cookie);
  const g1Body = await g1.json();
  check("d3 GET round-trips both brand kits in order", g1Body.brandKits.length === 2 && g1Body.brandKits[0].id === "acme" && g1Body.brandKits[1].id === "neon", JSON.stringify(g1Body.brandKits?.map((k) => k.id)));
  check("d4 kit fields survive exactly (name/colors/fonts)",
    g1Body.brandKits[0].name === KIT_A.name && g1Body.brandKits[0].primary === KIT_A.primary && g1Body.brandKits[0].accent === KIT_A.accent &&
    g1Body.brandKits[0].textColor === KIT_A.textColor && g1Body.brandKits[0].headingFont === KIT_A.headingFont && g1Body.brandKits[0].bodyFont === KIT_A.bodyFont);
  check("d5 optional logo persists", g1Body.brandKits[1].logo === KIT_B.logo);
  check("d6 kits without a logo carry no logo key", !("logo" in g1Body.brandKits[0]));
  check("d7 text styles round-trip all four tiers",
    g1Body.textStyles.heading.fontSize === 84 && g1Body.textStyles.subheading.fontFamily === "Oswald" &&
    g1Body.textStyles.body.fontWeight === 400 && g1Body.textStyles.caption.fontFamily === "JetBrains Mono");
  check("d8 defaultBg round-trips", g1Body.defaultBg === "#0B0E13");

  // (e) update semantics: second PUT replaces the whole document
  const DOC2 = { v: 1, brandKits: [{ ...KIT_A, name: "Acme Rebrand" }], textStyles: null, defaultBg: "" };
  const put2 = await req("PUT", "/api/settings", DOC2, cookie);
  check("e1 second PUT returns 200", put2.status === 200, `got ${put2.status}`);
  const g2 = await req("GET", "/api/settings", undefined, cookie);
  const g2Body = await g2.json();
  check("e2 update replaces kits (one renamed kit)", g2Body.brandKits.length === 1 && g2Body.brandKits[0].name === "Acme Rebrand", JSON.stringify(g2Body.brandKits));
  check("e3 cleared textStyles reads back null", g2Body.textStyles === null);
  check("e4 empty-string defaultBg reads back null (none selected → client falls back to black)", g2Body.defaultBg === null);

  // (f) schema validation — malformed documents are rejected with 400
  const bad1 = await req("PUT", "/api/settings", { brandKits: "nope" }, cookie);
  check("f1 brandKits not an array → 400", bad1.status === 400, `got ${bad1.status}`);
  const bad2 = await req("PUT", "/api/settings", { brandKits: [{ ...KIT_A, primary: "red" }] }, cookie);
  check("f2 non-hex kit color → 400", bad2.status === 400, `got ${bad2.status}`);
  const bad3 = await req("PUT", "/api/settings", { brandKits: [{ ...KIT_A, name: "" }] }, cookie);
  check("f3 empty kit name → 400", bad3.status === 400, `got ${bad3.status}`);
  const bad4 = await req("PUT", "/api/settings", { brandKits: [{ ...KIT_A, name: "x".repeat(61) }] }, cookie);
  check("f4 61-char kit name → 400", bad4.status === 400, `got ${bad4.status}`);
  const bad5 = await req("PUT", "/api/settings", { textStyles: { heading: { fontFamily: "Inter", fontSize: 500, fontWeight: 700 } } }, cookie);
  check("f5 fontSize 500 (out of 6..400) → 400", bad5.status === 400, `got ${bad5.status}`);
  const bad6 = await req("PUT", "/api/settings", { textStyles: { body: { fontFamily: "Inter", fontSize: 24, fontWeight: 450 } } }, cookie);
  check("f6 fontWeight 450 (not x100) → 400", bad6.status === 400, `got ${bad6.status}`);
  const bad7 = await req("PUT", "/api/settings", { defaultBg: "blue" }, cookie);
  check("f7 non-hex defaultBg → 400", bad7.status === 400, `got ${bad7.status}`);
  const tooMany = { brandKits: Array.from({ length: 25 }, (_, i) => ({ ...KIT_A, id: `k${i}`, name: `Kit ${i}` })) };
  const bad8 = await req("PUT", "/api/settings", tooMany, cookie);
  check("f8 25 brand kits (over the 24 cap) → 400", bad8.status === 400, `got ${bad8.status}`);
  const bad9 = await req("PUT", "/api/settings", { brandKits: [{ ...KIT_A, logo: `data:image/png;base64,${"A".repeat(130 * 1024)}` }] }, cookie);
  check("f9 logo over the 120 KB cap → 400", bad9.status === 400, `got ${bad9.status}`);
  const bad10 = await req("PUT", "/api/settings", { defaultBg: "#101218", junk: "x".repeat(300 * 1024) }, cookie);
  check("f10 oversize incoming payload → 413", bad10.status === 413, `got ${bad10.status}`);
  const notObj = await req("PUT", "/api/settings", [1, 2, 3], cookie);
  check("f11 array body → 400", notObj.status === 400, `got ${notObj.status}`);

  // (g) unknown keys are stripped, unknown tiers dropped, missing kit id repaired
  const messy = await req("PUT", "/api/settings", {
    v: 99, hacker: true,
    brandKits: [{ name: "No Id", primary: "#123456", accent: "#abc", textColor: "#FFFFFF", headingFont: "Inter", bodyFont: "Inter", extra: "drop me" }],
    textStyles: { heading: { fontFamily: "Inter", fontSize: 30, fontWeight: 600 }, footer: { fontFamily: "Inter", fontSize: 10, fontWeight: 400 } },
  }, cookie);
  check("g1 messy-but-valid document accepted", messy.status === 200, `got ${messy.status}`);
  const g3 = await (await req("GET", "/api/settings", undefined, cookie)).json();
  check("g2 unknown top-level keys stripped", !("hacker" in g3) && g3.v === 1, JSON.stringify(Object.keys(g3)));
  check("g3 unknown kit keys stripped + short hex kept", !("extra" in g3.brandKits[0]) && g3.brandKits[0].accent === "#abc");
  check("g4 missing kit id repaired with a generated one", typeof g3.brandKits[0].id === "string" && g3.brandKits[0].id.length > 0);
  check("g5 unknown text-style tier dropped, known tier kept", !("footer" in g3.textStyles) && g3.textStyles.heading.fontSize === 30);

  // (h) persistence across a full server restart
  await req("PUT", "/api/settings", DOC, cookie);
  shuttingDown = true;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 700));
  shuttingDown = false;
  boot();
  await waitForServer();
  const g4 = await (await req("GET", "/api/settings", undefined, cookie)).json();
  check("h1 settings survive a server restart", g4.brandKits.length === 2 && g4.defaultBg === "#0B0E13" && g4.textStyles.heading.fontSize === 84);

  // (i) isolation — a second user never sees the first user's document
  const su2 = await req("POST", "/api/auth/signup", { username: "set_user2", password: "password123" });
  const cookie2 = cookieFrom(su2);
  check("i1 second signup returns 201", su2.status === 201, `got ${su2.status}`);
  const g5 = await (await req("GET", "/api/settings", undefined, cookie2)).json();
  check("i2 second user reads the default document, not user1's", g5.brandKits.length === 0 && g5.defaultBg === null);
  await req("PUT", "/api/settings", { ...DOC, defaultBg: "#222222" }, cookie2);
  const g6 = await (await req("GET", "/api/settings", undefined, cookie)).json();
  check("i3 user1's document is untouched by user2's writes", g6.defaultBg === "#0B0E13");
} catch (err) {
  failures++;
  console.error("FAIL  harness error:", err.message);
} finally {
  shuttingDown = true;
  if (child) child.kill("SIGTERM");
}

/* ---------- 4. summary ---------- */
console.log(`\n${count} checks`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
