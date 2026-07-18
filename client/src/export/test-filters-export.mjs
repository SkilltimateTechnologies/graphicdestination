/**
 * test-filters-export.mjs — runtime proof that layer FILTERS (props.blur /
 * props.blend, engine/filters.js → StageObject) survive the EXPORT path
 * (frameRenderer.js rasterizes the same StageObject markup inside
 * <foreignObject>, so this verifies Chromium rasterizes CSS blur() and
 * mix-blend-mode there — not just in the editor preview).
 *
 * Scenario — a 1 s comp, exported twice via the REAL exportProject():
 *   A = baseline:   text "BLUR ME" sharp (blur 0) + amber ellipse blend normal
 *   B = filtered:   same text blur 8            + same ellipse blend screen
 * Layout: white rect bottom-center; the amber ellipse overlaps it and sticks
 * out over the dark stage bg; big white text above.
 *
 * Frame analysis (ffmpeg → raw rgb24 @ 0.5 s, plain JS stats):
 *   1. Both exports are valid MP4s (~1.0 s, h264).
 *   2. Frames are NON-BLANK (stddev ≫ 0).
 *   3. Blur is VISIBLE: mean |A−B| in the text box is significant, and the
 *      gradient energy of B there is well below A's (soft edges).
 *   4. Screen blend WORKS in the export: where the ellipse overlaps the
 *      white rect, B reads ≈ white (screen(white, amber) = white) while A
 *      reads amber; where the ellipse hangs over the dark bg, B is
 *      brightened per the screen formula.
 *
 * Run:  node src/export/test-filters-export.mjs        (from client/)
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
const harnessDir = path.join(clientDir, ".filters-test-harness");
const distDir = path.join(harnessDir, "dist");
const outDir = path.join(harnessDir, "out");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — got: ${detail}` : ""}`); }
}

/* ---------- harness page ---------- */

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>filters export harness</title></head>
<body><script type="module" src="./main.js"></script></body></html>
`;

/* 1 s project; __run(blur, blend) re-exports with different filter props.
   Geometry referenced by the pixel checks below:
     · text "BLUR ME" 120px white, centered (640,180) → text box x300..980 y110..250
     · white rect 500×300 centered (640,520)          → x390..890 y370..670
     · amber ellipse 340×340 centered (640,500)       → over-rect point (640,520),
       over-bg point (640,342) (ellipse top edge sticks out above the rect) */
const HARNESS_MAIN = `
import { exportProject } from "../src/export/exportVideo.js";

const layerBase = { tracks: {}, locked: false, hidden: false };
function projectWith(blur, blend) {
  const text = {
    ...layerBase, id: "ob1", type: "text", name: "Blur target",
    props: { x: 640, y: 180, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 0, h: 0,
      inT: 0, outT: null, path: null, prog: 0, text: "BLUR ME", fontSize: 120, fontWeight: 800,
      textFx: null, fontFamily: "Archivo Black", ls: 1, upper: false, pathMode: "flow",
      bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none", ...(blur ? { blur } : {}) },
  };
  const rect = {
    ...layerBase, id: "ob2", type: "shape", name: "White rect",
    props: { x: 640, y: 520, scale: 1, rotation: 0, opacity: 1, fill: "#FFFFFF", w: 500, h: 300,
      inT: 0, outT: null, path: null, prog: 0, shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0 },
  };
  const ellipse = {
    ...layerBase, id: "ob3", type: "shape", name: "Amber ellipse (" + blend + ")",
    props: { x: 640, y: 500, scale: 1, rotation: 0, opacity: 1, fill: "#F5A524", w: 340, h: 340,
      inT: 0, outT: null, path: null, prog: 0, shape: "ellipse", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0,
      ...(blend && blend !== "normal" ? { blend } : {}) },
  };
  return {
    app: "graphic-destination-motion", v: 5,
    stage: { w: 1280, h: 720, dur: 1000, bg: "#101218" },
    brands: [], brandId: null,
    objects: [text, rect, ellipse],
  };
}

function blobToBase64(blob) {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  });
}

window.__run = async (blur, blend) => {
  try {
    const { blob, warnings, format } = await exportProject({ project: projectWith(blur, blend), width: 1280, height: 720, fps: 30, prefer: "mp4" });
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

/* ---------- playwright / chromium (same discovery as test-mp4-export) ---------- */
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
/* one frame at t seconds as raw rgb24 */
function extractFrame(file, tSec, rawPath, W = 1280, H = 720) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(tSec), "-i", file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", rawPath]);
  const buf = fs.readFileSync(rawPath);
  if (buf.length !== W * H * 3) throw new Error(`frame size ${buf.length} != ${W * H * 3}`);
  return buf;
}

/* ---------- pixel stats ---------- */
const px = (raw, W, x, y) => { const i = (y * W + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };
function frameStd(raw) {
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
function gradientEnergy(raw, W, x0, y0, x1, y1) {
  let sum = 0, n = 0;
  for (let y = y0; y < y1 - 1; y += 2) for (let x = x0; x < x1 - 1; x += 2) {
    const i = (y * W + x) * 3, ix = (y * W + x + 1) * 3, iy = ((y + 1) * W + x) * 3;
    sum += (Math.abs(raw[ix] - raw[i]) + Math.abs(raw[ix + 1] - raw[i + 1]) + Math.abs(raw[ix + 2] - raw[i + 2])) / 3;
    sum += (Math.abs(raw[iy] - raw[i]) + Math.abs(raw[iy + 1] - raw[i + 1]) + Math.abs(raw[iy + 2] - raw[i + 2])) / 3;
    n += 2;
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

    console.log("\n== export A: blur 0 + blend normal (baseline) ==");
    const A = await page.evaluate("window.__run(0, 'normal')");
    console.log(JSON.stringify({ ...A, b64: undefined }));
    console.log("\n== export B: blur 8 + blend screen (filtered) ==");
    const B = await page.evaluate("window.__run(8, 'screen')");
    console.log(JSON.stringify({ ...B, b64: undefined }));

    if (!A.ok || !B.ok) {
      console.log("export FAILED:", A.error || B.error);
      failures++;
    } else {
      const fileA = path.join(outDir, "filters-A-blur0-normal.mp4");
      const fileB = path.join(outDir, "filters-B-blur8-screen.mp4");
      fs.writeFileSync(fileA, Buffer.from(A.b64, "base64"));
      fs.writeFileSync(fileB, Buffer.from(B.b64, "base64"));

      const jA = ffprobeJson(fileA), jB = ffprobeJson(fileB);
      const vA = (jA.streams || [])[0] || {}, vB = (jB.streams || [])[0] || {};
      check("A is h264 MP4, 1280×720, ~1.0 s", A.format === "mp4" && vA.codec_name === "h264" && Math.abs(parseFloat(jA.format.duration) - 1) < 0.08, `${A.format} ${vA.codec_name} ${jA.format.duration}s`);
      check("B is h264 MP4, 1280×720, ~1.0 s", B.format === "mp4" && vB.codec_name === "h264" && Math.abs(parseFloat(jB.format.duration) - 1) < 0.08, `${B.format} ${vB.codec_name} ${jB.format.duration}s`);

      const fA = extractFrame(fileA, 0.5, path.join(outDir, "A.raw"));
      const fB = extractFrame(fileB, 0.5, path.join(outDir, "B.raw"));
      const W = 1280;
      const sA = frameStd(fA), sB = frameStd(fB);
      console.log(`\n-- frame stats @0.5s --  A mean ${sA.mean.toFixed(1)} std ${sA.std.toFixed(1)} · B mean ${sB.mean.toFixed(1)} std ${sB.std.toFixed(1)}`);
      check("frames non-blank (stddev > 5)", sA.std > 5 && sB.std > 5, `A ${sA.std.toFixed(1)} / B ${sB.std.toFixed(1)}`);

      /* blur: text box x300..980 y110..250 */
      const diff = meanAbsDiff(fA, fB, W, 300, 110, 980, 250);
      const gA = gradientEnergy(fA, W, 300, 110, 980, 250);
      const gB = gradientEnergy(fB, W, 300, 110, 980, 250);
      console.log(`-- blur --  mean|A−B| in text box ${diff.toFixed(2)} · edge energy A ${gA.toFixed(2)} → B ${gB.toFixed(2)} (${((gB / gA) * 100).toFixed(0)}%)`);
      check("blur 8 visible: frames differ in text box (> 1.5)", diff > 1.5, diff.toFixed(2));
      check("blur 8 softens edges (< 80% of sharp energy)", gB < gA * 0.8, `${gB.toFixed(2)} vs ${gA.toFixed(2)}`);

      /* blend: ellipse over white rect (640,520) + over dark bg (640,342) */
      const pInA = px(fA, W, 640, 520), pInB = px(fB, W, 640, 520);
      const pOutA = px(fA, W, 640, 342), pOutB = px(fB, W, 640, 342);
      const pRect = px(fB, W, 430, 640);
      console.log(`-- blend --  over-rect A=[${pInA}] B=[${pInB}] · over-bg A=[${pOutA}] B=[${pOutB}] · plain rect B=[${pRect}]`);
      check("A (normal): ellipse over rect reads amber (b < 110)", pInA[0] > 200 && pInA[2] < 110, `[${pInA}]`);
      check("B (screen): ellipse over rect reads ≈ white (all ch > 230)", pInB.every((c) => c > 230), `[${pInB}]`);
      /* screen over #101218 bg ≈ (246,171,57) — vs normal amber (245,165,36):
         green +6, blue +21 (h264 rounds a few units) */
      check("B (screen): ellipse over dark bg brightened per the screen formula", pOutB[1] >= 168 && pOutB[2] > 45, `[${pOutA}] → [${pOutB}]`);
      check("sanity: rect outside the ellipse still white in B", pRect.every((c) => c > 225), `[${pRect}]`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nfilters export harness done — all checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
