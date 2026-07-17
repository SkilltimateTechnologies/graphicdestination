/*
 * Asset-library API verification script — wipes the local DB, boots the
 * server on PORT=8791 with TURSO_* unset and GD_ASSET_QUOTA=3 (so the quota
 * path is reachable without 50 uploads), and exercises /api/assets.
 * Run from the server directory: `node test-assets.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;

// 1x1 transparent PNG, built in-script (67 bytes decoded).
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(PNG_B64, "base64");
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

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
  GD_ASSET_QUOTA: "3",
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

  // (a) signup user A -> 201 + session cookie
  const suA = await post("/api/auth/signup", { username: "asset_alice", password: "password123" });
  const cookieA = cookieFrom(suA);
  check("a1 signup A returns 201", suA.status === 201, `got ${suA.status}`);
  check("a2 signup A sets gd_session cookie", !!cookieA);
  const authA = { Cookie: cookieA || "" };

  // (b) unauthenticated asset requests -> 401
  const anonList = await fetch(`${BASE}/api/assets`);
  check("b1 GET /api/assets without cookie returns 401", anonList.status === 401, `got ${anonList.status}`);
  const anonPost = await post("/api/assets", { name: "x", mime: "image/png", dataUrl: PNG_DATA_URL });
  check("b2 POST /api/assets without cookie returns 401", anonPost.status === 401, `got ${anonPost.status}`);

  // (c) upload a tiny PNG -> 201 + metadata + url
  const up = await post("/api/assets", { name: "pixel", mime: "image/png", dataUrl: PNG_DATA_URL }, authA);
  const upBody = await up.json();
  check("c1 upload returns 201", up.status === 201, `got ${up.status}: ${JSON.stringify(upBody)}`);
  check("c2 upload body has numeric id", typeof upBody.id === "number" && upBody.id > 0, JSON.stringify(upBody));
  check("c3 upload url is /api/assets/<id>", upBody.url === `/api/assets/${upBody.id}`, upBody.url);
  check("c4 upload echoes name/mime/size", upBody.name === "pixel" && upBody.mime === "image/png" && upBody.size === PNG_BYTES.length, JSON.stringify(upBody));
  check("c5 upload has createdAt", typeof upBody.createdAt === "string" && upBody.createdAt.length > 0, JSON.stringify(upBody));
  check("c6 upload response carries no raw data field", !("data" in upBody));
  const assetId = upBody.id;

  // (d) list -> contains the asset, metadata only, newest first
  const list = await fetch(`${BASE}/api/assets`, { headers: authA });
  const listBody = await list.json();
  check("d1 list returns 200", list.status === 200, `got ${list.status}`);
  const found = Array.isArray(listBody) && listBody.find((a) => a.id === assetId);
  check("d2 list contains uploaded asset", !!found, JSON.stringify(listBody));
  check(
    "d3 list entry is metadata only with url",
    !!found && found.name === "pixel" && found.mime === "image/png" && found.size === PNG_BYTES.length && found.url === `/api/assets/${assetId}` && typeof found.createdAt === "string" && !("data" in found),
    JSON.stringify(found)
  );

  // (e) GET binary -> exact bytes + content-type + cache header + length
  const bin = await fetch(`${BASE}/api/assets/${assetId}`, { headers: authA });
  const binBytes = Buffer.from(await bin.arrayBuffer());
  check("e1 GET binary returns 200", bin.status === 200, `got ${bin.status}`);
  check("e2 Content-Type is image/png", bin.headers.get("content-type") === "image/png", bin.headers.get("content-type"));
  check(
    "e3 Cache-Control is private, max-age=31536000, immutable",
    bin.headers.get("cache-control") === "private, max-age=31536000, immutable",
    bin.headers.get("cache-control")
  );
  check("e4 Content-Length matches decoded size", bin.headers.get("content-length") === String(PNG_BYTES.length), bin.headers.get("content-length"));
  check("e5 body bytes match the uploaded PNG exactly", binBytes.equals(PNG_BYTES), `got ${binBytes.length} bytes`);

  // (f) isolation: user B cannot fetch/delete/see user A's asset
  const suB = await post("/api/auth/signup", { username: "asset_bob", password: "password123" });
  const cookieB = cookieFrom(suB);
  check("f1 signup B returns 201", suB.status === 201, `got ${suB.status}`);
  const authB = { Cookie: cookieB || "" };
  const binB = await fetch(`${BASE}/api/assets/${assetId}`, { headers: authB });
  check("f2 user B fetching A's asset returns 404", binB.status === 404, `got ${binB.status}`);
  const delB = await fetch(`${BASE}/api/assets/${assetId}`, { method: "DELETE", headers: authB });
  check("f3 user B deleting A's asset returns 404", delB.status === 404, `got ${delB.status}`);
  const listB = await (await fetch(`${BASE}/api/assets`, { headers: authB })).json();
  check("f4 user B's asset list is empty", Array.isArray(listB) && listB.length === 0, JSON.stringify(listB));

  // (g) validation: bad mime -> 415
  const badMime = await post("/api/assets", { name: "vec", mime: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" }, authA);
  const badMimeBody = await badMime.json();
  check("g1 svg mime returns 415", badMime.status === 415, `got ${badMime.status}`);
  check("g2 415 has error message", typeof badMimeBody.error === "string" && badMimeBody.error.length > 0, JSON.stringify(badMimeBody));

  // (h) validation: malformed payloads -> 400
  const garbage = await post("/api/assets", { name: "x", mime: "image/png", dataUrl: "not-a-data-url" }, authA);
  check("h1 non-data-url returns 400", garbage.status === 400, `got ${garbage.status}`);
  const mismatch = await post("/api/assets", { name: "x", mime: "image/png", dataUrl: "data:image/jpeg;base64,iVBORw0KGgo=" }, authA);
  check("h2 mime/dataUrl mismatch returns 400", mismatch.status === 400, `got ${mismatch.status}`);
  const badB64 = await post("/api/assets", { name: "x", mime: "image/png", dataUrl: "data:image/png;base64,!!!" }, authA);
  check("h3 invalid base64 returns 400", badB64.status === 400, `got ${badB64.status}`);
  const longName = await post("/api/assets", { name: "n".repeat(121), mime: "image/png", dataUrl: PNG_DATA_URL }, authA);
  check("h4 name > 120 chars returns 400", longName.status === 400, `got ${longName.status}`);
  const emptyName = await post("/api/assets", { name: "", mime: "image/png", dataUrl: PNG_DATA_URL }, authA);
  check("h5 empty name returns 400", emptyName.status === 400, `got ${emptyName.status}`);

  // (i) oversize: > 3 MB decoded -> 413 with the exact message
  const bigB64 = Buffer.alloc(3 * 1024 * 1024 + 1, 7).toString("base64");
  const big = await post("/api/assets", { name: "big", mime: "image/png", dataUrl: `data:image/png;base64,${bigB64}` }, authA);
  const bigBody = await big.json();
  check("i1 >3MB upload returns 413", big.status === 413, `got ${big.status}`);
  check("i2 413 error message", bigBody.error === "Image too large (max 3 MB)", JSON.stringify(bigBody));

  // (j) quota (GD_ASSET_QUOTA=3): asset #1 already uploaded, #2/#3 ok, #4 -> 409
  const up2 = await post("/api/assets", { name: "second", mime: "image/png", dataUrl: PNG_DATA_URL }, authA);
  check("j1 second upload returns 201", up2.status === 201, `got ${up2.status}`);
  const up3 = await post("/api/assets", { name: "third", mime: "image/png", dataUrl: PNG_DATA_URL }, authA);
  const up3Body = await up3.json();
  check("j2 third upload returns 201", up3.status === 201, `got ${up3.status}`);
  const up4 = await post("/api/assets", { name: "fourth", mime: "image/png", dataUrl: PNG_DATA_URL }, authA);
  const up4Body = await up4.json();
  check("j3 fourth upload hits quota -> 409", up4.status === 409, `got ${up4.status}`);
  check("j4 409 error message reflects quota", up4Body.error === "Asset limit reached (3)", JSON.stringify(up4Body));

  // (k) list ordering: newest first
  const list2 = await (await fetch(`${BASE}/api/assets`, { headers: authA })).json();
  check("k1 list has 3 assets at quota", list2.length === 3, `got ${list2.length}`);
  check("k2 list is newest-first", list2[0]?.id === up3Body.id && list2[2]?.id === assetId, JSON.stringify(list2.map((a) => a.id)));

  // (l) delete -> ok, then fetch/delete -> 404
  const del = await fetch(`${BASE}/api/assets/${assetId}`, { method: "DELETE", headers: authA });
  const delBody = await del.json();
  check("l1 owner delete returns 200 {ok:true}", del.status === 200 && delBody.ok === true, `got ${del.status}: ${JSON.stringify(delBody)}`);
  const gone = await fetch(`${BASE}/api/assets/${assetId}`, { headers: authA });
  check("l2 GET after delete returns 404", gone.status === 404, `got ${gone.status}`);
  const delAgain = await fetch(`${BASE}/api/assets/${assetId}`, { method: "DELETE", headers: authA });
  check("l3 second delete returns 404", delAgain.status === 404, `got ${delAgain.status}`);
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
