/**
 * check-r8w3.mjs — node proof for the R8w3 editor wave:
 *
 *   1. CANVAS-TRANSFORM AUTO-KEYFRAMES FOR EVERY TYPE — the user's text test
 *      got NO keyframes: canvas drops only keyed props that already had a
 *      track, and resize never keyed at all. Now (autokey always-on):
 *        move   → x ◆ + y ◆ at the playhead (all 12 types)
 *        rotate → rotation ◆ at the playhead (every gripped type)
 *        resize → scale ◆ at the playhead + base compensation (drop frame
 *                 renders pixel-identical to the live drag)
 *        clip corner-scale → scale ◆ at the playhead
 *      A repeated drop at the same playhead UPDATES the ◆ (±5ms replace) —
 *      identical behavior across types. Simulated end-to-end per type with
 *      the app's REAL withKeyframe / resizeDropPlan / makeObject (extracted
 *      from GraphicDestinationMotion.jsx — node can't import JSX) plus the
 *      real engine (valueAt / posOf / objSize / camera*).
 *   2. INSPECTOR PURGE — x/y/rotation/scale rows gone for every type
 *      (transforms live on canvas + timeline); the duplicated number-card
 *      Ring W slider de-duped; functional type-specific controls kept.
 *   3. OBJECT-LEVEL CAMERA — Inspector "Camera" card (Focus here / Zoom to
 *      fit / Push in / Pull out / Reset) writes eased camera keyframes:
 *      anchor at the playhead, land one beat (CAM_ACT_BEAT) later. Math
 *      asserted against the engine's own cameraTransform.
 *
 * Run:  node check-r8w3.mjs        (from client/)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { valueAt } from "./src/engine/keyframes.js";
import { cameraAt, cameraTransform, depthFactor, clampZoom, CAM_DEFAULTS } from "./src/engine/camera.js";
import { layerOut, DEFAULT_INSERT_SIZE } from "./src/components/editor/model.js";
import { SHAPE_DEFS } from "./src/engine/shapes.js";
import { backdropDefaults } from "./src/engine/backdrops.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");
const GDM = read("src/components/GraphicDestinationMotion.jsx");
const INSP = read("src/components/editor/Inspector.jsx");
const SO = read("src/components/StageObject.jsx");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ---------- extract the app's real pure helpers (JSX file → source carve) ---------- */
function grabFn(src, name) {
  let at = src.indexOf(`export function ${name}(`);
  if (at < 0) at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`GDM is missing function ${name}`);
  /* skip the parameter list first (it may hold destructuring braces), then brace-match the body */
  let i = src.indexOf("(", at), pd = 0;
  for (; i < src.length; i++) { const ch = src[i]; if (ch === "(") pd++; else if (ch === ")") { pd--; if (!pd) break; } }
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (!depth) return src.slice(at, j + 1).replace(/^export /, ""); }
  }
  throw new Error(`unterminated function ${name}`);
}
function grabConstNum(src, name) {
  const m = src.match(new RegExp(`export const ${name} = ([0-9.]+);`));
  if (!m) throw new Error(`GDM is missing export const ${name}`);
  return parseFloat(m[1]);
}
const boxDefaultsSrc = (() => {
  const at = GDM.indexOf("const BOX_DEFAULTS = {");
  if (at < 0) throw new Error("GDM is missing BOX_DEFAULTS");
  return GDM.slice(at, GDM.indexOf("};", at) + 2);
})();
const CAM_ACT_BEAT = grabConstNum(GDM, "CAM_ACT_BEAT");
const CAM_FIT_FILL = grabConstNum(GDM, "CAM_FIT_FILL");

const { withKeyframe, resizeDropPlan, cameraFocusXY, cameraFitZoom, cameraPushZoom, makeObject } = new Function(
  "SHAPE_DEFS", "backdropDefaults", "depthFactor", "clampZoom", "CAM_FIT_FILL", "STAGE_W", "STAGE_H", "DEFAULT_INSERT_SIZE",
  `const uid = (() => { let n = 0; return () => "ob" + (++n); })();
   ${boxDefaultsSrc}
   ${grabFn(GDM, "withKeyframe")}
   ${grabFn(GDM, "resizeDropPlan")}
   ${grabFn(GDM, "cameraFocusXY")}
   ${grabFn(GDM, "cameraFitZoom")}
   ${grabFn(GDM, "cameraPushZoom")}
   ${grabFn(GDM, "makeObject")}
   return { withKeyframe, resizeDropPlan, cameraFocusXY, cameraFitZoom, cameraPushZoom, makeObject };`
)(SHAPE_DEFS, backdropDefaults, depthFactor, clampZoom, CAM_FIT_FILL, 1280, 720, DEFAULT_INSERT_SIZE);

/* ---------- a mutable harness mirroring the app's setKeyframe semantics ---------- */
const CTX_DUR = 5000;
function simSetKf(obj, prop, t, v, ease) {
  const lo = obj.props.inT || 0;
  const hi = layerOut(obj, CTX_DUR);
  const T = Math.max(lo, Math.min(hi, t));
  obj.tracks[prop] = withKeyframe(obj.tracks[prop], T, v, ease);
  return Math.round(T / 10) * 10;
}
/* the exact drop sequences the gestures perform (autokey always-on) */
function simMoveDrop(obj, t, x, y) {
  simSetKf(obj, "x", t, x); simSetKf(obj, "y", t, y);
  obj.props.x = x; obj.props.y = y; /* the move drag also patches the base live */
}
function simRotateDrop(obj, t, deg) {
  simSetKf(obj, "rotation", t, deg);
  obj.props.rotation = deg; /* R8w3: rotate mirrors the base prop */
}
function simResizeDrop(obj, t, fw, fh) {
  /* mirrors onResizeDown's up(): plan the scale ◆ + compensated base patch +
     the base-scale mirror (◆ deletion then preserves the resized size) */
  const s0 = Math.max(0.05, valueAt(obj, "scale", t));
  const plan = resizeDropPlan({ fw, fh, s0 });
  if (!plan.changed) return null;
  simSetKf(obj, "scale", t, plan.ns);
  obj.props.scale = plan.ns;
  return plan;
}
const T_PLAY = 1500;
const ALL_TYPES = ["shape", "text", "number", "image", "chart", "map", "continent", "world", "confetti", "backdrop", "kit", "clip"];
const GRIP_TYPES = ["shape", "text", "number", "image", "chart", "map", "continent", "world", "kit"]; /* 8-way {handles} */
const NO_GRIP_TYPES = ["confetti", "backdrop"]; /* move-only */

/* ================= 1. keyframe model primitives (the one write path) ================= */
console.log("\nkeyframe model primitives (withKeyframe — the app source)");
{
  let tr = withKeyframe([], 1500, 700);
  check("first drop: one ◆ at the playhead with the value", tr.length === 1 && tr[0].t === 1500 && tr[0].v === 700);
  check("first drop: default ease is the smooth easeInOutCubic", tr[0].ease === "easeInOutCubic");
  tr = withKeyframe(tr, 1501, 701);
  check("re-drop at the playhead (±5ms) UPDATES the ◆ — no duplicate", tr.length === 1 && tr[0].v === 701);
  tr = withKeyframe(tr, 3000, 900);
  check("drop at a second playhead ADDS a ◆, sorted", tr.length === 2 && tr[0].t === 1500 && tr[1].t === 3000);
  const o = { props: { x: 50 }, tracks: { x: tr } };
  check("valueAt interpolates between the two ◆", near(valueAt(o, "x", 2250), 800, 1));
  const o1 = { props: { x: 50 }, tracks: { x: [tr[0]] } };
  check("a single ◆ is constant before it (first-drop = visible everywhere)", valueAt(o1, "x", 0) === 701);
}

/* ================= 2. per-type canvas MOVE drop → x/y ◆ ================= */
console.log("\ncanvas MOVE drop → x ◆ + y ◆ (every type)");
for (const type of ALL_TYPES) {
  const o = makeObject(type);
  simMoveDrop(o, T_PLAY, 700, 400);
  check(`${type}: move drop writes an x ◆ at the playhead`, (o.tracks.x || []).length === 1 && o.tracks.x[0].t === T_PLAY && o.tracks.x[0].v === 700);
  check(`${type}: move drop writes a y ◆ at the playhead`, (o.tracks.y || []).length === 1 && o.tracks.y[0].t === T_PLAY && o.tracks.y[0].v === 400);
  simSetKf(o, "x", T_PLAY, 705); /* same playhead again */
  check(`${type}: re-drop at the same playhead UPDATES the ◆`, o.tracks.x.length === 1 && o.tracks.x[0].v === 705);
  check(`${type}: renderer reads the keyed position`, valueAt(o, "x", T_PLAY) === 705 && valueAt(o, "y", T_PLAY) === 400);
}

/* ================= 3. per-type canvas ROTATE drop → rotation ◆ ================= */
console.log("\ncanvas ROTATE drop → rotation ◆ (every gripped type)");
for (const type of [...GRIP_TYPES, "clip"]) {
  const o = makeObject(type);
  simRotateDrop(o, T_PLAY, 45);
  check(`${type}: rotate drop writes a rotation ◆ at the playhead`, (o.tracks.rotation || []).length === 1 && o.tracks.rotation[0].t === T_PLAY && o.tracks.rotation[0].v === 45);
  check(`${type}: renderer reads the keyed rotation`, valueAt(o, "rotation", T_PLAY) === 45);
}
{
  const confettiBr = SO.slice(SO.indexOf('obj.type === "confetti"'), SO.indexOf('obj.type === "kit"'));
  const backdropBr = SO.slice(SO.indexOf('obj.type === "backdrop"'), SO.indexOf('obj.type === "shape"'));
  check("confetti has no rotate/resize grips on canvas (move-only by design)", !confettiBr.includes("{handles}") && !confettiBr.includes("onRotate") && !confettiBr.includes("onResize"));
  check("backdrop has no rotate/resize grips on canvas (move-only by design)", !backdropBr.includes("{handles}") && !backdropBr.includes("onRotate") && !backdropBr.includes("onResize"));
}

/* ================= 4. per-type canvas RESIZE drop → scale ◆ + exact base compensation ================= */
console.log("\ncanvas RESIZE drop → scale ◆ at the playhead (render-exact)");
for (const type of GRIP_TYPES) {
  const o = makeObject(type);
  const s0 = 1;
  /* uniform drag ×1.5 (text/number resize fontSize, maps resize w, box types w/h — all uniform here) */
  const plan = simResizeDrop(o, T_PLAY, 1.5, 1.5);
  check(`${type}: resize drop writes a scale ◆ at the playhead`, !!plan && (o.tracks.scale || []).length === 1 && o.tracks.scale[0].t === T_PLAY && near(o.tracks.scale[0].v, s0 * 1.5, 0.01));
  const dragged = 108, compensated = Math.round(dragged / plan.g); /* e.g. fontSize 72→108 dragged, base compensated by g */
  check(`${type}: base compensation keeps the drop frame pixel-exact`, near(compensated * (s0 * plan.g), dragged * s0, 1));
}
{
  /* non-uniform box drag: w ×1.5, h ×1.2 → dominant factor wins, BOTH axes stay exact via compensation */
  const o = makeObject("shape");
  const plan = simResizeDrop(o, T_PLAY, 1.5, 1.2);
  const w0 = 190, h0 = 190, nw = Math.round(w0 * 1.5), nh = Math.round(h0 * 1.2);
  const cw = Math.round(nw / plan.g), ch = Math.round(nh / plan.g);
  check("shape: non-uniform drag lands the dominant factor on the scale ◆", near(o.tracks.scale[0].v, 1.5, 0.01));
  check("shape: non-uniform drag stays render-exact on BOTH axes", near(cw * plan.g, nw, 1) && near(ch * plan.g, nh, 1));
  check("resizeDropPlan: a bare grip click (f=1) reports changed:false (no stray ◆)", resizeDropPlan({ fw: 1, fh: 1, s0: 1 }).changed === false);
  check("resizeDropPlan: scale clamps into [0.05, 10]", resizeDropPlan({ fw: 40, fh: 40, s0: 1 }).ns === 10 && resizeDropPlan({ fw: 0.001, fh: 0.001, s0: 1 }).ns === 0.05);
}
{
  /* clip corner-scale drag → scale ◆ (the gesture writes setKeyframe("scale") directly) */
  const o = makeObject("clip");
  const ns = Math.max(0.05, Math.min(10, Math.round(1 * 1.4 * 100) / 100));
  simSetKf(o, "scale", T_PLAY, ns);
  check("clip: corner-scale drop writes a scale ◆ at the playhead", (o.tracks.scale || []).length === 1 && o.tracks.scale[0].t === T_PLAY && near(o.tracks.scale[0].v, 1.4, 0.01));
  check("clip: renderer reads the keyed scale", near(valueAt(o, "scale", T_PLAY), 1.4, 0.01));
}

/* ================= 5. identical behavior across types ================= */
console.log("\nidentical behavior across types (same drop sequence ⇒ same track shape)");
{
  const dropSeq = (type) => {
    const o = makeObject(type);
    simMoveDrop(o, T_PLAY, 700, 400);
    if (!NO_GRIP_TYPES.includes(type)) { simRotateDrop(o, T_PLAY, 45); simResizeDrop(o, T_PLAY, 1.5, 1.5); }
    return o;
  };
  for (const type of ALL_TYPES) {
    const o = dropSeq(type);
    const expectProps = NO_GRIP_TYPES.includes(type) ? ["x", "y"] : ["x", "y", "rotation", "scale"];
    const shape = Object.keys(o.tracks).sort();
    check(`${type}: same drop sequence ⇒ tracks ${expectProps.join("/")} with one ◆ each at the playhead`,
      JSON.stringify(shape) === JSON.stringify([...expectProps].sort()) && expectProps.every((p) => o.tracks[p].length === 1 && o.tracks[p][0].t === T_PLAY));
  }
  const eased = ALL_TYPES.every((type) => { const o = dropSeq(type); return Object.values(o.tracks).every((tr) => tr.every((k) => k.ease === "easeInOutCubic")); });
  check("every dropped ◆ rides the smooth default ease (easeInOutCubic)", eased);
  const o2 = makeObject("text");
  simMoveDrop(o2, T_PLAY, 700, 400);
  simMoveDrop(o2, 3000, 900, 200); /* second drop at a later playhead → real animation */
  check("text: drops at two playheads interpolate the position", near(valueAt(o2, "x", 2250), 800, 1));
}

/* ================= 5b. base+◆ end state: deleting the ◆ keeps the dropped value ================= */
console.log("\nbase+◆ end state (the move-drag model, now uniform)");
{
  const o = makeObject("text");
  simRotateDrop(o, T_PLAY, 38);
  o.tracks.rotation = []; /* user deletes the ◆ */
  check("rotate: deleting the ◆ keeps the angle (base mirrored)", valueAt(o, "rotation", T_PLAY) === 38);
  const s = makeObject("shape");
  const plan = simResizeDrop(s, T_PLAY, 1.5, 1.5);
  const withKf = valueAt(s, "scale", T_PLAY) * 120; /* rendered width: comp base × track scale */
  s.tracks.scale = [];
  const withoutKf = valueAt(s, "scale", T_PLAY) * 120; /* base scale mirrored ⇒ identical */
  check("resize: deleting the ◆ keeps the resized size (base scale mirrored)", near(withKf, withoutKf, 1) && near(withoutKf, 120 * plan.ns, 1));
  const m = makeObject("image");
  simMoveDrop(m, T_PLAY, 700, 400);
  m.tracks.x = []; m.tracks.y = [];
  check("move: deleting the ◆ keeps the position (base patched live)", valueAt(m, "x", T_PLAY) === 700 && valueAt(m, "y", T_PLAY) === 400);
}

/* ================= 6. GDM source wiring (the gestures really call this) ================= */
console.log("\nGDM source wiring");
{
  const cep = GDM.slice(GDM.indexOf("const canvasEditProp"), GDM.indexOf("const patchPath"));
  check("canvasEditProp (the move-drop path) writes setKeyframe when ARMED", cep.includes("setKeyframe(id, prop, timeRef.current, v);"));
  /* R9w1: the Animate arm toggle is BACK — the disarm path is now an EXPLICIT
     base patch without keyframes (the user's requested behavior); the R8w3
     rule (armed canvas edits ALWAYS key, never a silent base patch) holds. */
  check("canvasEditProp: the base patch exists ONLY as the explicit DISARM path (R9w1)", cep.includes("if (!autokey) { patchProps(id, { [prop]: v }); return; }"));
  check("canvasEditProp keeps the arm guard: disarmed → base patch, armed → ◆ at the playhead", cep.includes("if (!autokey) { patchProps(id, { [prop]: v }); return; }") && cep.indexOf("patchProps(id, { [prop]: v })") < cep.indexOf("setKeyframe(id, prop, timeRef.current, v);"));
  check("move drop lands x ◆ AND y ◆ through canvasEditProp", GDM.includes('canvasEditProp(m.id, "x", lv.x); canvasEditProp(m.id, "y", lv.y);'));
  const rot = GDM.slice(GDM.indexOf("const onRotateDown"), GDM.indexOf("const onClipScaleDown"));
  check("rotate drag keeps the R8w1-pinned existing-track site", rot.includes("if (autokey && (obj.tracks.rotation || []).length)"));
  check("rotate drag: fresh prop ALSO starts its track at the playhead", rot.includes('else if (autokey) setKeyframe(obj.id, "rotation", timeRef.current, nr);'));
  check("rotate drag starts from the LIVE angle (track-aware — no mid-drag jump)", rot.includes('const r0 = valueAt(obj, "rotation", timeRef.current) || 0;'));
  check("rotate drag mirrors the base rotation (◆ deletion keeps the angle)", rot.includes("if (autokey) patchProps(obj.id, { rotation: nr });"));
  const cs = GDM.slice(GDM.indexOf("const onClipScaleDown"), GDM.indexOf("const onClipScaleDown") + 2600);
  check("clip corner-scale drag always writes the scale ◆", cs.includes('if (autokey) setKeyframe(obj.id, "scale", timeRef.current, ns);'));
  check("clip corner-scale mirrors the base scale", cs.includes("if (autokey) patchProps(obj.id, { scale: ns });"));
  const rz = GDM.slice(GDM.indexOf("const onResizeDown"), GDM.indexOf("const onRotateDown"));
  check("resize drop lands a scale ◆ at the playhead", rz.includes("setKeyframe(obj.id, \"scale\", t, plan.ns);"));
  check("resize drop compensates the base prop by g (fontSize / w / h)", rz.includes("p.fontSize / g") && rz.includes("p.w / g") && rz.includes("p.h / g"));
  check("resize drop mirrors the base scale (◆ deletion keeps the size)", rz.includes("patchProps(obj.id, { scale: plan.ns });"));
  check("resize drop is planned by the pure resizeDropPlan helper", rz.includes("resizeDropPlan({ fw: last.fw, fh: last.fh, s0 })"));
}

/* ================= 7. Inspector purge (source-level) ================= */
console.log("\nInspector purge");
{
  check("x/y/rotation/scale Transform rows are GONE (no TRANSFORM_RO_PROPS)", !INSP.includes("TRANSFORM_RO_PROPS"));
  const tPropsLine = INSP.split("\n").find((l) => l.includes("const tProps ="));
  check("tProps keeps only opacity (+focus for manual world, +prog for path riders)",
    !!tPropsLine && tPropsLine.includes('["opacity"]') && tPropsLine.includes('["opacity", "focus"]') && tPropsLine.includes('["prog", "opacity"]'));
  check("tProps no longer lists x/y/rotation/scale", !!tPropsLine && !/"(x|y|rotation|scale)"/.test(tPropsLine));
  check("no readOnly PropRows left in the Inspector", !INSP.includes("readOnly"));
  check("the duplicated number-card Ring W slider is gated off when a Counter ring is on",
    INSP.includes('(sel.props.style === "dotted" || sel.props.style === "progressring") && (sel.props.ring || "none") === "none" && ('));
  /* functional type-specific controls KEPT (regression guards) */
  const confettiCard = INSP.slice(INSP.indexOf('{sel.type === "confetti" && ('), INSP.indexOf('{sel.type === "confetti" && (') + 3000);
  check("kept: confetti Duration slider", /Duration/.test(confettiCard));
  check("kept: chart data textarea", INSP.includes("dataStr") && INSP.includes('sel.type === "chart"'));
  check("kept: kit Variant + color controls", INSP.includes('sel.type === "kit"') && INSP.includes("Variant"));
  check("kept: backdrop Variant control", INSP.includes('sel.type === "backdrop"') && INSP.includes("BACKDROP_VARIANTS"));
  check("kept: map draw Start/Draw time sliders", INSP.includes("Draw time"));
  check("kept: number Start/Duration sliders", /Start/.test(INSP) && /Duration/.test(INSP) && INSP.includes('sel.type === "number"'));
  check("kept: world zoom-focus row for manual mode", INSP.includes('["opacity", "focus"]'));
  const flowHint = INSP.split("\n").find((l) => l.includes("Flowing on a path"));
  check("flow-text hint no longer advertises the removed Rotation/Scale rows", !!flowHint && flowHint.includes("Path progress") && !flowHint.includes("spins around the loop"));
}

/* ================= 8. object-level camera — action math (pure helpers) ================= */
console.log("\nobject-level camera — action math");
const STAGE = { w: 1280, h: 720 };
{
  const p = cameraFocusXY({ ox: 940, oy: 560, zoom: 1, depth: 0, stage: STAGE });
  check("Focus: depth-0 object at (940,560), zoom 1 → camera (300,200)", p.x === 300 && p.y === 200);
  const p2 = cameraFocusXY({ ox: 940, oy: 560, zoom: 2, depth: 0, stage: STAGE });
  check("Focus: zoom 2 doubles the pan (600,400)", p2.x === 600 && p2.y === 400);
  const p3 = cameraFocusXY({ ox: 940, oy: 560, zoom: 1, depth: 1.5, stage: STAGE });
  check("Focus: foreground depth +1.5 (f=2.5) pans LESS (120,80)", p3.x === 120 && p3.y === 80);
  const p4 = cameraFocusXY({ ox: 940, oy: 560, zoom: 1, depth: -1, stage: STAGE });
  check("Focus: camera-locked depth −1 stays finite (f floored to 0.1)", Number.isFinite(p4.x) && p4.x === 3000);
  const p5 = cameraFocusXY({ ox: 640, oy: 360, zoom: 1.6, depth: 0, stage: STAGE });
  check("Focus: an already-centered object needs no pan", p5.x === 0 && p5.y === 0);
  /* engine cross-check: the focused camera maps the object to the stage center */
  const verify = (ox, oy, zoom, depth) => {
    const f = Math.max(0.1, depthFactor(depth));
    const { x, y } = cameraFocusXY({ ox, oy, zoom, depth, stage: STAGE });
    const s = 1 + (zoom - 1) * f;
    const sx = (ox - STAGE.w / 2) * s + STAGE.w / 2 - x * f;
    const sy = (oy - STAGE.h / 2) * s + STAGE.h / 2 - y * f;
    return near(sx, STAGE.w / 2, 1.5) && near(sy, STAGE.h / 2, 1.5);
  };
  check("Focus math inverts the engine transform (object lands centered) — 3 combos", verify(940, 560, 1, 0) && verify(200, 100, 2, 0.5) && verify(1100, 640, 1.4, -0.5));
  const t = cameraTransform({ x: 300, y: 200, zoom: 1 }, 0, STAGE);
  check("engine cameraTransform itself is intact (sanity)", typeof t.tx === "number" && typeof t.s === "number");

  check("Fit: 200×200 object → zoom 2.88 (limiting axis fills 80%)", near(cameraFitZoom({ w: 200, h: 200, depth: 0, stage: STAGE }), 2.88, 0.01));
  check("Fit: huge object clamps to the zoom floor 0.25", cameraFitZoom({ w: 4000, h: 4000, depth: 0, stage: STAGE }) === 0.25);
  check("Fit: foreground depth +1 (f=2) halves the zoom delta (1.94)", near(cameraFitZoom({ w: 200, h: 200, depth: 1, stage: STAGE }), 1.94, 0.01));
  check("Fit: a camera-locked layer stays finite", Number.isFinite(cameraFitZoom({ w: 200, h: 200, depth: -1, stage: STAGE })));
  check("Push in: ×1.25", cameraPushZoom(1, 1) === 1.25);
  check("Pull out: ÷1.25 (0.8)", cameraPushZoom(1, -1) === 0.8);
  check("Push/pull clamp to the engine zoom range", cameraPushZoom(3.5, 1) === 4 && cameraPushZoom(0.3, -1) === 0.25);
  check("CAM_ACT_BEAT is 600ms · CAM_FIT_FILL is 0.8", CAM_ACT_BEAT === 600 && CAM_FIT_FILL === 0.8);
}

/* ================= 9. object-level camera — write sequence (simulated) + wiring ================= */
console.log("\nobject-level camera — keyframe write sequence + wiring");
{
  /* simulate applyCameraAction("focus") at t=1000 on a camera doc that already
     pans: anchor at the playhead, land one beat later — through withKeyframe */
  const doc = { tracks: { x: [{ t: 0, v: -100, ease: "easeInOutCubic" }], y: [], zoom: [] } };
  const t = 1000, land = t + CAM_ACT_BEAT;
  const cam = cameraAt(doc, t);
  const p = cameraFocusXY({ ox: 940, oy: 560, zoom: cam.zoom, depth: 0, stage: STAGE });
  doc.tracks.x = withKeyframe(doc.tracks.x, t, Math.round(cam.x));
  doc.tracks.y = withKeyframe(doc.tracks.y, t, Math.round(cam.y));
  doc.tracks.x = withKeyframe(doc.tracks.x, land, p.x);
  doc.tracks.y = withKeyframe(doc.tracks.y, land, p.y);
  check("Focus: anchor ◆ at the playhead keeps the current framing (no jump)", near(cameraAt(doc, t).x, Math.round(cam.x), 0.5) && doc.tracks.x.some((k) => k.t === t));
  check("Focus: the land ◆ one beat later centers the object", near(cameraAt(doc, land).x, 300, 0.5) && near(cameraAt(doc, land).y, 200, 0.5));
  check("Focus: the move eases between anchor and land (smooth)", cameraAt(doc, t + 300).x > Math.round(cam.x) && cameraAt(doc, t + 300).x < 300);
  check("Focus: pre-existing ◆ elsewhere on the lane is untouched", doc.tracks.x.some((k) => k.t === 0 && k.v === -100));
  const d2 = { tracks: { x: [], y: [], zoom: [] } };
  const z0 = cameraAt(d2, t).zoom, z1 = cameraPushZoom(z0, 1);
  d2.tracks.zoom = withKeyframe(d2.tracks.zoom, t, z0);
  d2.tracks.zoom = withKeyframe(d2.tracks.zoom, land, z1);
  check("Push in: zoom ramps 1.00× → 1.25× over one beat", near(cameraAt(d2, t).zoom, 1, 1e-9) && near(cameraAt(d2, land).zoom, 1.25, 1e-9));
  check("Camera defaults intact (x 0 · y 0 · zoom 1)", CAM_DEFAULTS.x === 0 && CAM_DEFAULTS.y === 0 && CAM_DEFAULTS.zoom === 1);

  const aca = GDM.slice(GDM.indexOf("const applyCameraAction"), GDM.indexOf("const applyCameraAction") + 2600);
  check("GDM: applyCameraAction anchors at the playhead and lands at t + CAM_ACT_BEAT", aca.includes("const land = Math.min(compDur, t + CAM_ACT_BEAT);"));
  check("GDM: focus/fit write x+y land ◆ through setCameraKeyframe", aca.includes('setCameraKeyframe("x", land, p.x);') && aca.includes('setCameraKeyframe("y", land, p.y);'));
  check("GDM: fit writes a zoom land ◆ (zoom to fit)", aca.includes('setCameraKeyframe("zoom", land, zoom);'));
  check("GDM: push/pull ramp the zoom one beat", aca.includes('setCameraKeyframe("zoom", land, cameraPushZoom('));
  check("GDM: reset delegates to the existing resetCamera (engine path intact)", aca.includes('if (action === "reset") { resetCamera(); return; }'));
  check("GDM: applyCameraAction is passed to the Inspector", GDM.includes("applyCameraAction={applyCameraAction}"));
  check("Inspector: Camera card offers Focus here / Zoom to fit / Push in / Pull out", INSP.includes("◎ Focus here") && INSP.includes("⤢ Zoom to fit") && INSP.includes("＋ Push in") && INSP.includes("－ Pull out"));
  check("Inspector: the object-level Camera card is root-scene only (hides in clips)", /\{!inClip && \([\s\S]{0,900}Focus here/.test(INSP));
  check("Inspector: all four actions route through applyCameraAction(sel.id, …)", ["focus", "fit", "push", "pull"].every((a) => INSP.includes(`applyCameraAction(sel.id, "${a}")`)));
}

/* ================= summary ================= */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
