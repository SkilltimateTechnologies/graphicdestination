/**
 * check-snapping-ui.mjs — browser smoke for smart snapping + alignment guides.
 * Mounts the REAL editor (GraphicDestinationMotion) in headless Chromium with a
 * deterministic two-rectangle project and drives canvas drags with Playwright:
 *
 *   1. body-drag near a sibling's left edge → lands EXACTLY on the shared x;
 *      an amber guide renders at that x mid-drag and disappears on pointer-up.
 *   2. drag near the canvas center → snaps both axes, two guides (640 / 360).
 *   3. magnet toggle OFF (persisted gd:snapping=0, dim icon) → no snap, no guides.
 *   4. Alt-drag with the toggle OFF → temporarily snaps (inversion).
 *   5. Alt-drag with the toggle ON → temporarily free (inversion), amber icon.
 *   6. west resize grip near a sibling's right edge → the edge snaps on; the
 *      drop lands on the SCALE track with base compensation (R8w3), so the
 *      TRACK-AWARE rendered size (objSize × valueAt(scale)) is what carries
 *      the snapped 286×120 — raw props.w/h are the compensated bases.
 *   7. rotation drags never snap and never show guides.
 *
 * Run:  node check-snapping-ui.mjs        (from client/)
 * Requires: client deps + a Chromium (Playwright's or /usr/bin/chromium).
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
/* R8w3: resize drops live on the scale track with base compensation — the
   rendered size is the TRACK-AWARE objSize × valueAt(scale) (real engine
   helpers, same math the renderer uses), not the raw compensated props. */
import { valueAt } from "./src/engine/keyframes.js";
import { objSize } from "./src/components/editor/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.join(here, ".snapping-ui-smoke");
const distDir = path.join(harnessDir, "dist");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`);
  else { failures++; console.log(`  FAIL ${name}${detail !== "" ? ` — ${detail}` : ""}`); }
}

const rect = (id, name, x, y, w, h, fill) => ({
  id, type: "shape", name, tracks: {}, locked: false, hidden: false,
  props: { shape: "rect", x, y, w, h, scale: 1, rotation: 0, opacity: 1, fill, fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0, inT: 0, outT: null, path: null, prog: 0 },
});
/* A: bbox [300,250]–[500,350] · B: bbox [840,490]–[960,610] */
const PROJECT = { app: "graphic-destination-motion", v: 5, stage: { w: 1280, h: 720, dur: 6000 }, objects: [rect("ob1", "A", 400, 300, 200, 100, "#5B8CFF"), rect("ob2", "B", 900, 550, 120, 120, "#6EE7B7")] };

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body,#root{height:100%;margin:0}</style></head>
<body><div id="root"></div><script type="module" src="./main.js"></script></body></html>`;

const HARNESS_MAIN = `
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import GraphicDestinationMotion from "../src/components/GraphicDestinationMotion.jsx";
createRoot(document.getElementById("root")).render(h(GraphicDestinationMotion, {
  initialProject: ${JSON.stringify(PROJECT)},
  onChange: (json) => { window.__lastProject = json; },
}));
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

const STAGE_RECT = `(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.style.width === "1280px" && d.style.height === "720px");
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, scale: r.width / 1280 };
})()`;

async function main() {
  fs.rmSync(harnessDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(harnessDir, "index.html"), HARNESS_HTML);
  fs.writeFileSync(path.join(harnessDir, "main.js"), HARNESS_MAIN);
  console.log("Bundling the snapping smoke harness with Vite…");
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

  const proj = async (page) => JSON.parse(await page.evaluate(() => window.__lastProject || "{}"));
  const stageRect = async (page) => page.evaluate(STAGE_RECT);
  const toScreen = (r, sx, sy) => ({ x: r.left + sx * r.scale, y: r.top + sy * r.scale });
  /* drag with a mid-drag probe: moves in steps, runs probe() while the pointer
     is still DOWN (guides live only during the drag), then releases */
  const dragProbe = async (page, from, ddx, ddy, probe) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (ddx * i) / 6, from.y + (ddy * i) / 6);
    if (probe) await probe();
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const guides = async (page) => page.evaluate(() => [...document.querySelectorAll(".gd-snap-guides > div")].map((d) => ({ axis: d.dataset.axis, pos: parseFloat(d.dataset.pos) })));
  const guideScreenX = async (page) => page.evaluate(() => {
    const line = document.querySelector('.gd-snap-guides > div[data-axis="x"] > div');
    if (!line) return null;
    const r = line.getBoundingClientRect();
    return r.left + r.width / 2;
  });
  const B = (p) => p.objects.find((o) => o.id === "ob2");

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    page.on("pageerror", (e) => console.log("[pageerror]", (e.stack || String(e)).slice(0, 1200)));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__ready && window.__lastProject);
    await page.waitForTimeout(300);
    let r = await stageRect(page);

    console.log("\n#0 toggle — default ON, amber magnet");
    const magnet = page.locator('button[title^="Snapping"]');
    check("magnet toggle exists in the zoom cluster", await magnet.count() === 1);
    const colOn = await magnet.evaluate((el) => getComputedStyle(el).color);
    check("default ON renders the amber magnet", colOn === "rgb(245, 165, 36)", colOn);
    check("default ON leaves gd:snapping unset (default)", await page.evaluate(() => localStorage.getItem("gd:snapping") === null));

    console.log("\n#1 body-drag — snaps to a sibling's left edge, guide at the shared x");
    let mid = null;
    await dragProbe(page, toScreen(r, 900, 550), -537 * r.scale, 3 * r.scale, async () => {
      mid = { g: await guides(page), gx: await guideScreenX(page) };
    });
    check("mid-drag: exactly one vertical guide at the shared x=300", mid.g.length === 1 && mid.g[0].axis === "x" && mid.g[0].pos === 300, JSON.stringify(mid.g));
    check("mid-drag: the guide sits at the shared x on screen", mid.gx != null && Math.abs(mid.gx - toScreen(r, 300, 0).x) <= 1.5, `guideX=${mid.gx} expected≈${toScreen(r, 300, 0).x}`);
    let p = await proj(page);
    check("drop landed EXACTLY on the shared edge (x=360 ⇒ left=300)", B(p).props.x === 360, `x=${B(p).props.x}`);
    check("unsnapped axis keeps the raw drag (y=553, no y snap)", B(p).props.y === 553, `y=${B(p).props.y}`);
    check("guides hidden on pointer-up", (await guides(page)).length === 0);

    console.log("\n#2 canvas center — both axes snap, two guides");
    await dragProbe(page, toScreen(r, 360, 553), 278 * r.scale, -196 * r.scale, async () => {
      mid = { g: await guides(page) };
    });
    /* the y snap is a TIE (delta +3): B's top lands on A's centerY (300) at the
       same moment B's center lands on the canvas center (360) — object
       edges/centers outrank canvas lines, so the guide draws at 300 */
    check("mid-drag: vertical guide at canvas center 640 + horizontal at the won y snap (300, object beats canvas on a tie)", mid.g.some((g) => g.axis === "x" && g.pos === 640) && mid.g.some((g) => g.axis === "y" && g.pos === 300), JSON.stringify(mid.g));
    p = await proj(page);
    check("drop landed on the canvas center (640, 360)", B(p).props.x === 640 && B(p).props.y === 360, `x=${B(p).props.x} y=${B(p).props.y}`);

    console.log("\n#3 toggle OFF — free drag, no guides, persisted + dim");
    await magnet.click();
    await page.waitForTimeout(150);
    check("toggle OFF persists gd:snapping=0", await page.evaluate(() => localStorage.getItem("gd:snapping") === "0"));
    const colOff = await magnet.evaluate((el) => getComputedStyle(el).color);
    check("toggle OFF renders the dim magnet", colOff === "rgb(147, 155, 173)", colOff);
    await dragProbe(page, toScreen(r, 640, 360), 3 * r.scale, 0, async () => {
      mid = { g: await guides(page) };
    });
    p = await proj(page);
    check("OFF: 3px past the center does NOT snap back", B(p).props.x === 643, `x=${B(p).props.x}`);
    check("OFF: no guides during the drag", mid.g.length === 0, JSON.stringify(mid.g));

    console.log("\n#4 Alt-drag with the toggle OFF — temporarily snaps");
    await page.keyboard.down("Alt");
    await dragProbe(page, toScreen(r, 643, 360), 3 * r.scale, 0, async () => {
      mid = { g: await guides(page) };
    });
    await page.keyboard.up("Alt");
    p = await proj(page);
    check("Alt-invert: drag snapped back to the canvas center (x=640)", B(p).props.x === 640, `x=${B(p).props.x}`);
    check("Alt-invert: guide shown mid-drag", mid.g.some((g) => g.axis === "x" && g.pos === 640), JSON.stringify(mid.g));

    console.log("\n#5 Alt-drag with the toggle ON — temporarily free");
    await magnet.click();
    await page.waitForTimeout(150);
    check("toggle ON persists gd:snapping=1", await page.evaluate(() => localStorage.getItem("gd:snapping") === "1"));
    await page.keyboard.down("Alt");
    await dragProbe(page, toScreen(r, 640, 360), 3 * r.scale, 0, async () => {
      mid = { g: await guides(page) };
    });
    await page.keyboard.up("Alt");
    p = await proj(page);
    check("Alt-invert: drag stays free (x=643, no snap)", B(p).props.x === 643, `x=${B(p).props.x}`);
    check("Alt-invert: no guides mid-drag", mid.g.length === 0, JSON.stringify(mid.g));

    console.log("\n#6 west resize grip — the dragged edge snaps to a sibling's right edge");
    /* B at (643,360) w=120 → left edge 583; drag the west grip −87 stage px →
       unsnapped left 496, within threshold of A's right edge 500 → w = 286 */
    const westGrip = page.locator('div[title="Drag to resize · Shift = keep aspect"]').nth(7);
    const wb = await westGrip.boundingBox();
    check("west grip sits on B's left edge midline", Math.abs(wb.x + wb.width / 2 - toScreen(r, 583, 360).x) <= 3 && Math.abs(wb.y + wb.height / 2 - toScreen(r, 583, 360).y) <= 3, `grip=(${Math.round(wb.x)},${Math.round(wb.y)})`);
    await dragProbe(page, { x: wb.x + wb.width / 2, y: wb.y + wb.height / 2 }, -87 * r.scale, 0, async () => {
      mid = { g: await guides(page) };
    });
    p = await proj(page);
    /* R8w3: the snapped resize landed as a scale ◆ at the playhead (t=0) with
       base compensation — assert the TRACK-AWARE rendered size (what the
       canvas/export actually draws) plus the ◆ + compensation themselves. */
    const sk = (B(p).tracks.scale || [])[0];
    const rSize = (o, t) => { const s = valueAt(o, "scale", t) ?? 1; const b = objSize(o, t); return { w: b.w * s, h: b.h * s }; };
    const rs = rSize(B(p), sk ? sk.t : 0);
    check("resize snapped the left edge to x=500 (rendered w≈286, track-aware)", !!sk && Math.abs(rs.w - 286) <= 1.5, `renderedW=${rs.w} scale◆=${sk && sk.v} baseW=${B(p).props.w}`);
    check("resize: vertical guide at the snapped edge x=500", mid.g.some((g) => g.axis === "x" && g.pos === 500), JSON.stringify(mid.g));
    check("resize: height untouched (rendered h≈120, track-aware)", !!sk && Math.abs(rs.h - 120) <= 1.5, `renderedH=${rs.h} baseH=${B(p).props.h}`);
    check("resize: scale ◆ at the playhead carries the snapped factor (2.38)", !!sk && sk.t === 0 && Math.abs(sk.v - 2.38) <= 0.01, JSON.stringify(B(p).tracks.scale));
    check("resize: bases compensated by g (w≈120, h≈50 under scale 2.38)", Math.abs(B(p).props.w - 120) <= 1 && Math.abs(B(p).props.h - 50) <= 1 && Math.abs((B(p).props.scale || 1) - 2.38) <= 0.01, `w=${B(p).props.w} h=${B(p).props.h} scale=${B(p).props.scale}`);

    console.log("\n#7 rotation grip — never snaps, never guides");
    const rotGrip = page.locator('div[title="Drag to rotate · Shift = 15° steps"]').first();
    const rb = await rotGrip.boundingBox();
    await dragProbe(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, 80, 0, async () => {
      mid = { g: await guides(page) };
    });
    p = await proj(page);
    check("rotation drag changed the rotation", Math.abs(B(p).props.rotation || 0) > 5, `rot=${B(p).props.rotation}`);
    check("rotation drag showed no guides", mid.g.length === 0, JSON.stringify(mid.g));

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${failures ? failures + " FAILURE(S)" : "all snapping UI checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
