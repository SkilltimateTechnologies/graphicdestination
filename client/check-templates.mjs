/* Sanity check: every template's buildProject() output parses and matches the
   GraphicDestinationMotion project schema (v5) — run with: node check-templates.mjs */
import { TEMPLATES, blankProject } from "./src/templates/templates.js";

const EASE_IDS = ["linear", "easeOutQuad", "easeInQuad", "easeInOutCubic", "easeOutCubic", "easeInCubic", "easeOutBack", "easeOutElastic", "easeOutBounce", "easeInOutSine"];
const SHAPE_IDS = ["rect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star", "heart", "arrow", "cross", "bolt"];
const FONT_IDS = ["Space Grotesk", "Inter", "JetBrains Mono", "Bebas Neue", "Montserrat", "Oswald", "Playfair Display", "Archivo Black", "Pacifico", "Caveat"];
const TEXTFX_IDS = ["typewriter", "rise", "pop", "fall", "tracking", "scramble", "wave"];
const NUM_STYLE_IDS = ["odometer", "count", "slot"];
const RING_IDS = ["none", "ring", "pie"];
const SWATCHES = ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#C084FC", "#F9F9F9", "#0F1116"];
const BASE_PROPS = ["x", "y", "scale", "rotation", "opacity", "fill", "w", "h", "inT", "outT", "path", "prog"];
const TYPE_PROPS = {
  shape: ["shape", "w", "h", "fillMode", "sC", "sW", "cornerR"],
  text: ["text", "fontSize", "fontWeight", "w", "h", "textFx", "fontFamily", "ls", "upper", "pathMode", "bg", "pad", "borderC", "borderW", "radius", "boxFx"],
  number: ["from", "to", "start", "dur", "style", "decimals", "prefix", "suffix", "fontSize", "fill", "numEase", "fontFamily", "ring", "ringC", "ringW", "bg", "pad", "borderC", "borderW", "radius", "boxFx"],
  confetti: ["burst", "count", "power", "seed"],
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
  /* envelope must survive a serialize/parse round-trip unchanged */
  if (JSON.stringify(JSON.parse(JSON.stringify(p))) !== JSON.stringify(p)) fail(`${tid}: JSON round-trip changed the project`);
}

console.log(`Checking ${TEMPLATES.length} templates + blankProject()…\n`);
for (const t of TEMPLATES) {
  console.log(`• ${t.name} (${t.id})`);
  if (!t.id || !t.name || !t.description || typeof t.accent !== "string" || typeof t.buildProject !== "function") { fail(`${t.id}: template meta incomplete`); continue; }
  if (!SWATCHES.includes(t.accent)) fail(`${t.id}: accent ${t.accent} not from engine SWATCHES`);
  let p;
  try { p = t.buildProject(); } catch (e) { fail(`${t.id}: buildProject threw — ${e.message}`); continue; }
  checkProject(t.id, p);
  if (!failures) ok(`${p.objects.length} layers, schema valid`);
  else console.log("");
}
console.log("\n• blankProject()");
const b = blankProject();
if (b.app !== "graphic-destination-motion" || b.v !== 5 || !Array.isArray(b.objects) || b.objects.length !== 0 || b.stage.w !== 1280 || b.stage.h !== 720 || b.stage.dur !== 5000) fail("blankProject: invalid empty project");
else ok("valid empty project");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nAll templates match the engine schema.");
