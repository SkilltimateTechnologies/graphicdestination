/* ============================================================
   ENGINE · "3D" widgets (2.5D, NO WebGL/Three.js) — pure builders
   ------------------------------------------------------------
   Each widget is a plain CLIP LAYER (the same shape makeObject("clip")
   produces: { name, children, props }) built from everyday 2D
   primitives — image / shape / text layers — so it inserts through the
   normal addObject("clip", over) path, is selected like any clip, and
   is ENTER-EDITABLE (double-click opens the clip timeline; every part
   stays a normal, keyframable layer).

   Builders are pure: they take { uid, stage, accent, dur } and return
   a fresh spec every call (ids come from the editor's uid factory —
   passed in, never module state). No DOM, no deps, deterministic.

   Widgets
     photoStack  — lyric-video depth sandwich. The clip carries
                   props.camInside = true, the opt-in flag that lets
                   StageObject thread the scene camera INTO the clip's
                   children (absent on every old clip → they render in
                   raw clip space, byte-identical). Pre-set depths give
                   instant parallax with the camera presets.
     tiltCard    — fake-perspective card: rounded rect with a slight
                   rotate + 0.92 vertical squash baked into h, a soft
                   blurred shadow ellipse and a floating badge.
     isoCube     — 3 diamond faces (rotated 0/+60/−60) in 3 shade
                   tones derived from one accent; recolor per face.
     extrudeText — face text + 5 darkened copies offset in 1 px steps.
   ============================================================ */

import { lerpColor } from "./keyframes.js";

/* ---------- widget catalogue (panel order) ---------- */
export const THREED_WIDGETS = [
  { id: "photoStack", name: "Photo Depth Stack", blurb: "Lyric-video parallax: dark 112% backdrop · big type at depth 0.6 · subject + foreground accent" },
  { id: "tiltCard", name: "Tilted Card", blurb: "Fake-perspective card — slight rotate, 0.92 squash, soft shadow + floating badge" },
  { id: "isoCube", name: "Isometric Cube", blurb: "3 rhombus faces in light/mid/dark shades of one accent" },
  { id: "extrudeText", name: "Extruded 3D Text", blurb: "Face text with 5 darkened copies stepping 1 px behind it" },
];

/* ---------- placeholder art (Photo Depth Stack) ----------
   An abstract "photo" backdrop as a compact SVG data-URI — ships inside
   the project JSON, renders identically in the editor and the export
   (frameRenderer inlines only remote images; data-URIs pass through).
   Users replace it on the image layers via the Image panel. */
export const THREED_PLACEHOLDER_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#41547A"/><stop offset="0.55" stop-color="#232F4A"/><stop offset="1" stop-color="#10141F"/>` +
    `</linearGradient>` +
    `<radialGradient id="sun" cx="0.72" cy="0.3" r="0.55">` +
    `<stop offset="0" stop-color="#F5A524" stop-opacity="0.85"/><stop offset="0.45" stop-color="#B85E28" stop-opacity="0.32"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#0A0D14" stop-opacity="0"/><stop offset="1" stop-color="#07090E" stop-opacity="0.9"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="1280" height="720" fill="url(#bg)"/>` +
    `<circle cx="922" cy="216" r="330" fill="url(#sun)"/>` +
    `<ellipse cx="410" cy="560" rx="480" ry="210" fill="#1B2438" opacity="0.75"/>` +
    `<ellipse cx="950" cy="640" rx="520" ry="180" fill="#151C2C" opacity="0.8"/>` +
    `<rect y="470" width="1280" height="250" fill="url(#floor)"/>` +
    `</svg>`
  );

/* ---------- tiny layer factory ----------
   Produces the FULL layer shape the schema expects (same base props as
   makeObject + the per-type defaults the renderer relies on), so widget
   children pass the same project validation as hand-made layers. */
const BASE = { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0 };
const TEXT_DEFAULTS = { text: "Text", fontSize: 72, fontWeight: 700, w: 0, h: 0, textFx: null, fontFamily: "Space Grotesk", ls: 0.5, upper: false, pathMode: "flow", bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none" };
const SHAPE_DEFAULTS = { shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0 };

function mk(uid, type, name, props) {
  const typeDefaults = type === "text" ? TEXT_DEFAULTS : type === "shape" ? SHAPE_DEFAULTS : type === "image" ? { src: "", w: 320, h: 220 } : {};
  return { id: uid(), type, name, tracks: {}, locked: false, hidden: false, props: { ...BASE, ...typeDefaults, ...props } };
}

/* ---------- 1 · PHOTO DEPTH STACK (the lyric-video recipe) ----------
   Back → front:
     BG image     — placeholder art at 112% (parallax slack), depth −0.6
     BG overlay   — full-canvas black rect at 35% over it, same depth
     Big type     — BETWEEN backdrop and subject, depth 0.6
     Subject      — same image at 100% ("replace + mask"), world-locked 0
     FG accent    — small amber star whipping past at depth 1.2
   The clip sets camInside so the scene camera reaches these depths. */
function buildPhotoDepthStack({ uid, stage, accent }) {
  const W = stage.w, H = stage.h, cx = W / 2, cy = H / 2;
  const sw = Math.round(W * 0.36), sh = Math.round(H * 0.8); /* subject footprint */
  const children = [
    mk(uid, "image", "BG · 112% (replace via Image panel)", { x: cx, y: cy, w: W, h: H, scale: 1.12, src: THREED_PLACEHOLDER_SRC, depth: -0.6 }),
    mk(uid, "shape", "BG overlay · dark 35%", { x: cx, y: cy, w: W, h: H, scale: 1.12, shape: "rect", fill: "#05070B", opacity: 0.35, depth: -0.6 }),
    mk(uid, "text", "Big type · depth 0.6", { x: cx, y: cy, text: "YOUR LYRIC", fontSize: 150, fontWeight: 800, fontFamily: "Archivo Black", ls: 2, fill: "#F9F9F9", depth: 0.6 }),
    mk(uid, "image", "SUBJECT (replace + mask)", { x: cx + Math.round(W * 0.19), y: cy, w: sw, h: sh, src: THREED_PLACEHOLDER_SRC }),
    mk(uid, "shape", "FG accent · depth 1.2", { x: cx - Math.round(W * 0.3), y: cy + Math.round(H * 0.25), w: 120, h: 120, shape: "star", fill: accent, rotation: 15, depth: 1.2 }),
  ];
  return { name: "3D · Photo Depth Stack", children, props: { camInside: true } };
}

/* ---------- 2 · TILTED CARD (fake perspective) ----------
   The "perspective" is baked: card tilted −5° with its height squashed
   to 0.92 (a rotateX illusion), a blurred black ellipse as the floor
   shadow, a headline, and a badge floating off the top-right corner. */
function buildTiltedCard({ uid, stage, accent }) {
  const cx = stage.w / 2, cy = stage.h / 2;
  const cardW = 400, cardH = 216; /* 216 ≈ 235 · 0.92 — the fake scaleY squash */
  const children = [
    mk(uid, "shape", "Soft shadow", { x: cx + 10, y: cy + 132, w: 340, h: 48, shape: "ellipse", fill: "#000000", opacity: 0.42, rotation: -5, blur: 14 }),
    mk(uid, "shape", "Card · rounded, tilted", { x: cx, y: cy, w: cardW, h: cardH, shape: "rect", cornerR: 24, rotation: -5, fillMode: "both", fill: "#1E2330", sC: accent, sW: 2.5 }),
    mk(uid, "text", "Card title", { x: cx, y: cy - 4, text: "TILTED CARD", fontSize: 42, fontWeight: 800, fontFamily: "Archivo Black", ls: 1.5, fill: "#F9F9F9", rotation: -5 }),
    mk(uid, "text", "Floating badge", { x: cx + 166, y: cy - 122, text: "NEW", fontSize: 21, fontWeight: 800, fill: "#1A1405", rotation: -5, bg: accent, radius: 999, pad: 12, borderW: 0 }),
  ];
  return { name: "3D · Tilted Card", children, props: {} };
}

/* ---------- 3 · ISOMETRIC CUBE ----------
   Three "diamond" rhombi (diagonals √3·R × R): the side faces are the
   same rhombus rotated ±60° — exact isometric geometry from the stock
   diamond shape, so every face stays a normal morphable/recolorable
   shape layer. Shades derive from the one accent (top light, left mid,
   right dark). */
function buildIsoCube({ uid, stage, accent }) {
  const R = 110;
  const diaW = +(Math.sqrt(3) * R).toFixed(2); /* long diagonal 190.53 */
  const cx = stage.w / 2, cy = stage.h / 2;
  const offX = +((Math.sqrt(3) * R) / 4).toFixed(2); /* face centers: ±47.63, −55/+27.5 */
  const children = [
    mk(uid, "shape", "Face · top (light)", { x: cx, y: cy - R / 2, w: diaW, h: R, shape: "diamond", fill: lerpColor(accent, "#ffffff", 0.28) }),
    mk(uid, "shape", "Face · left (mid)", { x: cx - offX, y: cy + R / 4, w: diaW, h: R, shape: "diamond", rotation: 60, fill: lerpColor(accent, "#05070B", 0.3) }),
    mk(uid, "shape", "Face · right (dark)", { x: cx + offX, y: cy + R / 4, w: diaW, h: R, shape: "diamond", rotation: -60, fill: lerpColor(accent, "#05070B", 0.55) }),
  ];
  return { name: "3D · Isometric Cube", children, props: {} };
}

/* ---------- 4 · EXTRUDED 3D TEXT ----------
   Five darkened copies step 1 px down-right behind the face — the
   classic fake extrusion. Deepest copy renders first, face last. */
function buildExtrudeText({ uid, stage, accent }) {
  const cx = stage.w / 2, cy = stage.h / 2;
  const word = "DEPTH";
  const face = { text: word, fontSize: 120, fontWeight: 800, fontFamily: "Archivo Black", ls: 3 };
  const children = [];
  for (let i = 5; i >= 1; i--) {
    children.push(mk(uid, "text", `Extrude ${i}`, { x: cx + i, y: cy + i, ...face, fill: lerpColor(accent, "#05070B", 0.42 + i * 0.1) }));
  }
  children.push(mk(uid, "text", "FACE TEXT · edit me", { x: cx, y: cy, ...face, fill: accent }));
  return { name: "3D · Extruded Text", children, props: {} };
}

const BUILDERS = { photoStack: buildPhotoDepthStack, tiltCard: buildTiltedCard, isoCube: buildIsoCube, extrudeText: buildExtrudeText };

/* buildThreedWidget(id, { uid, stage, accent, dur }) → { name, children, props }
   `dur` fills the composition by default (panel passes ctxDur). */
export function buildThreedWidget(id, { uid, stage, accent = "#F5A524", dur = 4000 } = {}) {
  const build = BUILDERS[id];
  if (!build) throw new Error("unknown 3D widget: " + id);
  const spec = build({ uid, stage, accent });
  return { name: spec.name, children: spec.children, props: { start: 0, dur, x: stage.w / 2, y: stage.h / 2, ...spec.props } };
}
