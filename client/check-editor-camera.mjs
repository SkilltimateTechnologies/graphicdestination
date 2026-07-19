/**
 * check-editor-camera.mjs — UI smoke for the 2.5D camera editor surface.
 * Mounts the REAL editor (GraphicDestinationMotion) in headless Chromium and
 * drives it with Playwright: camera lane pinned at the top of the timeline →
 * click selects the camera → Inspector camera card with PropRows → "Add
 * keyframe at playhead" → lane badge + camera frame corners → Reset →
 * per-object Depth slider.
 *
 * Run:  node check-editor-camera.mjs        (from client/)
 * Requires: client deps + a Chromium (Playwright's or /usr/bin/chromium).
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.join(here, ".editor-camera-smoke");
const distDir = path.join(harnessDir, "dist");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — ${detail}` : ""}`); }
}

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body,#root{height:100%;margin:0}</style></head>
<body><div id="root"></div><script type="module" src="./main.js"></script></body></html>`;

const HARNESS_MAIN = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import GraphicDestinationMotion from "../src/components/GraphicDestinationMotion.jsx";
createRoot(document.getElementById("root")).render(h(GraphicDestinationMotion));
window.__ready = true;
`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json" };
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

async function main() {
  fs.rmSync(harnessDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(harnessDir, "index.html"), HARNESS_HTML);
  fs.writeFileSync(path.join(harnessDir, "main.js"), HARNESS_MAIN);
  console.log("Bundling the editor smoke harness with Vite…");
  await build({
    configFile: false, logLevel: "silent", root: harnessDir, plugins: [react()],
    build: { outDir: distDir, emptyOutDir: true, minify: false },
  });
  const server = await serve(distDir);
  const port = server.address().port;
  const req = createRequire(import.meta.url);
  let playwright = null;
  for (const base of [path.join(here, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"]) {
    try { playwright = req(req.resolve("playwright", { paths: [base] })); break; } catch { /* next */ }
  }
  if (!playwright) throw new Error("playwright not found");
  let browser = null;
  for (const executablePath of [process.env.CHROMIUM_PATH, "/usr/bin/chromium", null].filter((p, i, a) => p !== undefined && a.indexOf(p) === i)) {
    try { browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] }); break; } catch { /* next */ }
  }
  if (!browser) throw new Error("no usable chromium found");

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    page.on("pageerror", (e) => console.log("[pageerror]", (e.stack || String(e)).slice(0, 1200)));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction("window.__ready === true");
    await page.waitForTimeout(1200); /* fonts + first paint */

    /* ---- camera lane pinned at the top of the timeline ---- */
    const lane = page.locator('div[title^="Scene camera — click to select"]');
    check("camera lane pinned in the timeline label column", await lane.count() === 1);
    const laneTrack = page.locator('div[title="Scene camera · drag empty stage space to pan · Alt+wheel (or select this lane) to zoom"]');
    check("camera lane track with empty-state hint", await laneTrack.count() === 1 && (await laneTrack.textContent()).includes("◆ add a keyframe or pick a preset in the inspector"));

    /* ---- click selects the camera → Inspector card ---- */
    await lane.click();
    await page.waitForTimeout(150);
    check("Inspector shows the Scene camera card", await page.getByText("Scene camera", { exact: true }).count() >= 1);
    check("camera card has Pan X / Pan Y / Zoom prop rows", await page.getByText("Pan X", { exact: true }).count() === 1 && await page.getByText("Pan Y", { exact: true }).count() === 1 && await page.getByText("Zoom", { exact: true }).count() === 1);
    check("camera frame corners on stage while camera selected", await page.evaluate(() => document.querySelectorAll('[style*="z-index: 65"]').length) >= 1);

    /* ---- add keyframe at playhead ---- */
    await page.getByText("◆ Add keyframe at playhead", { exact: true }).click();
    await page.waitForTimeout(150);
    check("lane badge shows 3◆ after add-keyframe", (await lane.textContent()).includes("3◆"));
    check("three diamonds on the camera lane", await laneTrack.locator(".gd-kf").count() === 3);
    const proj = await page.evaluate(() => JSON.parse(window.__lastProject || "{}"));
    void proj;

    /* ---- reset camera ---- */
    await page.getByText("⟲ Reset camera", { exact: true }).click();
    await page.waitForTimeout(150);
    check("reset camera clears the lane", !(await lane.textContent()).includes("◆") && await laneTrack.locator(".gd-kf").count() === 0);

    /* ---- depth slider on an inserted object ----
       R9w3: the Text rail button opens the presets/effects drawer — the
       "Normal text" preset performs the plain insert. */
    await page.locator('button:has(span:text-is("Text"))').first().click();
    await page.waitForTimeout(200);
    await page.locator('[data-text-panel] button[data-preset="body"]').first().click();
    await page.waitForTimeout(200);
    const depth = page.locator('input[aria-label="Parallax depth"]');
    check("Depth slider in the object's first card", await depth.count() === 1);
    const attrs = await depth.evaluate((el) => ({ min: el.min, max: el.max, step: el.step }));
    check("Depth slider range −0.9…+1.5 step 0.05", attrs.min === "-0.9" && attrs.max === "1.5" && attrs.step === "0.05", JSON.stringify(attrs));
    check("Depth readout starts at 0.00 (not amber)", await page.evaluate(() => {
      const s = document.querySelector('input[aria-label="Parallax depth"]').parentElement.querySelector("span:last-child");
      return s.textContent === "0.00" && !s.style.color.includes("245, 165, 36");
    }));
    await depth.evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "1");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(150);
    check("Depth = 1.00 readout turns amber", await page.evaluate(() => {
      const s = document.querySelector('input[aria-label="Parallax depth"]').parentElement.querySelector("span:last-child");
      return s.textContent === "1.00" && s.style.color.includes("245, 165, 36");
    }));
    /* depth must NOT be keyframable/serialized when 0 — set back and confirm the prop is removed */
    await depth.evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "0");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(150);
    check("Depth back to 0.00 clears amber", await page.evaluate(() => {
      const s = document.querySelector('input[aria-label="Parallax depth"]').parentElement.querySelector("span:last-child");
      return s.textContent === "0.00" && !s.style.color.includes("245, 165, 36");
    }));
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${failures ? failures + " FAILURE(S)" : "all editor camera UI checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
