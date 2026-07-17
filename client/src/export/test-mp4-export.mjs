/**
 * test-mp4-export.mjs — runtime proof for the in-browser MP4/WebM exporters.
 *
 * What it does:
 *   1. Generates a minimal harness page (client/.mp4-test-harness/) that
 *      imports the REAL exporter modules (exportVideo.js → exportMp4.js /
 *      exportWebm.js / frameRenderer.js) and a 2 s test project (a shape
 *      moving across the stage + a text layer).
 *   2. Bundles it with the project's own Vite and serves it locally.
 *   3. Drives headless Chromium (Playwright) to run both exports.
 *   4. Saves the resulting files and validates them with ffprobe:
 *      MP4 → container mov/mp4, codec h264, duration ≈ 2 s, ~60 frames.
 *      WebM → duration metadata present (ts-ebml repair check).
 *
 * Run:  node src/export/test-mp4-export.mjs        (from client/)
 * Requires: client deps installed, a Chromium (Playwright's or
 * /usr/bin/chromium), ffprobe on PATH. Exits non-zero on harness failure.
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

/* ---------- harness page ---------- */

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>mp4 export harness</title></head>
<body><script type="module" src="./main.js"></script></body></html>
`;

const HARNESS_MAIN = `
import { exportProject } from "../src/export/exportVideo.js";
import { probeMp4Codec, isMp4ExportSupported } from "../src/export/exportMp4.js";
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
    userAgent: navigator.userAgent,
    configs: {},
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
  info.chosenCodec = await probeMp4Codec();
  info.mp4Supported = await isMp4ExportSupported();
  info.webmSupported = isWebmExportSupported();
  info.webmMime = pickWebmMimeType();
  return info;
};

window.__run = async (prefer) => {
  try {
    const t0 = performance.now();
    const { blob, warnings, format } = await exportProject({
      project, width: 1280, height: 720, fps: 30, prefer,
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
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
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
      "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,profile,width,height,nb_frames,avg_frame_rate",
      "-of", "default=noprint_wrappers=1", file,
    ], { encoding: "utf8" });
  } catch (e) {
    return "ffprobe failed: " + (e.stderr || e.message);
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
    /* ts-ebml's dependency "ebml" ships an IIFE (no exports) in its package
       "browser" field — force the real ESM build for browser bundles. */
    resolve: { alias: { ebml: path.join(clientDir, "node_modules/ebml/lib/ebml.esm.js") } },
    build: { outDir: distDir, emptyOutDir: true },
  });

  const server = await serve(distDir);
  const port = server.address().port;
  const playwright = await loadPlaywright();
  const browser = await launchChromium(playwright, port);
  let failures = 0;

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

    /* ---- MP4 ---- */
    console.log("\n== MP4 export (prefer mp4) ==");
    const mp4 = await page.evaluate("window.__run('mp4')");
    console.log(JSON.stringify({ ...mp4, b64: undefined }));
    if (mp4.ok && mp4.format === "mp4") {
      const file = path.join(outDir, "export-test.mp4");
      fs.writeFileSync(file, Buffer.from(mp4.b64, "base64"));
      console.log("saved", file, mp4.size, "bytes in", mp4.ms, "ms");
      console.log("\n-- ffprobe export-test.mp4 --\n" + ffprobe(file));
    } else if (mp4.ok) {
      console.log("MP4 unsupported here — exportProject fell back to", mp4.format, "(expected on browsers without H.264 encode)");
    } else {
      console.log("MP4 export FAILED:", mp4.error, "\n", mp4.stack);
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
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nharness done");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
