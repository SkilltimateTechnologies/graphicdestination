/**
 * check-editor-w1.mjs — UI smoke for the w1 bugfix/UX pack. Mounts the REAL
 * editor (GraphicDestinationMotion) in headless Chromium and drives it with
 * Playwright, reading project state through the onChange seam:
 *
 *   #1 camera presets — Push In / Pan Right write two ◆ spanning the comp
 *      (easeInOutCubic) and the PREVIEW transform actually moves · lane hint.
 *   #2 new shell (R8w1): the top-bar purge holds (NO autokey toggle, NO
 *      Save/Load, NO share), the save control + grid toggle live in the
 *      timeline transport bar (state colors, persisted gd:grid), autokey is
 *      ALWAYS-ON so a canvas drag writes ◆ at the playhead on BOTH axes
 *      (R8w3: untracked props start their track — no silent base patches).
 *   #3 Transform card (R8w3 purge): x/y/rotation/scale rows GONE (canvas +
 *      timeline own them); the Opacity row keeps ◆ toggle + slider + mono.
 *   #5 lock toggle renders distinct SVG padlocks (open dim / closed amber).
 *   #6 nothing selected → no keyframe controls · empty project → no ◆ lanes.
 *   #7 clips: corner grips scale the wrapper uniformly (scale prop), body-drag
 *      moves with the 40px clamp, double-click still enters the clip.
 *   #8 number card has Format chips + style swatches but no Mode chips.
 *
 * Run:  node check-editor-w1.mjs        (from client/)
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
const harnessDir = path.join(here, ".editor-w1-smoke");
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
/* w2: this pack asserts EXACT drag deltas (auto-key ◆ values, clip moves, the
   40px clamp) — run it with smart snapping disabled so drags land unsnapped;
   snapping itself is covered by check-snapping-ui.mjs. */
localStorage.setItem("gd:snapping", "0");
/* R8w1 shell reality: the top-bar Save/Load modal is GONE — the only import
   path is the cloud seam (initialProject on mount). __loadProject remounts
   the editor with a fresh initialProject (key change → the mount effect
   re-imports), and the shell props saveState/onSaveNow light up the
   timeline-bar save control the Editor shell passes in production. */
let key = 0;
const root = createRoot(document.getElementById("root"));
const render = (initialProject) => root.render(h(GraphicDestinationMotion, {
  key: ++key,
  initialProject,
  onChange: (json) => { window.__lastProject = json; },
  saveState: "dirty",
  onSaveNow: () => { window.__saves = (window.__saves || 0) + 1; },
}));
window.__loadProject = (json) => { window.__lastProject = ""; render(JSON.parse(json)); };
render(null);
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

/* ---------- page-side helpers (evaluated in the harness) ---------- */
/* the stage element + its screen rect (rect already includes the fit scale) */
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
  console.log("Bundling the w1 editor smoke harness with Vite…");
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

  /* convenience closures */
  const proj = async (page) => JSON.parse(await page.evaluate(() => window.__lastProject || "{}"));
  const stageRect = async (page) => page.evaluate(STAGE_RECT);
  const toScreen = (r, sx, sy) => ({ x: r.left + sx * r.scale, y: r.top + sy * r.scale });
  const drag = async (page, from, ddx, ddy) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (ddx * i) / 6, from.y + (ddy * i) / 6);
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const scrubTo = async (page, frac) => {
    const r = await page.evaluate(() => { const el = document.querySelector("div[style*='col-resize']"); const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
    await page.mouse.click(r.left + r.width * frac, r.top + r.height / 2);
    await page.waitForTimeout(120);
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    page.on("pageerror", (e) => console.log("[pageerror]", (e.stack || String(e)).slice(0, 1200)));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction("window.__ready === true");
    await page.waitForTimeout(1200); /* fonts + first paint */

    /* ==================== #2 new shell — purge + timeline-bar controls ==== */
    console.log("\n#2 new shell — top-bar purge, timeline save control + grid toggle");
    check("top bar keeps the Main breadcrumb + stage preset + Brand (R9w1: + avatar, NO Export)",
      await page.locator('button:has-text("Main")').count() >= 1
      && await page.locator('select[aria-label="Stage size preset"]').count() >= 1
      && await page.locator('button:has-text("Brand")').count() >= 1
      && await page.locator("button.gd-avatar").count() === 1
      && await page.locator('button:has-text("Export")').count() === 1 /* the ONE Export now lives in the timeline bar */);
    /* R9w1: Export moved into the timeline transport bar beside the save control */
    check("Export sits in the timeline transport bar beside the save control", await page.locator("button.gd-tl-export").count() === 1 && await page.locator("button.gd-tl-save").count() === 1);
    /* R9w1: the Zwoosh wordmark moved to the slim brand bar above the timeline */
    check("the Zwoosh wordmark sits in the brand bar above the timeline", await page.locator(".gd-brandbar .gd-brandmark").count() === 1);
    /* R9w1: avatar menu — circular initial button, Profile / Logout items
       (standalone harness wires no handlers → disabled stubs) */
    const avatar = page.locator("button.gd-avatar");
    check("the avatar is a circular button showing one initial", (await avatar.evaluate((el) => getComputedStyle(el).borderRadius)) === "50%" && (await avatar.textContent()).trim().length === 1);
    await avatar.click();
    await page.waitForTimeout(150);
    check("avatar menu opens with Profile + Logout", await page.locator('.gd-avatar-menu button:has-text("Profile")').count() === 1 && await page.locator('.gd-avatar-menu button:has-text("Logout")').count() === 1);
    check("standalone harness: menu items render as disabled stubs", await page.locator(".gd-avatar-menu button[disabled]").count() === 2);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    check("Escape closes the avatar menu", await page.locator(".gd-avatar-menu").count() === 0);
    check("top-bar purge: NO Save/Load, share or auto-keyframe controls anywhere",
      await page.locator('button:has-text("Save / Load")').count() === 0
      && await page.locator('button:has-text("Share")').count() === 0
      && await page.locator('button[aria-label^="Auto-keyframe"]').count() === 0);
    check("autokey always-on: the gd:autokey pref is gone for good", await page.evaluate(() => localStorage.getItem("gd:autokey") === null));

    /* save control — relocated into the timeline transport bar (R8w1) */
    const saveBtn = page.locator("button.gd-tl-save");
    check("save control lives in the timeline bar, wired to the shell state", await saveBtn.count() === 1 && (await saveBtn.getAttribute("data-state")) === "dirty");
    check("dirty state shows ● Save with the exact title", (await saveBtn.textContent()).includes("● Save") && (await saveBtn.getAttribute("title")) === "Unsaved changes — click to save now");
    await saveBtn.click();
    await page.waitForTimeout(120);
    check("clicking the save control fires the shell's onSaveNow", await page.evaluate(() => window.__saves === 1), `saves=${await page.evaluate(() => window.__saves)}`);

    /* grid toggle — timeline bar, persisted, canvas overlay is export-safe */
    const gridBtn = page.locator("button.gd-grid-toggle");
    check("grid toggle lives in the timeline bar and starts OFF", await gridBtn.count() === 1 && (await gridBtn.getAttribute("aria-pressed")) === "false");
    check("grid OFF → no canvas overlay", await page.locator(".gd-grid-overlay").count() === 0);
    await gridBtn.click();
    await page.waitForTimeout(150);
    check("grid ON persists gd:grid=1 + aria-pressed flips", await page.evaluate(() => localStorage.getItem("gd:grid") === "1") && (await gridBtn.getAttribute("aria-pressed")) === "true");
    check("grid ON → the export-safe canvas overlay renders", await page.locator(".gd-grid-overlay").count() === 1);
    await gridBtn.click();
    await page.waitForTimeout(150);
    check("grid back OFF persists gd:grid=0 + overlay unmounts", await page.evaluate(() => localStorage.getItem("gd:grid") === "0") && await page.locator(".gd-grid-overlay").count() === 0);

    /* ==================== add a shape: #3 + #2 canvas behavior ==================== */
    console.log("\n#3 purged Transform card (opacity-only) + #2 canvas auto-keyframe");
    await page.locator('button:has(span:text-is("Shapes"))').first().click();
    await page.waitForTimeout(200);
    await page.locator('.gd-panel button[title="Rectangle"]').first().click();
    await page.waitForTimeout(250);
    /* Transform card (R8w3 purge): x/y/rotation/scale rows are GONE — canvas
       grips + the timeline own spatial transforms now. What remains for a
       shape is the one row with NO canvas control: Opacity — with its ◆
       toggle, ‹ › nav hooks, a live slider and the mono readout. */
    const tCard = await page.evaluate(() => {
      const card = [...document.querySelectorAll("div")].find((d) => d.firstElementChild && d.firstElementChild.textContent.startsWith("Transform"));
      if (!card) return { found: false };
      const labels = [...card.querySelectorAll("span")].map((s) => s.textContent);
      return {
        found: true,
        purged: ["Position X", "Position Y", "Rotation", "Scale"].every((l) => !labels.includes(l)),
        opacity: labels.includes("Opacity"),
        kfBtns: card.querySelectorAll('button[title="Add keyframe at playhead"]').length,
        sliders: card.querySelectorAll('input[type="range"]').length,
        mono: [...card.querySelectorAll('span')].some((s) => (s.style.fontFamily || "").includes("JetBrains Mono")),
      };
    });
    check("Transform card: x/y/rotation/scale rows purged, Opacity kept", tCard.found && tCard.purged && tCard.opacity, JSON.stringify(tCard));
    check("Opacity row keeps its ◆ toggle + live slider + JetBrains Mono value", tCard.kfBtns === 1 && tCard.sliders === 1 && tCard.mono, JSON.stringify(tCard));

    /* ◆ toggle on Opacity (playhead at 0) → first keyframe */
    await page.evaluate(() => {
      const card = [...document.querySelectorAll("div")].find((d) => d.firstElementChild && d.firstElementChild.textContent.startsWith("Transform"));
      card.querySelector('button[title="Add keyframe at playhead"]').click();
    });
    await page.waitForTimeout(150);
    let p = await proj(page);
    const shape = () => p.objects.find((o) => o.type === "shape");
    check("◆ toggle wrote the first opacity keyframe", shape().tracks.opacity?.length === 1 && shape().tracks.opacity[0].t === 0 && shape().tracks.opacity[0].v === 1, JSON.stringify(shape().tracks.opacity));

    /* scrub to ~1s, then drag the shape: autokey is ALWAYS-ON (R8w1) and a
       move STARTS fresh tracks with a ◆ at the playhead on BOTH axes (R8w3 —
       no silent base patches); the base mirrors the drop so the move also
       survives ◆ deletion */
    await scrubTo(page, 1000 / 6000);
    let r = await stageRect(page);
    const before = shape();
    const x0 = before.props.x, y0 = before.props.y;
    const from = toScreen(r, 640, 360);
    await drag(page, from, 120, 80);
    p = await proj(page);
    const sh = shape();
    const dSx = 120 / r.scale, dSy = 80 / r.scale;
    const kf2 = (sh.tracks.x || []).find((k) => k.t >= 900 && k.t <= 1100);
    check("auto-key: the drag STARTED the x track with a ◆ at the playhead", (sh.tracks.x || []).length === 1 && !!kf2, JSON.stringify(sh.tracks.x));
    check("auto-key: the x ◆ carries the dragged value", !!kf2 && Math.abs(kf2.v - (x0 + dSx)) <= 3, kf2 ? `v=${kf2.v} expected≈${Math.round(x0 + dSx)}` : "missing");
    const kfy = (sh.tracks.y || []).find((k) => k.t >= 900 && k.t <= 1100);
    check("auto-key always-on: the y track STARTED with a ◆ at the playhead too", (sh.tracks.y || []).length === 1 && !!kfy, JSON.stringify(sh.tracks.y || []));
    check("auto-key: the y ◆ carries the dragged value", !!kfy && Math.abs(kfy.v - (y0 + dSy)) <= 3, kfy ? `v=${kfy.v} expected≈${Math.round(y0 + dSy)}` : "missing");
    check("auto-key: the x/y bases mirror the drop (survive ◆ deletion)", Math.abs(sh.props.x - (x0 + dSx)) <= 3 && Math.abs(sh.props.y - (y0 + dSy)) <= 3, `x=${sh.props.x} y=${sh.props.y}`);

    /* rotate grip: autokey always-on → the drag STARTS the rotation track
       with a ◆ at the playhead (R8w3: fresh props key too — the old silent
       base patch is gone) */
    const rotGrip = page.locator('div[title="Drag to rotate · Shift = 15° steps"]').first();
    const rb = await rotGrip.boundingBox();
    await drag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, 80, 0);
    p = await proj(page);
    const rotKf = (shape().tracks.rotation || []).find((k) => k.t >= 900 && k.t <= 1100);
    check("auto-key: rotate drag STARTED the rotation track with a ◆ at the playhead", !!rotKf && rotKf.v > 10, JSON.stringify(shape().tracks.rotation || []));
    check("auto-key: the rotation base mirrors the drop", Math.abs((shape().props.rotation || 0) - rotKf.v) <= 1, `rot=${shape().props.rotation}`);

    /* ==================== R9w1 Animate arm/disarm ==================== */
    console.log("\nR9w1 Animate toggle — disarm patches base without ◆, re-arm keys again");
    const animBtn = page.locator("button.gd-animate-toggle");
    check("Animate toggle lives in the timeline bar, ARMED by default", await animBtn.count() === 1 && (await animBtn.getAttribute("aria-pressed")) === "true");
    check("armed state shows the unmistakable On label", (await animBtn.textContent()).includes("On"));
    /* the shape's VISIBLE position follows its x/y ◆ (single keyframe = a
       constant) — capture it before the disarm experiment */
    p = await proj(page);
    const visX = shape().props.x, visY = shape().props.y;
    const kfCountXY = () => { const s = shape(); return (s.tracks.x || []).length + (s.tracks.y || []).length; };
    const nKfBefore = kfCountXY();
    await animBtn.click(); /* disarm */
    await page.waitForTimeout(150);
    check("disarm flips aria-pressed + persists gd:animateArm=0", (await animBtn.getAttribute("aria-pressed")) === "false" && await page.evaluate(() => localStorage.getItem("gd:animateArm") === "0"));
    check("disarmed state shows the Off label", (await animBtn.textContent()).includes("Off"));
    r = await stageRect(page);
    await drag(page, toScreen(r, visX, visY), 60, 30); /* drag the shape body while DISARMED */
    p = await proj(page);
    check("DISARMED: the drag patched the base x/y", Math.abs(shape().props.x - (visX + 60 / r.scale)) <= 3 && Math.abs(shape().props.y - (visY + 30 / r.scale)) <= 3, `x=${shape().props.x} y=${shape().props.y}`);
    check("DISARMED: NO new keyframes were written", kfCountXY() === nKfBefore, `kf x+y count ${nKfBefore} → ${kfCountXY()}`);
    await scrubTo(page, 2500 / 6000); /* a fresh playhead away from the 1s ◆ */
    await animBtn.click(); /* re-arm */
    await page.waitForTimeout(150);
    check("re-arm restores aria-pressed + persists gd:animateArm=1", (await animBtn.getAttribute("aria-pressed")) === "true" && await page.evaluate(() => localStorage.getItem("gd:animateArm") === "1"));
    await drag(page, toScreen(r, visX, visY), 40, 20); /* the visible body still sits at the ◆ position */
    p = await proj(page);
    const armKf = (prop) => (shape().tracks[prop] || []).find((k) => k.t >= 2400 && k.t <= 2600);
    check("RE-ARMED: the drag wrote ◆ at the new playhead (x AND y)", !!armKf("x") && !!armKf("y"), `x=${JSON.stringify(shape().tracks.x)}`);

    /* ==================== R9w1 scrub-follow ==================== */
    console.log("\nR9w1 scrub-follow — a long comp overflows; the playhead is chased into view");
    await page.locator("input.gd-dur-input").fill("30");
    await page.waitForTimeout(300);
    const dims = await page.evaluate(() => { const el = document.querySelector(".gd-tl-scroll"); return { cw: el.scrollWidth, vw: el.clientWidth }; });
    check("a 30s comp overflows the lane viewport (100px/s min density)", dims.cw > dims.vw, JSON.stringify(dims));
    /* pan right (as a trackpad/scrollbar user would), then scrub NEAR the
       visible right edge — the follow rule must chase the playhead */
    await page.evaluate(() => { document.querySelector(".gd-tl-scroll").scrollLeft = 1400; });
    const laneBox = await page.evaluate(() => { const el = document.querySelector(".gd-tl-scroll").getBoundingClientRect(); return { left: el.left, right: el.right, top: el.top }; });
    await page.mouse.click(laneBox.right - 24, laneBox.top + 13); /* ruler is 26px tall */
    await page.waitForTimeout(250);
    const chase1 = await page.evaluate(() => {
      const el = document.querySelector(".gd-tl-scroll");
      const ph = document.querySelector(".gd-playhead").getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { sl: el.scrollLeft, phL: ph.left, left: r.left, right: r.right };
    });
    check("scrubbing near the right edge auto-scrolls (playhead chased into view)", chase1.sl > 1400 && chase1.phL >= chase1.left - 2 && chase1.phL <= chase1.right + 2, JSON.stringify(chase1));
    await page.mouse.click(laneBox.left + 24, laneBox.top + 13); /* near the visible LEFT edge */
    await page.waitForTimeout(250);
    const chase2 = await page.evaluate(() => {
      const el = document.querySelector(".gd-tl-scroll");
      const ph = document.querySelector(".gd-playhead").getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { sl: el.scrollLeft, phL: ph.left, left: r.left, right: r.right };
    });
    check("scrubbing near the left edge scrolls back (playhead stays visible)", chase2.sl < chase1.sl && chase2.phL >= chase2.left - 2 && chase2.phL <= chase2.right + 2, JSON.stringify(chase2));
    await page.locator("input.gd-dur-input").fill("6");
    await page.waitForFunction(() => { const el = document.querySelector(".gd-tl-scroll"); return el && el.scrollWidth <= el.clientWidth + 1 && el.scrollLeft <= 1; }, null, { timeout: 4000 }).catch(() => {});
    check("restoring a short comp removes the overflow (scroll returns home)", await page.evaluate(() => { const el = document.querySelector(".gd-tl-scroll"); return el.scrollWidth <= el.clientWidth + 1 && el.scrollLeft <= 1; }),
      await page.evaluate(() => { const el = document.querySelector(".gd-tl-scroll"); return `scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth} scrollLeft=${el.scrollLeft}`; }));

    /* R9w1 keyframe glyphs: every .gd-kf marker wraps a per-prop SVG glyph —
       the shape currently carries x/y ◆ (diamond), rotation ▲ (triangle)
       and opacity ◐ (half) */
    check("R9w1: object keyframes render distinct per-prop SVG glyphs", await page.evaluate(() => {
      const ks = [...document.querySelectorAll(".gd-kf")];
      const glyphs = new Set(ks.map((k) => k.querySelector("svg")?.getAttribute("data-glyph")).filter(Boolean));
      return ks.length > 0 && ks.every((k) => !!k.querySelector("svg")) && glyphs.has("diamond") && glyphs.has("triangle") && glyphs.has("half");
    }));

    /* ==================== #8 number card: no Mode chips ==================== */
    console.log("\n#8 number card — mode chips removed");
    await page.locator('button:has(span:text-is("Number"))').first().click();
    await page.waitForTimeout(200);
    await page.locator('.gd-panel button:has-text("Count Up")').first().click();
    await page.waitForTimeout(250);
    const numCard = await page.evaluate(() => {
      const card = [...document.querySelectorAll("div")].find((d) => d.firstElementChild && d.firstElementChild.textContent.startsWith("Number"));
      if (!card) return { found: false };
      const spans = [...card.querySelectorAll("span")].map((s) => s.textContent);
      return { found: true, hasMode: spans.includes("Mode"), hasFormat: spans.includes("Format"), hasStyles: card.textContent.includes("Style presets") };
    });
    check("Number card keeps Format chips + style swatches", numCard.found && numCard.hasFormat && numCard.hasStyles, JSON.stringify(numCard));
    check("Number card has NO Mode chips (owned by the Number panel)", numCard.found && !numCard.hasMode);

    /* ==================== #1 camera presets + preview ==================== */
    console.log("\n#1 camera — presets + empty-state hint + live preview");
    const lane = page.locator('div[title^="Scene camera — click to select"]');
    const laneTrack = page.locator('div[title="Scene camera · drag empty stage space to pan · Alt+wheel (or select this lane) to zoom"]');
    check("empty camera lane hint points at presets", (await laneTrack.textContent()).includes("◆ add a keyframe or pick a preset in the inspector"));
    await lane.click();
    await page.waitForTimeout(200);
    for (const nm of ["Push In", "Pull Out", "Pan Left", "Pan Right", "Drift Up"]) {
      check(`camera preset button: ${nm}`, await page.locator(`button:has-text("${nm}")`).count() >= 1);
    }
    await page.locator('button:has-text("Push In")').first().click();
    await page.waitForTimeout(200);
    p = await proj(page);
    const ztr = p.camera?.tracks?.zoom || [];
    check("Push In writes exactly two zoom ◆ spanning the comp", ztr.length === 2 && ztr[0].t === 0 && ztr[1].t === 6000, JSON.stringify(ztr));
    check("Push In values 1 → 1.15 with easeInOutCubic", ztr.length === 2 && ztr[0].v === 1 && ztr[1].v === 1.15 && ztr[0].ease === "easeInOutCubic", JSON.stringify(ztr));
    check("camera lane badge shows 2◆", (await lane.textContent()).includes("2◆"));
    /* preview: at t=0 the camera wrapper is identity; near the end it scales ~1.15 */
    const camTf = async () => page.evaluate(() => [...document.querySelectorAll("div")]
      .filter((d) => d.style.transformOrigin === "640px 360px" && d.style.pointerEvents === "none" && /scale\(/.test(d.style.transform) && !/rotate\(/.test(d.style.transform))
      .map((d) => d.style.transform));
    await scrubTo(page, 0.001);
    let tfs = await camTf();
    const sAt = (tf) => parseFloat((tf.match(/scale\(([^)]+)\)/) || [])[1]);
    check("preview: root layers render inside camera wrappers", tfs.length >= 3, `${tfs.length} wrappers`);
    check("preview: t=0 → identity scale(1)", tfs.length > 0 && tfs.every((t) => Math.abs(sAt(t) - 1) < 0.01), tfs[0]);
    await scrubTo(page, 0.98);
    tfs = await camTf();
    const sEnd = tfs.length ? parseFloat((tfs[0].match(/scale\(([^)]+)\)/) || [])[1]) : 0;
    check("preview: near the end the push-in scales the scene ≈1.15", sEnd > 1.1 && sEnd < 1.2, `scale=${sEnd} · ${tfs[0]}`);
    await page.locator('button:has-text("Pan Right")').first().click();
    await page.waitForTimeout(150);
    p = await proj(page);
    const xtr = p.camera?.tracks?.x || [];
    check("Pan Right writes x ◆ 0 → 120 across the comp", xtr.length === 2 && xtr[0].v === 0 && xtr[1].v === 120 && xtr[1].t === 6000, JSON.stringify(xtr));
    tfs = await camTf();
    const txEnd = tfs.length ? parseFloat((tfs[0].match(/translate\(([-\d.]+)px/) || [])[1]) : 0;
    check("preview: pan shifts the scene left ≈ −120px", Number.isFinite(txEnd) && txEnd < -100 && txEnd > -125, `tx=${txEnd}`);
    await page.getByText("⟲ Reset camera", { exact: true }).click();
    await page.waitForTimeout(150);
    p = await proj(page);
    check("reset camera clears the camera from the project", !p.camera, JSON.stringify(p.camera || null));

    console.log("\n(clip / lock / empty-state checks in part 2 — appended below)");
    await runPart2(page, { check, proj, stageRect, toScreen, drag, scrubTo });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${failures ? failures + " FAILURE(S)" : "all w1 editor UI checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

/* ==================== part 2: clips / lock icons / empty states ==================== */
async function runPart2(page, { check, proj, stageRect, toScreen, drag }) {
  const stats = (p) => p.objects.find((o) => o.type === "clip" && o.name.includes("Stats"));

  /* ==================== #7 clips move + scale on canvas ==================== */
  console.log("\n#7 clips — body-drag move, corner-grip uniform scale, clamp, enter");
  let r = await stageRect(page);
  /* click the clip's full-canvas body away from the centered shape/number */
  await page.mouse.click(toScreen(r, 100, 100).x, toScreen(r, 100, 100).y);
  await page.waitForTimeout(200);
  const selIsClip = await page.evaluate(() => document.body.textContent.includes("clip · 3 layers"));
  check("clicking the clip body selects the clip", selIsClip);
  const gripSel = 'div[title="Drag to scale the whole clip uniformly"]';
  check("selected clip shows 4 corner scale grips", await page.locator(gripSel).count() === 4, `count=${await page.locator(gripSel).count()}`);

  /* corner grip (NE, index 1) drag outward → uniform scale via the scale prop.
     R7a: grips sit on the clip's CONTENT bbox (not the stage corners), so the
     expected ratio is measured from the ACTUAL grip position read off the DOM,
     relative to the clip origin's screen position — geometry-agnostic. */
  let p = await proj(page);
  const s0 = stats(p).props.scale || 1;
  const grip = page.locator(gripSel).nth(1);
  const gb = await grip.boundingBox();
  const gFrom = { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 };
  const originS = toScreen(r, stats(p).props.x, stats(p).props.y);
  await drag(page, gFrom, 40, -25);
  p = await proj(page);
  const r0 = Math.hypot(gFrom.x - originS.x, gFrom.y - originS.y), r1 = Math.hypot(gFrom.x + 40 - originS.x, gFrom.y - 25 - originS.y);
  const expected = Math.round(s0 * (r1 / r0) * 100) / 100;
  check("corner grip scales the clip uniformly via the scale prop", Math.abs((stats(p).props.scale || 1) - expected) <= 0.03, `scale=${stats(p).props.scale} expected≈${expected}`);
  check("clip contents live in the wrapper (children scale with it)", (stats(p).children || []).length === 3, `${(stats(p).children || []).length} children in the scaled wrapper`);

  /* double-click the clip body → still enters clip editing after the transform */
  await page.mouse.dblclick(toScreen(r, 200, 200).x, toScreen(r, 200, 200).y);
  await page.waitForTimeout(250);
  const inClip = await page.evaluate(() => document.body.textContent.includes("Editing clip — Esc to go back") && document.body.textContent.includes("Scene 2 · Stats"));
  check("double-click still enters the clip after transforms", inClip);
  /* R9w1: the clip breadcrumb moved INTO the timeline transport bar (beside Grid/Animate) */
  check("R9w1: the clip breadcrumb renders inside the timeline transport bar", await page.locator("button.gd-tl-crumb").count() >= 1
    && await page.evaluate(() => document.body.textContent.includes("Editing clip — Esc to go back")));
  /* R9w1: the kf markers inside the clip render as SVG glyphs too */
  check("R9w1: in-clip keyframe markers render SVG glyphs", await page.evaluate(() => {
    const ks = [...document.querySelectorAll(".gd-kf")];
    return ks.length > 0 && ks.every((k) => !!k.querySelector("svg"));
  }));
  /* Escape back to the root — one press per layer of UI state (selKf etc. first) */
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => document.body.textContent.includes("Editing clip")))) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  check("escaped back to the root", !(await page.evaluate(() => document.body.textContent.includes("Editing clip"))));

  /* body-drag moves the clip (x/y base — tracks empty under auto-key) */
  await page.mouse.click(toScreen(r, 100, 100).x, toScreen(r, 100, 100).y);
  await page.waitForTimeout(200);
  p = await proj(page);
  const cx0 = stats(p).props.x, cy0 = stats(p).props.y;
  await drag(page, toScreen(r, 100, 100), 90, 60);
  p = await proj(page);
  check("body-drag moves the clip (x/y)", Math.abs(stats(p).props.x - (cx0 + 90 / r.scale)) <= 3 && Math.abs(stats(p).props.y - (cy0 + 60 / r.scale)) <= 3, `x=${stats(p).props.x} y=${stats(p).props.y}`);

  /* extreme drag left → the 40px clamp stops the clip at the floor (start from
     clip-covered stage space away from the centered shape/number bodies) */
  const sc = stats(p).props.scale || 1;
  await drag(page, toScreen(r, 200, 600), -4000, 0);
  p = await proj(page);
  const xClamped = stats(p).props.x;
  check("40px clamp works for clips (not flung off-canvas)", xClamped > -600 && xClamped < 0, `x=${xClamped} scale=${sc}`);

  /* ==================== #5 lock icons ==================== */
  console.log("\n#5 lock — distinct padlock glyphs");
  const tlLock = page.locator('button[title="Lock"]').first();
  check("timeline lock toggle renders an SVG padlock (no emoji)", await tlLock.evaluate((el) => !!el.querySelector("svg") && !/🔒|🔓/.test(el.innerHTML)));
  const openSvg = await tlLock.evaluate((el) => el.innerHTML);
  await tlLock.click();
  await page.waitForTimeout(150);
  const closedBtn = page.locator('button[title="Unlock"]').first();
  check("locked state renders a different, amber closed padlock", await closedBtn.evaluate((el) => {
    const svg = el.querySelector("svg");
    return !!svg && (svg.getAttribute("stroke") || "").toLowerCase() === "#f5a524" && !!svg.querySelector("circle");
  }));
  const closedSvg = await closedBtn.evaluate((el) => el.innerHTML);
  check("open vs closed padlock glyphs are clearly different", openSvg !== closedSvg);
  /* Inspector lock button is an SVG too — select an object first */
  await page.locator('button[title="Unlock"]').first().click(); /* unlock again */
  await page.waitForTimeout(150);
  await page.mouse.click(toScreen(r, 100, 100).x, toScreen(r, 100, 100).y);
  await page.waitForTimeout(200);
  const inspLock = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.title === "Lock" || x.title === "Unlock");
    return !!b && !!b.querySelector("svg") && !/🔒|🔓/.test(b.innerHTML);
  });
  check("Inspector lock toggle renders an SVG padlock (no emoji)", inspLock);

  /* ==================== #6 empty states ==================== */
  console.log("\n#6 empty states — no keyframe UI");
  await page.keyboard.press("Escape"); /* clear selection */
  await page.keyboard.press("Escape"); /* clear camera lane selection */
  await page.keyboard.press("Escape"); /* safety */
  await page.waitForTimeout(200);
  check("nothing selected → Inspector shows the Stage card (no keyframe controls)",
    await page.evaluate(() => document.body.textContent.includes("Add layers from the rail.")
      && document.querySelectorAll('button[title="Add keyframe at playhead"]').length === 0));
  /* import an empty project → no diamond lanes at all. R8w1: the top-bar
     Save/Load modal is GONE — the only import path is the cloud seam
     (initialProject on mount), exercised here through the harness remount. */
  await page.evaluate(() => window.__loadProject('{"objects":[]}'));
  await page.waitForTimeout(400);
  check("empty project → zero keyframe diamonds in the timeline", await page.evaluate(() => document.querySelectorAll(".gd-kf").length) === 0);
  check("empty project → camera lane shows the preset hint, no stray ◆", await page.evaluate(() => {
    const lane = document.querySelector('div[title="Scene camera · drag empty stage space to pan · Alt+wheel (or select this lane) to zoom"]');
    return !!lane && lane.textContent.includes("◆ add a keyframe or pick a preset in the inspector") && lane.querySelectorAll(".gd-kf").length === 0;
  }));
  check("empty project → Inspector still shows no keyframe controls", await page.evaluate(() => document.querySelectorAll('button[title="Add keyframe at playhead"]').length) === 0);
}
