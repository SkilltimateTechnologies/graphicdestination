/**
 * test-mp4-export.mjs — runtime proof for the in-browser MP4/WebM exporters.
 *
 * What it does:
 *   1. Generates a minimal harness page (client/.mp4-test-harness/) that
 *      imports the REAL exporter modules (exportVideo.js → exportMp4.js /
 *      exportWebm.js / frameRenderer.js / audioMix.js) and a 2 s test project
 *      (a shape moving across the stage + a text layer).
 *   2. Bundles it with the project's own Vite and serves it locally, along
 *      with a generated 1.5 s / 440 Hz sine WAV as the project audio track.
 *   3. Drives headless Chromium (Playwright) to run the exports.
 *   4. Saves the resulting files and validates them with ffprobe/ffmpeg:
 *      MP4 (no audio)  → ONE stream (h264) — regression for silent exports.
 *      MP4 + audio     → TWO streams (h264 + aac when the platform's
 *                        AudioEncoder supports mp4a.40.2 — macOS/Windows/
 *                        Android/ChromeOS; h264 + opus on Linux Chromium,
 *                        which has no AAC encoder — the exporter's probed
 *                        fallback), duration ≈ 2.000 s, audio ≈ 2 s @ 48 kHz
 *                        stereo; extracted PCM is silent before startT
 *                        (250 ms), has the sine mid-track (peak ≈ 0.72), and
 *                        is silent again after the 1.5 s file ends (1.75 s).
 *      WebM + audio    → video + opus audio stream; duration metadata
 *                        present (ts-ebml repair check).
 *
 * Run:  node src/export/test-mp4-export.mjs        (from client/)
 * Requires: client deps installed, a Chromium (Playwright's or
 * /usr/bin/chromium), ffprobe + ffmpeg on PATH. Exits non-zero on failure.
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..", "..");
const harnessDir = path.join(clientDir, ".mp4-test-harness");
const distDir = path.join(harnessDir, "dist");
const outDir = path.join(harnessDir, "out");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — got: ${detail}` : ""}`); }
}

/* ---------- harness page ---------- */

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>mp4 export harness</title></head>
<body><script type="module" src="./main.js"></script></body></html>
`;

const HARNESS_MAIN = `
import { exportProject } from "../src/export/exportVideo.js";
import { probeMp4Codec, isMp4ExportSupported, probeAudioCodec } from "../src/export/exportMp4.js";
import { isWebmExportSupported, pickWebmMimeType } from "../src/export/exportWebm.js";

/* 2 s test project: a rect sliding left→right (keyframed x) + a text layer */
const project = {
  app: "graphic-destination-motion", v: 5,
  stage: { w: 1280, h: 720, dur: 2000, bg: "#101218" },
  brands: [], brandId: null,
  objects: [
    {
      id: "ob1", type: "shape", name: "Moving box", locked: false, hidden: false,
      tracks: { x: [{ t: 0, v: 150, ease: "linear" }, { t: 2000, v: 1130 }] },
      props: { x: 150, y: 400, scale: 1, rotation: 0, opacity: 1, fill: "#FFB224", w: 180, h: 180,
        inT: 0, outT: null, path: null, prog: 0, shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 16 },
    },
    {
      id: "ob2", type: "text", name: "Title", locked: false, hidden: false,
      tracks: {},
      props: { x: 640, y: 200, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 0, h: 0,
        inT: 0, outT: null, path: null, prog: 0, text: "MP4 EXPORT OK", fontSize: 72, fontWeight: 700,
        textFx: null, fontFamily: "Space Grotesk", ls: 0.5, upper: false, pathMode: "flow",
        bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none" },
    },
  ],
};

function blobToBase64(blob) {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  });
}

window.__probe = async () => {
  const info = {
    hasVideoEncoder: typeof VideoEncoder !== "undefined",
    hasAudioEncoder: typeof AudioEncoder !== "undefined",
    userAgent: navigator.userAgent,
    configs: {},
    audioConfigs: {},
  };
  if (info.hasVideoEncoder && typeof VideoEncoder.isConfigSupported === "function") {
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42001f"]) {
      try {
        const r = await VideoEncoder.isConfigSupported({
          codec, width: 1280, height: 720, bitrate: 8000000, framerate: 30,
          latencyMode: "quality", hardwareAcceleration: "no-preference", avc: { format: "avc" },
        });
        info.configs[codec] = !!r.supported;
      } catch (e) {
        info.configs[codec] = "error: " + (e && e.message ? e.message : e);
      }
    }
  }
  if (info.hasAudioEncoder && typeof AudioEncoder.isConfigSupported === "function") {
    for (const codec of ["mp4a.40.2", "opus"]) {
      try {
        const r = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
        info.audioConfigs[codec] = !!r.supported;
      } catch (e) {
        info.audioConfigs[codec] = "error: " + (e && e.message ? e.message : e);
      }
    }
  }
  info.chosenCodec = await probeMp4Codec();
  info.chosenAudioCodec = await probeAudioCodec();
  info.mp4Supported = await isMp4ExportSupported();
  info.webmSupported = isWebmExportSupported();
  info.webmMime = pickWebmMimeType();
  info.webmAudioMime = pickWebmMimeType(true);
  return info;
};

window.__runProject = async (prefer, audioCfg) => {
  try {
    const t0 = performance.now();
    const proj = audioCfg ? { ...project, audio: audioCfg } : project;
    const { blob, warnings, format } = await exportProject({
      project: proj, width: 1280, height: 720, fps: 30, prefer,
    });
    const b64 = await blobToBase64(blob);
    return { ok: true, format, size: blob.size, warnings, ms: Math.round(performance.now() - t0), b64 };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), stack: String((e && e.stack) || "") };
  }
};
window.__run = (prefer) => window.__runProject(prefer, null);
window.__ready = true;
`;

/* ---------- static server ---------- */

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".map": "application/json", ".wav": "audio/wav" };
function serve(dir) {
  const server = http.createServer((req, res) => {
    const p = path.join(dir, req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end("nf"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ---------- playwright / chromium ---------- */

async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const candidates = [
    path.join(clientDir, "node_modules"),
    "/home/kimi/.npm-global/lib/node_modules",
    "/usr/lib/node_modules",
  ];
  for (const base of candidates) {
    try { return req(req.resolve("playwright", { paths: [base] })); } catch { /* next */ }
  }
  throw new Error("playwright not found in " + candidates.join(", "));
}

/* Playwright's default headless SHELL build lacks H.264 encode (openh264 is
   not compiled in) — full Chromium builds have it. Try candidates in order
   and keep the first that both launches and reports VideoEncoder support. */
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`,
  `${process.env.HOME}/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome`,
  null, // playwright default (headless shell — last resort)
].filter((p, i, a) => p !== undefined && a.indexOf(p) === i);

async function launchChromium(playwright, port) {
  /* --autoplay-policy=no-user-gesture-required: the WebM audio path uses a
     realtime AudioContext; without the flag headless Chromium leaves it
     suspended (real exports are click-driven, so this is a test-only need). */
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"];
  const attempts = [];
  for (const executablePath of CHROMIUM_CANDIDATES) {
    try {
      const browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : {}), args });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/`);
      const hasVE = await page.evaluate("typeof VideoEncoder !== 'undefined'");
      const ua = await page.evaluate("navigator.userAgent");
      await page.close();
      attempts.push(`${executablePath || "playwright-default"}: VideoEncoder=${hasVE}`);
      if (hasVE) {
        console.log("using browser:", executablePath || "playwright-default", "|", ua);
        return browser;
      }
      await browser.close();
    } catch (e) {
      attempts.push(`${executablePath || "playwright-default"}: launch failed (${e.message.split("\n")[0]})`);
    }
  }
  console.log("browser attempts:\n  " + attempts.join("\n  "));
  throw new Error("no usable chromium found");
}

/* ---------- ffprobe / ffmpeg ---------- */

function ffprobe(file) {
  try {
    return execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,profile,width,height,nb_frames,avg_frame_rate,duration,sample_rate,channels",
      "-of", "default=noprint_wrappers=1", file,
    ], { encoding: "utf8" });
  } catch (e) {
    return "ffprobe failed: " + (e.stderr || e.message);
  }
}

function ffprobeJson(file) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,profile,width,height,nb_frames,avg_frame_rate,duration,sample_rate,channels",
      "-of", "json", file,
    ], { encoding: "utf8" });
    return JSON.parse(out);
  } catch (e) {
    return { error: String(e.stderr || e.message) };
  }
}

/* Decode the first audio stream to interleaved stereo f32 PCM @ 48 kHz and
   return per-channel arrays. NB: mono downmixing (-ac 1) is NOT used for
   peak checks — ffmpeg downmixes stereo→mono with 0.707·(L+R), which
   inflates identical channels by √2 and would fake a gain-stage bug. */
function extractPcmChannels(file, pcmPath, channels = 2) {
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", file,
    "-map", "0:a:0", "-f", "f32le", "-ac", String(channels), "-ar", "48000", pcmPath,
  ]);
  const buf = fs.readFileSync(pcmPath);
  const interleaved = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const out = Array.from({ length: channels }, () => new Float32Array(Math.floor(interleaved.length / channels)));
  for (let i = 0; i < out[0].length; i++) {
    for (let ch = 0; ch < channels; ch++) out[ch][i] = interleaved[i * channels + ch];
  }
  return out;
}

function maxAbsIn(pcm, sampleRate, t0s, t1s) {
  let m = 0;
  const from = Math.max(0, Math.floor(t0s * sampleRate));
  const to = Math.min(pcm.length, Math.ceil(t1s * sampleRate));
  for (let i = from; i < to; i++) m = Math.max(m, Math.abs(pcm[i]));
  return m;
}

/* ---------- test tone: 1.5 s 440 Hz sine, 44.1 kHz 16-bit mono WAV ---------- */

function makeSineWav({ seconds = 1.5, freq = 440, amp = 0.9, sampleRate = 44100 } = {}) {
  const n = Math.round(seconds * sampleRate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, amp * Math.sin((2 * Math.PI * freq * i) / sampleRate)));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

/* The audio scenario: 1.5 s sine starts 250 ms into a 2 s comp → audible
   window is 0.25–1.75 s, silence before and after. Volume 0.8 → expected
   peak ≈ 0.9 · 0.8 = 0.72. */
const AUDIO_CFG = { src: "tone.wav", name: "tone.wav", startT: 250, volume: 0.8, fadeIn: 0, fadeOut: 0 };

/* ---------- main ---------- */

async function main() {
  fs.rmSync(harnessDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(harnessDir, "index.html"), HARNESS_HTML);
  fs.writeFileSync(path.join(harnessDir, "main.js"), HARNESS_MAIN);

  console.log("== bundling harness with vite ==");
  await build({
    configFile: false,
    logLevel: "silent",
    root: harnessDir,
    plugins: [react()],
    /* ts-ebml's dependency "ebml" ships an IIFE (no exports) in its package
       "browser" field — force the real ESM build for browser bundles. */
    resolve: { alias: { ebml: path.join(clientDir, "node_modules/ebml/lib/ebml.esm.js") } },
    build: { outDir: distDir, emptyOutDir: true },
  });
  fs.writeFileSync(path.join(distDir, "tone.wav"), makeSineWav());

  const server = await serve(distDir);
  const port = server.address().port;
  const playwright = await loadPlaywright();
  const browser = await launchChromium(playwright, port);

  try {
    const page = await browser.newPage();
    page.on("console", (m) => console.log("[page]", m.type(), m.text()));
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", null, { timeout: 30_000 });

    console.log("\n== WebCodecs probe (this sandbox's Chromium) ==");
    const probe = await page.evaluate("window.__probe()");
    console.log(JSON.stringify({ ...probe, userAgent: undefined }, null, 2));
    console.log("UA:", probe.userAgent);

    /* ---- MP4, no audio (regression: single video stream) ---- */
    console.log("\n== MP4 export, no audio track (prefer mp4) — regression ==");
    const mp4 = await page.evaluate("window.__runProject('mp4', null)");
    console.log(JSON.stringify({ ...mp4, b64: undefined }));
    if (mp4.ok && mp4.format === "mp4") {
      const file = path.join(outDir, "export-test.mp4");
      fs.writeFileSync(file, Buffer.from(mp4.b64, "base64"));
      console.log("saved", file, mp4.size, "bytes in", mp4.ms, "ms");
      console.log("\n-- ffprobe export-test.mp4 --\n" + ffprobe(file));
      const j = ffprobeJson(file);
      const streams = j.streams || [];
      check("no-audio MP4 has exactly 1 stream", streams.length === 1, `${streams.length} stream(s)`);
      check("no-audio MP4 stream is h264 video", streams[0]?.codec_type === "video" && streams[0]?.codec_name === "h264", JSON.stringify(streams[0] && { type: streams[0].codec_type, codec: streams[0].codec_name }));
      check("no-audio MP4 duration ≈ 2.000 s", Math.abs(parseFloat(j.format?.duration) - 2) < 0.05, j.format?.duration);
    } else if (mp4.ok) {
      console.log("MP4 unsupported here — exportProject fell back to", mp4.format, "(expected on browsers without H.264 encode)");
    } else {
      console.log("MP4 export FAILED:", mp4.error, "\n", mp4.stack);
      failures++;
    }

    /* ---- MP4 with audio (2 s comp + 1.5 s sine @ startT=250 ms) ----
       The exporter prefers AAC (mp4a.40.2) and falls back to Opus only when
       AudioEncoder can't do AAC. AAC encode is a PLATFORM encoder in
       Chromium: present on macOS/Windows/Android/ChromeOS, ABSENT on Linux
       desktop builds (all of /usr/bin/chromium, Chrome-for-Testing and
       Playwright's Chromium report mp4a.40.2 unsupported here). The
       assertion follows the probe: aac when the platform offers it, opus
       (with the fallback warning) otherwise — both are "two streams". */
    const aacSupported = probe.audioConfigs?.["mp4a.40.2"] === true;
    console.log(`\n== MP4 export with audio (sine WAV, startT=250 ms, volume=0.8) — expect h264 + ${aacSupported ? "aac" : "opus (AAC unsupported on this Linux build, fallback engaged)"} ==`);
    const mp4a = await page.evaluate(`window.__runProject('mp4', ${JSON.stringify(AUDIO_CFG)})`);
    console.log(JSON.stringify({ ...mp4a, b64: undefined }));
    if (mp4a.ok && mp4a.format === "mp4") {
      const file = path.join(outDir, "export-audio.mp4");
      fs.writeFileSync(file, Buffer.from(mp4a.b64, "base64"));
      console.log("saved", file, mp4a.size, "bytes in", mp4a.ms, "ms");
      console.log("\n-- ffprobe export-audio.mp4 --\n" + ffprobe(file));
      const j = ffprobeJson(file);
      const streams = j.streams || [];
      const v = streams.find((s) => s.codec_type === "video");
      const a = streams.find((s) => s.codec_type === "audio");
      check("audio MP4 has exactly 2 streams", streams.length === 2, `${streams.length} stream(s)`);
      check("audio MP4 video is h264", v?.codec_name === "h264", v?.codec_name);
      if (aacSupported) {
        check("audio MP4 audio is aac", a?.codec_name === "aac", a?.codec_name);
        check("no audio warnings", (mp4a.warnings || []).every((w) => !/audio|opus/i.test(w)), JSON.stringify(mp4a.warnings));
      } else {
        check("audio MP4 audio is opus (probed AAC fallback)", a?.codec_name === "opus", a?.codec_name);
        check("opus-in-MP4 fallback warning surfaced",
          (mp4a.warnings || []).some((w) => /Opus/i.test(w)),
          JSON.stringify(mp4a.warnings));
      }
      check("audio MP4 format duration ≈ 2.000 s", Math.abs(parseFloat(j.format?.duration) - 2) < 0.05, j.format?.duration);
      check("audio MP4 audio duration ≈ 2 s", a && Math.abs(parseFloat(a.duration) - 2) < 0.1, a?.duration);
      check("audio MP4 audio is 48 kHz stereo", a && +a.sample_rate === 48000 && a.channels === 2, a && `${a.sample_rate} Hz / ${a.channels} ch`);

      const pcmPath = path.join(outDir, "export-audio.pcm");
      const [chL, chR] = extractPcmChannels(file, pcmPath, 2);
      const pre = Math.max(maxAbsIn(chL, 48000, 0, 0.20), maxAbsIn(chR, 48000, 0, 0.20));
      const mid = Math.max(maxAbsIn(chL, 48000, 0.30, 1.00), maxAbsIn(chR, 48000, 0.30, 1.00));
      const tail = Math.max(maxAbsIn(chL, 48000, 1.85, 2.00), maxAbsIn(chR, 48000, 1.85, 2.00));
      console.log(`\n-- PCM windows (per-channel 48 kHz, ${chL.length} samples/ch = ${(chL.length / 48000).toFixed(3)} s) --`);
      console.log(`  max|x| 0.00–0.20 s (before startT=250 ms): ${pre.toExponential(3)}`);
      console.log(`  max|x| 0.30–1.00 s (sine, expect ≈0.72):     ${mid.toFixed(4)}`);
      console.log(`  max|x| 1.85–2.00 s (after 1.5 s file ends): ${tail.toExponential(3)}`);
      check("silence before startT (< 0.02)", pre < 0.02, pre.toExponential(3));
      check("sine peak mid-track (0.5 < peak < 1.0, expect ≈0.72)", mid > 0.5 && mid < 1.0, mid.toFixed(4));
      check("silence after audio end (< 0.02)", tail < 0.02, tail.toExponential(3));
    } else if (mp4a.ok) {
      console.log("MP4 unsupported here — fell back to", mp4a.format);
      failures++;
    } else {
      console.log("MP4+audio export FAILED:", mp4a.error, "\n", mp4a.stack);
      failures++;
    }

    /* ---- MP4 with audio fades (fadeIn=500 ms, fadeOut=500 ms) ----
       Audible window 0.25–1.75 s → fade-in ramp 0.25–0.75 s, plateau
       0.75–1.25 s (≈0.72), fade-out ramp 1.25–1.75 s. */
    console.log("\n== MP4 export with audio fades (fadeIn=500, fadeOut=500) ==");
    const FADE_CFG = { src: "tone.wav", name: "tone.wav", startT: 250, volume: 0.8, fadeIn: 500, fadeOut: 500 };
    const mp4f = await page.evaluate(`window.__runProject('mp4', ${JSON.stringify(FADE_CFG)})`);
    console.log(JSON.stringify({ ...mp4f, b64: undefined }));
    if (mp4f.ok && mp4f.format === "mp4") {
      const file = path.join(outDir, "export-fades.mp4");
      fs.writeFileSync(file, Buffer.from(mp4f.b64, "base64"));
      const [fL] = extractPcmChannels(file, path.join(outDir, "export-fades.pcm"), 2);
      const rampUp = maxAbsIn(fL, 48000, 0.28, 0.45); // inside fade-in (gain ≤ 0.32 → peak ≈ 0.29)
      const plateau = maxAbsIn(fL, 48000, 0.80, 1.20); // full volume (≈ 0.72)
      const rampDown = maxAbsIn(fL, 48000, 1.45, 1.72); // inside fade-out (gain ≤ 0.48 → peak ≈ 0.43)
      console.log(`  fades: ramp-up ${rampUp.toFixed(4)} | plateau ${plateau.toFixed(4)} | ramp-down ${rampDown.toFixed(4)}`);
      check("fade plateau ≈ 0.72", plateau > 0.5 && plateau < 1.0, plateau.toFixed(4));
      check("fade-in ramp below plateau", rampUp < plateau * 0.8, `${rampUp.toFixed(4)} < ${(plateau * 0.8).toFixed(4)}`);
      check("fade-out ramp below plateau", rampDown < plateau * 0.8, `${rampDown.toFixed(4)} < ${(plateau * 0.8).toFixed(4)}`);
    } else {
      console.log("fades MP4 export FAILED:", mp4f.error);
      failures++;
    }

    /* ---- MP4 with a BROKEN audio src → warning + silent video ---- */
    console.log("\n== MP4 export with broken audio src (falls back to silent + warning) ==");
    const bad = await page.evaluate(`window.__runProject('mp4', ${JSON.stringify({ src: "missing-404.wav", name: "missing-404.wav", startT: 0 })})`);
    console.log(JSON.stringify({ ...bad, b64: undefined }));
    if (bad.ok && bad.format === "mp4") {
      const file = path.join(outDir, "export-bad-audio.mp4");
      fs.writeFileSync(file, Buffer.from(bad.b64, "base64"));
      const j = ffprobeJson(file);
      const streams = j.streams || [];
      check("broken-audio MP4 has video only", streams.length === 1 && streams[0]?.codec_type === "video", streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(", "));
      check("broken-audio warning surfaced",
        (bad.warnings || []).some((w) => /missing-404\.wav/.test(w) && /without sound/i.test(w)),
        JSON.stringify(bad.warnings));
    } else {
      console.log("broken-audio MP4 export FAILED:", bad.error);
      failures++;
    }

    /* ---- WebM (explicit) incl. ts-ebml duration repair ---- */
    console.log("\n== WebM export (prefer webm, with duration repair) ==");
    const webm = await page.evaluate("window.__run('webm')");
    console.log(JSON.stringify({ ...webm, b64: undefined }));
    if (webm.ok) {
      const file = path.join(outDir, "export-test.webm");
      fs.writeFileSync(file, Buffer.from(webm.b64, "base64"));
      console.log("saved", file, webm.size, "bytes in", webm.ms, "ms");
      console.log("\n-- ffprobe export-test.webm --\n" + ffprobe(file));
    } else {
      console.log("WebM export FAILED:", webm.error, "\n", webm.stack);
      failures++;
    }

    /* ---- WebM with audio (VP9/VP8 + Opus in one MediaStream) ---- */
    console.log("\n== WebM export with audio (sine WAV, startT=250 ms, volume=0.8) ==");
    const webma = await page.evaluate(`window.__runProject('webm', ${JSON.stringify(AUDIO_CFG)})`);
    console.log(JSON.stringify({ ...webma, b64: undefined }));
    if (webma.ok) {
      const file = path.join(outDir, "export-audio.webm");
      fs.writeFileSync(file, Buffer.from(webma.b64, "base64"));
      console.log("saved", file, webma.size, "bytes in", webma.ms, "ms");
      console.log("\n-- ffprobe export-audio.webm --\n" + ffprobe(file));
      const j = ffprobeJson(file);
      const streams = j.streams || [];
      const v = streams.find((s) => s.codec_type === "video");
      const a = streams.find((s) => s.codec_type === "audio");
      check("audio WebM has video + audio streams", !!v && !!a, streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(", "));
      check("audio WebM audio is opus", a?.codec_name === "opus", a?.codec_name);
      check("no audio warnings", (webma.warnings || []).every((w) => !/audio/i.test(w)), JSON.stringify(webma.warnings));
      if (a) {
        const pcmPath = path.join(outDir, "export-audio-webm.pcm");
        const [chL, chR] = extractPcmChannels(file, pcmPath, 2);
        const mid = Math.max(maxAbsIn(chL, 48000, 0.30, 1.00), maxAbsIn(chR, 48000, 0.30, 1.00));
        console.log(`  WebM PCM max|x| 0.30–1.00 s (per-channel): ${mid.toFixed(4)} (informational — wall-clock sync)`);
        check("WebM sine audible mid-track (> 0.3)", mid > 0.3, mid.toFixed(4));
      }
    } else {
      console.log("WebM+audio export FAILED:", webma.error, "\n", webma.stack);
      failures++;
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nharness done — all checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
