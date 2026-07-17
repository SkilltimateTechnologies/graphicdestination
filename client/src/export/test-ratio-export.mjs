/**
 * test-ratio-export.mjs — runtime proof that video export respects the
 * project's stage size (multi-aspect-ratio support).
 *
 * What it does:
 *   1. Generates a minimal harness page (client/.ratio-test-harness/) that
 *      imports the REAL exporter modules (exportVideo.js → exportMp4.js /
 *      frameRenderer.js) and probes WebCodecs at three export geometries:
 *      1280×720 (16:9 baseline), 1080×1080 (1:1), 1080×1920 (9:16).
 *   2. Bundles it with the project's own Vite and serves it locally.
 *   3. Drives headless Chromium (Playwright) to run 1 s MP4 exports at
 *      1080×1080 and 1080×1920 — passing width/height through
 *      exportProject() exactly like ExportDialog does.
 *   4. Validates the files with ffprobe: one h264 stream, exact pixel
 *      dimensions, duration ≈ 1.000 s.
 *
 * The 1080×1080 export is a hard check. The 1080×1920 export is asserted
 * too (H.264 L4.0/L5.0 covers it and Chromium's software encoder accepts),
 * but a sandbox Chromium without enough encoder headroom surfaces it as a
 * documented environment limitation, not a code failure — see the report.
 *
 * Run:  node src/export/test-ratio-export.mjs        (from client/)
 * Requires: client deps installed, a Chromium (Playwright's or
 * /usr/bin/chromium), ffprobe on PATH. Exits non-zero on failure.
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
const harnessDir = path.join(clientDir, ".ratio-test-harness");
const distDir = path.join(harnessDir, "dist");
const outDir = path.join(harnessDir, "out");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — got: ${detail}` : ""}`); }
}

/* ---------- harness page ---------- */

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>ratio export harness</title></head>
<body><script type="module" src="./main.js"></script></body></html>
`;

const HARNESS_MAIN = `
import { exportProject } from "../src/export/exportVideo.js";
import { probeMp4Codec } from "../src/export/exportMp4.js";

/* 1 s test project on a SQUARE stage: a rect sliding left→right + a text
   layer, both laid out for 1080×1080. The same objects array is re-used for
   the 1080×1920 export (stage size lives in project.stage, export dims come
   from the width/height args — exactly what ExportDialog passes). */
const project = {
  app: "graphic-destination-motion", v: 5,
  stage: { w: 1080, h: 1080, dur: 1000, bg: "#101218" },
  brands: [], brandId: null,
  objects: [
    {
      id: "ob1", type: "shape", name: "Moving box", locked: false, hidden: false,
      tracks: { x: [{ t: 0, v: 240, ease: "linear" }, { t: 1000, v: 840 }] },
      props: { x: 240, y: 700, scale: 1, rotation: 0, opacity: 1, fill: "#FFB224", w: 220, h: 220,
        inT: 0, outT: null, path: null, prog: 0, shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 16 },
    },
    {
      id: "ob2", type: "text", name: "Title", locked: false, hidden: false,
      tracks: {},
      props: { x: 540, y: 380, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 0, h: 0,
        inT: 0, outT: null, path: null, prog: 0, text: "SQUARE 1080", fontSize: 72, fontWeight: 700,
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

/* dimension-aware probe: which H.264 candidate wins at each geometry */
window.__probeGeometry = async (width, height) => {
  const codec = await probeMp4Codec({ width, height, fps: 30, bitrate: 8000000 });
  return { width, height, codec };
};

window.__runAt = async (width, height) => {
  try {
    const t0 = performance.now();
    const proj = { ...project, stage: { ...project.stage, w: width, h: height } };
    const { blob, warnings, format } = await exportProject({
      project: proj, width, height, fps: 30, prefer: "mp4",
    });
    const b64 = await blobToBase64(blob);
    return { ok: true, format, size: blob.size, warnings, ms: Math.round(performance.now() - t0), b64 };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), stack: String((e && e.stack) || "") };
  }
};
window.__ready = true;
`;

/* ---------- static server ---------- */

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".map": "application/json" };
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

/* Same browser preference as test-mp4-export.mjs: full Chromium builds have
   H.264 encode; Playwright's headless shell does not. */
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`,
  `${process.env.HOME}/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome`,
  null, // playwright default (headless shell — last resort)
].filter((p, i, a) => p !== undefined && a.indexOf(p) === i);

async function launchChromium(playwright, port) {
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

/* ---------- ffprobe ---------- */

function ffprobe(file) {
  try {
    return execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,profile,width,height,nb_frames,avg_frame_rate,duration",
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
      "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,profile,width,height,nb_frames,avg_frame_rate,duration",
      "-of", "json", file,
    ], { encoding: "utf8" });
    return JSON.parse(out);
  } catch (e) {
    return { error: String(e.stderr || e.message) };
  }
}

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
    build: { outDir: distDir, emptyOutDir: true },
  });

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

    console.log("\n== dimension-aware H.264 probe ==");
    for (const [w, h] of [[1280, 720], [1080, 1080], [1080, 1920]]) {
      const r = await page.evaluate(`window.__probeGeometry(${w}, ${h})`);
      console.log(`  ${w}×${h} → ${r.codec || "null"}`);
      check(`probe ${w}×${h} picks an H.264 codec`, typeof r.codec === "string" && r.codec.startsWith("avc1."), String(r.codec));
    }

    /* ---- hard check: 1 s 1080×1080 MP4 ---- */
    console.log("\n== MP4 export 1080×1080 (1:1, 1 s) ==");
    const sq = await page.evaluate("window.__runAt(1080, 1080)");
    console.log(JSON.stringify({ ...sq, b64: undefined }));
    if (sq.ok && sq.format === "mp4") {
      const file = path.join(outDir, "export-1080x1080.mp4");
      fs.writeFileSync(file, Buffer.from(sq.b64, "base64"));
      console.log("saved", file, sq.size, "bytes in", sq.ms, "ms");
      console.log("\n-- ffprobe export-1080x1080.mp4 --\n" + ffprobe(file));
      const j = ffprobeJson(file);
      const streams = j.streams || [];
      const v = streams.find((s) => s.codec_type === "video");
      check("1080×1080 MP4 has exactly 1 stream", streams.length === 1, `${streams.length} stream(s)`);
      check("1080×1080 MP4 stream is h264 video", v?.codec_name === "h264", v?.codec_name);
      check("1080×1080 MP4 pixel size is 1080×1080", v?.width === 1080 && v?.height === 1080, `${v?.width}×${v?.height}`);
      check("1080×1080 MP4 duration ≈ 1.000 s", Math.abs(parseFloat(j.format?.duration) - 1) < 0.05, j.format?.duration);
    } else {
      console.log("1080×1080 MP4 export FAILED:", sq.error || `fell back to ${sq.format}`, "\n", sq.stack || "");
      failures++;
    }

    /* ---- 1080×1920 (9:16) — asserted; sandbox encoder limits would be
       reported as an environment note, not a code bug ---- */
    console.log("\n== MP4 export 1080×1920 (9:16, 1 s) ==");
    const vert = await page.evaluate("window.__runAt(1080, 1920)");
    console.log(JSON.stringify({ ...vert, b64: undefined }));
    if (vert.ok && vert.format === "mp4") {
      const file = path.join(outDir, "export-1080x1920.mp4");
      fs.writeFileSync(file, Buffer.from(vert.b64, "base64"));
      console.log("saved", file, vert.size, "bytes in", vert.ms, "ms");
      console.log("\n-- ffprobe export-1080x1920.mp4 --\n" + ffprobe(file));
      const j = ffprobeJson(file);
      const v = (j.streams || []).find((s) => s.codec_type === "video");
      check("1080×1920 MP4 stream is h264 video", v?.codec_name === "h264", v?.codec_name);
      check("1080×1920 MP4 pixel size is 1080×1920", v?.width === 1080 && v?.height === 1920, `${v?.width}×${v?.height}`);
      check("1080×1920 MP4 duration ≈ 1.000 s", Math.abs(parseFloat(j.format?.duration) - 1) < 0.05, j.format?.duration);
    } else {
      console.log("NOTE: 1080×1920 MP4 did not encode in this sandbox:", vert.error || `fell back to ${vert.format}`);
      console.log("      (environment limitation — 1080×1080 above is the required proof; the L5.0 probe candidate covers 1920-height encodes on full browsers)");
      check("1080×1920 MP4 export", false, vert.error || `format=${vert.format}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nratio harness done — all checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
