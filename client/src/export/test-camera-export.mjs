/**
 * test-camera-export.mjs — runtime proof for the 2.5D scene camera + parallax.
 *
 * Test scene (1280×720, 2 s): a RED rect at x=500 with props.depth=1 and a
 * BLUE rect at x=800 with no depth (world-locked), plus a camera whose x is
 * keyframed 0 → 400 over the first 1 s (linear, then holds).
 * At t=500 ms the camera x is 200, so:
 *   · blue (depth 0, f=1) renders at 800 − 200·1 = 600  (−200 px)
 *   · red  (depth 1, f=2) renders at 500 − 200·2 = 100  (−400 px, 2× the shift)
 *
 * Checks, all driven through the REAL modules in headless Chromium:
 *   1. PREVIEW DOM (the editor's render path — StageObject with a camera
 *      prop): polygon bboxes at t=0 vs t=500 match the formula, and a zoom-2
 *      camera scales depth-0 by 2 and depth-1 by 3 about the stage center.
 *   2. IDENTITY: a frame of the same project WITHOUT a camera field renders
 *      pixel-identical to the camera project at t=0 (camX=0) — the old-project
 *      guarantee (createFrameRenderer → canvas → ImageData hash).
 *   3. EXPORTED MP4: the camera project exports; ffprobe shows one h264
 *      1280×720 stream ≈ 2 s; frames 0 and 15 extracted with ffmpeg show the
 *      same red/blue centroids as the preview DOM (preview/export parity).
 *
 * Run:  node src/export/test-camera-export.mjs        (from client/)
 * Requires: client deps, a Chromium (Playwright's or /usr/bin/chromium),
 * ffprobe + ffmpeg on PATH. Exits non-zero on failure.
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
const harnessDir = path.join(clientDir, ".camera-test-harness");
const distDir = path.join(harnessDir, "dist");
const outDir = path.join(harnessDir, "out");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — got: ${detail}` : ""}`); }
}

/* ---------- harness page ---------- */

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>camera export harness</title></head>
<body><div id="preview" style="position:fixed;left:-100000px;top:0;width:1280px;height:720px;overflow:hidden;"></div><script type="module" src="./main.js"></script></body></html>
`;

const HARNESS_MAIN = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { exportProject } from "../src/export/exportVideo.js";
import { createFrameRenderer } from "../src/export/frameRenderer.js";
import { StageObject } from "../src/components/GraphicDestinationMotion.jsx";

const rect = (id, name, x, fill, depth) => ({
  id, type: "shape", name, locked: false, hidden: false,
  tracks: {},
  props: { x, y: 360, scale: 1, rotation: 0, opacity: 1, fill, w: 120, h: 120,
    inT: 0, outT: null, path: null, prog: 0, shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0,
    ...(depth != null ? { depth } : {}) },
});

/* camera x: 0 → 400 over the first second (linear), then holds */
export const project = {
  app: "graphic-destination-motion", v: 5,
  stage: { w: 1280, h: 720, dur: 2000, bg: "#101218" },
  brands: [], brandId: null,
  objects: [rect("ob1", "Near red", 500, "#FF0000", 1), rect("ob2", "World blue", 800, "#0000FF")],
  camera: { tracks: { x: [{ t: 0, v: 0, ease: "linear" }, { t: 1000, v: 400, ease: "linear" }] } },
};
const noCameraProject = JSON.parse(JSON.stringify(project));
delete noCameraProject.camera;
window.__proj = project;

/* ---- 1. preview DOM path: render the exact editor component and measure ---- */
const previewHost = document.getElementById("preview");
const previewRoot = createRoot(previewHost);
window.__previewMeasure = (proj, time) => {
  flushSync(() => previewRoot.render(
    h("div", { style: { width: 1280, height: 720, position: "relative", overflow: "hidden", background: "#101218" } },
      proj.objects.map((o) => h(StageObject, { key: o.id, obj: o, time, stage: { w: 1280, h: 720 }, camera: proj.camera || null, selected: false, interactive: false })))
  ));
  const out = {};
  previewHost.querySelectorAll("polygon").forEach((pg) => {
    const r = pg.getBoundingClientRect();
    out[pg.getAttribute("fill")] = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  });
  return out;
};

/* ---- 2. raster identity: render one frame via createFrameRenderer, hash the pixels ---- */
window.__frameHash = async (proj, time) => {
  const cv = document.createElement("canvas");
  cv.width = 1280; cv.height = 720;
  const ctx = cv.getContext("2d");
  const renderer = await createFrameRenderer({ project: proj, ctx, width: 1280, height: 720, warn: () => {} });
  await renderer.renderFrame(time);
  renderer.dispose();
  const d = ctx.getImageData(0, 0, 1280, 720).data;
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 4) {
    h1 = Math.imul(h1 ^ (d[i] + d[i + 1] * 256 + d[i + 2] * 65536), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ d[i + 3], 16777619) >>> 0;
  }
  return h1 + ":" + h2;
};

/* ---- 3. mp4 export ---- */
function blobToBase64(blob) {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  });
}
window.__exportMp4 = async () => {
  try {
    const { blob, warnings, format } = await exportProject({ project, width: 1280, height: 720, fps: 30, prefer: "mp4" });
    return { ok: true, format, size: blob.size, warnings, b64: await blobToBase64(blob) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
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

/* ---------- playwright / chromium (same probing as test-mp4-export) ---------- */

async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const candidates = [path.join(clientDir, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"];
  for (const base of candidates) {
    try { return req(req.resolve("playwright", { paths: [base] })); } catch { /* next */ }
  }
  throw new Error("playwright not found");
}
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  `${process.env.HOME}/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`,
  null,
].filter((p, i, a) => p !== undefined && a.indexOf(p) === i);
async function launchChromium(playwright, port) {
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"];
  for (const executablePath of CHROMIUM_CANDIDATES) {
    try {
      const browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : {}), args });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/`);
      const hasVE = await page.evaluate("typeof VideoEncoder !== 'undefined'");
      await page.close();
      if (hasVE) { console.log("using browser:", executablePath || "playwright-default"); return browser; }
      await browser.close();
    } catch { /* next candidate */ }
  }
  throw new Error("no usable chromium found");
}

/* ---------- ffmpeg helpers ---------- */

function ffprobe(file) {
  return execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,profile,width,height,nb_frames,avg_frame_rate,duration",
    "-of", "default=noprint_wrappers=1", file,
  ], { encoding: "utf8" });
}
/* extract frames n0,n1 as PNGs, return per-frame red/blue pixel centroids */
function frameCentroids(mp4, n0, n1) {
  const raw = path.join(outDir, `frames-${n0}-${n1}.rgb`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-vf", `select='eq(n,${n0})+eq(n,${n1})'`, "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", raw]);
  const buf = fs.readFileSync(raw);
  const frameBytes = 1280 * 720 * 3;
  const out = [];
  for (let fi = 0; fi < 2; fi++) {
    const base = fi * frameBytes;
    const c = { red: [0, 0, 0], blue: [0, 0, 0] }; /* sx, sy, count */
    for (let p = 0; p < frameBytes; p += 3) {
      const r = buf[base + p], g = buf[base + p + 1], b = buf[base + p + 2];
      const px = (p / 3) % 1280, py = Math.floor(p / 3 / 1280);
      if (r > 180 && g < 90 && b < 90) { c.red[0] += px; c.red[1] += py; c.red[2]++; }
      else if (b > 180 && r < 90 && g < 90) { c.blue[0] += px; c.blue[1] += py; c.blue[2]++; }
    }
    out.push({ red: { cx: c.red[0] / c.red[2], cy: c.red[1] / c.red[2], n: c.red[2] }, blue: { cx: c.blue[0] / c.blue[2], cy: c.blue[1] / c.blue[2], n: c.blue[2] } });
  }
  return out;
}

/* ---------- main ---------- */

async function main() {
  fs.rmSync(harnessDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(harnessDir, "index.html"), HARNESS_HTML);
  fs.writeFileSync(path.join(harnessDir, "main.js"), HARNESS_MAIN);

  console.log("Bundling the camera harness with Vite…");
  await build({
    configFile: false, logLevel: "silent", root: harnessDir, plugins: [react()],
    /* ts-ebml's dependency "ebml" ships an IIFE (no exports) in its package
       "browser" field — force the real ESM build for browser bundles. */
    resolve: { alias: { ebml: path.join(clientDir, "node_modules/ebml/lib/ebml.esm.js") } },
    build: { outDir: distDir, emptyOutDir: true },
  });

  const server = await serve(distDir);
  const port = server.address().port;
  const playwright = await loadPlaywright();
  const browser = await launchChromium(playwright, port);

  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 600)));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[console]", m.type(), m.text().slice(0, 300)); });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction("window.__ready === true");

    /* ---- 1. preview DOM (editor render path) ---- */
    console.log("\npreview DOM (StageObject + camera — the editor's render path)");
    const projJson = await page.evaluate("window.__proj");
    const at0 = await page.evaluate((p) => window.__previewMeasure(p, 0), projJson);
    const at500 = await page.evaluate((p) => window.__previewMeasure(p, 500), projJson);
    const zoomProj = JSON.parse(JSON.stringify(projJson));
    zoomProj.camera = { tracks: { zoom: [{ t: 0, v: 2, ease: "linear" }] } };
    const z1 = await page.evaluate((p) => window.__previewMeasure(p, 500), zoomProj);

    console.log("  t=0:   red cx=" + at0["#FF0000"].cx.toFixed(1) + " · blue cx=" + at0["#0000FF"].cx.toFixed(1));
    console.log("  t=500: red cx=" + at500["#FF0000"].cx.toFixed(1) + " · blue cx=" + at500["#0000FF"].cx.toFixed(1));
    /* the preview div sits at left:-100000px (off-screen) — normalize cx by that */
    const OFF = -100000;
    const dRed = at500["#FF0000"].cx - at0["#FF0000"].cx;
    const dBlue = at500["#0000FF"].cx - at0["#0000FF"].cx;
    check("t=0: red at 500 · blue at 800", Math.abs(at0["#FF0000"].cx - OFF - 500) < 2 && Math.abs(at0["#0000FF"].cx - OFF - 800) < 2, `red=${(at0["#FF0000"].cx - OFF).toFixed(1)} blue=${(at0["#0000FF"].cx - OFF).toFixed(1)}`);
    check("t=500 (camX=200): blue shifted −200 (depth 0)", Math.abs(dBlue + 200) < 2, `Δblue=${dBlue.toFixed(1)}`);
    check("t=500 (camX=200): red shifted −400 (depth 1 = 2× opposite)", Math.abs(dRed + 400) < 2, `Δred=${dRed.toFixed(1)}`);
    check("red moved exactly 2× the depth-0 layer", Math.abs(Math.abs(dRed / dBlue) - 2) < 0.02, `ratio=${(dRed / dBlue).toFixed(3)}`);
    check("zoom 2: depth-0 layer scaled ×2 about center", Math.abs(z1["#0000FF"].w / at500["#0000FF"].w - 2) < 0.02, `w=${z1["#0000FF"].w.toFixed(1)} vs ${at500["#0000FF"].w.toFixed(1)}`);
    check("zoom 2: depth-1 layer scaled ×3 about center", Math.abs(z1["#FF0000"].w / at500["#FF0000"].w - 3) < 0.02, `w=${z1["#FF0000"].w.toFixed(1)} vs ${at500["#FF0000"].w.toFixed(1)}`);
    check("zoom scales about the STAGE CENTER (blue at 800 → 640+(800−640)·2 = 960)", Math.abs(z1["#0000FF"].cx - OFF - 960) < 3, `cx=${(z1["#0000FF"].cx - OFF).toFixed(1)}`);

    /* ---- 2. raster identity (old projects render unchanged) ---- */
    console.log("\nraster identity (createFrameRenderer → canvas pixels)");
    const hashCam0 = await page.evaluate((p) => window.__frameHash(p, 0), projJson);
    const noCam = JSON.parse(JSON.stringify(projJson)); delete noCam.camera;
    const hashNoCam0 = await page.evaluate((p) => window.__frameHash(p, 0), noCam);
    check("camera at identity (t=0, camX=0) == no-camera project, pixel-identical frame", hashCam0 === hashNoCam0, hashCam0.slice(0, 18) + "…");
    const hashCam500 = await page.evaluate((p) => window.__frameHash(p, 500), projJson);
    check("camera moved (t=500) actually changes the frame", hashCam500 !== hashCam0);

    /* ---- 3. exported MP4 ---- */
    console.log("\nexported MP4 (exportProject → mp4-muxer → ffprobe/ffmpeg)");
    const res = await page.evaluate("window.__exportMp4()");
    check("export succeeded", res.ok === true, res.ok ? `${res.format} · ${(res.size / 1024).toFixed(0)} KB` : res.error);
    if (res.ok) {
      const mp4 = path.join(outDir, "camera-export.mp4");
      fs.writeFileSync(mp4, Buffer.from(res.b64, "base64"));
      const probe = ffprobe(mp4);
      console.log(probe.split("\n").map((l) => "    " + l).join("\n"));
      check("ffprobe: mp4 container", /mov,mp4,m4a/.test(probe));
      check("ffprobe: one h264 video stream at 1280×720", /codec_name=h264/.test(probe) && /width=1280/.test(probe) && /height=720/.test(probe));
      check("ffprobe: ~2 s duration", Math.abs(parseFloat((probe.match(/duration=([\d.]+)/) || [])[1]) - 2) < 0.15, (probe.match(/duration=([\d.]+)/) || [])[1]);
      const [f0, f15] = frameCentroids(mp4, 0, 15);
      console.log(`  frame 0:  red cx=${f0.red.cx.toFixed(1)} (n=${f0.red.n}) · blue cx=${f0.blue.cx.toFixed(1)} (n=${f0.blue.n})`);
      console.log(`  frame 15: red cx=${f15.red.cx.toFixed(1)} (n=${f15.red.n}) · blue cx=${f15.blue.cx.toFixed(1)} (n=${f15.blue.n})`);
      check("exported frame 0: red ≈ 500 · blue ≈ 800", Math.abs(f0.red.cx - 500) < 4 && Math.abs(f0.blue.cx - 800) < 4, `red=${f0.red.cx.toFixed(1)} blue=${f0.blue.cx.toFixed(1)}`);
      check("exported frame 15 (t=500 ms): blue ≈ 600 (depth 0, −200)", Math.abs(f15.blue.cx - 600) < 4, `blue=${f15.blue.cx.toFixed(1)}`);
      check("exported frame 15 (t=500 ms): red ≈ 100 (depth 1, −400 = 2× opposite)", Math.abs(f15.red.cx - 100) < 4, `red=${f15.red.cx.toFixed(1)}`);
      check("exported motion ratio red/blue ≈ 2", Math.abs((f0.red.cx - f15.red.cx) / (f0.blue.cx - f15.blue.cx) - 2) < 0.06, `ratio=${((f0.red.cx - f15.red.cx) / (f0.blue.cx - f15.blue.cx)).toFixed(3)}`);
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${failures ? failures + " FAILURE(S)" : "all camera checks passed"} — artifacts in ${outDir}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
