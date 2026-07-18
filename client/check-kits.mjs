/**
 * check-kits.mjs — node proof for the icon + UI-element kits (src/engine/kits.js):
 *
 *   1. LIBRARY META — ≥48 flat icons across ≥6 categories, ≥12 UI elements,
 *      unique ids, complete {id, name, category, tags, recipe, build} meta.
 *
 *   2. SCHEMA — every kit's build() returns ONE clip layer that satisfies the
 *      project layer schema (same rules check-templates.mjs enforces: layer
 *      keys, ob<n> ids, base + per-type props, known eases/shapes/fonts,
 *      sorted keyframes), with the kit contract: 0-relative start, 2.4–6 s
 *      dur, end "loop", and a non-empty children array. Icons build TWO
 *      variants from the same art: "animated" (default) and "static".
 *
 *   3. VARIANTS — the animated icon has ≥1 keyframed track; the static
 *      variant has ZERO tracks anywhere in the tree and every part is
 *      always visible (inT 0 / outT null). The animated variant is
 *      structurally seamless: every top-level child lives strictly inside
 *      the loop window (inT > 0, outT < dur; groups start > 0, end "hide"
 *      before the loop point) so frame(0) ≡ frame(dur).
 *
 *   4. FLAT-FILL STYLE — icons are colored flat art, not line art: every
 *      icon composes ≥3 solid-fill shapes (fillMode "fill"/"both") with
 *      ≥2 distinct fill colors, and no icon is a stroke-only composition.
 *
 *   4b. BEZIER ART — v3 icons are hand-authored vector art: registered
 *      ka-* glyphs carry bezier curve commands (C/Q) sampled into the
 *      engine's polygon pipeline. Every icon uses ≥2 art layers, except
 *      the three template-embedded icons (heart, arrow-up-right, volume)
 *      which must stay on the 11 classic shape ids (frozen template
 *      schema in check-templates.mjs).
 *
 *   5. RENDER — every kit (both icon variants) SSR-renders a non-empty,
 *      NaN-free frame at hold time through the real StageObject (bundled
 *      with the project's own Vite, one shared react instance); is pure
 *      (same t ⇒ same bytes); is seamless (frame(t=0) ≡ frame(t=dur) via
 *      the end-"hold" probe); and the ANIMATED variant actually animates
 *      (markup differs across hold-time samples) while the STATIC variant
 *      is byte-identical across the whole loop.
 *
 *   6. CUSTOMIZATION — build({color}) recolors the primary fill (shades
 *      re-derive from it), build({size}) scales geometry, build({dur})
 *      re-times the loop within schema bounds, build({variant:"static"})
 *      keeps the same art with no tracks; two builds mint fresh ids and
 *      are otherwise identical (deterministic).
 *
 * Run:  node check-kits.mjs        (from client/)
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ICONS, UI_ELEMENTS, ICON_CATS, UI_CATS, KIT_COLORS, KIT_ART, frameOf } from "./src/engine/kits.js";

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
  if (l.type === "shape" && !SHAPE_IDS.includes(l.props.shape) && !(l.props.shape in KIT_ART)) out.push(`${where}: unknown shape "${l.props.shape}"`);
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

/* every top-level child of an ANIMATED clip must live strictly inside the
   loop window so the t=0 and t=dur frames are both empty (seamless wrap) */
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
const walkAll = (o, fn) => { fn(o); (o.children || []).forEach((c) => walkAll(c, fn)); };
const trackCount = (clip) => { let n = 0; walkAll(clip, (o) => { n += Object.keys(o.tracks || {}).length; }); return n; };

/* ---------- 1 · library meta ---------- */
console.log("kits library — meta");
check("≥48 flat icons", ICONS.length >= 48, `${ICONS.length} icons`);
check("≥6 icon categories", new Set(ICONS.map((k) => k.category)).size >= 6, [...new Set(ICONS.map((k) => k.category))].join(","));
check("every icon category is declared in ICON_CATS", ICONS.every((k) => ICON_CATS.includes(k.category)));
check("icon ids unique", new Set(ICONS.map((k) => k.id)).size === ICONS.length);
check("every icon has name/tags/recipe/build", ICONS.every((k) => k.name && Array.isArray(k.tags) && k.tags.length >= 2 && typeof k.recipe === "string" && typeof k.build === "function"));
check("template-embedded icon ids still exist (heart, arrow-up-right, volume)", ["heart", "arrow-up-right", "volume"].every((id) => ICONS.some((k) => k.id === id)));
check("≥12 UI elements", UI_ELEMENTS.length >= 12, `${UI_ELEMENTS.length} elements`);
check("UI element ids unique", new Set(UI_ELEMENTS.map((k) => k.id)).size === UI_ELEMENTS.length);
check("every UI category is declared in UI_CATS", UI_ELEMENTS.every((k) => UI_CATS.includes(k.category)));
check("every UI element has name/tags/recipe/build", UI_ELEMENTS.every((k) => k.name && Array.isArray(k.tags) && k.tags.length >= 2 && typeof k.recipe === "string" && typeof k.build === "function"));
check("KIT_COLORS ≥ 5 engine swatches", Array.isArray(KIT_COLORS) && KIT_COLORS.length >= 5);
check("≥30 registered bezier art glyphs (ka-*), ≥28 curved", Object.keys(KIT_ART).length >= 30 && Object.values(KIT_ART).filter((a) => a.curves).length >= 28, `${Object.keys(KIT_ART).length} glyphs`);

/* ---------- 2 · build + schema + variant contract (pure, pre-SSR) ---------- */
const built = new Map(); /* `${kind}:${id}` → { k, kind, clip, variant } — reused by the SSR pass */
function checkClipShell(k, kind, variant, clip) {
  const probs = [];
  if (clip.type !== "clip") probs.push(`payload must be a clip — got ${clip.type}`);
  if (clip.name !== k.name) probs.push(`clip titled "${clip.name}", expected "${k.name}"`);
  if (clip.props.start !== 0) probs.push("clip start must be 0-relative");
  if (!(clip.props.dur >= 2400 && clip.props.dur <= 6000)) probs.push(`dur ${clip.props.dur} outside 2400..6000`);
  if (clip.props.end !== "loop") probs.push(`clip end must be "loop" — got "${clip.props.end}"`);
  if (!Array.isArray(clip.children) || !clip.children.length) probs.push("no children");
  layerProblems(clip, new Set(), probs);
  if (JSON.stringify(clip).match(/NaN|Infinity/)) probs.push("JSON contains NaN/Infinity");
  check(`${kind}:${k.id} (${variant}) clip schema`, probs.length === 0, probs.slice(0, 3).join(" · "));
}
function checkIcon(k) {
  for (const variant of ["animated", "static"]) {
    let clip = null, err = null;
    try { clip = k.build({ variant }); } catch (e) { err = e; }
    check(`icon:${k.id} (${variant}) builds`, !err && !!clip, err ? String(err && err.message || err) : "");
    if (!clip) continue;
    built.set(`icon:${k.id}:${variant}`, { k, kind: "icon", variant, clip });
    checkClipShell(k, "icon", variant, clip);
    const kfs = trackCount(clip);
    if (variant === "animated") {
      const probs = [];
      loopWindowProblems(clip, probs);
      check(`icon:${k.id} (animated) loop window (structurally seamless)`, probs.length === 0, probs.slice(0, 3).join(" · "));
      check(`icon:${k.id} (animated) is keyframed (${kfs} tracks)`, kfs >= 1);
    } else {
      check(`icon:${k.id} (static) has zero keyframed props`, kfs === 0, `${kfs} tracks`);
      const open = [];
      walkAll(clip, (o) => { if (o.type !== "clip" && (o.props.inT !== 0 || o.props.outT !== null)) open.push(`${o.name}: inT=${o.props.inT} outT=${o.props.outT}`); });
      check(`icon:${k.id} (static) every part always visible (inT 0 / outT null)`, open.length === 0, open.slice(0, 2).join(" · "));
    }
  }
  /* flat-fill style — the art is colored solid fills, not line strokes */
  const art = k.build({ variant: "static" });
  let filled = 0, stroked = 0; const fills = new Set();
  walkAll(art, (o) => {
    if (o.type === "text") { filled++; if (typeof o.props.fill === "string") fills.add(o.props.fill.toUpperCase()); return; }
    if (o.type !== "shape") return;
    const fm = o.props.fillMode || "fill";
    if (typeof o.props.sC === "string" && fm !== "fill") fills.add(o.props.sC.toUpperCase());
    if (fm === "stroke") stroked++;
    else { filled++; if (typeof o.props.fill === "string") fills.add(o.props.fill.toUpperCase()); }
  });
  check(`icon:${k.id} flat-fill style (≥3 solid fills, ≥2 colors, not stroke-only)`, filled >= 3 && fills.size >= 2 && filled > stroked, `filled=${filled} stroked=${stroked} colors=${fills.size}`);
  /* bezier art contract (4b) */
  const artLayers = [];
  walkAll(art, (o) => { if (o.type === "shape" && o.props.shape in KIT_ART) artLayers.push(o.props.shape); });
  if (["heart", "arrow-up-right", "volume"].includes(k.id)) {
    const classic = [];
    walkAll(art, (o) => { if (o.type === "shape") classic.push(o.props.shape); });
    check(`icon:${k.id} template-embedded ⇒ classic shape ids only`, classic.every((s) => SHAPE_IDS.includes(s)), classic.filter((s) => !SHAPE_IDS.includes(s)).join(","));
  } else {
    check(`icon:${k.id} bezier path art (≥2 ka-* layers)`, artLayers.length >= 2, `${artLayers.length}`);
    check(`icon:${k.id} art layers carry curve commands (C/Q)`, artLayers.filter((s) => KIT_ART[s].curves).length >= 2);
  }
}
console.log("\nicons — build + schema + variant contract (animated × static)");
for (const k of ICONS) checkIcon(k);

function checkUi(k) {
  let clip = null, err = null;
  try { clip = k.build(); } catch (e) { err = e; }
  check(`ui:${k.id} builds`, !err && !!clip, err ? String(err && err.message || err) : "");
  if (!clip) return;
  built.set(`ui:${k.id}:animated`, { k, kind: "ui", variant: "animated", clip });
  checkClipShell(k, "ui", "default", clip);
  const probs = [];
  loopWindowProblems(clip, probs);
  check(`ui:${k.id} clip schema + loop window`, probs.length === 0, probs.slice(0, 3).join(" · "));
  check(`ui:${k.id} is animated (${trackCount(clip)} tracks)`, trackCount(clip) >= 1);
}
console.log("\nUI elements — build + schema + loop contract");
for (const k of UI_ELEMENTS) checkUi(k);

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

  /* ---------- 4 · render + purity + seamless + motion, per kit × variant ---------- */
  console.log("\nSSR — non-empty frame · pure f(time) · seamless loop · variant motion");
  for (const [, { k, kind, variant, clip }] of built) {
    const D = clip.props.dur;
    const tHold = Math.round(D * 0.5);
    const tAlt = Math.round(D * 0.66);
    const tExit = Math.round(D * 0.86);
    let a = "", b = "", alt = "", exit = "", err = null;
    try { a = ssr(clip, tHold); b = ssr(clip, tHold); alt = ssr(clip, tAlt); exit = ssr(clip, tExit); } catch (e) { err = e; }
    check(`${k.id} (${variant}): SSR non-empty at hold, no NaN`, !err && a.length > 200 && !a.includes("NaN") && !exit.includes("NaN") && a.includes("position:absolute"), err ? String(err && err.message || err) : `${a.length} bytes`);
    check(`${k.id} (${variant}): pure — same t ⇒ same bytes`, a === b && a.length > 0);
    /* seamless loop probe: end "hold" forces local time = dur at t=dur */
    const probe = JSON.parse(JSON.stringify(clip));
    probe.props.end = "hold";
    let f0 = "", f1 = "", err2 = null;
    try { f0 = ssr(probe, 0); f1 = ssr(probe, D); } catch (e) { err2 = e; }
    check(`${k.id} (${variant}): seamless — frame(t=0) ≡ frame(t=dur)`, !err2 && f0 === f1 && !f0.includes("NaN"), err2 ? String(err2 && err2.message || err2) : "");
    if (kind === "icon" && variant === "animated") {
      const frames = new Set([a, alt, exit]);
      for (let i = 0; i < 8 && frames.size < 2; i++) frames.add(ssr(clip, Math.round(D * (0.28 + i * 0.09))));
      check(`${k.id} (animated): actually animates (markup differs across t)`, frames.size >= 2, "identical markup at every sampled t");
    }
    if (kind === "icon" && variant === "static") {
      check(`${k.id} (static): still frame — identical markup across the loop`, a === alt && a === exit && a.length > 200);
    }
  }

  /* ---------- 5 · customization + determinism ---------- */
  console.log("\ncustomization (color / size / dur / variant) + determinism");
  for (const k of [ICONS[0], ICONS[21], ICONS[43]]) {
    const dflt = k.build();
    const tinted = k.build({ color: "#123ABC" });
    check(`icon:${k.id} build({color}) recolors the artwork`, JSON.stringify(tinted).includes("#123ABC") && !JSON.stringify(dflt).includes("#123ABC"));
    const tintedStatic = k.build({ color: "#123ABC", variant: "static" });
    check(`icon:${k.id} static variant recolors too`, JSON.stringify(tintedStatic).includes("#123ABC"));
  }
  const sSmall = ICONS[4].build(), sBig = ICONS[4].build({ size: 500 });
  const wOf = (c) => c.children[0].props.w;
  check("icon build({size:500}) scales geometry up", wOf(sBig) > wOf(sSmall) * 1.4, `${wOf(sSmall)} → ${wOf(sBig)}`);
  const dCustom = ICONS[3].build({ dur: 4000 });
  let maxT = 0;
  walkAll(dCustom, (o) => {
    for (const tr of Object.values(o.tracks || {})) tr.forEach((kk) => { maxT = Math.max(maxT, kk.t); });
    if (o.props.outT != null) maxT = Math.max(maxT, o.props.outT);
  });
  check("icon build({dur:4000}) re-times the whole loop", dCustom.props.dur === 4000 && maxT < 4000, `maxT=${maxT}`);
  const artA = ICONS[6].build(), artS = ICONS[6].build({ variant: "static" });
  const artEq = (o) => JSON.stringify(o, (k2, v) => (k2 === "tracks" || k2 === "inT" || k2 === "outT" || k2 === "id" ? undefined : v));
  check("static variant keeps the animated art (same layers, same fills)",
    collectIds(artA).length === collectIds(artS).length && artEq(artA) === artEq(artS));
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
  check("frameOf(icon animated) finite, inside the stage", [fIcon.x, fIcon.y, fIcon.w, fIcon.h].every(Number.isFinite) && fIcon.x > 0 && fIcon.y > 0 && fIcon.x + fIcon.w < 1280 && fIcon.y + fIcon.h < 720);
  const fIconS = frameOf(ICONS[0].build({ variant: "static" }));
  check("frameOf(icon static) finite, sane size", [fIconS.x, fIconS.y, fIconS.w, fIconS.h].every(Number.isFinite) && fIconS.w > 60 && fIconS.h > 60);
  const fUi = frameOf(UI_ELEMENTS[0].build());
  check("frameOf(ui) finite, sane size", [fUi.x, fUi.y, fUi.w, fUi.h].every(Number.isFinite) && fUi.w > 100 && fUi.h > 60);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (passed < 150) { console.error(`expected ≥150 assertions, got ${passed}`); process.exit(1); }
  if (!failed) console.log("All kit checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
