/*
 * Token-scoped public asset serving — wipes the local DB, boots the server
 * on PORT=8794 with TURSO_* unset, and verifies that anonymous viewers of a
 * shared project can fetch ONLY the assets that project references:
 *   GET /api/share/:token/assets/:assetId
 * Run from the server directory: `node test-share-assets.mjs`.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8794;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  (" + detail + ")"}`);
  if (!ok) failures++;
}

/* wipe local db */
const dataDir = path.join(__dirname, "data");
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) {
    if (f.startsWith("app.db")) fs.rmSync(path.join(dataDir, f), { force: true });
  }
}

const env = { ...process.env, PORT: String(PORT) };
delete env.TURSO_DATABASE_URL;
delete env.TURSO_AUTH_TOKEN;
const child = spawn("node", ["index.js"], { cwd: __dirname, env, stdio: "ignore" });
process.on("exit", () => { try { child.kill("SIGTERM"); } catch {} });

const j = (r) => r.json();
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
}
const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];

try {
  await waitUp();

  /* owner signup */
  let r = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sharer", password: "password123" }),
  });
  const cookie = cookieOf(r);
  check("a1 signup 201", r.status === 201, String(r.status));

  /* upload two assets — one referenced, one not */
  const up = (name) => fetch(`${BASE}/api/assets`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name, mime: "image/png", dataUrl: `data:image/png;base64,${PNG_B64}` }),
  }).then(j);
  const a1 = await up("used.png");
  const a2 = await up("secret.png");
  check("a2 two assets uploaded", !!a1.id && !!a2.id, JSON.stringify({ a1, a2 }));

  /* project references only a1 */
  const data = {
    app: "graphic-destination-motion", v: 5,
    stage: { w: 1280, h: 720, dur: 4000, bg: "#101218" },
    brands: [], brandId: null,
    objects: [{ id: "ob1", type: "image", name: "Logo",
      props: { src: `/api/assets/${a1.id}`, x: 100, y: 100, w: 200, h: 200 }, tracks: {} }],
  };
  r = await fetch(`${BASE}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: "Shared proj", data }),
  });
  const { id: pid } = await j(r);
  check("a3 project created", !!pid, String(r.status));

  /* enable share */
  r = await fetch(`${BASE}/api/projects/${pid}/share`, { method: "POST", headers: { cookie } });
  const { shareToken } = await j(r);
  check("a4 share enabled", !!shareToken, String(r.status));

  /* anonymous: referenced asset served with exact bytes */
  r = await fetch(`${BASE}/api/share/${shareToken}/assets/${a1.id}`);
  const buf = Buffer.from(await r.arrayBuffer());
  check("b1 referenced asset 200 for anonymous", r.status === 200, String(r.status));
  check("b2 content-type image/png", r.headers.get("content-type") === "image/png", r.headers.get("content-type"));
  check("b3 exact byte round-trip", buf.equals(Buffer.from(PNG_B64, "base64")), `${buf.length}B`);

  /* anonymous: unreferenced asset 404 */
  r = await fetch(`${BASE}/api/share/${shareToken}/assets/${a2.id}`);
  check("c1 unreferenced asset is 404", r.status === 404, String(r.status));

  /* anonymous: bad token 404 */
  r = await fetch(`${BASE}/api/share/not-a-token/assets/${a1.id}`);
  check("c2 unknown token is 404", r.status === 404, String(r.status));

  /* disable share -> 404 */
  await fetch(`${BASE}/api/projects/${pid}/share`, { method: "DELETE", headers: { cookie } });
  r = await fetch(`${BASE}/api/share/${shareToken}/assets/${a1.id}`);
  check("d1 revoked token asset is 404", r.status === 404, String(r.status));
} catch (err) {
  failures++;
  console.error("FAIL  harness error:", err.message);
} finally {
  child.kill("SIGTERM");
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
