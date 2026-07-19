/* Sanity check: every template's buildProject() output parses and matches the
   GraphicDestinationMotion project schema (v5), every buildClip() returns a
   clip-shaped payload (type "clip", children, 0-relative start, template-
   length dur, fades, fresh ids per call) for the editor's insert-as-clip path,
   and every template renders a NON-EMPTY live thumbnail frame (TemplateThumb
   → the real StageObject, SSR) without throwing or falling back to its
   placeholder — run with: node check-templates.mjs */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TEMPLATES, blankProject } from "./src/templates/templates.js";
import { BACKDROP_VARIANT_IDS, BACKDROP_THEMES } from "./src/engine/backdrops.js";
import { CHART_TYPES } from "./src/engine/fx.js";

const EASE_IDS = ["linear", "easeOutQuad", "easeInQuad", "easeInOutCubic", "easeOutCubic", "easeInCubic", "easeOutBack", "easeOutElastic", "easeOutBounce", "easeInOutSine"];
const SHAPE_IDS = ["rect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star", "heart", "arrow", "cross", "bolt"];
const FONT_IDS = ["Space Grotesk", "Inter", "JetBrains Mono", "Bebas Neue", "Montserrat", "Oswald", "Playfair Display", "Archivo Black", "Pacifico", "Caveat"];
const TEXTFX_IDS = ["typewriter", "rise", "pop", "fall", "tracking", "scramble", "wave"];
const NUM_STYLE_IDS = ["odometer", "count", "slot", "bold", "blur", "dotted", "poster", "pixel", "progressring"];
const RING_IDS = ["none", "ring", "pie"];
const SWATCHES = ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#C084FC", "#F9F9F9", "#0F1116"];
const BASE_PROPS = ["x", "y", "scale", "rotation", "opacity", "fill", "w", "h", "inT", "outT", "path", "prog"];
const CHART_TYPE_IDS = CHART_TYPES.map((c) => c.id);
const BACKDROP_THEME_IDS = BACKDROP_THEMES.map((t) => t.id);
const CAM_PROPS = ["x", "y", "zoom"];
const TYPE_PROPS = {
  shape: ["shape", "w", "h", "fillMode", "sC", "sW", "cornerR"],
  text: ["text", "fontSize", "fontWeight", "w", "h", "textFx", "fontFamily", "ls", "upper", "pathMode", "bg", "pad", "borderC", "borderW", "radius", "boxFx"],
  number: ["from", "to", "start", "dur", "style", "decimals", "prefix", "suffix", "fontSize", "fill", "numEase", "fontFamily", "ring", "ringC", "ringW", "bg", "pad", "borderC", "borderW", "radius", "boxFx"],
  confetti: ["burst", "count", "power", "seed", "style"],
  chart: ["chartType", "dataStr", "start", "dur", "showVals", "bg", "bgOp", "radius", "borderC", "borderW", "pad"],
  backdrop: ["variant", "theme", "colors", "speed", "intensity", "loopMs", "seed", "columns"],
  clip: ["start", "dur", "speed", "end", "bg", "bgPad", "bgRadius", "tIn", "tOut", "tDur"],
};

let failures = 0;
const fail = (msg) => { failures += 1; console.error("  ✗ " + msg); };
const ok = (msg) => console.log("  ✓ " + msg);

function checkTrack(tid, layerName, prop, track) {
  if (!Array.isArray(track) || !track.length) return fail(`${tid}/${layerName}: track "${prop}" must be a non-empty array`);
  let prev = -1;
  for (const k of track) {
    if (typeof k.t !== "number" || typeof k.ease !== "string" || !("v" in k)) fail(`${tid}/${layerName}: keyframe in "${prop}" needs { t:number, v, ease:string } — got ${JSON.stringify(k)}`);
    if (!EASE_IDS.includes(k.ease)) fail(`${tid}/${layerName}: unknown ease "${k.ease}" in "${prop}"`);
    if (k.t < 0 || k.t > 5000) fail(`${tid}/${layerName}: keyframe t=${k.t} out of 0..5000 in "${prop}"`);
    if (k.t < prev) fail(`${tid}/${layerName}: keyframes in "${prop}" not sorted by t`);
    prev = k.t;
    if (prop === "shape" && !SHAPE_IDS.includes(k.v)) fail(`${tid}/${layerName}: unknown shape id "${k.v}" in shape track`);
  }
}

function checkLayer(tid, l, seenIds) {
  const where = `${tid}/${l.name || l.id}`;
  for (const k of ["id", "type", "name", "tracks", "locked", "hidden", "props"]) if (!(k in l)) fail(`${where}: missing layer key "${k}"`);
  if (typeof l.id !== "string" || !/^ob\d+$/.test(l.id)) fail(`${where}: id "${l.id}" must look like ob<n>`);
  if (seenIds.has(l.id)) fail(`${where}: duplicate id ${l.id}`);
  seenIds.add(l.id);
  if (!(l.type in TYPE_PROPS)) fail(`${where}: unsupported type "${l.type}"`);
  if (typeof l.tracks !== "object" || l.tracks === null) fail(`${where}: tracks must be an object`);
  for (const p of BASE_PROPS) if (!(p in l.props)) fail(`${where}: missing base prop "${p}"`);
  for (const p of TYPE_PROPS[l.type] || []) if (!(p in l.props)) fail(`${where}: missing ${l.type} prop "${p}"`);
  for (const [prop, tr] of Object.entries(l.tracks)) checkTrack(tid, l.name, prop, tr);
  if (l.type === "shape" && !SHAPE_IDS.includes(l.props.shape)) fail(`${where}: unknown shape "${l.props.shape}"`);
  if (l.type === "text") {
    if (!FONT_IDS.includes(l.props.fontFamily)) fail(`${where}: font "${l.props.fontFamily}" not in engine FONTS`);
    if (l.props.textFx && !TEXTFX_IDS.includes(l.props.textFx.type)) fail(`${where}: unknown textFx "${l.props.textFx.type}"`);
  }
  if (l.type === "number") {
    if (!NUM_STYLE_IDS.includes(l.props.style)) fail(`${where}: unknown number style "${l.props.style}"`);
    if (!RING_IDS.includes(l.props.ring)) fail(`${where}: unknown ring "${l.props.ring}"`);
    if (!FONT_IDS.includes(l.props.fontFamily)) fail(`${where}: font "${l.props.fontFamily}" not in engine FONTS`);
    if (!EASE_IDS.includes(l.props.numEase)) fail(`${where}: unknown numEase "${l.props.numEase}"`);
  }
  if (l.type === "chart" && !CHART_TYPE_IDS.includes(l.props.chartType)) fail(`${where}: unknown chartType "${l.props.chartType}"`);
  if (l.type === "backdrop") {
    if (!BACKDROP_VARIANT_IDS.includes(l.props.variant)) fail(`${where}: unknown backdrop variant "${l.props.variant}"`);
    if (!BACKDROP_THEME_IDS.includes(l.props.theme)) fail(`${where}: unknown backdrop theme "${l.props.theme}"`);
    if (!Array.isArray(l.props.colors) || l.props.colors.length !== 5 || l.props.colors.some((c) => !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c))) fail(`${where}: backdrop colors must be 5 hex slots`);
  }
  if ("depth" in l.props && (typeof l.props.depth !== "number" || l.props.depth < -1 || l.props.depth > 1.5)) fail(`${where}: depth ${l.props.depth} out of −1…1.5`);
  if (l.type === "clip") {
    if (!Array.isArray(l.children)) fail(`${where}: clip needs a children array`);
    else l.children.forEach((c) => checkLayer(tid, c, seenIds));
  }
}

function checkProject(tid, p) {
  if (p.app !== "graphic-destination-motion") fail(`${tid}: app must be "graphic-destination-motion"`);
  if (p.v !== 5) fail(`${tid}: v must be 5`);
  if (p.stage?.w !== 1280 || p.stage?.h !== 720) fail(`${tid}: stage must be 1280×720`);
  if (p.stage?.dur !== 5000) fail(`${tid}: stage dur must be 5000`);
  if (typeof p.stage?.bg !== "string") fail(`${tid}: stage bg missing`);
  if (!Array.isArray(p.brands) || !p.brands.length) fail(`${tid}: brands array missing`);
  else {
    const b = p.brands[0];
    for (const k of ["id", "name", "colors", "headFont", "bodyFont"]) if (!(k in b)) fail(`${tid}: brand missing "${k}"`);
    if (!FONT_IDS.includes(b.headFont) || !FONT_IDS.includes(b.bodyFont)) fail(`${tid}: brand fonts must be engine fonts`);
  }
  if (p.brandId !== p.brands?.[0]?.id) fail(`${tid}: brandId must reference brands[0].id`);
  if (!Array.isArray(p.objects) || !p.objects.length) fail(`${tid}: objects must be a non-empty array`);
  const seen = new Set();
  (p.objects || []).forEach((l) => checkLayer(tid, l, seen));
  /* optional 2.5D scene camera (engine/camera.js): tracks for x/y/zoom only,
     numeric values, zoom clamped 0.25…4, same keyframe rules as object tracks */
  if (p.camera != null) {
    if (typeof p.camera !== "object" || Array.isArray(p.camera) || !p.camera.tracks || typeof p.camera.tracks !== "object") fail(`${tid}: camera must be { tracks }`);
    else {
      for (const [prop, tr] of Object.entries(p.camera.tracks)) {
        if (!CAM_PROPS.includes(prop)) { fail(`${tid}: unknown camera prop "${prop}"`); continue; }
        checkTrack(tid, "camera", prop, tr);
        for (const k of tr) {
          if (typeof k.v !== "number") fail(`${tid}/camera: keyframe value in "${prop}" must be numeric`);
          if (prop === "zoom" && (k.v < 0.25 || k.v > 4)) fail(`${tid}/camera: zoom ${k.v} out of 0.25…4`);
        }
      }
    }
  }
  /* envelope must survive a serialize/parse round-trip unchanged */
  if (JSON.stringify(JSON.parse(JSON.stringify(p))) !== JSON.stringify(p)) fail(`${tid}: JSON round-trip changed the project`);
}

/* confetti emission styles the engine supports (engine/fx.js CONFETTI_STYLES) */
const CONFETTI_STYLE_IDS = ["burst", "rain", "cannonL", "cannonR", "firework", "spiral", "snow", "pop", "cannons", "fountain", "celebration", "patriotic", "mono", "streamers", "tornado", "popring", "drift"];
const CLIP_TRANSITION_IDS = ["none", "fade", "slideU", "slideD", "slideL", "slideR", "zoom", "zoomOut"];

function collectIds(l, out) {
  out.push(l.id);
  (l.children || []).forEach((c) => collectIds(c, out));
  return out;
}

/* buildClip(): the insert-as-editable-clip payload — one clip layer whose
   children are the template's objects, with 0-relative timing and fades */
function checkClip(t) {
  let c;
  try { c = t.buildClip(); } catch (e) { fail(`${t.id}: buildClip threw — ${e.message}`); return; }
  const where = `${t.id}/clip`;
  if (c.type !== "clip") return fail(`${where}: payload type must be "clip" — got ${c.type}`);
  if (c.name !== t.name) fail(`${where}: clip should be titled with the template name "${t.name}" — got "${c.name}"`);
  if (!Array.isArray(c.children) || !c.children.length) fail(`${where}: clip needs a non-empty children array`);
  for (const k of ["id", "type", "name", "tracks", "locked", "hidden", "props", "children"]) if (!(k in c)) fail(`${where}: missing layer key "${k}"`);
  if (typeof c.props.start !== "number" || c.props.start !== 0) fail(`${where}: clip start must be 0-relative — got ${c.props.start}`);
  if (c.props.dur !== 5000) fail(`${where}: clip dur must equal the template length (5000) — got ${c.props.dur}`);
  if (!CLIP_TRANSITION_IDS.includes(c.props.tIn) || !CLIP_TRANSITION_IDS.includes(c.props.tOut)) fail(`${where}: unknown tIn/tOut "${c.props.tIn}"/"${c.props.tOut}"`);
  if (typeof c.props.x !== "number" || typeof c.props.y !== "number") fail(`${where}: clip needs numeric x/y (stage-centered)`);
  const seen = new Set();
  checkLayer(t.id, c, seen); /* full recursive schema check of clip + children */
  (c.children || []).forEach((ch) => { if (ch.type === "confetti" && !CONFETTI_STYLE_IDS.includes(ch.props.style)) fail(`${where}/${ch.name}: unknown confetti style "${ch.props.style}"`); });
  if (JSON.stringify(JSON.parse(JSON.stringify(c))) !== JSON.stringify(c)) fail(`${where}: JSON round-trip changed the clip`);
  /* fresh ids on every call — two clips from the same template must not share ids */
  let c2;
  try { c2 = t.buildClip(); } catch (e) { fail(`${t.id}: second buildClip threw — ${e.message}`); return; }
  const ids1 = new Set(collectIds(c, []));
  const dup = collectIds(c2, []).filter((id) => ids1.has(id));
  if (dup.length) fail(`${where}: buildClip does not mint fresh ids — repeated ${dup.join(", ")}`);
  if (c2.children.length !== c.children.length) fail(`${where}: buildClip child count differs between calls`);
}

console.log(`Checking ${TEMPLATES.length} templates + blankProject()…\n`);
for (const t of TEMPLATES) {
  console.log(`• ${t.name} (${t.id})`);
  if (!t.id || !t.name || !t.description || typeof t.accent !== "string" || typeof t.buildProject !== "function") { fail(`${t.id}: template meta incomplete`); continue; }
  if (!SWATCHES.includes(t.accent)) fail(`${t.id}: accent ${t.accent} not from engine SWATCHES`);
  if (typeof t.category !== "string" || !t.category.trim()) fail(`${t.id}: category missing`);
  if (typeof t.buildClip !== "function") fail(`${t.id}: buildClip missing`);
  let p;
  try { p = t.buildProject(); } catch (e) { fail(`${t.id}: buildProject threw — ${e.message}`); continue; }
  checkProject(t.id, p);
  if (typeof t.buildClip === "function") checkClip(t);
  if (!failures) ok(`${p.objects.length} layers, schema valid`);
  else console.log("");
}

/* ---------- R5 library-drop assertions ---------- */
console.log("\n• library drop (R5)");
const LEGACY_IDS = ["logo-reveal", "quote-card", "lower-third", "countdown", "subscribe-cta", "promo-flash"];
const NEW_IDS = [
  "cam-parallax-hero", "cam-depth-product", "cam-dolly-reveal", "cam-parallax-quote", "cam-orbit-countdown",
  "zero-gravity-words", "bold-color-list",
  "data-stat-ring", "data-bars", "data-donut", "data-trend",
  "social-like-burst", "social-follow-card", "social-story-swipe",
  "promo-podcast", "promo-drop",
  "business-lower-glass", "business-kpi",
  "title-cinematic", "title-minimal",
  "countdown-premiere", "countdown-event",
  "product-features", "intro-logo-sting", "cta-endcard",
];
const ids = TEMPLATES.map((t) => t.id);
if (new Set(ids).size !== ids.length) fail("duplicate template ids");
if (NEW_IDS.length < 20) fail(`spec: NEW_IDS lists ${NEW_IDS.length} — the drop must add ≥ 20 templates`);
const missing = NEW_IDS.filter((id) => !ids.includes(id));
if (missing.length) fail(`library: missing new templates: ${missing.join(", ")}`);
else ok(`≥ 20 new templates present (${NEW_IDS.length} new + ${TEMPLATES.length - NEW_IDS.length} legacy = ${TEMPLATES.length} total)`);
const unknown = ids.filter((id) => ![...NEW_IDS, ...LEGACY_IDS].includes(id));
if (unknown.length) fail(`library: templates not accounted for (add to NEW_IDS/LEGACY_IDS): ${unknown.join(", ")}`);

/* camera-depth showcases: ≥ 4 templates, non-trivial AND loop-aware camera
   tracks, ≥ 3 distinct parallax depths among the layers */
const camTpls = TEMPLATES.filter((t) => {
  const p = t.buildProject();
  return p.camera && Object.keys(p.camera.tracks || {}).length > 0;
});
if (camTpls.length < 4) fail(`camera: only ${camTpls.length} camera templates (need ≥ 4)`);
else {
  for (const t of camTpls) {
    const p = t.buildProject();
    const depths = new Set(p.objects.map((o) => o.props.depth ?? 0));
    if (depths.size < 3) fail(`${t.id}: needs ≥ 3 distinct depth values, got [${[...depths].join(", ")}]`);
    for (const [prop, tr] of Object.entries(p.camera.tracks)) {
      if (tr.length < 2) fail(`${t.id}: camera.${prop} needs ≥ 2 keyframes`);
      const vals = tr.map((k) => k.v);
      if (Math.max(...vals) - Math.min(...vals) < 1e-6) fail(`${t.id}: camera.${prop} never moves`);
      if (tr[0].v !== tr[tr.length - 1].v) fail(`${t.id}: camera.${prop} not loop-aware (${tr[0].v} ≠ ${tr[tr.length - 1].v})`);
    }
  }
  if (!failures) ok(`camera: ${camTpls.length} depth showcases — moving, loop-aware tracks + ≥ 3 depths each`);
}

/* promo-flash must be the R5 rebuild: procedural backdrop + confetti, no legacy morphers */
{
  const promo = TEMPLATES.find((t) => t.id === "promo-flash");
  const objs = promo.buildProject().objects;
  const procedural = objs.some((o) => o.type === "backdrop" && o.props.variant === "procedural");
  const confetti = objs.some((o) => o.type === "confetti");
  const morphers = objs.filter((o) => /morpher/i.test(o.name || ""));
  if (!procedural || !confetti || morphers.length) fail(`promo-flash: legacy structure still present (procedural=${procedural}, confetti=${confetti}, morphers=${morphers.length})`);
  else ok("promo-flash: rebuilt structure (procedural backdrop + confetti + CTA grammar, no morphers)");
}

/* zero-gravity-words: ≥ 6 independently-animated letter/word objects */
{
  const p = TEMPLATES.find((t) => t.id === "zero-gravity-words").buildProject();
  const floaters = p.objects.filter((o) =>
    o.type === "text" && o.tracks && ["x", "y", "rotation"].filter((pr) => Array.isArray(o.tracks[pr]) && o.tracks[pr].length >= 2).length >= 2);
  if (floaters.length < 6) fail(`zero-gravity-words: only ${floaters.length} independently-animated letters (need ≥ 6)`);
  else ok(`zero-gravity-words: ${floaters.length} independently-animated letters`);
}

/* determinism: two builds → byte-identical JSON once volatile ids are normalized */
const normIds = (v) => {
  let n = 0;
  const seen = new Map();
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const o = {};
      for (const [k, val] of Object.entries(x)) {
        if (k === "id") { if (!seen.has(val)) seen.set(val, `ob${(n += 1)}`); o[k] = seen.get(val); }
        else o[k] = walk(val);
      }
      return o;
    }
    return x;
  };
  return walk(v);
};
for (const t of TEMPLATES) {
  if (JSON.stringify(normIds(t.buildProject())) !== JSON.stringify(normIds(t.buildProject()))) fail(`${t.id}: buildProject not deterministic`);
  if (JSON.stringify(normIds(t.buildClip())) !== JSON.stringify(normIds(t.buildClip()))) fail(`${t.id}: buildClip not deterministic`);
}
if (!failures) ok("determinism: two builds byte-identical (ids normalized) for all templates");

console.log("\n• blankProject()");
const b = blankProject();
if (b.app !== "graphic-destination-motion" || b.v !== 5 || !Array.isArray(b.objects) || b.objects.length !== 0 || b.stage.w !== 1280 || b.stage.h !== 720 || b.stage.dur !== 5000) fail("blankProject: invalid empty project");
else ok("valid empty project");

/* live thumbnail frames — bundle the REAL TemplateThumb (which renders the
   template's t = 40% frame through the app's own StageObject) and SSR every
   template: must not throw, must not fall back to the placeholder, non-empty
   markup on the template's own stage background, ≥ 1 positioned wrapper per
   root layer, no NaN. A deliberately broken template must degrade to the
   accent-tinted placeholder with its initial. */
const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".templates-thumb-tmp");
async function checkThumbs() {
  console.log("\n• live thumbnail frames (TemplateThumb → StageObject SSR)");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.js");
  fs.writeFileSync(entry, [
    `export { default as TemplateThumb } from ${JSON.stringify(path.join(here, "src", "components", "editor", "TemplateThumb.jsx"))};`,
    `export { createElement } from "react";`,
    `export { renderToStaticMarkup } from "react-dom/server";`,
    "",
  ].join("\n"));
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    build: { outDir: tmpDir, lib: { entry, formats: ["es"], fileName: () => "thumb.mjs" } },
  });
  const M = await import(pathToFileURL(path.join(tmpDir, "thumb.mjs")).href);
  const { TemplateThumb, createElement: h, renderToStaticMarkup } = M;
  if (!(typeof TemplateThumb === "function" || (typeof TemplateThumb === "object" && TemplateThumb !== null))) { fail("TemplateThumb export missing"); return; }
  for (const t of TEMPLATES) {
    let html = "", err = null;
    try { html = renderToStaticMarkup(h(TemplateThumb, { tpl: t })); } catch (e) { err = e; }
    if (err) { fail(`${t.id}: thumb render threw — ${err.message || err}`); continue; }
    const proj = t.buildProject();
    const abs = (html.match(/position:absolute/g) || []).length;
    /* only layers alive at the thumb time render a wrapper — windowed layers
       (inT > t, or already outT) legitimately contribute none */
    const thumbT = Math.round(proj.stage.dur * 0.4);
    const alive = proj.objects.filter((o) => (o.props.inT ?? 0) <= thumbT && (o.props.outT == null || thumbT < o.props.outT)).length;
    const probs = [];
    if (html.includes("data-thumb-fallback")) probs.push("fell back to the placeholder");
    if (!html.includes(`data-thumb="${t.id}"`)) probs.push("thumb marker missing");
    if (!html.includes(`background:${proj.stage.bg}`)) probs.push(`stage bg ${proj.stage.bg} not the thumb background`);
    if (html.includes("NaN")) probs.push("markup contains NaN");
    if (html.length < 400) probs.push(`markup suspiciously small (${html.length} bytes)`);
    if (abs < alive) probs.push(`only ${abs} positioned wrappers for ${alive} live root layers`);
    if (probs.length) fail(`${t.id}: ${probs.join(" · ")}`);
    else ok(`${t.id}: renders at t=${thumbT} (${html.length} bytes, ${alive}/${proj.objects.length} layers live)`);
  }
  /* guard: a template whose buildProject throws must degrade gracefully */
  const broken = { id: "broken", name: "Broken", accent: "#FF6B6B", category: "X", description: "", buildProject() { throw new Error("boom"); } };
  let bh = "", berr = null;
  try { bh = renderToStaticMarkup(h(TemplateThumb, { tpl: broken })); } catch (e) { berr = e; }
  if (berr) fail(`broken template crashed the guard — ${berr.message || berr}`);
  else if (!bh.includes("data-thumb-fallback") || !bh.includes(">B<") || !bh.includes("#FF6B6B")) fail("broken template did not render the accent placeholder with its initial");
  else ok("broken template → accent-tinted placeholder with initial");
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

checkThumbs().then(() => {
  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log("\nAll templates match the engine schema, and every thumbnail renders.");
  /* explicit exit — the vite build's esbuild service can hold the event loop
     open after the assertions are done (every other check exits explicitly) */
  process.exit(0);
}).catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
