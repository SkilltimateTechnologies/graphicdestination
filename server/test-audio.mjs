/*
 * Audio-asset API verification script — wipes the local DB, boots the server
 * on PORT=8792 with TURSO_* unset and GD_ASSET_QUOTA=2 (so the shared quota
 * path is reachable without 50 uploads), and exercises audio support in
 * /api/assets: kind fields, per-kind size caps, binary round-trip, and quota
 * accounting. Run from the server directory: `node test-audio.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8792;
const BASE = `http://127.0.0.1:${PORT}`;

/* Generate a valid 0.1s 8kHz mono 16-bit PCM WAV in-script (440 Hz sine,
 * 1644 bytes total: 44-byte header + 800 frames * 2 bytes). */
function makeWav({ seconds = 0.1, sampleRate = 8000, freq = 440 } = {}) {
  const frames = Math.round(seconds * sampleRate);
  const dataSize = frames * 2; // 16-bit samples, mono
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // PCM fmt chunk size
  buf.writeUInt16LE(1, 20); // audio format 1 = PCM
  buf.writeUInt16LE(1, 22); // channels: mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 32767 * 0.5), 44 + i * 2);
  }
  return buf;
}

const WAV_BYTES = makeWav();
const WAV_B64 = WAV_BYTES.toString("base64");
const WAV_DATA_URL = `data:audio/wav;base64,${WAV_B64}`;

// 1x1 transparent PNG (67 bytes decoded) for the image-side checks.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
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
  GD_ASSET_QUOTA: "2",
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
async function signup(username) {
  const res = await post("/api/auth/signup", { username, password: "password123" });
  return { status: res.status, auth: { Cookie: cookieFrom(res) || "" } };
}

/* ---------- 3. run the assertions ---------- */
try {
  await waitForServer();

  // (a) upload the generated WAV -> 201 + kind:"audio" + metadata
  const { status: suAStatus, auth: authA } = await signup("audio_alice");
  check("a1 signup A returns 201", suAStatus === 201, `got ${suAStatus}`);
  const up = await post("/api/assets", { name: "beep", mime: "audio/wav", dataUrl: WAV_DATA_URL }, authA);
  const upBody = await up.json();
  check("a2 WAV upload returns 201", up.status === 201, `got ${up.status}: ${JSON.stringify(upBody)}`);
  check("a3 upload body has kind 'audio'", upBody.kind === "audio", JSON.stringify(upBody));
  check(
    "a4 upload echoes name/mime/size",
    upBody.name === "beep" && upBody.mime === "audio/wav" && upBody.size === WAV_BYTES.length,
    JSON.stringify(upBody)
  );
  check("a5 upload url is /api/assets/<id>", upBody.url === `/api/assets/${upBody.id}`, upBody.url);
  check("a6 upload response carries no raw data field", !("data" in upBody));
  const wavId = upBody.id;

  // (b) list -> entry shows kind:"audio"
  const list = await fetch(`${BASE}/api/assets`, { headers: authA });
  const listBody = await list.json();
  const found = Array.isArray(listBody) && listBody.find((a) => a.id === wavId);
  check("b1 list returns 200", list.status === 200, `got ${list.status}`);
  check("b2 list entry shows kind 'audio'", !!found && found.kind === "audio", JSON.stringify(found));
  check("b3 list entry keeps mime/size/url metadata", !!found && found.mime === "audio/wav" && found.size === WAV_BYTES.length && found.url === `/api/assets/${wavId}`, JSON.stringify(found));

  // (c) GET binary -> exact bytes + audio content-type (round-trip)
  const bin = await fetch(`${BASE}/api/assets/${wavId}`, { headers: authA });
  const binBytes = Buffer.from(await bin.arrayBuffer());
  check("c1 GET binary returns 200", bin.status === 200, `got ${bin.status}`);
  check("c2 Content-Type is audio/wav", bin.headers.get("content-type") === "audio/wav", bin.headers.get("content-type"));
  check("c3 body bytes round-trip exactly", binBytes.equals(WAV_BYTES), `got ${binBytes.length} bytes`);
  check(
    "c4 round-tripped file is a valid WAV (RIFF/WAVE/data chunks)",
    binBytes.length === 44 + 1600 && binBytes.toString("ascii", 0, 4) === "RIFF" && binBytes.toString("ascii", 8, 12) === "WAVE" && binBytes.toString("ascii", 36, 40) === "data" && binBytes.readUInt32LE(24) === 8000 && binBytes.readUInt32LE(40) === 1600,
    `len=${binBytes.length} sig=${binBytes.toString("ascii", 0, 4)}/${binBytes.toString("ascii", 8, 12)}`
  );

  // (d) other allowed audio mimes upload fine (user B, own quota of 2).
  // The server validates the data-url envelope, not codec bytes, so small
  // dummy payloads suffice to exercise the allow-list.
  const { status: suBStatus, auth: authB } = await signup("audio_bob");
  check("d1 signup B returns 201", suBStatus === 201, `got ${suBStatus}`);
  const mp3 = Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x21fake-mp3-frames");
  const upMp3 = await post("/api/assets", { name: "track", mime: "audio/mpeg", dataUrl: `data:audio/mpeg;base64,${mp3.toString("base64")}` }, authB);
  const upMp3Body = await upMp3.json();
  check("d2 audio/mpeg upload returns 201", upMp3.status === 201, `got ${upMp3.status}: ${JSON.stringify(upMp3Body)}`);
  check("d3 audio/mpeg kind is 'audio'", upMp3Body.kind === "audio", JSON.stringify(upMp3Body));
  const upOgg = await post("/api/assets", { name: "clip", mime: "audio/ogg", dataUrl: `data:audio/ogg;base64,${Buffer.from("OggS-fake").toString("base64")}` }, authB);
  check("d4 audio/ogg upload returns 201", upOgg.status === 201, `got ${upOgg.status}`);

  // (e) disallowed types still -> 415 (audio/flac, video/mp4)
  const flac = await post("/api/assets", { name: "x", mime: "audio/flac", dataUrl: `data:audio/flac;base64,${Buffer.from("ZkxhQw==").toString("base64")}` }, authA);
  const flacBody = await flac.json();
  check("e1 audio/flac returns 415", flac.status === 415, `got ${flac.status}`);
  check(
    "e2 415 message lists audio mimes as allowed",
    typeof flacBody.error === "string" && flacBody.error.startsWith("Unsupported media type (allowed:") && flacBody.error.includes("audio/mpeg") && flacBody.error.includes("audio/wav"),
    JSON.stringify(flacBody)
  );
  const vid = await post("/api/assets", { name: "x", mime: "video/mp4", dataUrl: `data:video/mp4;base64,${Buffer.from("AAAA").toString("base64")}` }, authA);
  check("e3 video/mp4 returns 415", vid.status === 415, `got ${vid.status}`);

  // (f) per-kind size caps (user C, fresh quota):
  // - 4 MB audio (> image cap, < audio cap) is accepted
  // - 4 MB image is still rejected with the image message
  // - 5 MB+1 audio is rejected with the audio message. The ~7 MB JSON body
  //   also proves the raised 12mb express.json limit lets it reach the handler.
  const { status: suCStatus, auth: authC } = await signup("audio_carol");
  check("f1 signup C returns 201", suCStatus === 201, `got ${suCStatus}`);
  const audio4mb = Buffer.alloc(4 * 1024 * 1024, 3).toString("base64");
  const up4mb = await post("/api/assets", { name: "long", mime: "audio/mp4", dataUrl: `data:audio/mp4;base64,${audio4mb}` }, authC);
  const up4mbBody = await up4mb.json();
  check("f2 4MB audio (over the 3MB image cap) returns 201", up4mb.status === 201, `got ${up4mb.status}: ${JSON.stringify(up4mbBody)}`);
  check("f3 4MB audio kind is 'audio'", up4mbBody.kind === "audio", JSON.stringify(up4mbBody));
  const img4mb = Buffer.alloc(4 * 1024 * 1024, 7).toString("base64");
  const bigImg = await post("/api/assets", { name: "big-img", mime: "image/png", dataUrl: `data:image/png;base64,${img4mb}` }, authC);
  const bigImgBody = await bigImg.json();
  check("f4 4MB image (under the 5MB audio cap) still returns 413", bigImg.status === 413, `got ${bigImg.status}`);
  check("f5 image 413 keeps the image message", bigImgBody.error === "Image too large (max 3 MB)", JSON.stringify(bigImgBody));
  const audioOver = Buffer.alloc(5 * 1024 * 1024 + 1, 5).toString("base64");
  const bigAudio = await post("/api/assets", { name: "huge", mime: "audio/mpeg", dataUrl: `data:audio/mpeg;base64,${audioOver}` }, authC);
  const bigAudioBody = await bigAudio.json();
  check("f6 >5MB audio returns 413", bigAudio.status === 413, `got ${bigAudio.status}`);
  check("f7 audio 413 has the audio message", bigAudioBody.error === "Audio too large (max 5 MB)", JSON.stringify(bigAudioBody));

  // (g) shared quota (GD_ASSET_QUOTA=2, user A already holds the WAV):
  // image upload is slot #2, then another audio upload must hit the limit --
  // proving audio counts toward the same per-user quota as images.
  const upPng = await post("/api/assets", { name: "pixel", mime: "image/png", dataUrl: PNG_DATA_URL }, authA);
  const upPngBody = await upPng.json();
  check("g1 image upload as asset #2 returns 201", upPng.status === 201, `got ${upPng.status}: ${JSON.stringify(upPngBody)}`);
  check("g2 image upload kind is 'image'", upPngBody.kind === "image", JSON.stringify(upPngBody));
  const upThird = await post("/api/assets", { name: "beep2", mime: "audio/wav", dataUrl: WAV_DATA_URL }, authA);
  const upThirdBody = await upThird.json();
  check("g3 third upload (audio) hits the shared quota -> 409", upThird.status === 409, `got ${upThird.status}`);
  check("g4 409 error message reflects quota", upThirdBody.error === "Asset limit reached (2)", JSON.stringify(upThirdBody));

  // (h) final list: one image + one audio, kinds visible per entry
  const list2 = await (await fetch(`${BASE}/api/assets`, { headers: authA })).json();
  check(
    "h1 list shows both kinds",
    Array.isArray(list2) && list2.length === 2 && list2.find((a) => a.id === wavId)?.kind === "audio" && list2.find((a) => a.id === upPngBody.id)?.kind === "image",
    JSON.stringify(list2)
  );
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
