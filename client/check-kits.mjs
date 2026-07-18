/**
 * check-kits.mjs — node proof for the icon + UI-element kits (src/engine/kits.js):
 *
 *   1. LIBRARY META — ≥36 icons across ≥6 categories, ≥12 UI elements, unique
 *      ids, complete {id, name, category, tags, recipe, build} meta.
 *
 *   2. SCHEMA — every kit's build() returns ONE clip layer that satisfies the
 *      project layer schema (same rules check-templates.mjs enforces: layer
 *      keys, ob<n> ids, base + per-type props, known eases/shapes/fonts,
 *      sorted keyframes), with the kit contract: 0-relative start, 2.4–6 s
 *      dur, end "loop", and a non-empty children array.
 *
 *   3. SEAMLESS LOOP — structurally, every top-level child lives in a window
 *      strictly inside the loop (inT > 0 and outT < dur for plain layers;
 *      start > 0, start+dur < dur and end "hide" for group clips), so both
 *      loop ends render the same empty frame; then PROVEN via the real
 *      StageObject (SSR): the clip rendered at t=0 and t=dur (end "hold"
 *      probe) is byte-identical.
 *
 *   4. RENDER — every kit SSR-renders a non-empty, NaN-free frame at hold
 *      time through the real StageObject (bundled with the project's own
 *      Vite, one shared react instance), and is pure: same t ⇒ same bytes.
 *
 *   5. CUSTOMIZATION — build({color/accent}) recolors, build({size}) scales
 *      geometry, build({dur}) re-times the loop within schema bounds; two
 *      builds mint fresh ids and are otherwise identical (deterministic).
 *
 * Run:  node check-kits.mjs        (from client/)
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ICONS, UI_ELEMENTS, ICON_CATS, UI_CATS, KIT_COLORS, frameOf } from "./src/engine/kits.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".kits-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

/* ---- schema mirror (same rules as check-templates.mjs) ---- */
const EASE_IDS = ["linear", "easeOutQuad", "easeInQuad", "easeInOutCubic", "easeOutCubic", "easeInCubic", "easeOutBack", "easeOutElastic", "easeOutBounce", "easeInOutSine"];
const SHAPE_IDS = ["rect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star", "heart", "arrow", "cross", "bolt"];
const FONT_IDS = ["Space Grotesk", "Inter", "JetBrains Mono", "Bebas Neue", "Montserrat", "Oswald", "Playfair Display", "Archivo Black", "Pacifico", "Caveat"];
const NUM_STYLE_IDS = ["odometer", "count", "slot"];
const RING_IDS = ["none", "ring", "pie"];
const CLIP_END_IDS = ["hold", "hide", "loop"];
const CLIP_TRANSITION_IDS = ["none", "fade", "slideU", "slideD", "slideL", "slideR", "zoom", "zoomOut"];
const BASE_PROPS = ["x", "y", "scale", "rotation", "opacity", "fill", "w", "h", "inT", "outT", "path", "prog"];
const TYPE_PROPS = {
  shape: ["shape", "w", "h", "fillMode", "sC", "sW", "cornerR"],
  text: ["text", "fontSize", "fontWeight", "w", "h", "textFx", "fontFamily", "ls", "upper", "pathMode", "bg", "pad", "borderC", "borderW", "radius", "boxFx"],
  number: ["from", "to", "start", "dur", "style", "decimals", "prefix", "suffix", "fontSize", "fill", "numEase", "fontFamily", "ring", "ringC", "ringW", "bg", "pad", "borderC", "borderW", "radius", "boxFx"],
  clip: ["start", "dur", "speed", "end", "bg", "bgPad", "bgRadius", "tIn", "tOut", "tDur"],
};

function layerProblems(l, seen, out) {
  const where = l.name || l.id;
  for (const k of ["id", "type", "name", "tracks", "locked", "hidden", "props"]) if (!(k in l)) out.push(`${where}: missing key "${k}"`);
  if (typeof l.id !== "string" || !/^ob\d+$/.test(l.id)) out.push(`${where}: bad id "${l.id}"`);
  if (seen.has(l.id)) out.push(`${where}: duplicate id ${l.id}`);
  seen.add(l.id);
  if (!(l.type in TYPE_PROPS)) out.push(`${where}: unsupported type "${l.type}"`);
  if (!l.props || typeof l.props !== "object") { out.push(`${where}: props missing`); return; }
  for (const p of BASE_PROPS) if (!(p in l.props)) out.push(`${where}: missing base prop "${p}"`);
  for (const p of TYPE_PROPS[l.type] || []) if (!(p in l.props)) out.push(`${where}: missing ${l.type} prop "${p}"`);
  for (const [prop, tr] of Object.entries(l.tracks || {})) {
    if (!Array.isArray(tr) || !tr.length) { out.push(`${where}: track "${prop}" empty`); continue; }
    let prev = -1;
    for (const k of tr) {
      if (typeof k.t !== "number" || typeof k.ease !== "string" || !("v" in k)) out.push(`${where}: bad keyframe in "${prop}"`);
      if (!EASE_IDS.includes(k.ease)) out.push(`${where}: unknown ease "${k.ease}"`);
      if (!(k.t >= 0 && k.t <= 6500)) out.push(`${where}: keyframe t=${k.t} out of range`);
      if (k.t < prev) out.push(`${where}: track "${prop}" not sorted`);
      prev = k.t;
      if (typeof k.v === "number" && !Number.isFinite(k.v)) out.push(`${where}: non-finite value in "${prop}"`);
    }
  }
  if (l.type === "shape" && !SHAPE_IDS.includes(l.props.shape)) out.push(`${where}: unknown shape "${l.props.shape}"`);
  if (l.type === "text" && !FONT_IDS.includes(l.props.fontFamily)) out.push(`${where}: unknown font "${l.props.fontFamily}"`);
  if (l.type === "number") {
    if (!NUM_STYLE_IDS.includes(l.props.style)) out.push(`${where}: unknown number style "${l.props.style}"`);
    if (!RING_IDS.includes(l.props.ring)) out.push(`${where}: unknown ring "${l.props.ring}"`);
    if (!FONT_IDS.includes(l.props.fontFamily)) out.push(`${where}: unknown font "${l.props.fontFamily}"`);
    if (!EASE_IDS.includes(l.props.numEase)) out.push(`${where}: unknown numEase "${l.props.numEase}"`);
  }
  if (l.type === "clip") {
    if (!CLIP_END_IDS.includes(l.props.end)) out.push(`${where}: unknown clip end "${l.props.end}"`);
    if (!CLIP_TRANSITION_IDS.includes(l.props.tIn) || !CLIP_TRANSITION_IDS.includes(l.props.tOut)) out.push(`${where}: unknown clip transition`);
    if (!Array.isArray(l.children) || !l.children.length) out.push(`${where}: clip needs children`);
    else l.children.forEach((c) => layerProblems(c, seen, out));
  }
}

/* every top-level child must live strictly inside the loop window so the
   t=0 and t=dur frames are both empty (the seamless-loop contract) */
function loopWindowProblems(clip, out) {
  const D = clip.props.dur;
  for (const c of clip.children) {
    if (c.type === "clip") {
      if (!(c.props.start > 0)) out.push(`${c.name}: group must start after 0 (start=${c.props.start})`);
      if (!(c.props.start + c.props.dur <= D - 20)) out.push(`${c.name}: group must end before the loop point (end=${c.props.start + c.props.dur}, dur=${D})`);
      if (c.props.end !== "hide") out.push(`${c.name}: group must end "hide" — got "${c.props.end}"`);
    } else {
      if (!(c.props.inT > 0)) out.push(`${c.name}: inT must be > 0 (got ${c.props.inT})`);
      if (!(c.props.outT != null && c.props.outT < D)) out.push(`${c.name}: outT must be < dur (got ${c.props.outT}, dur ${D})`);
    }
  }
}

const collectIds = (l, out = []) => { out.push(l.id); (l.children || []).forEach((c) => collectIds(c, out)); return out; };
const stripIds = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "id" ? "ID" : v)));

/* ---------- 1 · library meta ---------- */
console.log("kits library — meta");
check("≥36 icons", ICONS.length >= 36, `${ICONS.length} icons`);
check("≥6 icon categories", new Set(ICONS.map((k) => k.category)).size >= 6, [...new Set(ICONS.map((k) => k.category))].join(","));
check("every icon category is declared in ICON_CATS", ICONS.every((k) => ICON_CATS.includes(k.category)));
check("icon ids unique", new Set(ICONS.map((k) => k.id)).size === ICONS.length);
check("every icon has name/tags/recipe/build", ICONS.every((k) => k.name && Array.isArray(k.tags) && k.tags.length >= 2 && typeof k.recipe === "string" && typeof k.build === "function"));
check("≥12 UI elements", UI_ELEMENTS.length >= 12, `${UI_ELEMENTS.length} elements`);
check("UI element ids unique", new Set(UI_ELEMENTS.map((k) => k.id)).size === UI_ELEMENTS.length);
check("every UI category is declared in UI_CATS", UI_ELEMENTS.every((k) => UI_CATS.includes(k.category)));
check("every UI element has name/tags/recipe/build", UI_ELEMENTS.every((k) => k.name && Array.isArray(k.tags) && k.tags.length >= 2 && typeof k.recipe === "string" && typeof k.build === "function"));
check("KIT_COLORS ≥ 5 engine swatches", Array.isArray(KIT_COLORS) && KIT_COLORS.length >= 5);

/* ---------- 2 · build + schema + loop contract (pure, pre-SSR) ---------- */
const built = new Map(); /* kit → default clip, reused by the SSR pass */
function checkKit(k, kind) {
  let clip = null, err = null;
  try { clip = k.build(); } catch (e) { err = e; }
  check(`${kind}:${k.id} builds`, !err && !!clip, err ? String(err && err.message || err) : "");
  if (!clip) return;
  built.set(k, clip);
  const probs = [];
  if (clip.type !== "clip") probs.push(`payload must be a clip — got ${clip.type}`);
  if (clip.name !== k.name) probs.push(`clip titled "${clip.name}", expected "${k.name}"`);
  if (clip.props.start !== 0) probs.push("clip start must be 0-relative");
  if (!(clip.props.dur >= 2400 && clip.props.dur <= 6000)) probs.push(`dur ${clip.props.dur} outside 2400..6000`);
  if (clip.props.end !== "loop") probs.push(`clip end must be "loop" — got "${clip.props.end}"`);
  if (!Array.isArray(clip.children) || !clip.children.length) probs.push("no children");
  layerProblems(clip, new Set(), probs);
  loopWindowProblems(clip, probs);
  if (JSON.stringify(clip).match(/NaN|Infinity/)) probs.push("JSON contains NaN/Infinity");
  check(`${kind}:${k.id} clip schema + loop window`, probs.length === 0, probs.slice(0, 3).join(" · "));
  /* animated: at least one keyframed track somewhere in the tree */
  let kfs = 0;
  const walk = (o) => { kfs += Object.keys(o.tracks || {}).length; (o.children || []).forEach(walk); };
  walk(clip);
  check(`${kind}:${k.id} is animated (${kfs} tracks)`, kfs >= 1);
}
console.log("\nicons — build + schema + loop contract");
for (const k of ICONS) checkKit(k, "icon");
console.log("\nUI elements — build + schema + loop contract");
for (const k of UI_ELEMENTS) checkKit(k, "ui");

/* ---------- 3 · bundle the real StageObject for SSR ---------- */
async function main() {
  console.log("\nBundling the real StageObject (+ react-dom/server) with Vite…");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.js");
  fs.writeFileSync(entry, [
    `export { StageObject } from ${JSON.stringify(path.join(here, "src", "components", "StageObject.jsx"))};`,
    `export { createElement } from "react";`,
    `export { renderToStaticMarkup } from "react-dom/server";`,
    "",
  ].join("\n"));
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    build: { outDir: tmpDir, lib: { entry, formats: ["es"], fileName: () => "engine.mjs" } },
  });
  const M = await import(pathToFileURL(path.join(tmpDir, "engine.mjs")).href);
  const { StageObject, createElement: h, renderToStaticMarkup } = M;
  check("StageObject export present", typeof StageObject === "function" || (typeof StageObject === "object" && StageObject !== null));
  const stage = { w: 1280, h: 720 };
  const ssr = (obj, time) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));

  /* ---------- 4 · render + purity + seamless loop, per kit ---------- */
  console.log("\nSSR — non-empty frame · pure f(time) · seamless loop");
  for (const [k, clip] of built) {
    const D = clip.props.dur;
    const tHold = Math.round(D * 0.5);
    const tExit = Math.round(D * 0.86);
    let a = "", b = "", c = "", err = null;
    try { a = ssr(clip, tHold); b = ssr(clip, tHold); c = ssr(clip, tExit); } catch (e) { err = e; }
    check(`${k.id}: SSR non-empty at hold, no NaN`, !err && a.length > 200 && !a.includes("NaN") && !c.includes("NaN") && a.includes("position:absolute"), err ? String(err && err.message || err) : `${a.length} bytes`);
    check(`${k.id}: pure — same t ⇒ same bytes`, a === b && a.length > 0);
    /* seamless loop probe: end "hold" forces local time = dur at t=dur */
    const probe = JSON.parse(JSON.stringify(clip));
    probe.props.end = "hold";
    let f0 = "", f1 = "", err2 = null;
    try { f0 = ssr(probe, 0); f1 = ssr(probe, D); } catch (e) { err2 = e; }
    check(`${k.id}: seamless — frame(t=0) ≡ frame(t=dur)`, !err2 && f0 === f1, err2 ? String(err2 && err2.message || err2) : "");
  }

  /* ---------- 5 · customization + determinism ---------- */
  console.log("\ncustomization (color / accent / size / dur) + determinism");
  for (const k of [ICONS[0], ICONS[12], ICONS[32]]) {
    const dflt = k.build();
    const tinted = k.build({ color: "#123ABC" });
    check(`icon:${k.id} build({color}) recolors the artwork`, JSON.stringify(tinted).includes("#123ABC") && !JSON.stringify(dflt).includes("#123ABC"));
  }
  const sSmall = ICONS[0].build(), sBig = ICONS[0].build({ size: 500 });
  const wOf = (c) => c.children[0].props.w;
  check("icon build({size:500}) scales geometry up", wOf(sBig) > wOf(sSmall) * 1.4, `${wOf(sSmall)} → ${wOf(sBig)}`);
  const dCustom = ICONS[3].build({ dur: 4000 });
  let maxT = 0;
  const walkT = (o) => { for (const tr of Object.values(o.tracks || {})) tr.forEach((k) => { maxT = Math.max(maxT, k.t); }); if (o.props.outT != null) maxT = Math.max(maxT, o.props.outT); (o.children || []).forEach(walkT); };
  walkT(dCustom);
  check("icon build({dur:4000}) re-times the whole loop", dCustom.props.dur === 4000 && maxT < 4000, `maxT=${maxT}`);
  for (const k of [UI_ELEMENTS[1], UI_ELEMENTS[7], UI_ELEMENTS[11]]) {
    const tinted = k.build({ accent: "#10EFCD" });
    check(`ui:${k.id} build({accent}) recolors the accent`, JSON.stringify(tinted).includes("#10EFCD"));
  }
  const uDur = UI_ELEMENTS[0].build({ dur: 4400 });
  check("ui build({dur:4400}) re-times the loop", uDur.props.dur === 4400);
  const detA = ICONS[7].build(), detB = ICONS[7].build();
  check("icon build deterministic (fresh ids, identical content)", JSON.stringify(detA) !== JSON.stringify(detB) && JSON.stringify(stripIds(detA)) === JSON.stringify(stripIds(detB)));
  const detC = UI_ELEMENTS[0].build(), detD = UI_ELEMENTS[0].build();
  check("ui build deterministic (fresh ids, identical content)", JSON.stringify(detC) !== JSON.stringify(detD) && JSON.stringify(stripIds(detC)) === JSON.stringify(stripIds(detD)));
  check("two builds mint fresh ids (no overlap)", collectIds(detA).every((id) => !collectIds(detB).includes(id)));

  /* ---------- 6 · frameOf thumb bounds ---------- */
  console.log("\nframeOf — thumbnail content bounds");
  const fIcon = frameOf(ICONS[0].build());
  check("frameOf(icon) finite, inside the stage", [fIcon.x, fIcon.y, fIcon.w, fIcon.h].every(Number.isFinite) && fIcon.x > 0 && fIcon.y > 0 && fIcon.x + fIcon.w < 1280 && fIcon.y + fIcon.h < 720);
  const fUi = frameOf(UI_ELEMENTS[0].build());
  check("frameOf(ui) finite, sane size", [fUi.x, fUi.y, fUi.w, fUi.h].every(Number.isFinite) && fUi.w > 100 && fUi.h > 60);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (passed < 80) { console.error(`expected ≥80 assertions, got ${passed}`); process.exit(1); }
  if (!failed) console.log("All kit checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
