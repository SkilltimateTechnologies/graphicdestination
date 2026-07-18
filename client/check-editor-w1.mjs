/**
 * check-editor-w1.mjs — UI smoke for the w1 bugfix/UX pack. Mounts the REAL
 * editor (GraphicDestinationMotion) in headless Chromium and drives it with
 * Playwright, reading project state through the onChange seam:
 *
 *   #1 camera presets — Push In / Pan Right write two ◆ spanning the comp
 *      (easeInOutCubic) and the PREVIEW transform actually moves · lane hint.
 *   #2 auto-keyframe — top-bar ◆ toggle (exact title, amber, gd:autokey
 *      persisted); canvas drag on a TRACKED prop writes a ◆ at the playhead,
 *      an UNTRACKED prop patches the base value (no keyframe).
 *   #3 Transform rows are ◆-only: no inputs, read-only JetBrains Mono value.
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
createRoot(document.getElementById("root")).render(h(GraphicDestinationMotion, {
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

    /* ==================== #2 top-bar auto-keyframe toggle ==================== */
    console.log("\n#2 auto-keyframe — top-bar toggle");
    const akBtn = page.locator('button[aria-label="Auto-keyframe: canvas edits write keyframes"]');
    check("top-bar ◆ auto-keyframe toggle exists with the exact title", await akBtn.count() === 1);
    check("toggle starts ON (amber)", await akBtn.evaluate((el) => el.getAttribute("aria-pressed") === "true" && /#F5A524|245, 165, 36/.test(el.getAttribute("style") || "")));
    await akBtn.click();
    await page.waitForTimeout(120);
    check("toggling OFF persists gd:autokey=0", await page.evaluate(() => localStorage.getItem("gd:autokey") === "0"));
    await akBtn.click();
    await page.waitForTimeout(120);
    check("toggling ON persists gd:autokey=1", await page.evaluate(() => localStorage.getItem("gd:autokey") === "1"));

    /* ==================== add a shape: #3 + #2 canvas behavior ==================== */
    console.log("\n#3 ◆-only Transform rows + #2 canvas auto-keyframe");
    await page.locator('button:has(span:text-is("Shapes"))').first().click();
    await page.waitForTimeout(200);
    await page.locator('.gd-panel button[title="Rectangle"]').first().click();
    await page.waitForTimeout(250);
    /* Transform card: no inputs at all, read-only mono values */
    const tCard = await page.evaluate(() => {
      const card = [...document.querySelectorAll("div")].find((d) => d.firstElementChild && d.firstElementChild.textContent.startsWith("Transform"));
      if (!card) return { found: false };
      const xRow = [...card.querySelectorAll("span")].find((s) => s.textContent === "Position X" && s.children.length === 0);
      const valSpan = xRow && xRow.parentElement.querySelector('span[style*="JetBrains Mono"]');
      return {
        found: true,
        inputs: card.querySelectorAll("input").length,
        rows: ["Position X", "Position Y", "Rotation", "Scale", "Opacity"].filter((l) => [...card.querySelectorAll("span")].some((s) => s.textContent === l)).length,
        monoDim: !!valSpan && valSpan.style.fontFamily.includes("JetBrains Mono"),
      };
    });
    check("Transform card found with all 5 transform rows", tCard.found && tCard.rows === 5, JSON.stringify(tCard));
    check("Transform rows are ◆-only (zero inputs)", tCard.found && tCard.inputs === 0, `inputs=${tCard.inputs}`);
    check("current value read-only in JetBrains Mono", !!tCard.monoDim);

    /* ◆ toggle on Position X (playhead at 0) → first keyframe */
    await page.evaluate(() => {
      const xRow = [...document.querySelectorAll("span")].find((s) => s.textContent === "Position X" && s.children.length === 0);
      xRow.parentElement.querySelector('button[title="Add keyframe at playhead"]').click();
    });
    await page.waitForTimeout(150);
    let p = await proj(page);
    const shape = () => p.objects.find((o) => o.type === "shape");
    check("◆ toggle wrote the first x keyframe", shape().tracks.x?.length === 1 && shape().tracks.x[0].t === 0, JSON.stringify(shape().tracks.x));

    /* scrub to ~1s, then drag the shape: x (tracked) must get a ◆ at the
       playhead; y (untracked) must patch its base value with NO keyframe */
    await scrubTo(page, 1000 / 6000);
    let r = await stageRect(page);
    const before = shape();
    const x0 = before.tracks.x[0].v, y0 = before.props.y;
    const from = toScreen(r, 640, 360);
    await drag(page, from, 120, 80);
    p = await proj(page);
    const sh = shape();
    const dSx = 120 / r.scale, dSy = 80 / r.scale;
    const kf2 = (sh.tracks.x || []).find((k) => k.t >= 900 && k.t <= 1100);
    check("auto-key: drag on TRACKED x wrote a ◆ at the playhead", (sh.tracks.x || []).length === 2 && !!kf2, JSON.stringify(sh.tracks.x));
    check("auto-key: the new ◆ carries the dragged value", !!kf2 && Math.abs(kf2.v - (x0 + dSx)) <= 3, kf2 ? `v=${kf2.v} expected≈${Math.round(x0 + dSx)}` : "missing");
    check("auto-key: UNTRACKED y got NO keyframe", !(sh.tracks.y || []).length, JSON.stringify(sh.tracks.y || []));
    check("auto-key: UNTRACKED y patched the base value", Math.abs(sh.props.y - (y0 + dSy)) <= 3, `y=${sh.props.y} expected≈${Math.round(y0 + dSy)}`);

    /* rotate grip: auto-key ON + existing rotation track → ◆ at the playhead */
    await page.evaluate(() => {
      const row = [...document.querySelectorAll("span")].find((s) => s.textContent === "Rotation" && s.children.length === 0);
      row.parentElement.querySelector('button[title="Add keyframe at playhead"]').click();
    });
    await page.waitForTimeout(150);
    const rotGrip = page.locator('div[title="Drag to rotate · Shift = 15° steps"]').first();
    const rb = await rotGrip.boundingBox();
    await drag(page, { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 }, 80, 0);
    p = await proj(page);
    const rotKf = (shape().tracks.rotation || []).find((k) => k.t >= 900 && k.t <= 1100);
    check("auto-key: rotate drag wrote a rotation ◆ at the playhead", !!rotKf && rotKf.v > 10, JSON.stringify(shape().tracks.rotation || []));

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

  /* corner grip (NE, index 1) drag outward → uniform scale via the scale prop */
  let p = await proj(page);
  const s0 = stats(p).props.scale || 1;
  const grip = page.locator(gripSel).nth(1);
  const gb = await grip.boundingBox();
  const gFrom = { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 };
  await drag(page, gFrom, 40, -25);
  p = await proj(page);
  const dxS = 40 / r.scale, dyS = 25 / r.scale;
  const r0 = Math.hypot(640, 360) * s0, r1 = Math.hypot(640 + dxS, 360 + dyS);
  const expected = Math.round(s0 * (r1 / r0) * 100) / 100;
  check("corner grip scales the clip uniformly via the scale prop", Math.abs((stats(p).props.scale || 1) - expected) <= 0.03, `scale=${stats(p).props.scale} expected≈${expected}`);
  check("clip contents live in the wrapper (children scale with it)", (stats(p).children || []).length === 3, `${(stats(p).children || []).length} children in the scaled wrapper`);

  /* double-click the clip body → still enters clip editing after the transform */
  await page.mouse.dblclick(toScreen(r, 200, 200).x, toScreen(r, 200, 200).y);
  await page.waitForTimeout(250);
  const inClip = await page.evaluate(() => document.body.textContent.includes("Editing clip — Esc to go back") && document.body.textContent.includes("Scene 2 · Stats"));
  check("double-click still enters the clip after transforms", inClip);
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
  /* import an empty project → no diamond lanes at all */
  await page.locator('button:has-text("Save / Load")').first().click();
  await page.waitForTimeout(200);
  await page.locator("textarea").first().fill('{"objects":[]}');
  await page.locator('button:has-text("Load project")').first().click();
  await page.waitForTimeout(300);
  check("empty project → zero keyframe diamonds in the timeline", await page.evaluate(() => document.querySelectorAll(".gd-kf").length) === 0);
  check("empty project → camera lane shows the preset hint, no stray ◆", await page.evaluate(() => {
    const lane = document.querySelector('div[title="Scene camera · drag empty stage space to pan · Alt+wheel (or select this lane) to zoom"]');
    return !!lane && lane.textContent.includes("◆ add a keyframe or pick a preset in the inspector") && lane.querySelectorAll(".gd-kf").length === 0;
  }));
  check("empty project → Inspector still shows no keyframe controls", await page.evaluate(() => document.querySelectorAll('button[title="Add keyframe at playhead"]').length) === 0);
}
