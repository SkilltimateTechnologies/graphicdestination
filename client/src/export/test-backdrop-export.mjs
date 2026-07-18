/**
 * test-backdrop-export.mjs — runtime proof that an animated BACKDROP layer
 * (engine/backdrops.js → StageObject) survives the REAL export path:
 * frameRenderer.js rasterizes the same StageObject markup inside
 * <foreignObject>, so this verifies Chromium rasterizes the gradient-heavy
 * backdrop SVG there — not just in the editor preview.
 *
 * Scenario — a 1 s comp: one full-stage "aurora" backdrop (Amber Dusk,
 * loopMs 1000 so a whole loop plays inside the export) plus a white title
 * on top (proves the backdrop sits BEHIND content). Exported via the REAL
 * exportProject().
 *
 * Frame analysis (ffmpeg → raw rgb24):
 *   1. Valid MP4 (~1.0 s, h264, 1280×720).
 *   2. Frames are NON-BLANK (stddev ≫ 0) at two different times.
 *   3. It ANIMATES: mean |F(0.2s) − F(0.7s)| over the frame is significant.
 *   4. Colors sane: mean pixel is neither black-crushed nor white-clipped,
 *      and the Amber Dusk tint reads warm (R > B) in a field area.
 *   5. The title pixel reads bright over the darker backdrop (compositing).
 *
 * Run:  node src/export/test-backdrop-export.mjs        (from client/)
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
const harnessDir = path.join(clientDir, ".backdrop-test-harness");
const distDir = path.join(harnessDir, "dist");
const outDir = path.join(harnessDir, "out");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — got: ${detail}` : ""}`); }
}

/* ---------- harness page ---------- */
const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>backdrop export harness</title></head>
<body><script type="module" src="./main.js"></script></body></html>
`;

/* 1 s project — full-stage aurora backdrop (bottom of the stack, loopMs
   1000 = one full loop inside the export) + a white title above it. */
const HARNESS_MAIN = `
import { exportProject } from "../src/export/exportVideo.js";

const layerBase = { tracks: {}, locked: false, hidden: false };
const project = {
  app: "graphic-destination-motion", v: 5,
  stage: { w: 1280, h: 720, dur: 1000, bg: "#101218" },
  brands: [], brandId: null,
  objects: [
    { ...layerBase, id: "ob1", type: "backdrop", name: "Aurora Background",
      props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 1280, h: 720,
        inT: 0, outT: null, path: null, prog: 0, variant: "aurora", theme: "amberDusk",
        colors: ["#160B06", "#F5A524", "#FF7847", "#FFD984", "#E5636A"], speed: 1, intensity: 1, loopMs: 1000, seed: 11 } },
    { ...layerBase, id: "ob2", type: "text", name: "Title",
      props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 0, h: 0,
        inT: 0, outT: null, path: null, prog: 0, text: "ZWOOSH", fontSize: 120, fontWeight: 800,
        textFx: null, fontFamily: "Archivo Black", ls: 2, upper: false, pathMode: "flow",
        bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none" } },
  ],
};

function blobToBase64(blob) {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  });
}

window.__run = async () => {
  try {
    const { blob, warnings, format } = await exportProject({ project, width: 1280, height: 720, fps: 30, prefer: "mp4" });
    const b64 = await blobToBase64(blob);
    return { ok: true, format, size: blob.size, warnings, b64 };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), stack: String((e && e.stack) || "") };
  }
};
window.__ready = true;
`;

/* ---------- static server ---------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
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

/* ---------- playwright / chromium (same discovery as test-filters-export) ---------- */
async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const candidates = [path.join(clientDir, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"];
  for (const base of candidates) {
    try { return req(req.resolve("playwright", { paths: [base] })); } catch { /* next */ }
  }
  throw new Error("playwright not found in " + candidates.join(", "));
}
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`,
  `${process.env.HOME}/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome`,
  null,
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
      await page.close();
      attempts.push(`${executablePath || "playwright-default"}: VideoEncoder=${hasVE}`);
      if (hasVE) { console.log("using browser:", executablePath || "playwright-default"); return browser; }
      await browser.close();
    } catch (e) {
      attempts.push(`${executablePath || "playwright-default"}: launch failed (${e.message.split("\n")[0]})`);
    }
  }
  console.log("browser attempts:\n  " + attempts.join("\n  "));
  throw new Error("no usable chromium found");
}

/* ---------- ffprobe / ffmpeg frame extraction ---------- */
function ffprobeJson(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,nb_frames",
    "-of", "json", file,
  ], { encoding: "utf8" });
  return JSON.parse(out);
}
function extractFrame(file, tSec, rawPath, W = 1280, H = 720) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(tSec), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", rawPath]);
  const buf = fs.readFileSync(rawPath);
  if (buf.length !== W * H * 3) throw new Error(`frame size ${buf.length} != ${W * H * 3}`);
  return buf;
}

/* ---------- pixel stats ---------- */
const px = (raw, W, x, y) => { const i = (y * W + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };
function frameMeanStd(raw) {
  let n = raw.length, sum = 0, sq = 0;
  for (let i = 0; i < n; i += 7) { sum += raw[i]; sq += raw[i] * raw[i]; } /* sampled */
  n = Math.ceil(n / 7);
  const m = sum / n;
  return { mean: m, std: Math.sqrt(Math.max(0, sq / n - m * m)) };
}
function meanAbsDiff(ra, rb, W, x0, y0, x1, y1) {
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * W + x) * 3;
    sum += (Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2])) / 3;
    n++;
  }
  return sum / n;
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
    resolve: { alias: { ebml: path.join(clientDir, "node_modules/ebml/lib/ebml.esm.js") } },
    build: { outDir: distDir, emptyOutDir: true },
  });

  const server = await serve(distDir);
  const port = server.address().port;
  const playwright = await loadPlaywright();
  const browser = await launchChromium(playwright, port);

  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", null, { timeout: 30_000 });

    console.log("\n== export: 1 s aurora backdrop (Amber Dusk, loop 1000ms) + title ==");
    const R = await page.evaluate("window.__run()");
    console.log(JSON.stringify({ ...R, b64: undefined }));

    if (!R.ok) {
      console.log("export FAILED:", R.error);
      failures++;
    } else {
      const file = path.join(outDir, "backdrop-aurora.mp4");
      fs.writeFileSync(file, Buffer.from(R.b64, "base64"));

      const j = ffprobeJson(file);
      const vs = (j.streams || [])[0] || {};
      check("h264 MP4, 1280×720, ~1.0 s", R.format === "mp4" && vs.codec_name === "h264" && vs.width === 1280 && vs.height === 720 && Math.abs(parseFloat(j.format.duration) - 1) < 0.08, `${R.format} ${vs.codec_name} ${vs.width}x${vs.height} ${j.format.duration}s`);

      const f1 = extractFrame(file, 0.2, path.join(outDir, "f02.raw"));
      const f2 = extractFrame(file, 0.7, path.join(outDir, "f07.raw"));
      const W = 1280;
      const s1 = frameMeanStd(f1), s2 = frameMeanStd(f2);
      console.log(`\n-- frame stats --  0.2s mean ${s1.mean.toFixed(1)} std ${s1.std.toFixed(1)} · 0.7s mean ${s2.mean.toFixed(1)} std ${s2.std.toFixed(1)}`);
      check("frames non-blank (stddev > 5) at both times", s1.std > 5 && s2.std > 5, `${s1.std.toFixed(1)} / ${s2.std.toFixed(1)}`);

      const diff = meanAbsDiff(f1, f2, W, 0, 0, W, 720);
      console.log(`-- animation --  mean|F(0.2)−F(0.7)| full-frame ${diff.toFixed(2)}`);
      check("it animates: two times differ (> 2)", diff > 2, diff.toFixed(2));

      check("colors sane: mean pixel not black-crushed (< 8) or white-clipped (> 240)", s1.mean > 8 && s1.mean < 240 && s2.mean > 8 && s2.mean < 240, `${s1.mean.toFixed(1)} / ${s2.mean.toFixed(1)}`);

      /* Amber Dusk warmth in a field area away from the title (top-left quadrant) */
      const p1 = px(f1, W, 320, 140), p2 = px(f2, W, 960, 620);
      console.log(`-- palette --  field px @0.2s (320,140)=[${p1}] · @0.7s (960,620)=[${p2}]`);
      check("Amber Dusk tint reads warm (R > B) in field areas", p1[0] > p1[2] && p2[0] > p2[2], `[${p1}] / [${p2}]`);

      /* title compositing: bright glyph pixels over the darker backdrop */
      const pt = px(f1, W, 640, 355), pb = px(f1, W, 640, 690);
      console.log(`-- compositing --  title px (640,355)=[${pt}] · bottom-edge backdrop px (640,690)=[${pb}]`);
      check("title renders bright over the backdrop (min channel > 150)", pt.every((c) => c > 150), `[${pt}]`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nbackdrop export harness done — all checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
