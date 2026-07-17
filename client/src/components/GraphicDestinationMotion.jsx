import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ExportDialog from "./ExportDialog";
import { api } from "../api";
import { prepareImageFile } from "../lib/imagePrep";
import { makeAudioTrack, audioToJson, audioFromJson, audioGainAt, audioWithinAt, validateAudioFile, AUDIO_ACCEPT_ATTR } from "../lib/audioTrack";
import { EASE, EASE_LABEL, clamp01 } from "../engine/easing.js";
import { SHAPE_DEFS, SHAPE_IDS, ptsToStr, pathSamples, pointOnPath, morphPtsAt } from "../engine/shapes.js";
import { valueAt, colorAt, lerpColor, posOf, clipLocalTime, clipTransition } from "../engine/keyframes.js";
import { MAPS, WORLD_H, WORLD, CONTINENTS, CONTINENT_NAMES, ringsToPath, arcPath, mapBox, WORLD_D, WORLD_EXT, WORLD_LIST, normHi, worldZoomWindow } from "../engine/maps.js";
import { SWATCHES, FONT_IMPORT, charFx, numberValue, numberColumns, CONFETTI_LIFE, confettiParticles, parseChart, highlightFlick, worldCameraAt } from "../engine/fx.js";

/* Re-export the pure engine API so the export pipeline
   (export/frameRenderer.js, export/exportWebm.js, export/validateFrameMath.mjs)
   keeps importing it from this module, unchanged. */
export { EASE, clamp01 } from "../engine/easing.js";
export { mulberry32 } from "../engine/random.js";
export { lerpPts, shapePtsOf, morphPtsAt, pointOnPath } from "../engine/shapes.js";
export { valueAt, colorAt, lerpColor, posOf, fxDuration, clipLocalTime, clipTransition } from "../engine/keyframes.js";
export { FONT_IMPORT, charFx, numberValue, numberColumns, confettiParticles, parseChart, highlightFlick, worldCameraAt } from "../engine/fx.js";

/* ============================================================
   GRAPHIC DESTINATION — Motion  (prototype v0.2)
   shapes folder · shape morphing · text FX · number rollers ·
   real country maps + border FX · images · export/import
   ============================================================ */

const STAGE_W = 1280;
const STAGE_H = 720;
const DUR = 5000;
const FPS = 60;

/* timeline vertical resize + stage zoom */
const TL_H_KEY = "gd:timelineH";
const TL_H_DEFAULT = 240;
const TL_H_MIN = 160;
const clampTlH = (h) => Math.max(TL_H_MIN, Math.min(window.innerHeight * 0.45, h));
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5];
const STAGE_PAD = 120; /* workspace margin (screen px) around the canvas in manual zoom — bounds the scroll/pan area */

const C = {
  bg0: "#0A0C10", bg1: "#10131A", bg2: "#171B24", bg3: "#1E2330",
  line: "#232936", lineStrong: "#2E3546", txt: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  amber: "#F5A524", amberDim: "#B87A18", amberSoft: "rgba(245,165,36,0.12)", danger: "#E5636A", info: "#5B8DEF",
};




/* ---------- fonts ---------- */
const FONTS = ["Space Grotesk", "Inter", "JetBrains Mono", "Bebas Neue", "Montserrat", "Oswald", "Playfair Display", "Archivo Black", "Pacifico", "Caveat"];



/* ============================================================
   KEYFRAMES + INTERPOLATION
   ============================================================ */
const ANIM_PROPS = ["x", "y", "scale", "rotation", "opacity"];
const PROP_LABEL = { x: "Position X", y: "Position Y", scale: "Scale", rotation: "Rotation", opacity: "Opacity", shape: "Shape", fill: "Fill", prog: "Path progress", focus: "Zoom focus" };

function withKeyframe(track = [], t, v, ease) {
  const T = Math.round(t / 10) * 10;
  const old = track.find((k) => Math.abs(k.t - T) <= 5);
  const next = track.filter((k) => Math.abs(k.t - T) > 5);
  next.push({ t: T, v, ease: ease || (old && old.ease) || "easeInOutCubic" });
  next.sort((a, b) => a.t - b.t);
  return next;
}
const kfAt = (track = [], t) => track.find((k) => Math.abs(k.t - t) <= 5);

/* ============================================================
   TEXT FX — per-character, deterministic
   ============================================================ */
const TEXTFX_LIST = [
  { id: "none", name: "None" }, { id: "typewriter", name: "Typewriter" },
  { id: "rise", name: "Rise" }, { id: "pop", name: "Pop" },
  { id: "fall", name: "Fall Bounce" }, { id: "tracking", name: "Tracking In" },
  { id: "scramble", name: "Scramble" }, { id: "wave", name: "Wave · loop" },
];


/* ============================================================
   NUMBER ROLLERS (mechanical odometer cascade)
   ============================================================ */
const NUM_STYLES = [{ id: "odometer", name: "Odometer" }, { id: "count", name: "Count Up" }, { id: "slot", name: "Slot Machine" }];



/* ============================================================
   MOTION PRESETS
   ============================================================ */
const PRESETS = [
  { id: "fadeIn", name: "Fade In", icon: "◐", recipe: (c) => [{ prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 600, v: c.opacity }] },
  { id: "popIn", name: "Pop In", icon: "◎", recipe: (c) => [{ prop: "scale", dt: 0, v: 0, ease: "easeOutBack" }, { prop: "scale", dt: 650, v: c.scale }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 250, v: c.opacity }] },
  { id: "slideL", name: "Slide In ←", icon: "⇤", recipe: (c) => [{ prop: "x", dt: 0, v: c.x - 420, ease: "easeOutCubic" }, { prop: "x", dt: 700, v: c.x }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 350, v: c.opacity }] },
  { id: "riseUp", name: "Rise Up", icon: "↥", recipe: (c) => [{ prop: "y", dt: 0, v: c.y + 180, ease: "easeOutCubic" }, { prop: "y", dt: 700, v: c.y }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 350, v: c.opacity }] },
  { id: "spinIn", name: "Spin In", icon: "↻", recipe: (c) => [{ prop: "rotation", dt: 0, v: c.rotation - 180, ease: "easeOutCubic" }, { prop: "rotation", dt: 750, v: c.rotation }, { prop: "scale", dt: 0, v: 0, ease: "easeOutBack" }, { prop: "scale", dt: 750, v: c.scale }] },
  { id: "elastic", name: "Elastic Pop", icon: "〜", recipe: (c) => [{ prop: "scale", dt: 0, v: 0, ease: "easeOutElastic" }, { prop: "scale", dt: 950, v: c.scale }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 200, v: c.opacity }] },
  { id: "bounceIn", name: "Drop Bounce", icon: "⤓", recipe: (c) => [{ prop: "y", dt: 0, v: c.y - 320, ease: "easeOutBounce" }, { prop: "y", dt: 900, v: c.y }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 200, v: c.opacity }] },
  { id: "driftFade", name: "Drift + Fade", icon: "⇢", recipe: (c) => [{ prop: "x", dt: 0, v: c.x, ease: "linear" }, { prop: "x", dt: 1400, v: c.x + 260 }, { prop: "opacity", dt: 0, v: c.opacity, ease: "easeInQuad" }, { prop: "opacity", dt: 1400, v: 0 }] },
  { id: "softRise", name: "Soft Rise", icon: "⌃", recipe: (c) => [{ prop: "y", dt: 0, v: c.y + 26, ease: "easeInOutSine" }, { prop: "y", dt: 520, v: c.y }, { prop: "opacity", dt: 0, v: 0, ease: "easeInOutSine" }, { prop: "opacity", dt: 420, v: c.opacity }] },
  { id: "gentlePop", name: "Gentle Pop", icon: "○", recipe: (c) => [{ prop: "scale", dt: 0, v: c.scale * 0.94, ease: "softSpring" }, { prop: "scale", dt: 620, v: c.scale }, { prop: "opacity", dt: 0, v: 0, ease: "easeInOutSine" }, { prop: "opacity", dt: 340, v: c.opacity }] },
  { id: "fadeOut", name: "Fade Out", icon: "◑", recipe: (c) => [{ prop: "opacity", dt: 0, v: c.opacity, ease: "easeInQuad" }, { prop: "opacity", dt: 500, v: 0 }] },
  { id: "popOut", name: "Pop Out", icon: "⊙", recipe: (c) => [{ prop: "scale", dt: 0, v: c.scale, ease: "easeInCubic" }, { prop: "scale", dt: 450, v: 0 }, { prop: "opacity", dt: 100, v: c.opacity, ease: "easeInQuad" }, { prop: "opacity", dt: 450, v: 0 }] },
];

/* ============================================================
   CLIP TRANSITIONS (in/out at the clip's timeline window)
   ============================================================ */
const TRANSITIONS = [
  { id: "none", name: "None" }, { id: "fade", name: "Fade" },
  { id: "slideU", name: "Slide ↑" }, { id: "slideD", name: "Slide ↓" },
  { id: "slideL", name: "Slide ←" }, { id: "slideR", name: "Slide →" },
  { id: "zoom", name: "Zoom In" }, { id: "zoomOut", name: "Zoom Out" },
];

/* ============================================================
   OBJECTS
   ============================================================ */
let _uid = 100;
const uid = () => `ob${_uid++}`;
const BOX_DEFAULTS = { bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none" };

function makeObject(type, over = {}) {
  const base = {
    id: uid(), type, name: type[0].toUpperCase() + type.slice(1), tracks: {}, locked: false, hidden: false,
    props: { x: STAGE_W / 2, y: STAGE_H / 2, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0 },
  };
  if (type === "shape") { base.props.shape = over.shape || "rect"; base.name = SHAPE_DEFS[base.props.shape].name; Object.assign(base.props, { w: 190, h: 190, fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0 }); }
  if (type === "text") { Object.assign(base.props, { text: "Headline", fontSize: 72, fontWeight: 700, w: 0, h: 0, textFx: null, fontFamily: "Space Grotesk", ls: 0.5, upper: false, pathMode: "flow", ...BOX_DEFAULTS }); }
  if (type === "image") { Object.assign(base.props, { src: over.src || "", w: over.w || 320, h: over.h || 220 }); }
  if (type === "number") { base.name = "Number"; Object.assign(base.props, { from: 0, to: 100, start: 200, dur: 1600, style: "odometer", decimals: 0, prefix: "", suffix: "", fontSize: 96, fill: "#F9F9F9", numEase: "easeOutCubic", fontFamily: "JetBrains Mono", ring: "none", ringC: "#FFB224", ringW: 8, ...BOX_DEFAULTS }); }
  if (type === "map") { base.name = "Map"; Object.assign(base.props, { country: "IND", mapStyle: "comet", stroke: "#FFB224", fillC: "#FFB224", fillOp: 0.85, strokeW: 1.6, start: 200, dur: 1800, w: 420 }); }
  if (type === "continent") { base.name = "Continent"; Object.assign(base.props, { continent: "ASIA", mapStyle: "comet", stroke: "#FFB224", fillC: "#FFB224", fillOp: 0.7, strokeW: 1, start: 200, dur: 2200, w: 620, hi: [], reveal: "simple", revealDur: 600, hiFill: "#FFD984", hiStroke: "#ffffff", glow: true, autoZoom: true, zoomK: 2.2, zoomHoldMs: 1600, zoomTransMs: 550 }); }
  if (type === "confetti") { base.name = "Confetti"; Object.assign(base.props, { burst: 500, count: 70, power: 1, seed: 7 }); }
  if (type === "chart") { base.name = "Chart"; Object.assign(base.props, { chartType: "bar", dataStr: "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84", start: 200, dur: 1400, w: 560, h: 340, showVals: true, bg: "#171B24", bgOp: 1, radius: 18, borderC: "#2B3140", borderW: 1, pad: 20 }); }
  if (type === "world") { base.name = "World map"; Object.assign(base.props, { hi: [{ cc: "IND", t: 0, zoom: true }], reveal: "simple", revealDur: 600, zoomK: 2.6, autoZoom: true, zoomHoldMs: 1600, zoomTransMs: 550, focus: 0, base: "#2A3350", baseOp: 1, hiFill: "#FFB224", hiStroke: "#FFD984", stroke: "#3D4A6E", strokeW: 0.7, glow: true, w: 780 }); }
  if (type === "clip") {
    base.name = over.name || "Clip";
    base.children = over.children || [];
    Object.assign(base.props, { start: 0, dur: 3000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500 });
  }
  base.props = { ...base.props, ...(over.props || {}) };
  return { ...base, props: base.props, name: over.name || base.name };
}


function cloneLayer(o) {
  const c = JSON.parse(JSON.stringify(o));
  const walk = (l) => { l.id = uid(); (l.children || []).forEach(walk); };
  walk(c);
  return c;
}

function demoProject() {
  /* Scene 1 — Intro clip: fades out, replaced by Scene 2 sliding up */
  const title = makeObject("text", { name: "Title", props: { text: "GRAPHIC DESTINATION", fontSize: 72, x: 640, y: 300, fill: "#F9F9F9", textFx: { type: "rise", start: 250, seed: 3 } } });
  const chip = makeObject("text", { name: "Chip", props: { text: "MOTION · MADE LIGHT", fontSize: 21, x: 640, y: 392, fill: "#FFB224", fontWeight: 600, bg: "#20263480", borderC: "#FFB224", borderW: 1.5, radius: 999, pad: 18, boxFx: "glow", inT: 550 } });
  chip.tracks = { opacity: [{ t: 550, v: 0, ease: "easeOutQuad" }, { t: 1000, v: 1, ease: "linear" }] };
  const morph = makeObject("shape", { shape: "ellipse", name: "Morpher", props: { x: 240, y: 150, w: 96, h: 96, fill: "#FFB224", path: { pts: [[210, 175], [640, 78], [1070, 175]], curved: true, show: true } } });
  morph.tracks = {
    prog: [{ t: 0, v: 0, ease: "easeInOutCubic" }, { t: 2300, v: 1, ease: "linear" }],
    shape: [{ t: 0, v: "ellipse", ease: "easeInOutCubic" }, { t: 1200, v: "star", ease: "easeInOutCubic" }, { t: 2300, v: "heart", ease: "linear" }],
    rotation: [{ t: 0, v: 0, ease: "linear" }, { t: 2300, v: 360, ease: "linear" }],
    opacity: [{ t: 1800, v: 1, ease: "easeInQuad" }, { t: 2300, v: 0.25, ease: "linear" }],
    fill: [{ t: 0, v: "#FFB224", ease: "linear" }, { t: 1200, v: "#FF6B6B", ease: "linear" }, { t: 2300, v: "#C084FC", ease: "linear" }],
  };
  const intro = makeObject("clip", { name: "Scene 1 · Intro", children: [morph, title, chip], props: { start: 150, dur: 2500, end: "hide", tIn: "fade", tOut: "fade", tDur: 420, x: 640, y: 340 } });

  /* Scene 2 — Stats clip: slides up in, holds */
  const num = makeObject("number", { name: "Counter", props: { x: 610, y: 350, from: 0, to: 2026, start: 350, dur: 1500, style: "odometer", fontSize: 82, fill: "#E9EBF2", bg: "#10151F", borderC: "#5B8CFF", borderW: 1.5, radius: 16, pad: 22, boxFx: "glow" } });
  const badge = makeObject("shape", { shape: "star", name: "Badge", props: { x: 855, y: 348, w: 66, h: 66, fill: "#FFB224" } });
  badge.tracks = { rotation: [{ t: 0, v: 0, ease: "linear" }, { t: 3000, v: 360, ease: "linear" }] };
  const conf = makeObject("confetti", { props: { x: 640, y: 280, burst: 1000, count: 80, power: 1.1, seed: 12 } });
  const stats = makeObject("clip", { name: "Scene 2 · Stats", children: [num, badge, conf], props: { start: 2750, dur: 3250, end: "hold", tIn: "slideU", tDur: 550, bg: "#141926cc", bgPad: 40, bgRadius: 22, x: 640, y: 355 } });

  /* Persistent map with comet border */
  const mapa = makeObject("map", { name: "Mexico · comet", props: { country: "MEX", x: 218, y: 528, w: 300, mapStyle: "comet", stroke: "#6EE7B7", fillC: "#6EE7B7", fillOp: 0.8, strokeW: 1.4 } });
  return [mapa, intro, stats];
}

/* ============================================================
   LAYER TREE
   ============================================================ */
function resolvePath(root, path, rootDur) {
  let layers = root, dur = rootDur, names = [], clip = null;
  for (const id of path) {
    const c = layers.find((o) => o.id === id && o.type === "clip");
    if (!c) return { layers: root, dur: rootDur, names: [], clip: null, broken: true };
    layers = c.children; dur = c.props.dur; names.push(c.name); clip = c;
  }
  return { layers, dur, names, clip };
}
function updateAtPath(root, path, fn) {
  if (!path.length) return fn(root);
  const [h, ...rest] = path;
  return root.map((o) => (o.id === h ? { ...o, children: updateAtPath(o.children, rest, fn) } : o));
}
function objSize(o, time) {
  const P = o.props;
  if (o.type === "shape" || o.type === "image") return { w: P.w, h: P.h };
  if (o.type === "map") { const b = mapBox(MAPS[P.country]); return { w: P.w, h: (P.w * b.h) / b.w }; }
  if (o.type === "continent") {
    const codes = CONTINENTS[P.continent] || [];
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    codes.forEach((cc) => { const e = WORLD_EXT[cc]; if (!e) return; mnx = Math.min(mnx, e[0]); mny = Math.min(mny, e[1]); mxx = Math.max(mxx, e[2]); mxy = Math.max(mxy, e[3]); });
    if (mnx > mxx) return { w: P.w, h: P.w };
    return { w: P.w, h: (P.w * (mxy - mny)) / (mxx - mnx) };
  }
  if (o.type === "world") return { w: P.w, h: (P.w * WORLD_H) / 200 };
  if (o.type === "chart") return { w: P.w, h: P.h };
  if (o.type === "text") return { w: Math.max(40, P.text.length * P.fontSize * 0.56), h: P.fontSize * 1.25 };
  if (o.type === "number") {
    const digits = String(Math.floor(Math.max(P.from, P.to))).length + P.decimals + (P.decimals ? 1 : 0) + P.prefix.length + P.suffix.length;
    return { w: Math.max(40, digits * P.fontSize * 0.62), h: P.fontSize * 1.2 };
  }
  if (o.type === "clip") { const b = bboxOfLayers(o.children, clipLocalTime(P, time) ?? 0); return { w: b.w, h: b.h }; }
  return { w: 44, h: 44 };
}
function layerOut(o, dur) { return o.props.outT == null ? dur : o.props.outT; }
function layerVisible(o, t, dur) {
  if (o.type === "clip") return true;
  return t >= (o.props.inT || 0) && t <= layerOut(o, dur);
}
function bboxOfLayers(layers, localT) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const o of layers) {
    if (o.type === "clip" && clipLocalTime(o.props, localT) === null) continue;
    const [x, y] = posOf(o, localT);
    const s = valueAt(o, "scale", localT);
    const { w, h } = objSize(o, localT);
    mnx = Math.min(mnx, x - (w * s) / 2); mxx = Math.max(mxx, x + (w * s) / 2);
    mny = Math.min(mny, y - (h * s) / 2); mxy = Math.max(mxy, y + (h * s) / 2);
  }
  if (mnx === Infinity) { mnx = 550; mxx = 730; mny = 300; mxy = 420; }
  return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny, cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 };
}
/* shift every time-based value in a layer by dt (bar move) */
function shiftLayerTimes(o, dt, dur) {
  const n = JSON.parse(JSON.stringify(o));
  Object.keys(n.tracks).forEach((p) => (n.tracks[p] = n.tracks[p].map((k) => ({ ...k, t: Math.max(0, Math.min(dur, k.t + dt)) }))));
  n.props.inT = Math.max(0, (n.props.inT || 0) + dt);
  if (n.props.outT != null) n.props.outT = Math.min(dur, n.props.outT + dt);
  if (n.type === "number" || n.type === "map") n.props.start = Math.max(0, n.props.start + dt);
  if (n.type === "confetti") n.props.burst = Math.max(0, n.props.burst + dt);
  if (n.type === "text" && n.props.textFx) n.props.textFx = { ...n.props.textFx, start: Math.max(0, n.props.textFx.start + dt) };
  if (n.type === "world") n.props.hi = normHi(n.props.hi).map((h) => ({ ...h, t: Math.max(0, h.t + dt), ...(h.out != null ? { out: Math.max(0, h.out + dt) } : {}) }));
  if (n.type === "clip") n.props.start = Math.max(0, n.props.start + dt);
  return n;
}
/* scale every time-based value by factor f (time stretch), recursive */
function scaleLayerTimes(o, f) {
  const n = JSON.parse(JSON.stringify(o));
  const S = (t) => Math.round(t * f);
  Object.keys(n.tracks).forEach((p) => (n.tracks[p] = n.tracks[p].map((k) => ({ ...k, t: S(k.t) }))));
  n.props.inT = S(n.props.inT || 0);
  if (n.props.outT != null) n.props.outT = S(n.props.outT);
  if (n.type === "number" || n.type === "map") { n.props.start = S(n.props.start); n.props.dur = S(n.props.dur); }
  if (n.type === "confetti") n.props.burst = S(n.props.burst);
  if (n.type === "text" && n.props.textFx) n.props.textFx = { ...n.props.textFx, start: S(n.props.textFx.start) };
  if (n.type === "world") n.props.hi = normHi(n.props.hi).map((h) => ({ ...h, t: S(h.t), ...(h.out != null ? { out: S(h.out) } : {}) }));
  if (n.type === "clip") { n.props.start = S(n.props.start); n.props.dur = S(n.props.dur); n.children = n.children.map((c) => scaleLayerTimes(c, f)); }
  return n;
}

const STAGE_PRESETS = [
  { id: "land", name: "Landscape 16:9", w: 1280, h: 720 },
  { id: "vert", name: "Reel · 9:16", w: 720, h: 1280 },
  { id: "sq", name: "Square 1:1", w: 960, h: 960 },
];
const DEFAULT_BRAND = { id: "b1", name: "Graphic Destination", colors: ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#F9F9F9"], headFont: "Space Grotesk", bodyFont: "Inter" };

/* map /api/assets failures (and image-prep rejections) to panel-friendly copy */
function assetErrorText(err) {
  if (err?.status === 413) return "That image is too large for the server — try a smaller one.";
  if (err?.status === 415) return "That file type isn't supported. Use PNG, JPEG, WebP or GIF.";
  if (err?.status === 409) return "Your asset storage is full — delete some assets to make room.";
  return err?.message || "Something went wrong — please try again.";
}
/* same mapping, audio-flavored copy (client-side type/size rejects come from validateAudioFile) */
function audioErrorText(err) {
  if (err?.status === 413) return "That audio file is too large for the server — try a shorter or more compressed one.";
  if (err?.status === 415) return "That file type isn't supported. Use MP3, WAV, OGG, M4A or AAC.";
  if (err?.status === 409) return "Your asset storage is full — delete some assets to make room.";
  return err?.message || "Something went wrong — please try again.";
}

/* ============================================================
   APP
   ============================================================ */
export default function GraphicDestinationMotion({ initialProject, onChange } = {}) {
  const [objects, setObjects] = useState(demoProject);
  const [stage, setStage] = useState({ w: 1280, h: 720 });
  const [compDur, setCompDur] = useState(6000);
  const [brands, setBrands] = useState([DEFAULT_BRAND]);
  const [brandId, setBrandId] = useState("b1");
  const [brandOpen, setBrandOpen] = useState(false);
  const [path, setPath] = useState([]);
  const [selIds, setSelIds] = useState([]);
  const [selKf, setSelKf] = useState(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [autokey, setAutokey] = useState(true);
  const [stageBg, setStageBg] = useState("#101218");
  const [stageScale, setStageScale] = useState(0.6);
  const [zoomMode, setZoomMode] = useState("fit"); /* "fit" (auto) or a manual factor from ZOOM_STEPS */
  const [tlH, setTlH] = useState(() => { try { const v = parseFloat(localStorage.getItem(TL_H_KEY)); return Number.isFinite(v) ? clampTlH(v) : TL_H_DEFAULT; } catch { return TL_H_DEFAULT; } });
  const [tlDragging, setTlDragging] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [assets, setAssets] = useState(null); /* null = not fetched yet; [] = fetched, empty */
  const [assetsBusy, setAssetsBusy] = useState(false);
  const [assetErr, setAssetErr] = useState("");
  const [assetUploading, setAssetUploading] = useState(false);
  /* project-level audio track: { src, name, startT, volume, fadeIn, fadeOut } | null — all times engine ms */
  const [audioTrack, setAudioTrack] = useState(null);
  const [audioSel, setAudioSel] = useState(false); /* audio lane selected → inspector shows audio props */
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioErr, setAudioErr] = useState("");
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioDurMs, setAudioDurMs] = useState(null); /* attached file's own duration once metadata loads (null = unknown) */
  const [shapeQ, setShapeQ] = useState("");
  const [morphQ, setMorphQ] = useState("");
  const [overflowShow, setOverflowShow] = useState(true);
  const clipboardRef = useRef([]);
  const [clipCount, setClipCount] = useState(0);
  const [menu, setMenu] = useState(null); // context menu {x,y,kind,...}
  const [stretchClips, setStretchClips] = useState(true);
  const [ioOpen, setIoOpen] = useState(false);
  const [ioCopied, setIoCopied] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState("");
  const [name, setName] = useState("Untitled project");
  const [exportOpen, setExportOpen] = useState(false);

  const timeRef = useRef(0);
  timeRef.current = time;
  const stageWrapRef = useRef(null);
  const stageScrollRef = useRef(null);
  const rulerRef = useRef(null);
  const fileRef = useRef(null);
  const assetFileRef = useRef(null);
  const audioFileRef = useRef(null);
  const audioElRef = useRef(null); /* lazily-created HTMLAudioElement for preview sync */
  const audioLoadedSrcRef = useRef(""); /* src currently assigned to that element */
  const zoomModeRef = useRef("fit");
  zoomModeRef.current = zoomMode;

  const brand = brands.find((b) => b.id === brandId) || brands[0] || DEFAULT_BRAND;
  const ctx = useMemo(() => resolvePath(objects, path, compDur), [objects, path, compDur]);
  const ctxLayers = ctx.layers;
  const ctxDur = ctx.dur;
  const inClip = path.length > 0;
  const zoomed = zoomMode !== "fit"; /* manual zoom: stage scrolls/pans inside a padded wrapper */
  const sel = ctxLayers.find((o) => o.id === selIds[0]) || null;
  const selMany = selIds.map((id) => ctxLayers.find((o) => o.id === id)).filter(Boolean);

  /* ---------- mutations ---------- */
  const setLayers = useCallback((fn) => setObjects((root) => updateAtPath(root, path, fn)), [path]);
  const patchObject = useCallback((id, fn) => setLayers((ls) => ls.map((o) => (o.id === id ? fn(o) : o))), [setLayers]);
  const patchProps = useCallback((id, patch) => patchObject(id, (o) => ({ ...o, props: { ...o.props, ...patch } })), [patchObject]);
  const setKeyframe = useCallback((id, prop, t, v, ease) => {
    const obj = ctxLayers.find((o) => o.id === id);
    const lo = obj ? obj.props.inT || 0 : 0;
    const hi = obj ? layerOut(obj, ctxDur) : ctxDur;
    const T = Math.max(lo, Math.min(hi, t)); // keyframes live inside the layer bar
    patchObject(id, (o) => ({ ...o, tracks: { ...o.tracks, [prop]: withKeyframe(o.tracks[prop], T, v, ease) } }));
    return Math.round(T / 10) * 10;
  }, [patchObject, ctxLayers, ctxDur]);
  const removeKeyframe = useCallback((id, prop, t) => patchObject(id, (o) => {
    const next = (o.tracks[prop] || []).filter((k) => Math.abs(k.t - t) > 5);
    const tracks = { ...o.tracks };
    if (next.length) tracks[prop] = next; else delete tracks[prop];
    return { ...o, tracks };
  }), [patchObject]);

  const KF_PROPS = ["x", "y", "scale", "rotation", "opacity", "fill", "prog", "focus"];
  const editProp = useCallback((id, prop, v) => {
    const obj = ctxLayers.find((o) => o.id === id);
    if (!obj || obj.locked) return;
    const track = obj.tracks[prop];
    if (KF_PROPS.includes(prop)) {
      if (autokey) { setKeyframe(id, prop, timeRef.current, v); return; }
      if (track?.length && typeof v === "number") {
        /* Animate off + existing animation: offset every keyframe → the whole motion moves */
        const dvv = v - valueAt(obj, prop, timeRef.current);
        patchObject(id, (o) => ({ ...o, tracks: { ...o.tracks, [prop]: (o.tracks[prop] || []).map((k) => ({ ...k, v: k.v + dvv })) } }));
        return;
      }
    }
    patchProps(id, { [prop]: v });
  }, [ctxLayers, autokey, setKeyframe, patchProps, patchObject]);

  const setShapeAt = (id, shapeId) => {
    const obj = ctxLayers.find((o) => o.id === id);
    if (!obj || obj.locked) return;
    if (obj.tracks.shape?.length > 0 || autokey) setKeyframe(id, "shape", timeRef.current, shapeId, "easeInOutCubic");
    else patchProps(id, { shape: shapeId });
  };
  const setSegmentEase = (id, prop, aT, ease) => patchObject(id, (o) => ({ ...o, tracks: { ...o.tracks, [prop]: (o.tracks[prop] || []).map((k) => (Math.abs(k.t - aT) <= 5 ? { ...k, ease } : k)) } }));

  /* keyframe navigation: jump playhead to prev/next key of a track */
  const kfNav = (obj, prop, dir) => {
    const tr = obj.tracks[prop] || [];
    const t = timeRef.current;
    const cand = dir > 0 ? tr.find((k) => k.t > t + 5) : [...tr].reverse().find((k) => k.t < t - 5);
    if (cand) { setTime(cand.t); setSelKf({ objId: obj.id, prop, t: cand.t }); }
  };

  /* ---------- fit + playback + keyboard ---------- */
  const fitStage = useCallback(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setStageScale(Math.min((r.width - 48) / stage.w, (r.height - 60) / stage.h));
  }, [stage]);
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const fit = () => { if (zoomModeRef.current === "fit") fitStage(); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitStage]);

  /* ---------- stage zoom (Fit = auto-fit above; manual steps reuse the same stageScale transform) ---------- */
  const setZoom = (z) => { setZoomMode(z); if (z === "fit") fitStage(); else setStageScale(z); };
  const stepZoom = (dir) => {
    const eff = zoomMode === "fit" ? stageScale : zoomMode;
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > eff + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < eff - 0.001);
    setZoom(next != null ? next : dir > 0 ? ZOOM_STEPS[ZOOM_STEPS.length - 1] : ZOOM_STEPS[0]);
  };
  const cycleZoom = () => setZoom(zoomMode === "fit" ? 1 : zoomMode === 1 ? 0.5 : zoomMode === 0.5 ? 0.25 : "fit");

  /* keep the timeline height inside 160px…45% of the viewport when the window resizes */
  useEffect(() => {
    const onRs = () => setTlH((h) => clampTlH(h));
    window.addEventListener("resize", onRs);
    return () => window.removeEventListener("resize", onRs);
  }, []);

  /* ns-resize cursor across the whole window while the timeline is being dragged */
  useEffect(() => {
    if (!tlDragging) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "ns-resize";
    return () => { document.body.style.cursor = prev; };
  }, [tlDragging]);

  /* manual zoom keeps the canvas centered in the scrollport when it overflows
     (runs on zoom change only — never fights the user's own panning) */
  useEffect(() => {
    if (zoomMode === "fit") return;
    const el = stageScrollRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoomMode, stageScale]);

  useEffect(() => {
    if (!playing) return;
    let raf;
    let t0 = performance.now() - timeRef.current;
    const step = (now) => {
      let t = now - t0;
      if (t >= ctxDur) {
        if (loop) { t0 = now - (t % ctxDur); t = t % ctxDur; }
        else { setTime(ctxDur); setPlaying(false); return; }
      }
      setTime(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, ctxDur]);

  /* ---------- audio preview sync ----------
     Project audio lives on the MAIN composition timeline only (startT is in
     root ms), so it plays at root and pauses while editing inside a clip.
     The <audio> element + file load are deferred until the first playing
     frame (lazy preload); while paused (incl. scrubbing) it stays silent.
     Per-frame: currentTime = (t - startT)/1000 with a small drift tolerance,
     volume = track volume × fade-in/out gain. Never loops on its own — a
     looping composition re-triggers it via the drift snap below. */
  useEffect(() => {
    const at = audioTrack;
    const el0 = audioElRef.current;
    if (!at || path.length > 0 || !playing) {
      if (el0 && !el0.paused) el0.pause();
      return;
    }
    if (!audioElRef.current) {
      const el = new Audio();
      el.preload = "auto";
      el.loop = false;
      el.addEventListener("loadedmetadata", () => {
        setAudioDurMs(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
      });
      audioElRef.current = el;
    }
    const el = audioElRef.current;
    if (audioLoadedSrcRef.current !== at.src) {
      audioLoadedSrcRef.current = at.src;
      setAudioDurMs(null);
      el.src = at.src; /* first assignment starts the (lazy) load */
    }
    if (!audioWithinAt(at, time, audioDurMs)) { if (!el.paused) el.pause(); return; }
    const target = (time - at.startT) / 1000;
    const drift = Math.abs(el.currentTime - target);
    if (drift > 0.12) { try { el.currentTime = target; } catch { /* metadata not seekable yet — retried next frame */ } }
    el.volume = audioGainAt(at, time, audioDurMs);
    if (el.paused) {
      /* don't retrigger right after a natural end while the playhead is still in the tail */
      if (el.ended && drift <= 0.12) return;
      el.play().catch(() => { /* autoplay policy / not ready — retried next frame */ });
    }
  }, [playing, time, audioTrack, path, audioDurMs]);

  /* silence + release the audio element on unmount */
  useEffect(() => () => {
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.src = ""; }
    audioElRef.current = null;
    audioLoadedSrcRef.current = "";
  }, []);

  useEffect(() => { setTime((t) => Math.min(t, ctxDur)); setSelKf(null); }, [path, ctxDur]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") { e.preventDefault(); groupSelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); copySelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); pasteClipboard(); }
      if (e.key === "Escape") {
        if (menu) setMenu(null);
        else if (selKf) setSelKf(null);
        else if (selIds.length) setSelIds([]);
        else if (audioSel) setAudioSel(false);
        else if (path.length) exitToDepth(path.length - 1);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selKf) { removeKeyframe(selKf.objId, selKf.prop, selKf.t); setSelKf(null); }
        else if (selIds.length) removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  /* ---------- navigation ---------- */
  const enterClip = (id) => {
    const c = ctxLayers.find((o) => o.id === id && o.type === "clip");
    if (!c) return;
    const local = clipLocalTime(c.props, timeRef.current);
    setPath((p) => [...p, id]);
    setSelIds([]);
    setTime(local === null ? 0 : Math.min(local, c.props.dur));
    setPlaying(false);
  };
  const exitToDepth = (depth) => { setPath((p) => p.slice(0, depth)); setSelIds([]); setPlaying(false); };

  /* ---------- structure ops ---------- */
  const addObject = (type, over = {}) => {
    const o = makeObject(type, over);
    o.props.x = stage.w / 2; o.props.y = stage.h / 2;
    o.props.outT = o.type === "clip" ? null : ctxDur;
    if (type === "confetti") o.props.burst = Math.round(timeRef.current / 10) * 10;
    if (type === "clip" && !over.children) {
      const ends = ctxLayers.filter((c) => c.type === "clip").map((c) => c.props.start + c.props.dur / (c.props.speed || 1));
      const st = ends.length ? Math.min(ctxDur - 400, Math.round(Math.max(...ends) / 10) * 10) : 0;
      o.props.start = Math.max(0, st);
      o.props.dur = Math.max(600, Math.min(3000, ctxDur - o.props.start));
    }
    if (type === "text") { o.props.fontFamily = brand.headFont; o.props.fill = brand.colors[4] || "#F9F9F9"; }
    Object.assign(o.props, over.props || {});
    setLayers((ls) => [...ls, o]);
    setSelIds([o.id]);
    setShapesOpen(false);
    if (type === "clip" && !over.children) enterClip(o.id);
  };
  const copySelection = () => { if (!selMany.length) return; clipboardRef.current = selMany.map((o) => JSON.parse(JSON.stringify(o))); setClipCount(clipboardRef.current.length); };
  const pasteClipboard = () => {
    if (!clipboardRef.current.length) return;
    const clones = clipboardRef.current.map((o) => { const c = cloneLayer(o); c.locked = false; c.props = { ...c.props, x: c.props.x + 28, y: c.props.y + 28 }; if (c.props.path) c.props.path = { ...c.props.path, pts: c.props.path.pts.map(([px, py]) => [px + 28, py + 28]) }; return c; });
    setLayers((ls) => [...ls, ...clones]);
    setSelIds(clones.map((c) => c.id));
  };
  const removeSelected = () => { setLayers((ls) => ls.filter((o) => !selIds.includes(o.id) || o.locked)); setSelIds([]); };
  const duplicateSelected = () => {
    const clones = selMany.map((o) => { const c = cloneLayer(o); c.name = o.name + " copy"; c.locked = false; c.props = { ...c.props, x: c.props.x + 24, y: c.props.y + 24 }; if (c.props.path) c.props.path = { ...c.props.path, pts: c.props.path.pts.map(([px, py]) => [px + 24, py + 24]) }; return c; });
    setLayers((ls) => [...ls, ...clones]);
    setSelIds(clones.map((c) => c.id));
  };
  const reorder = (id, dir) => setLayers((ls) => {
    const i = ls.findIndex((o) => o.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ls.length) return ls;
    const next = [...ls];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const toggleLock = (id) => patchObject(id, (o) => ({ ...o, locked: !o.locked }));
  const toggleHide = (id) => patchObject(id, (o) => ({ ...o, hidden: !o.hidden }));

  const groupSelection = () => {
    if (!selIds.length) return;
    const members = ctxLayers.filter((o) => selIds.includes(o.id));
    if (!members.length) return;
    const clip = makeObject("clip", { name: "Clip " + (_uid % 100), children: members, props: { start: 0, dur: ctxDur, x: stage.w / 2, y: stage.h / 2 } });
    const memberIds = members.map((m) => m.id);
    setLayers((ls) => {
      const at = ls.findIndex((o) => o.id === memberIds[0]);
      const rest = ls.filter((o) => !memberIds.includes(o.id));
      rest.splice(Math.min(at < 0 ? rest.length : at, rest.length), 0, clip);
      return rest;
    });
    setSelIds([clip.id]);
  };
  const ungroupClip = (id) => {
    const c = ctxLayers.find((o) => o.id === id && o.type === "clip");
    if (!c) return;
    const dx = c.props.x - stage.w / 2, dy = c.props.y - stage.h / 2;
    const shift = c.props.start, sp = c.props.speed || 1;
    const kids = c.children.map((k) => {
      const nk = JSON.parse(JSON.stringify(k));
      nk.props.x += dx; nk.props.y += dy;
      if (nk.props.path) nk.props.path.pts = nk.props.path.pts.map(([px, py]) => [px + dx, py + dy]);
      ["x", "y"].forEach((pp) => { if (nk.tracks[pp]) nk.tracks[pp] = nk.tracks[pp].map((kf) => ({ ...kf, v: kf.v + (pp === "x" ? dx : dy) })); });
      const sh = shiftLayerTimes(nk, 0, 1e9); // normalize shape
      Object.keys(sh.tracks).forEach((pp) => (sh.tracks[pp] = sh.tracks[pp].map((kf) => ({ ...kf, t: Math.round(shift + kf.t / sp) }))));
      sh.props.inT = Math.round(shift + (sh.props.inT || 0) / sp);
      if (sh.props.outT != null) sh.props.outT = Math.round(shift + sh.props.outT / sp);
      if (sh.type === "clip") sh.props.start = Math.round(shift + sh.props.start / sp);
      if (sh.type === "confetti") sh.props.burst = Math.round(shift + sh.props.burst / sp);
      if (sh.type === "number" || sh.type === "map") sh.props.start = Math.round(shift + sh.props.start / sp);
      if (sh.type === "text" && sh.props.textFx) sh.props.textFx = { ...sh.props.textFx, start: Math.round(shift + sh.props.textFx.start / sp) };
      return sh;
    });
    setLayers((ls) => {
      const at = ls.findIndex((o) => o.id === id);
      if (at < 0) return ls;
      const next = ls.filter((o) => o.id !== id);
      next.splice(at, 0, ...kids);
      return next;
    });
    setSelIds(kids.map((k) => k.id));
  };

  /* ---------- duration control (with optional time-stretch of contents) ---------- */
  const setCtxDurMs = (v, scaleContents) => {
    const nd = Math.max(1000, Math.min(30000, Math.round(v / 100) * 100));
    if (!path.length) {
      if (scaleContents && compDur > 0 && nd !== compDur) {
        const f = nd / compDur;
        setObjects((root) => root.map((o) => scaleLayerTimes(o, f)));
      }
      setCompDur(nd);
    } else {
      const parent = path.slice(0, -1), cid = path[path.length - 1];
      setObjects((root) => updateAtPath(root, parent, (ls) => ls.map((o) => {
        if (o.id !== cid) return o;
        const f = nd / o.props.dur;
        const children = scaleContents && f !== 1 ? o.children.map((c) => scaleLayerTimes(c, f)) : o.children;
        return { ...o, children, props: { ...o.props, dur: nd } };
      })));
    }
  };
  const stretchClipDur = (id, nd) => patchObject(id, (o) => {
    const f = nd / o.props.dur;
    const children = stretchClips && f !== 1 ? o.children.map((c) => scaleLayerTimes(c, f)) : o.children;
    return { ...o, children, props: { ...o.props, dur: nd } };
  });

  /* ---------- alignment ---------- */
  const align = (mode) => {
    const t = timeRef.current;
    const items = selMany.filter((o) => !o.locked).map((o) => { const s = valueAt(o, "scale", t); const [px, py] = posOf(o, t); const { w, h } = objSize(o, t); return { o, x: px, y: py, hw: (w * s) / 2, hh: (h * s) / 2 }; });
    if (!items.length) return;
    const L = Math.min(...items.map((i) => i.x - i.hw)), R = Math.max(...items.map((i) => i.x + i.hw));
    const T = Math.min(...items.map((i) => i.y - i.hh)), B = Math.max(...items.map((i) => i.y + i.hh));
    items.forEach((i) => {
      if (i.o.props.path) return;
      if (mode === "left") editProp(i.o.id, "x", Math.round(L + i.hw));
      if (mode === "hcenter") editProp(i.o.id, "x", Math.round((L + R) / 2));
      if (mode === "right") editProp(i.o.id, "x", Math.round(R - i.hw));
      if (mode === "top") editProp(i.o.id, "y", Math.round(T + i.hh));
      if (mode === "vcenter") editProp(i.o.id, "y", Math.round((T + B) / 2));
      if (mode === "bottom") editProp(i.o.id, "y", Math.round(B - i.hh));
    });
  };

  /* ---------- motion path ops ---------- */
  const addPathTo = (id, kind = "line") => {
    const o = ctxLayers.find((x) => x.id === id);
    if (!o) return;
    const [px, py] = posOf(o, timeRef.current);
    if (kind === "circle") {
      const r = 150;
      const pts = Array.from({ length: 8 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / 8; return [Math.round(px + r * Math.cos(a)), Math.round(py + r * Math.sin(a))]; });
      patchProps(id, { path: { pts, curved: true, closed: true, show: true }, prog: 0 });
    } else {
      patchProps(id, { path: { pts: [[px, py], [Math.min(stage.w - 60, px + 320), py - 90]], curved: true, closed: false, show: true }, prog: 0 });
    }
  };
  const patchPath = (id, fn) => patchObject(id, (o) => ({ ...o, props: { ...o.props, path: fn(o.props.path) } }));
  const animateAlongPath = (id) => {
    const t = timeRef.current;
    setKeyframe(id, "prog", t, 0, "easeInOutCubic");
    setKeyframe(id, "prog", t + 1600, 1);
  };

  /* ---------- image upload ---------- */
  const onPickImage = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 460 / Math.max(img.width, img.height));
        addObject("image", { props: { src: rd.result, w: Math.round(img.width * s), h: Math.round(img.height * s) } });
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };

  /* ---------- asset library (uploads + reusable images) ---------- */
  /* adds an image layer through the SAME addObject("image") path as
     onPickImage above — props { src, w, h } scaled to fit 460px */
  const addImageLayer = (src, natW, natH) => {
    const s = Math.min(1, 460 / Math.max(natW, natH));
    addObject("image", { props: { src, w: Math.round(natW * s), h: Math.round(natH * s) } });
  };
  const refreshAssets = useCallback(async () => {
    setAssetsBusy(true);
    try { setAssets(await api.listAssets()); setAssetErr(""); }
    catch (err) { setAssetErr(assetErrorText(err)); }
    finally { setAssetsBusy(false); }
  }, []);
  useEffect(() => { if ((imagesOpen || audioOpen) && assets === null) refreshAssets(); }, [imagesOpen, audioOpen, assets, refreshAssets]);
  const onPickAsset = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setAssetUploading(true); setAssetErr("");
    try {
      const prep = await prepareImageFile(f);
      const asset = await api.uploadAsset({ name: prep.name, mime: prep.mime, dataUrl: prep.dataUrl });
      addImageLayer(asset.url, prep.width, prep.height);
      refreshAssets();
    } catch (err) { setAssetErr(assetErrorText(err)); }
    finally { setAssetUploading(false); }
  };
  const addAssetLayer = (asset) => {
    const img = new Image();
    img.onload = () => addImageLayer(asset.url, img.naturalWidth || 320, img.naturalHeight || 220);
    img.onerror = () => addImageLayer(asset.url, 320, 220);
    img.src = asset.url;
  };
  const onDeleteAsset = async (asset) => {
    if (!window.confirm(`Delete "${asset.name}" from your assets? Layers already using it will lose the image.`)) return;
    setAssetErr("");
    try { await api.deleteAsset(asset.id); refreshAssets(); }
    catch (err) { setAssetErr(assetErrorText(err)); }
  };

  /* ---------- audio track (project-level, main timeline) ---------- */
  const patchAudio = useCallback((patch) => setAudioTrack((a) => (a ? { ...a, ...patch } : a)), []);
  const selectAudio = useCallback(() => { setAudioSel(true); setSelIds([]); setSelKf(null); }, []);
  /* attach an asset-library audio file with the schema defaults */
  const attachAudioAsset = useCallback((asset) => {
    setAudioTrack(makeAudioTrack({ src: asset.url, name: asset.name }));
    setAudioSel(true); setSelIds([]); setSelKf(null);
  }, []);
  const detachAudio = useCallback(() => { setAudioTrack(null); setAudioSel(false); }, []);
  const onPickAudioAsset = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const verdict = validateAudioFile(f);
    if (!verdict.ok) { setAudioErr(verdict.error); return; }
    setAudioUploading(true); setAudioErr("");
    try {
      const dataUrl = await new Promise((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res(rd.result);
        rd.onerror = () => rej(new Error("Couldn't read that file — please try again."));
        rd.readAsDataURL(f);
      });
      const asset = await api.uploadAsset({ name: f.name, mime: verdict.mime, dataUrl });
      attachAudioAsset({ url: asset.url, name: asset.name || f.name });
      refreshAssets();
    } catch (err) { setAudioErr(audioErrorText(err)); }
    finally { setAudioUploading(false); }
  };
  const onDeleteAudioAsset = async (asset) => {
    if (!window.confirm(`Delete "${asset.name}" from your assets? If it's attached to this project, the audio will stop working.`)) return;
    setAudioErr("");
    try {
      await api.deleteAsset(asset.id);
      if (audioTrack?.src === asset.url) detachAudio();
      refreshAssets();
    } catch (err) { setAudioErr(audioErrorText(err)); }
  };

  const applyPreset = (preset) => {
    if (!sel || sel.locked) return;
    const t = timeRef.current;
    const cur = {};
    ANIM_PROPS.forEach((p) => (cur[p] = valueAt(sel, p, t)));
    const recipe = preset.recipe(cur);
    const touched = [...new Set(recipe.map((k) => k.prop))];
    patchObject(sel.id, (o) => {
      const tracks = { ...o.tracks };
      touched.forEach((p) => delete tracks[p]); // preset replaces previous animation on these props
      return { ...o, tracks };
    });
    recipe.forEach((k) => setKeyframe(sel.id, k.prop, t + k.dt, k.v, k.ease || "linear"));
  };

  /* ---------- save / load ---------- */
  /* optional top-level "audio" field — OMITTED entirely when no track is attached (export-team contract) */
  const projectJson = () => JSON.stringify({ app: "graphic-destination-motion", v: 5, stage: { ...stage, dur: compDur, bg: stageBg }, brands, brandId, objects, ...(audioToJson(audioTrack) ? { audio: audioToJson(audioTrack) } : {}) }, null, 2);
  const copyProject = async () => {
    const txt = projectJson();
    try { await navigator.clipboard.writeText(txt); setIoCopied(true); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setIoCopied(true); } catch { setIoCopied(false); }
      document.body.removeChild(ta);
    }
    setTimeout(() => setIoCopied(false), 1800);
  };
  const importProject = (raw) => {
    try {
      const data = JSON.parse(typeof raw === "string" ? raw : importText);
      if (!Array.isArray(data.objects)) throw new Error("no objects array");
      const walk = (l) => { const m = /^ob(\d+)$/.exec(l.id || ""); if (m) _uid = Math.max(_uid, parseInt(m[1]) + 1); (l.children || []).forEach(walk); };
      data.objects.forEach(walk);
      setObjects(data.objects);
      if (data.stage) { setStage({ w: data.stage.w || 1280, h: data.stage.h || 720 }); if (data.stage.dur) setCompDur(data.stage.dur); if (data.stage.bg) setStageBg(data.stage.bg); }
      if (Array.isArray(data.brands) && data.brands.length) { setBrands(data.brands); setBrandId(data.brandId || data.brands[0].id); }
      setAudioTrack(audioFromJson(data.audio)); /* restore attached audio (null when the field is absent) */
      setAudioSel(false);
      setPath([]); setSelIds([]); setSelKf(null); setTime(0); setImportErr(""); setIoOpen(false); setImportText("");
    } catch (err) { setImportErr("Couldn't parse that JSON: " + err.message); }
  };

  /* ---------- cloud project seam (dashboard load/save) ----------
     initialProject: restore once on mount through the SAME code path as the
     Save/Load "Load project" button above (importProject). onChange: single
     central notification fired with projectJson() after any project mutation. */
  useEffect(() => {
    if (initialProject) importProject(JSON.stringify(initialProject));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastJsonRef = useRef(null);
  const notifyMountedRef = useRef(false);
  useEffect(() => {
    const json = projectJson();
    if (!notifyMountedRef.current) { notifyMountedRef.current = true; lastJsonRef.current = json; return; } // swallow mount
    if (json === lastJsonRef.current) return; // no-op restores (StrictMode remount) and unchanged state
    lastJsonRef.current = json;
    onChangeRef.current?.(json);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, stage, compDur, stageBg, brands, brandId, audioTrack]);

  /* ---------- stage drag (group + path aware, lock aware) ---------- */
  const dragRef = useRef(null);
  const onObjectDown = (e, obj) => {
    e.stopPropagation();
    setSelKf(null); setShapesOpen(false); setMenu(null);
    let ids;
    if (e.ctrlKey || e.metaKey) { ids = selIds.includes(obj.id) ? selIds.filter((i) => i !== obj.id) : [...selIds, obj.id]; setSelIds(ids); if (!ids.includes(obj.id)) return; }
    else if (selIds.includes(obj.id)) ids = selIds;
    else { ids = [obj.id]; setSelIds(ids); }
    const t = timeRef.current;
    const members = ids.map((id) => ctxLayers.find((o) => o.id === id)).filter((o) => o && !o.locked)
      .map((o) => ({ id: o.id, hasPath: !!o.props.path, pts: o.props.path ? o.props.path.pts.map((p) => p.slice()) : null, ox: valueAt(o, "x", t), oy: valueAt(o, "y", t) }));
    if (!members.length) return;
    dragRef.current = { members, sx: e.clientX, sy: e.clientY, moved: false, live: {} };
    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.sx) / stageScale, dy = (ev.clientY - d.sy) / stageScale;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      d.members.forEach((m) => {
        if (m.hasPath) {
          const npts = m.pts.map(([px, py]) => [Math.round(px + dx), Math.round(py + dy)]);
          d.live[m.id] = { pathPts: npts };
          patchPath(m.id, (p) => ({ ...p, pts: npts }));
        } else {
          const nx = Math.round(m.ox + dx), ny = Math.round(m.oy + dy);
          d.live[m.id] = { x: nx, y: ny };
          patchProps(m.id, { x: nx, y: ny });
        }
      });
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!d || !d.moved) return;
      d.members.forEach((m) => { const lv = d.live[m.id]; if (lv && !m.hasPath) { editProp(m.id, "x", lv.x); editProp(m.id, "y", lv.y); } });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const displayValue = (obj, prop) => {
    const d = dragRef.current;
    if (d && d.moved && d.live[obj.id] && d.live[obj.id][prop] !== undefined) return d.live[obj.id][prop];
    return valueAt(obj, prop, time);
  };
  /* corner-handle resize — goes through editProp, so it records scale keyframes
     exactly like moving records position keyframes (Animate on = keys; off = offset/static) */
  const onResizeDown = (e, obj) => {
    e.stopPropagation();
    if (obj.locked) return;
    setSelIds([obj.id]);
    const t = timeRef.current;
    const s0 = valueAt(obj, "scale", t);
    const { w, h } = objSize(obj, t);
    const base = Math.max(60, Math.hypot(w * s0, h * s0) / 2);
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      const d = ((ev.clientX - sx) + (ev.clientY - sy)) / (2 * stageScale);
      const ns = Math.max(0.05, Math.min(6, +(s0 * (1 + d / base)).toFixed(3)));
      editProp(obj.id, "scale", ns);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* rotation grip — drag around the object's center; shift snaps to 15° */
  const onRotateDown = (e, obj) => {
    e.stopPropagation();
    if (obj.locked) return;
    setSelIds([obj.id]);
    const wrap = e.currentTarget.parentElement.getBoundingClientRect();
    const cx = wrap.left + wrap.width / 2, cy = wrap.top + wrap.height / 2;
    const r0 = valueAt(obj, "rotation", timeRef.current);
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const move = (ev) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let nr = Math.round(r0 + ((a - a0) * 180) / Math.PI);
      if (ev.shiftKey) nr = Math.round(nr / 15) * 15;
      editProp(obj.id, "rotation", Math.max(-360, Math.min(360, nr)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* drag a single path point */
  const onPathPtDown = (e, objId, idx) => {
    e.stopPropagation();
    const obj = ctxLayers.find((o) => o.id === objId);
    if (!obj || obj.locked) return;
    const start = obj.props.path.pts[idx].slice();
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      const nx = Math.round(start[0] + (ev.clientX - sx) / stageScale);
      const ny = Math.round(start[1] + (ev.clientY - sy) / stageScale);
      patchPath(objId, (p) => ({ ...p, pts: p.pts.map((pt, i) => (i === idx ? [nx, ny] : pt)) }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------- scrub / kf drag / bar move + trim ---------- */
  const scrubFromEvent = (ev) => {
    const r = rulerRef.current.getBoundingClientRect();
    setTime(Math.round(clamp01((ev.clientX - r.left) / r.width) * ctxDur / 10) * 10);
  };
  const onRulerDown = (e) => {
    if (e.button === 2) return;
    setPlaying(false);
    scrubFromEvent(e);
    const move = (ev) => scrubFromEvent(ev);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------- timeline vertical resize (top-edge handle) ---------- */
  const persistTlH = (h) => { try { localStorage.setItem(TL_H_KEY, String(Math.round(h))); } catch { /* storage unavailable — height just won't persist */ } };
  const onTlHandleDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY, startH = tlH;
    setTlDragging(true);
    const move = (ev) => setTlH(clampTlH(startH + (startY - ev.clientY)));
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setTlDragging(false);
      const h = clampTlH(startH + (startY - ev.clientY));
      setTlH(h);
      persistTlH(h);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resetTlH = () => { setTlH(TL_H_DEFAULT); persistTlH(TL_H_DEFAULT); };
  const onKfDown = (e, objId, prop, k0) => {
    if (e.button === 2) return;
    e.stopPropagation();
    setSelIds([objId]);
    const obj = ctxLayers.find((o) => o.id === objId);
    if (obj?.locked) { setSelKf({ objId, prop, t: k0.t }); return; }
    let moved = false;
    let curT = k0.t;
    const { v: kv, ease: ke } = k0;
    const lo = obj ? obj.props.inT || 0 : 0;
    const hi = obj ? layerOut(obj, ctxDur) : ctxDur;
    const r = rulerRef.current.getBoundingClientRect();
    const move = (ev) => {
      let nt = Math.round(clamp01((ev.clientX - r.left) / r.width) * ctxDur / 10) * 10;
      nt = Math.max(lo, Math.min(hi, nt));
      if (Math.abs(nt - k0.t) > 20) moved = true;
      if (moved && nt !== curT) {
        const prev = curT;
        curT = nt;
        patchObject(objId, (o) => {
          const track = (o.tracks[prop] || []).filter((kk) => Math.abs(kk.t - prev) > 5 && Math.abs(kk.t - nt) > 5);
          track.push({ t: nt, v: kv, ease: ke });
          track.sort((a, b) => a.t - b.t);
          return { ...o, tracks: { ...o.tracks, [prop]: track } };
        });
        setSelKf({ objId, prop, t: nt });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) { setTime(k0.t); setSelKf({ objId, prop, t: k0.t }); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* bar body drag = move (keys travel) · edge drag = trim, keyframes stretch to stay inside */
  const onBarDown = (e, obj, mode) => {
    if (e.button === 2) return;
    e.stopPropagation();
    setSelIds([obj.id]);
    if (obj.locked) return;
    const r = rulerRef.current.getBoundingClientRect();
    const sx = e.clientX;
    const isClip = obj.type === "clip";
    const startIn = isClip ? obj.props.start : obj.props.inT || 0;
    const startOut = isClip ? obj.props.start + obj.props.dur / (obj.props.speed || 1) : layerOut(obj, ctxDur);
    const base = JSON.parse(JSON.stringify(obj));
    let applied = 0;
    const remap = (ni, no) => {
      const n = JSON.parse(JSON.stringify(base));
      const span = Math.max(1, startOut - startIn);
      const f = (t) => Math.round((ni + ((t - startIn) * (no - ni)) / span) / 10) * 10;
      Object.keys(n.tracks).forEach((p) => {
        n.tracks[p] = n.tracks[p].map((k) => ({ ...k, t: Math.max(ni, Math.min(no, f(k.t))) }));
        n.tracks[p].sort((a, b) => a.t - b.t);
      });
      if (isClip) {
        const oldDur = n.props.dur;
        n.props.start = ni;
        n.props.dur = Math.max(100, Math.round((no - ni) * (n.props.speed || 1)));
        if (stretchClips && n.props.dur !== oldDur) n.children = n.children.map((c) => scaleLayerTimes(c, n.props.dur / Math.max(1, oldDur)));
      } else {
        const k = (no - ni) / span;
        n.props.inT = ni;
        n.props.outT = no;
        if (n.type === "number" || n.type === "map") { n.props.start = f(n.props.start); n.props.dur = Math.max(100, Math.round(n.props.dur * k)); }
        if (n.type === "confetti") n.props.burst = f(n.props.burst);
        if (n.type === "text" && n.props.textFx) n.props.textFx = { ...n.props.textFx, start: f(n.props.textFx.start) };
        if (n.type === "world") n.props.hi = normHi(n.props.hi).map((h) => ({ ...h, t: f(h.t), ...(h.out != null ? { out: f(h.out) } : {}) }));
      }
      return n;
    };
    const move = (ev) => {
      const dt = Math.round(((ev.clientX - sx) / r.width) * ctxDur / 10) * 10;
      if (mode === "move") {
        if (Math.abs(dt) < 10) return;
        const lim = Math.max(-startIn, Math.min(ctxDur - startOut, dt));
        const step = lim - applied;
        if (!step) return;
        applied = lim;
        if (isClip) patchObject(obj.id, (o) => { const n = JSON.parse(JSON.stringify(o)); n.props.start += step; Object.keys(n.tracks).forEach((p) => (n.tracks[p] = n.tracks[p].map((k) => ({ ...k, t: k.t + step })))); return n; });
        else patchObject(obj.id, (o) => shiftLayerTimes(o, step, ctxDur));
      } else if (mode === "in") {
        const ni = Math.max(0, Math.min(startOut - 100, startIn + dt));
        patchObject(obj.id, () => remap(ni, startOut));
      } else {
        const no = Math.max(startIn + 100, Math.min(ctxDur, startOut + dt));
        patchObject(obj.id, () => remap(startIn, no));
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* ---------- audio lane: click selects (opens the panel when empty), bar drag retimes startT ---------- */
  const onAudioLaneDown = (e) => {
    if (e.button === 2) return;
    e.stopPropagation();
    if (audioTrack) selectAudio();
    else setAudioOpen(true);
  };
  /* bar body drag = move start offset, snapped to 100ms, clamped inside the composition */
  const onAudioBarDown = (e) => {
    if (e.button === 2) return;
    e.stopPropagation();
    selectAudio();
    const r = rulerRef.current.getBoundingClientRect();
    const move = (ev) => {
      const nt = Math.round(clamp01((ev.clientX - r.left) / r.width) * ctxDur / 100) * 100;
      patchAudio({ startT: Math.max(0, Math.min(ctxDur - 100, nt)) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* drag a world-map country marker (appear/disappear) on the timeline */
  const onWorldKfDown = (e, objId, cc, kind, t0) => {
    if (e.button === 2) return;
    e.stopPropagation();
    setSelIds([objId]);
    const obj = ctxLayers.find((o) => o.id === objId);
    if (obj?.locked) return;
    const r = rulerRef.current.getBoundingClientRect();
    let moved = false;
    const move = (ev) => {
      const nt = Math.round(clamp01((ev.clientX - r.left) / r.width) * ctxDur / 10) * 10;
      if (Math.abs(nt - t0) > 20) moved = true;
      if (moved) patchObject(objId, (o) => ({ ...o, props: { ...o.props, hi: normHi(o.props.hi).map((h) => (h.cc === cc ? { ...h, [kind]: nt } : h)) } }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (!moved) setTime(t0); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* right-click a lane → segment easing menu */
  const onLaneContext = (e, obj) => {
    e.preventDefault();
    e.stopPropagation();
    const r = rulerRef.current.getBoundingClientRect();
    const t = clamp01((e.clientX - r.left) / r.width) * ctxDur;
    const segs = [];
    [...KF_PROPS, "shape"].forEach((p) => {
      const tr = obj.tracks[p] || [];
      for (let i = 0; i < tr.length - 1; i++) if (t >= tr[i].t && t <= tr[i + 1].t) segs.push({ prop: p, a: tr[i], b: tr[i + 1] });
    });
    setSelIds([obj.id]);
    setMenu({ kind: "segment", x: e.clientX, y: e.clientY, objId: obj.id, segs, locked: obj.locked });
  };
  const onLayerContext = (e, obj) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selIds.includes(obj.id)) setSelIds([obj.id]);
    setMenu({ kind: "layer", x: e.clientX, y: e.clientY, objId: obj.id, isClip: obj.type === "clip", locked: obj.locked, hidden: obj.hidden, multi: selIds.includes(obj.id) && selIds.length > 1 });
  };

  const selectedKfData = useMemo(() => {
    if (!selKf) return null;
    const o = ctxLayers.find((x) => x.id === selKf.objId);
    const k = o && kfAt(o.tracks[selKf.prop], selKf.t);
    return k ? { ...selKf, k } : null;
  }, [selKf, ctxLayers]);

  const fmt = (ms) => `${Math.floor(ms / 1000)}:${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`;
  const SW = brand.colors;
  /* audio lane is selected only while no layer selection supersedes it */
  const audioLaneSel = audioSel && !!audioTrack && selIds.length === 0;
  /* bar length: the file's own duration once known, else to the end of the comp (min 100ms so it stays grabbable) */
  const audioBarMs = audioTrack ? Math.max(100, Math.min(ctxDur - audioTrack.startT, audioDurMs != null ? Math.min(audioDurMs, ctxDur) : ctxDur - audioTrack.startT)) : 0;
  const audioAssets = (assets || []).filter((a) => a.kind === "audio");
  const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  const stageCX = stage.w / 2, stageCY = stage.h / 2;
  const flowText = !!(sel && sel.type === "text" && sel.props.path && (sel.props.pathMode || "flow") === "flow");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.bg0, color: C.txt, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, userSelect: "none", overflow: "hidden" }}>
      <style>{`
        @import url('${FONT_IMPORT}');
        *::-webkit-scrollbar{width:8px;height:8px} *::-webkit-scrollbar-thumb{background:${C.line};border-radius:4px}
        input[type=range]{-webkit-appearance:none;height:3px;background:${C.line};border-radius:2px;outline:none;width:100%}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:${C.amber};cursor:pointer}
        input[type=color]{border:none;background:none;width:24px;height:24px;padding:0;cursor:pointer}
        input[type=color]::-webkit-color-swatch{border:1px solid ${C.line};border-radius:6px}
        button{font-family:inherit}
        select{background:${C.bg2};border:1px solid ${C.line};color:${C.txt};border-radius:6px;padding:5px 8px;font-size:12px;outline:none;width:100%}
        .gd-btn{transition:background-color 120ms ease-out,border-color 120ms ease-out,color 120ms ease-out,filter 120ms ease-out}
        .gd-btn:hover{background:${C.bg3} !important}
        .gd-btn-accent{transition:background 120ms ease-out}
        .gd-btn-accent:hover{background:${C.amberDim} !important}
        .gd-kf:hover{transform:translate(-50%,-50%) rotate(45deg) scale(1.3) !important}
        .gd-kfc:hover{transform:translate(-50%,-50%) scale(1.3) !important}
        @keyframes gdPanelIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        .gd-panel{animation:gdPanelIn 160ms ease-out}
        .gd-asset{transition:border-color 120ms ease-out}
        .gd-asset:hover{border-color:${C.amber} !important}
        .gd-name-input{background:transparent;border:1px solid transparent;border-radius:6px;color:${C.txt};padding:4px 8px;font-size:12.5px;font-weight:600;font-family:inherit;outline:none;transition:border-color 120ms ease-out,background 120ms ease-out}
        .gd-name-input:hover{border-color:${C.line}}
        .gd-name-input:focus{border-color:${C.amber};background:${C.bg2}}
        .gd-tl-handle-line{opacity:0;transition:opacity 120ms ease-out}
        .gd-tl-handle:hover .gd-tl-handle-line{opacity:1}
        .gd-tl-handle.gd-dragging .gd-tl-handle-line{opacity:1}
      `}</style>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickImage} />
      <input ref={assetFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={onPickAsset} />
      <input ref={audioFileRef} type="file" accept={AUDIO_ACCEPT_ATTR} style={{ display: "none" }} onChange={onPickAudioAsset} />

      {/* ============ TOP BAR ============ */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 44, background: C.bg1, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 15, letterSpacing: 0.4, whiteSpace: "nowrap" }}>
          Graphic<span style={{ color: C.amber }}>Destination</span>
          <span style={{ color: C.faint, fontWeight: 500, marginLeft: 8, fontSize: 12 }}>MOTION · v0.5</span>
        </div>
        <input className="gd-name-input" value={name} onChange={(e) => setName(e.target.value)} title="Project name" aria-label="Project name" style={{ width: 150 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, overflow: "hidden" }}>
          <button className="gd-btn" onClick={() => exitToDepth(0)} style={{ background: !inClip ? C.bg3 : "transparent", border: "none", color: !inClip ? C.txt : C.dim, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Main</button>
          {ctx.names.map((nm, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: C.faint }}>▸</span>
              <button className="gd-btn" onClick={() => exitToDepth(i + 1)} style={{ background: i === ctx.names.length - 1 ? C.bg3 : "transparent", border: "none", color: i === ctx.names.length - 1 ? C.amber : C.dim, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{nm}</button>
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select value={`${stage.w}x${stage.h}`} onChange={(e) => { const p = STAGE_PRESETS.find((s) => `${s.w}x${s.h}` === e.target.value); if (p) setStage({ w: p.w, h: p.h }); }} style={{ width: 150 }}>
          {STAGE_PRESETS.map((p) => <option key={p.id} value={`${p.w}x${p.h}`}>{p.name}</option>)}
        </select>
        <button className="gd-btn" onClick={() => setBrandOpen(true)} style={{ background: C.bg2, border: `1px solid ${C.line}`, color: C.txt, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ display: "flex", gap: 2 }}>{brand.colors.slice(0, 3).map((c, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: c }} />)}</span>
          Brand
        </button>
        <button className="gd-btn" onClick={() => { setIoOpen(true); setImportErr(""); }} style={{ background: C.bg2, border: `1px solid ${C.line}`, color: C.txt, borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>Save / Load</button>
        <button className="gd-btn-accent" onClick={() => setExportOpen(true)} title="Export video — WebM in-browser, MP4 server render" style={{ background: C.amber, color: "#1A1405", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 1.5v6.2M3.7 5.6 6 7.9l2.3-2.3M1.8 9.2v.9a.9.9 0 0 0 .9.9h6.6a.9.9 0 0 0 .9-.9v-.9" /></svg>
          Export
        </button>
      </div>

      {/* ============ MAIN ============ */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        <div style={{ width: 76, background: C.bg1, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 9, flexShrink: 0, zIndex: 20, overflowY: "auto" }}>
          <RailBtn label="Shapes" active={shapesOpen} onClick={() => setShapesOpen(!shapesOpen)} glyph={<svg width="19" height="19" viewBox="0 0 100 100"><polygon points={ptsToStr(SHAPE_DEFS.star.pts)} fill={C.dim} /></svg>} />
          <RailBtn label="Text" onClick={() => addObject("text")} glyph={<div style={{ color: C.dim, fontWeight: 800, fontSize: 15 }}>T</div>} />
          <RailBtn label="Image" active={imagesOpen} onClick={() => setImagesOpen(!imagesOpen)} glyph={<div style={{ width: 18, height: 14, border: `2px solid ${C.dim}`, borderRadius: 3, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", width: 7, height: 7, background: C.dim, transform: "rotate(45deg)", bottom: -4, left: 3 }} /></div>} />
          <RailBtn label="Audio" active={audioOpen} onClick={() => setAudioOpen(!audioOpen)} glyph={<NoteIcon size={18} color={audioTrack ? C.amber : C.dim} />} />
          <RailBtn label="Number" onClick={() => addObject("number")} glyph={<div style={{ color: C.dim, fontWeight: 800, fontSize: 12.5, fontFamily: "'JetBrains Mono'" }}>123</div>} />
          <RailBtn label="Charts" onClick={() => addObject("chart")} glyph={<div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 16 }}><div style={{ width: 4, height: 8, background: C.dim, borderRadius: 1 }} /><div style={{ width: 4, height: 15, background: C.dim, borderRadius: 1 }} /><div style={{ width: 4, height: 11, background: C.dim, borderRadius: 1 }} /></div>} />
          <RailBtn label="Maps" active={mapsOpen} onClick={() => setMapsOpen(!mapsOpen)} glyph={<svg width="19" height="19" viewBox="0 0 100 102"><path d={ringsToPath(MAPS.IND.rings)} fill="none" stroke={C.dim} strokeWidth="5" /></svg>} />
          <RailBtn label="Confetti" onClick={() => addObject("confetti")} glyph={<div style={{ fontSize: 14 }}>🎉</div>} />
          <div style={{ height: 1, width: 44, background: C.line }} />
          <RailBtn label="Clip" onClick={() => addObject("clip")} glyph={<div style={{ position: "relative", width: 20, height: 16 }}><div style={{ position: "absolute", inset: "0 4px 4px 0", border: `2px solid ${C.dim}`, borderRadius: 3 }} /><div style={{ position: "absolute", inset: "4px 0 0 4px", border: `2px solid ${C.dim}`, borderRadius: 3, background: C.bg2 }} /></div>} />
        </div>

        {/* shapes folder with search */}
        {shapesOpen && (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <input autoFocus value={shapeQ} onChange={(e) => setShapeQ(e.target.value)} placeholder="Search shapes…" style={{ ...inputStyle, marginBottom: 9 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, maxHeight: 210, overflowY: "auto" }}>
              {SHAPE_IDS.filter((sid) => SHAPE_DEFS[sid].name.toLowerCase().includes(shapeQ.toLowerCase())).map((sid) => (
                <button key={sid} className="gd-btn" title={SHAPE_DEFS[sid].name} onClick={() => addObject("shape", { shape: sid })}
                  style={{ background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 6, padding: 7, cursor: "pointer", aspectRatio: "1" }}>
                  <svg width="100%" height="100%" viewBox="-6 -6 112 112"><polygon points={ptsToStr(SHAPE_DEFS[sid].pts)} fill={C.dim} /></svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* maps drawer */}
        {mapsOpen && (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Maps</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <button className="gd-btn" onClick={() => { addObject("map"); setMapsOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                <svg width="26" height="26" viewBox="0 0 100 102" style={{ flexShrink: 0 }}><path d={ringsToPath(MAPS.IND.rings)} fill="none" stroke={C.amber} strokeWidth="6" /></svg>
                <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>Country Map</div><div style={{ fontSize: 10, color: C.faint }}>One real country outline · border FX</div></span>
              </button>
              <button className="gd-btn" onClick={() => { addObject("world"); setMapsOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${C.amber}`, position: "relative", flexShrink: 0 }}><div style={{ position: "absolute", inset: "4px 9px", borderLeft: `1.5px solid ${C.amber}`, borderRight: `1.5px solid ${C.amber}`, borderRadius: "50%" }} /></div>
                <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>World Map</div><div style={{ fontSize: 10, color: C.faint }}>177 countries · timed reveals + auto-zoom</div></span>
              </button>
              <button className="gd-btn" onClick={() => { addObject("continent"); setMapsOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                <svg width="26" height="26" viewBox="0 0 100 100" style={{ flexShrink: 0 }}><circle cx="50" cy="50" r="42" fill="none" stroke={C.amber} strokeWidth="6" strokeDasharray="16 10" /></svg>
                <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>Continent Map</div><div style={{ fontSize: 10, color: C.faint }}>All countries in a region · same border FX</div></span>
              </button>
            </div>
          </div>
        )}

        {/* images drawer: upload + your asset library */}
        {imagesOpen && (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <button className="gd-btn-accent" onClick={() => assetFileRef.current?.click()} disabled={assetUploading}
              style={{ width: "100%", background: C.amber, color: "#1A1405", border: "none", borderRadius: 6, padding: "8px 0", cursor: assetUploading ? "default" : "pointer", fontWeight: 700, fontSize: 12.5, opacity: assetUploading ? 0.65 : 1 }}>
              {assetUploading ? "Uploading…" : "Upload image"}
            </button>
            {assetErr && <div style={{ color: C.danger, fontSize: 11.5, lineHeight: 1.5, marginTop: 9 }}>{assetErr}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "13px 0 8px" }}>
              <div style={sectionLabel}>Your assets</div>
              {assetsBusy && <div style={{ fontSize: 10.5, color: C.faint }}>Loading…</div>}
            </div>
            {assets === null ? (
              assetErr
                ? <button className="gd-btn" onClick={refreshAssets} style={{ ...chipStyle, cursor: "pointer" }}>Retry</button>
                : <div style={{ color: C.faint, fontSize: 12 }}>Loading…</div>
            ) : assets.length === 0 ? (
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>Upload your logo or image to use it in videos</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 48px)", gap: 8, maxHeight: 264, overflowY: "auto" }}>
                {assets.map((a) => (
                  <div key={a.id} style={{ position: "relative", width: 48, height: 48 }}>
                    <button className="gd-asset" title={`${a.name} — click to add`} onClick={() => addAssetLayer(a)}
                      style={{ width: 48, height: 48, padding: 0, background: C.bg3, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", overflow: "hidden", display: "block" }}>
                      <img src={a.url} alt={a.name} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
                    </button>
                    <button title={`Delete ${a.name}`} aria-label={`Delete ${a.name}`} onClick={() => onDeleteAsset(a)}
                      style={{ position: "absolute", top: 2, right: 2, width: 15, height: 15, borderRadius: "50%", background: "rgba(10,12,16,0.88)", border: `1px solid ${C.lineStrong}`, color: C.dim, fontSize: 10, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* audio drawer: upload + attached track + reusable audio assets */}
        {audioOpen && (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <button className="gd-btn-accent" onClick={() => audioFileRef.current?.click()} disabled={audioUploading}
              style={{ width: "100%", background: C.amber, color: "#1A1405", border: "none", borderRadius: 6, padding: "8px 0", cursor: audioUploading ? "default" : "pointer", fontWeight: 700, fontSize: 12.5, opacity: audioUploading ? 0.65 : 1 }}>
              {audioUploading ? "Uploading…" : "Upload audio"}
            </button>
            <div style={{ color: C.faint, fontSize: 10.5, marginTop: 6, lineHeight: 1.5 }}>MP3, WAV, OGG, M4A or AAC · 5 MB max</div>
            {audioErr && <div style={{ color: C.danger, fontSize: 11.5, lineHeight: 1.5, marginTop: 9 }}>{audioErr}</div>}

            <div style={{ ...sectionLabel, margin: "13px 0 8px" }}>Attached track</div>
            {audioTrack ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg1, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 9px" }}>
                <NoteIcon size={15} color={C.amber} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div title={audioTrack.name} style={{ fontSize: 12, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{audioTrack.name}</div>
                  <div style={{ fontSize: 10, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>starts {fmt(audioTrack.startT)} · vol {audioTrack.volume.toFixed(2)}</div>
                </div>
                <button title="Detach audio from this project" aria-label="Detach audio" onClick={detachAudio}
                  style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(10,12,16,0.88)", border: `1px solid ${C.lineStrong}`, color: C.dim, fontSize: 11, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>×</button>
              </div>
            ) : (
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>Nothing attached — upload a track or pick one below.</div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "13px 0 8px" }}>
              <div style={sectionLabel}>Your audio</div>
              {assetsBusy && <div style={{ fontSize: 10.5, color: C.faint }}>Loading…</div>}
            </div>
            {assets === null ? (
              assetErr
                ? <button className="gd-btn" onClick={refreshAssets} style={{ ...chipStyle, cursor: "pointer" }}>Retry</button>
                : <div style={{ color: C.faint, fontSize: 12 }}>Loading…</div>
            ) : audioAssets.length === 0 ? (
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>No audio uploaded yet — it will appear here to reuse across projects.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {audioAssets.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg1, border: `1px solid ${audioTrack?.src === a.url ? C.amber : C.line}`, borderRadius: 8, padding: "7px 9px" }}>
                    <NoteIcon size={14} color={audioTrack?.src === a.url ? C.amber : C.faint} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={a.name} style={{ fontSize: 11.5, fontWeight: 600, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                      <div style={{ fontSize: 9.5, color: C.faint }}>{fmtBytes(a.size)}</div>
                    </div>
                    <button className="gd-btn" onClick={() => attachAudioAsset(a)} disabled={audioTrack?.src === a.url}
                      style={{ ...chipStyle, cursor: audioTrack?.src === a.url ? "default" : "pointer", padding: "3px 9px", fontSize: 10.5, flexShrink: 0, borderColor: audioTrack?.src === a.url ? C.amber : C.line, color: audioTrack?.src === a.url ? C.amber : C.dim }}>
                      {audioTrack?.src === a.url ? "Attached" : "Attach"}
                    </button>
                    <button title={`Delete ${a.name}`} aria-label={`Delete ${a.name}`} onClick={() => onDeleteAudioAsset(a)}
                      style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(10,12,16,0.88)", border: `1px solid ${C.lineStrong}`, color: C.dim, fontSize: 10, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- stage ---- */}
        <div ref={stageWrapRef} onPointerDown={() => { setSelIds([]); setSelKf(null); setAudioSel(false); setShapesOpen(false); setMapsOpen(false); setImagesOpen(false); setAudioOpen(false); }}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg0, minWidth: 0, position: "relative", overflow: "hidden", pointerEvents: tlDragging ? "none" : undefined }}>
          {/* manual zoom: inner scroller pans the padded canvas area (margin:auto centers until larger than the viewport);
              floating overlays stay pinned because the scroller is a sibling. fit mode: display:contents = zero layout change */}
          <div ref={stageScrollRef} style={zoomed ? { position: "absolute", inset: 0, overflow: "auto", display: "flex" } : { display: "contents" }}>
          <div style={zoomed ? { width: stage.w * stageScale + STAGE_PAD * 2, height: stage.h * stageScale + STAGE_PAD * 2, margin: "auto", flexShrink: 0, position: "relative", overflow: "hidden" } : { display: "contents" }}>
          <div style={{ width: stage.w, height: stage.h, transform: `scale(${stageScale})`, background: stageBg, borderRadius: 6, boxShadow: inClip ? `0 0 0 2px ${C.amber}55, 0 8px 50px rgba(0,0,0,.55)` : "0 8px 50px rgba(0,0,0,.55)", position: zoomed ? "absolute" : "relative", overflow: overflowShow ? "visible" : "hidden", flexShrink: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.045) 1px, transparent 1px)", backgroundSize: "36px 36px", ...(zoomed ? { left: STAGE_PAD, top: STAGE_PAD, transformOrigin: "0 0" } : null) }}>
            {inClip && ctx.clip?.props.bg && <div style={{ position: "absolute", inset: 0, background: ctx.clip.props.bg, pointerEvents: "none" }} />}
            {ctxLayers.map((obj) => (
              <StageObject key={obj.id} obj={obj} time={time} stage={stage} selected={selIds.includes(obj.id)} onDown={onObjectDown} onEnterClip={enterClip} displayValue={displayValue} onResize={onResizeDown} onRotate={onRotateDown} interactive />
            ))}
            {overflowShow && <>
              <div style={{ position: "absolute", left: -4000, top: -4000, width: 9000, height: 4000, background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: -4000, top: "100%", width: 9000, height: 4000, background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: -4000, top: 0, width: 4000, height: "100%", background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: "100%", top: 0, width: 4000, height: "100%", background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, border: "1px dashed rgba(245,165,36,.4)", zIndex: 71, pointerEvents: "none" }} />
            </>}
            {sel && sel.props.path && (sel.props.path.show || selIds.includes(sel.id)) && (
              <PathEditor obj={sel} onPtDown={onPathPtDown} patchPath={patchPath} locked={sel.locked} />
            )}
          </div>
          </div>
          </div>
          {inClip && (
            <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: C.amberSoft, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 999, padding: "5px 14px", fontSize: 11.5, fontWeight: 700 }}>
              Editing clip: {ctx.names[ctx.names.length - 1]} — Esc to go back
            </div>
          )}
          <div style={{ position: "absolute", bottom: 8, left: 14, color: C.faint, fontSize: 10.5, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>
            <span onClick={() => setOverflowShow(!overflowShow)} style={{ cursor: "pointer", color: overflowShow ? C.amber : C.faint, marginRight: 8 }}>[{overflowShow ? "workspace: showing off-canvas" : "workspace: hidden"}]</span>{stage.w}×{stage.h} · space play · ⌘click multi · ⌘G group · ⌘D dup · right-click timeline = easing
          </div>

          {/* ---- zoom controls (bottom-right) ---- */}
          <div onPointerDown={(e) => e.stopPropagation()}
            style={{ position: "absolute", right: 14, bottom: 8, display: "flex", alignItems: "center", gap: 2, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 6, padding: 3, zIndex: 80 }}>
            <button className="gd-btn" onClick={() => stepZoom(-1)} title="Zoom out" style={zoomCtlBtn}>−</button>
            <button className="gd-btn" onClick={cycleZoom} title="Zoom — click to cycle Fit → 100% → 50% → 25%"
              style={{ ...zoomCtlBtn, minWidth: 52, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
              {Math.round((zoomMode === "fit" ? stageScale : zoomMode) * 100)}%
            </button>
            <button className="gd-btn" onClick={() => stepZoom(1)} title="Zoom in" style={zoomCtlBtn}>+</button>
            <div style={{ width: 1, height: 16, background: C.line, margin: "0 2px" }} />
            <button className="gd-btn" onClick={() => setZoom("fit")} title="Fit stage to the available space"
              style={{ ...zoomCtlBtn, padding: "0 10px", fontSize: 11.5, fontWeight: 700, color: zoomMode === "fit" ? C.amber : C.dim }}>Fit</button>
          </div>
        </div>

        {/* ---- inspector ---- */}
        <div style={{ width: 280, background: C.bg1, borderLeft: `1px solid ${C.line}`, overflowY: "auto", flexShrink: 0, padding: "12px 12px 30px" }}>
          {audioLaneSel ? (
            <Card title="Audio track" hint="main timeline">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <NoteIcon size={16} color={C.amber} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div title={audioTrack.name} style={{ fontSize: 12.5, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{audioTrack.name}</div>
                  <div style={{ fontSize: 10, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>starts {fmt(audioTrack.startT)} · drag the lane bar to retime</div>
                </div>
              </div>
              <SliderRow label="Volume" min={0} max={1} step={0.01} value={audioTrack.volume} onChange={(v) => patchAudio({ volume: v })} />
              <Row label="Fade in">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="number" min={0} step={100} value={audioTrack.fadeIn} onChange={(e) => patchAudio({ fadeIn: Math.max(0, Math.round(parseFloat(e.target.value) || 0)) })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
                  <span style={{ color: C.faint, fontSize: 10.5, flexShrink: 0 }}>ms</span>
                </div>
              </Row>
              <Row label="Fade out">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="number" min={0} step={100} value={audioTrack.fadeOut} onChange={(e) => patchAudio({ fadeOut: Math.max(0, Math.round(parseFloat(e.target.value) || 0)) })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
                  <span style={{ color: C.faint, fontSize: 10.5, flexShrink: 0 }}>ms</span>
                </div>
              </Row>
              <button className="gd-btn" onClick={detachAudio} style={{ ...chipStyle, cursor: "pointer", color: C.danger, width: "100%", padding: "7px 0", marginTop: 2 }}>✕ Remove audio from project</button>
            </Card>
          ) : selMany.length > 1 ? (
            <Card title={`${selMany.length} layers selected`}>
              <button className="gd-btn" onClick={groupSelection} style={{ width: "100%", background: C.amber, color: "#1a1405", border: "none", borderRadius: 6, padding: "9px 0", cursor: "pointer", fontWeight: 700, marginBottom: 12 }}>⌘G · Group into Clip</button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
                {[["left", "⇤"], ["hcenter", "↔"], ["right", "⇥"], ["top", "⤒"], ["vcenter", "↕"], ["bottom", "⤓"]].map(([m, ic]) => (
                  <button key={m} className="gd-btn" onClick={() => align(m)} style={{ ...chipStyle, cursor: "pointer", borderRadius: 6, padding: "7px 0", textAlign: "center" }}>{ic}</button>
                ))}
              </div>
              <button className="gd-btn" onClick={duplicateSelected} style={{ ...chipStyle, cursor: "pointer", marginRight: 6 }}>⧉ Duplicate</button>
              <button className="gd-btn" onClick={removeSelected} style={{ ...chipStyle, cursor: "pointer", color: C.danger }}>✕ Delete</button>
            </Card>
          ) : !sel ? (
            <Card title={inClip ? `Clip: ${ctx.names[ctx.names.length - 1]}` : "Stage"}>
              {!inClip && <Row label="Background"><input type="color" value={stageBg} onChange={(e) => setStageBg(e.target.value)} /></Row>}
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.65 }}>
                {inClip ? "You're inside a clip — its timeline runs on local time." : "Add layers from the rail. Drag on stage with Autokey to record motion. Right-click between two ◆ on the timeline to set that segment's easing."}
              </div>
            </Card>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <input value={sel.name} onChange={(e) => patchObject(sel.id, (o) => ({ ...o, name: e.target.value }))} style={{ ...inputStyle, fontWeight: 700 }} />
                <button className="gd-btn" title={sel.hidden ? "Show" : "Hide"} onClick={() => toggleHide(sel.id)}
                  style={{ ...chipStyle, cursor: "pointer", padding: "5px 9px", borderColor: sel.hidden ? C.amber : C.line, color: sel.hidden ? C.amber : C.dim }}>{sel.hidden ? "⊘" : "◉"}</button>
                <button className="gd-btn" title={sel.locked ? "Unlock" : "Lock"} onClick={() => toggleLock(sel.id)}
                  style={{ ...chipStyle, cursor: "pointer", padding: "5px 9px", borderColor: sel.locked ? C.amber : C.line, color: sel.locked ? C.amber : C.dim }}>{sel.locked ? "🔒" : "🔓"}</button>
              </div>
              <div style={{ color: C.faint, fontSize: 11, marginBottom: 10 }}>{sel.type}{sel.type === "clip" ? ` · ${sel.children.length} layers` : ""}{sel.locked ? " · locked" : ""}{sel.hidden ? " · hidden" : ""}</div>

              {sel.type === "clip" && (
                <Card title="Clip">
                  <button className="gd-btn" onClick={() => enterClip(sel.id)} style={{ width: "100%", background: C.amber, color: "#1a1405", border: "none", borderRadius: 6, padding: "8px 0", cursor: "pointer", fontWeight: 700, marginBottom: 10 }}>Open clip timeline →</button>
                  <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 100)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                  <SliderRow label="Duration" min={300} max={15000} step={100} value={sel.props.dur} onChange={(v) => stretchClipDur(sel.id, v)} />
                  <label style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 11.5, fontWeight: 600, marginBottom: 9, cursor: "pointer" }}>
                    <input type="checkbox" checked={stretchClips} onChange={(e) => setStretchClips(e.target.checked)} />
                    Time-stretch contents with duration
                  </label>
                  <ChipRow label="Speed" options={[[0.5, "0.5×"], [1, "1×"], [1.5, "1.5×"], [2, "2×"]]} value={sel.props.speed} onChange={(v) => patchProps(sel.id, { speed: v })} />
                  <ChipRow label="After end" options={[["hold", "Hold"], ["hide", "Hide"], ["loop", "Loop"]]} value={sel.props.end} onChange={(v) => patchProps(sel.id, { end: v })} />
                  <button className="gd-btn" onClick={() => ungroupClip(sel.id)} style={{ ...chipStyle, cursor: "pointer" }}>⛓ Ungroup</button>
                </Card>
              )}
              {sel.type === "clip" && (
                <Card title="Clip background">
                  <Row label="Color">
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="gd-btn" onClick={() => patchProps(sel.id, { bg: "" })} style={{ ...chipStyle, cursor: "pointer", borderColor: !sel.props.bg ? C.amber : C.line, color: !sel.props.bg ? C.amber : C.dim }}>None</button>
                      <input type="color" value={sel.props.bg || "#141926"} onChange={(e) => patchProps(sel.id, { bg: e.target.value })} />
                    </div>
                  </Row>
                </Card>
              )}
              {sel.type === "clip" && (
                <Card title="Transitions" hint="in / out">
                  <ChipRow label="In" options={TRANSITIONS.map((t) => [t.id, t.name])} value={sel.props.tIn} onChange={(v) => patchProps(sel.id, { tIn: v })} wrap />
                  <ChipRow label="Out" options={TRANSITIONS.map((t) => [t.id, t.name])} value={sel.props.tOut} onChange={(v) => patchProps(sel.id, { tOut: v })} wrap />
                  <SliderRow label="Length" min={150} max={1500} step={10} value={sel.props.tDur} onChange={(v) => patchProps(sel.id, { tDur: v })} />
                  {sel.props.tOut !== "none" && sel.props.end !== "hide" && <div style={{ color: C.amber, fontSize: 10.5, lineHeight: 1.5 }}>Out transition plays when "After end" is set to Hide.</div>}
                </Card>
              )}

              {sel.type === "shape" && (
                <Card title="Shape" hint="click = morph keyframe">
                  <input value={morphQ} onChange={(e) => setMorphQ(e.target.value)} placeholder="Search shapes…" style={{ ...inputStyle, marginBottom: 7 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5, marginBottom: 9 }}>
                    {SHAPE_IDS.filter((sid) => SHAPE_DEFS[sid].name.toLowerCase().includes(morphQ.toLowerCase())).map((sid) => {
                      const atNow = kfAt(sel.tracks.shape, Math.round(time / 10) * 10);
                      const isCur = atNow ? atNow.v === sid : (!sel.tracks.shape?.length && sel.props.shape === sid);
                      return (
                        <button key={sid} className="gd-btn" title={SHAPE_DEFS[sid].name} onClick={() => setShapeAt(sel.id, sid)}
                          style={{ background: C.bg2, border: `1px solid ${isCur ? C.amber : C.line}`, borderRadius: 6, padding: 4, cursor: "pointer", aspectRatio: "1" }}>
                          <svg width="100%" height="100%" viewBox="-6 -6 112 112"><polygon points={ptsToStr(SHAPE_DEFS[sid].pts)} fill={isCur ? C.amber : C.dim} /></svg>
                        </button>
                      );
                    })}
                  </div>
                  <ChipRow label="Style" options={[["fill", "Fill"], ["stroke", "Border"], ["both", "Both"]]} value={sel.props.fillMode} onChange={(v) => patchProps(sel.id, { fillMode: v })} />
                  <ColorKfRow label="Fill" obj={sel} time={time} sw={SW} onEdit={(v) => editProp(sel.id, "fill", v)} onKf={(has, v) => { if (has) removeKeyframe(sel.id, "fill", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "fill", time, v); setSelKf({ objId: sel.id, prop: "fill", t: T }); } }} />
                  {sel.props.fillMode !== "fill" && (
                    <>
                      <Row label="Border"><input type="color" value={sel.props.sC} onChange={(e) => patchProps(sel.id, { sC: e.target.value })} /></Row>
                      <SliderRow label="Border W" min={1} max={16} value={sel.props.sW} onChange={(v) => patchProps(sel.id, { sW: v })} />
                    </>
                  )}
                  <SliderRow label="Corner R" min={0} max={49} value={sel.props.cornerR} onChange={(v) => patchProps(sel.id, { cornerR: v })} />
                  <SliderRow label="Width" min={20} max={900} value={sel.props.w} onChange={(v) => patchProps(sel.id, { w: v })} />
                  <SliderRow label="Height" min={20} max={900} value={sel.props.h} onChange={(v) => patchProps(sel.id, { h: v })} />
                </Card>
              )}

              {sel.type === "text" && (
                <Card title="Text">
                  <Row label="Text"><input value={sel.props.text} onChange={(e) => patchProps(sel.id, { text: e.target.value })} style={inputStyle} /></Row>
                  <FontControls P={sel.props} onChange={(patch) => patchProps(sel.id, patch)} showSpacing brand={brand} />
                  <ColorKfRow label="Color" obj={sel} time={time} sw={SW} onEdit={(v) => editProp(sel.id, "fill", v)} onKf={(has, v) => { if (has) removeKeyframe(sel.id, "fill", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "fill", time, v); setSelKf({ objId: sel.id, prop: "fill", t: T }); } }} />
                  {flowText && <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, margin: "8px 0" }}>Flowing on a path — animate with <b style={{ color: C.txt }}>Path progress</b>, <b style={{ color: C.txt }}>Rotation</b> (spins around the loop), <b style={{ color: C.txt }}>Scale</b> and <b style={{ color: C.txt }}>Opacity</b> (flow in, fade out). Text FX and boxes apply in normal or Travel mode.</div>}
                  {!flowText && <div style={{ ...sectionLabel, margin: "10px 0 6px" }}>TEXT FX · starts at playhead</div>}
                  {!flowText && sel.props.textFx && <SliderRow label="FX speed" min={0.25} max={3} step={0.05} value={sel.props.textFx.speed || 1} onChange={(v) => patchProps(sel.id, { textFx: { ...sel.props.textFx, speed: v } })} />}
                  {!flowText && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    {TEXTFX_LIST.map((fx) => {
                      const on = (sel.props.textFx?.type || "none") === fx.id;
                      return <button key={fx.id} className="gd-btn" onClick={() => patchProps(sel.id, { textFx: fx.id === "none" ? null : { type: fx.id, start: Math.round(timeRef.current / 10) * 10, seed: Math.floor(Math.random() * 9999) } })}
                        style={{ background: C.bg2, border: `1px solid ${on ? C.amber : C.line}`, color: on ? C.amber : C.txt, borderRadius: 6, padding: "6px 5px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{fx.name}</button>;
                    })}
                  </div>}
                </Card>
              )}

              {sel.type === "number" && (
                <Card title="Number">
                  <Row label="From"><input type="number" value={sel.props.from} onChange={(e) => patchProps(sel.id, { from: Math.max(0, parseFloat(e.target.value) || 0) })} style={inputStyle} /></Row>
                  <Row label="To"><input type="number" value={sel.props.to} onChange={(e) => patchProps(sel.id, { to: Math.max(0, parseFloat(e.target.value) || 0) })} style={inputStyle} /></Row>
                  <ChipRow label="Style" options={NUM_STYLES.map((s) => [s.id, s.name])} value={sel.props.style} onChange={(v) => patchProps(sel.id, { style: v })} wrap />
                  <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                  <SliderRow label="Duration" min={300} max={5000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                  <SliderRow label="Decimals" min={0} max={2} value={sel.props.decimals} onChange={(v) => patchProps(sel.id, { decimals: v })} />
                  <Row label="Prefix"><input value={sel.props.prefix} onChange={(e) => patchProps(sel.id, { prefix: e.target.value })} style={inputStyle} placeholder="$" /></Row>
                  <Row label="Suffix"><input value={sel.props.suffix} onChange={(e) => patchProps(sel.id, { suffix: e.target.value })} style={inputStyle} placeholder="+" /></Row>
                  <ChipRow label="Ease" options={[["easeOutCubic", "Out Cubic"], ["easeInOutCubic", "In-Out"], ["linear", "Linear"], ["easeInOutSine", "Apple"]]} value={sel.props.numEase} onChange={(v) => patchProps(sel.id, { numEase: v })} wrap />
                  <ChipRow label="Counter" options={[["none", "Plain"], ["ring", "Ring"], ["pie", "Pie wipe"]]} value={sel.props.ring || "none"} onChange={(v) => patchProps(sel.id, { ring: v })} />
                  {(sel.props.ring || "none") !== "none" && <>
                    <Row label="Ring"><input type="color" value={sel.props.ringC} onChange={(e) => patchProps(sel.id, { ringC: e.target.value })} /></Row>
                    <SliderRow label="Ring W" min={3} max={22} value={sel.props.ringW} onChange={(v) => patchProps(sel.id, { ringW: v })} />
                    <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5 }}>Counting down (To &lt; From)? The circle depletes like a game timer. Counting up? It fills.</div>
                  </>}
                  <FontControls P={sel.props} onChange={(patch) => patchProps(sel.id, patch)} brand={brand} />
                  <ColorKfRow label="Color" obj={sel} time={time} sw={SW} onEdit={(v) => editProp(sel.id, "fill", v)} onKf={(has, v) => { if (has) removeKeyframe(sel.id, "fill", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "fill", time, v); setSelKf({ objId: sel.id, prop: "fill", t: T }); } }} />
                </Card>
              )}

              {(sel.type === "text" || sel.type === "number") && !flowText && !(sel.type === "number" && (sel.props.ring || "none") !== "none") && (
                <Card title="Box" hint="background + border">
                  <Row label="Fill">
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="gd-btn" onClick={() => patchProps(sel.id, { bg: "" })} style={{ ...chipStyle, cursor: "pointer", borderColor: !sel.props.bg ? C.amber : C.line, color: !sel.props.bg ? C.amber : C.dim }}>None</button>
                      <input type="color" value={(sel.props.bg || "#141926").slice(0, 7)} onChange={(e) => patchProps(sel.id, { bg: e.target.value })} />
                    </div>
                  </Row>
                  <SliderRow label="Padding" min={0} max={80} value={sel.props.pad} onChange={(v) => patchProps(sel.id, { pad: v })} />
                  <SliderRow label="Radius" min={0} max={90} value={sel.props.radius} onChange={(v) => patchProps(sel.id, { radius: v })} />
                  <SliderRow label="Border W" min={0} max={8} step={0.5} value={sel.props.borderW} onChange={(v) => patchProps(sel.id, { borderW: v })} />
                  <Row label="Border"><input type="color" value={sel.props.borderC} onChange={(e) => patchProps(sel.id, { borderC: e.target.value })} /></Row>
                  <ChipRow label="Glow" options={[["none", "None"], ["glow", "Glow"], ["pulse", "Pulse"]]} value={sel.props.boxFx} onChange={(v) => patchProps(sel.id, { boxFx: v })} />
                </Card>
              )}

              {sel.type === "image" && (
                <Card title="Image">
                  <SliderRow label="Width" min={20} max={1200} value={sel.props.w} onChange={(v) => patchProps(sel.id, { w: v })} />
                  <SliderRow label="Height" min={20} max={1200} value={sel.props.h} onChange={(v) => patchProps(sel.id, { h: v })} />
                  <button className="gd-btn" onClick={() => fileRef.current?.click()} style={{ ...chipStyle, cursor: "pointer" }}>Replace image…</button>
                </Card>
              )}

              {sel.type === "map" && (
                <Card title="Country map" hint="real outlines">
                  <ChipRow label="Country" options={Object.keys(MAPS).map((cc) => [cc, MAPS[cc].name])} value={sel.props.country} onChange={(v) => patchProps(sel.id, { country: v })} wrap />
                  <ChipRow label="Effect" options={[["plain", "Plain"], ["draw", "Draw & stay"], ["comet", "Comet"], ["neon", "Neon"], ["reveal", "Draw → Glow"], ["pulse", "Glow pulse"]]} value={sel.props.mapStyle} onChange={(v) => patchProps(sel.id, { mapStyle: v })} wrap />
                  <Row label="Fill"><input type="color" value={sel.props.fillC} onChange={(e) => patchProps(sel.id, { fillC: e.target.value })} /></Row>
                  <SliderRow label="Fill op." min={0} max={1} step={0.01} value={sel.props.fillOp} onChange={(v) => patchProps(sel.id, { fillOp: v })} />
                  <Row label="Border"><input type="color" value={sel.props.stroke} onChange={(e) => patchProps(sel.id, { stroke: e.target.value })} /></Row>
                  <SliderRow label="Border W" min={0.5} max={5} step={0.1} value={sel.props.strokeW} onChange={(v) => patchProps(sel.id, { strokeW: v })} />
                  <SliderRow label="Size" min={80} max={1000} value={sel.props.w} onChange={(v) => patchProps(sel.id, { w: v })} />
                  {(sel.props.mapStyle === "draw" || sel.props.mapStyle === "reveal") && (
                    <>
                      <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                      <SliderRow label="Draw time" min={300} max={4000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                    </>
                  )}
                </Card>
              )}

              {sel.type === "world" && (
                <Card title="World map" hint="countries appear at their set time">
                  <WorldPicker hi={normHi(sel.props.hi)} fmt={fmt} zoomHoldMs={sel.props.zoomHoldMs || 1600}
                    onAdd={(cc) => patchProps(sel.id, { hi: [...normHi(sel.props.hi), { cc, t: Math.round(timeRef.current / 10) * 10, zoom: true }] })}
                    onRetime={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, t: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onRemove={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).filter((h) => h.cc !== cc) })}
                    onSetOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, out: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { out, ...rest } = h; return rest; }) })}
                    onSetZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomIn: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomIn, ...rest } = h; return rest; }) })}
                    onSetZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomOut: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomOut, ...rest } = h; return rest; }) })}
                    onToggleZoom={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoom: h.zoom === false } : h)) })} />
                  <ChipRow label="Reveal" options={[["simple", "Simple"], ["electric", "Electric"], ["pop", "Pop"], ["trace", "Trace"]]} value={sel.props.reveal || "simple"} onChange={(v) => patchProps(sel.id, { reveal: v })} />
                  <SliderRow label="Reveal ms" min={150} max={2500} step={10} value={sel.props.revealDur || 600} onChange={(v) => patchProps(sel.id, { revealDur: v })} />
                  <Row label="Highlight"><input type="color" value={sel.props.hiFill} onChange={(e) => patchProps(sel.id, { hiFill: e.target.value })} /></Row>
                  <Row label="Hi border"><input type="color" value={sel.props.hiStroke} onChange={(e) => patchProps(sel.id, { hiStroke: e.target.value })} /></Row>
                  <Row label="Base"><input type="color" value={sel.props.base} onChange={(e) => patchProps(sel.id, { base: e.target.value })} /></Row>
                  <SliderRow label="Base op." min={0.05} max={1} step={0.01} value={sel.props.baseOp} onChange={(v) => patchProps(sel.id, { baseOp: v })} />
                  <Row label="Outlines"><input type="color" value={sel.props.stroke} onChange={(e) => patchProps(sel.id, { stroke: e.target.value })} /></Row>
                  <ChipRow label="Glow" options={[[true, "On"], [false, "Off"]]} value={sel.props.glow} onChange={(v) => patchProps(sel.id, { glow: v })} />
                  <div style={{ ...sectionLabel, margin: "10px 0 5px" }}>ZOOM CAMERA</div>
                  <ChipRow label="Mode" options={[[true, "Automatic"], [false, "Manual"]]} value={sel.props.autoZoom !== false} onChange={(v) => patchProps(sel.id, { autoZoom: v })} />
                  {sel.props.autoZoom !== false ? (
                    <>
                      <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginBottom: 8 }}>Each country below has 4 independent points: appears, zoom‑in, zoom‑out, hides. Set any of them at the playhead — unset ones fall back automatically (zoom‑in = appear, zoom‑out = hide).</div>
                      <SliderRow label="Fallback ms" min={400} max={4000} step={50} value={sel.props.zoomHoldMs || 1600} onChange={(v) => patchProps(sel.id, { zoomHoldMs: v })} />
                      <SliderRow label="Ease ms" min={150} max={1500} step={10} value={sel.props.zoomTransMs || 550} onChange={(v) => patchProps(sel.id, { zoomTransMs: v })} />
                    </>
                  ) : (
                    <PropRow obj={sel} prop="focus" time={time} ctxDur={ctxDur} stage={stage}
                      onEdit={(v) => editProp(sel.id, "focus", v)}
                      onKfToggle={(has, v) => { if (has) removeKeyframe(sel.id, "focus", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "focus", time, v); setSelKf({ objId: sel.id, prop: "focus", t: T }); } }}
                      onNav={(dir) => kfNav(sel, "focus", dir)} />
                  )}
                  <SliderRow label="Zoom amount" min={1.4} max={5} step={0.1} value={sel.props.zoomK || 2.6} onChange={(v) => patchProps(sel.id, { zoomK: v })} />
                  <SliderRow label="Size" min={200} max={1400} value={sel.props.w} onChange={(v) => patchProps(sel.id, { w: v })} />
                  <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginTop: 4 }}>Keyframe <b style={{ color: C.txt }}>Zoom focus</b> in Transform — the lit countries enlarge to the map's center while the rest of the world blurs behind them.</div>
                </Card>
              )}

              {sel.type === "continent" && (
                <Card title="Continent map" hint="all countries in the region">
                  <ChipRow label="Region" options={Object.keys(CONTINENT_NAMES).map((k) => [k, CONTINENT_NAMES[k]])} value={sel.props.continent} onChange={(v) => patchProps(sel.id, { continent: v })} wrap />
                  <ChipRow label="Effect" options={[["plain", "Plain"], ["draw", "Draw & stay"], ["comet", "Comet"], ["neon", "Neon"], ["reveal", "Draw → Glow"], ["pulse", "Glow pulse"]]} value={sel.props.mapStyle} onChange={(v) => patchProps(sel.id, { mapStyle: v })} wrap />
                  <Row label="Fill"><input type="color" value={sel.props.fillC} onChange={(e) => patchProps(sel.id, { fillC: e.target.value })} /></Row>
                  <SliderRow label="Fill op." min={0} max={1} step={0.01} value={sel.props.fillOp} onChange={(v) => patchProps(sel.id, { fillOp: v })} />
                  <Row label="Border"><input type="color" value={sel.props.stroke} onChange={(e) => patchProps(sel.id, { stroke: e.target.value })} /></Row>
                  <SliderRow label="Border W" min={0.3} max={3} step={0.1} value={sel.props.strokeW} onChange={(v) => patchProps(sel.id, { strokeW: v })} />
                  <SliderRow label="Size" min={200} max={1400} value={sel.props.w} onChange={(v) => patchProps(sel.id, { w: v })} />
                  {(sel.props.mapStyle === "draw" || sel.props.mapStyle === "reveal") && (
                    <>
                      <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                      <SliderRow label="Draw time" min={300} max={5000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                    </>
                  )}
                  <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginTop: 4 }}>Every country border in the region shares this effect — the comet travels every outline, the glow lights the whole cluster.</div>
                </Card>
              )}
              {sel.type === "continent" && (
                <Card title="Highlight a country" hint="zooms in, just like World map">
                  <WorldPicker hi={normHi(sel.props.hi)} fmt={fmt} zoomHoldMs={sel.props.zoomHoldMs || 1600} scopeCodes={CONTINENTS[sel.props.continent] || []}
                    onAdd={(cc) => patchProps(sel.id, { hi: [...normHi(sel.props.hi), { cc, t: Math.round(timeRef.current / 10) * 10, zoom: true }] })}
                    onRetime={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, t: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onRemove={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).filter((h) => h.cc !== cc) })}
                    onSetOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, out: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { out, ...rest } = h; return rest; }) })}
                    onSetZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomIn: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomIn, ...rest } = h; return rest; }) })}
                    onSetZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomOut: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomOut, ...rest } = h; return rest; }) })}
                    onToggleZoom={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoom: h.zoom === false } : h)) })} />
                  <ChipRow label="Reveal" options={[["simple", "Simple"], ["electric", "Electric"], ["pop", "Pop"], ["trace", "Trace"]]} value={sel.props.reveal || "simple"} onChange={(v) => patchProps(sel.id, { reveal: v })} />
                  <SliderRow label="Reveal ms" min={150} max={2500} step={10} value={sel.props.revealDur || 600} onChange={(v) => patchProps(sel.id, { revealDur: v })} />
                  <Row label="Highlight"><input type="color" value={sel.props.hiFill} onChange={(e) => patchProps(sel.id, { hiFill: e.target.value })} /></Row>
                  <Row label="Hi border"><input type="color" value={sel.props.hiStroke} onChange={(e) => patchProps(sel.id, { hiStroke: e.target.value })} /></Row>
                  <ChipRow label="Glow" options={[[true, "On"], [false, "Off"]]} value={sel.props.glow} onChange={(v) => patchProps(sel.id, { glow: v })} />
                  {normHi(sel.props.hi).length > 0 && (
                    <>
                      <ChipRow label="Zoom" options={[[true, "Automatic"], [false, "Manual off"]]} value={sel.props.autoZoom !== false} onChange={(v) => patchProps(sel.id, { autoZoom: v })} />
                      <SliderRow label="Zoom amount" min={1.2} max={4} step={0.1} value={sel.props.zoomK || 2.2} onChange={(v) => patchProps(sel.id, { zoomK: v })} />
                      <SliderRow label="Hold fallback" min={400} max={4000} step={50} value={sel.props.zoomHoldMs || 1600} onChange={(v) => patchProps(sel.id, { zoomHoldMs: v })} />
                    </>
                  )}
                </Card>
              )}
              {sel.type === "chart" && (
                <Card title="Chart" hint="one row per line: Label, value">
                  <ChipRow label="Type" options={[["bar", "Bars"], ["line", "Line"], ["donut", "Donut"]]} value={sel.props.chartType} onChange={(v) => patchProps(sel.id, { chartType: v })} />
                  <textarea value={sel.props.dataStr} onChange={(e) => patchProps(sel.id, { dataStr: e.target.value })}
                    style={{ ...inputStyle, height: 92, resize: "none", fontFamily: "'JetBrains Mono'", fontSize: 11, marginBottom: 8 }} placeholder={"Q1, 42\nQ2, 65"} />
                  <ChipRow label="Values" options={[[true, "Show"], [false, "Hide"]]} value={sel.props.showVals} onChange={(v) => patchProps(sel.id, { showVals: v })} />
                  <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                  <SliderRow label="Duration" min={400} max={5000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                  <SliderRow label="Width" min={200} max={1100} value={sel.props.w} onChange={(v) => patchProps(sel.id, { w: v })} />
                  <SliderRow label="Height" min={140} max={800} value={sel.props.h} onChange={(v) => patchProps(sel.id, { h: v })} />
                  <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5 }}>Series colors follow the brand palette. Bars stagger in, lines draw on, donuts sweep — all easing-finished.</div>
                </Card>
              )}
              {sel.type === "chart" && (
                <Card title="Chart box" hint="background + border">
                  <Row label="Fill">
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="gd-btn" onClick={() => patchProps(sel.id, { bg: "" })} style={{ ...chipStyle, cursor: "pointer", borderColor: !sel.props.bg ? C.amber : C.line, color: !sel.props.bg ? C.amber : C.dim }}>None</button>
                      <input type="color" value={sel.props.bg || "#171B24"} onChange={(e) => patchProps(sel.id, { bg: e.target.value })} />
                    </div>
                  </Row>
                  <SliderRow label="Fill op." min={0} max={1} step={0.01} value={sel.props.bgOp} onChange={(v) => patchProps(sel.id, { bgOp: v })} />
                  <SliderRow label="Padding" min={0} max={80} value={sel.props.pad} onChange={(v) => patchProps(sel.id, { pad: v })} />
                  <SliderRow label="Radius" min={0} max={60} value={sel.props.radius} onChange={(v) => patchProps(sel.id, { radius: v })} />
                  <SliderRow label="Border W" min={0} max={8} step={0.5} value={sel.props.borderW} onChange={(v) => patchProps(sel.id, { borderW: v })} />
                  <Row label="Border"><input type="color" value={sel.props.borderC} onChange={(e) => patchProps(sel.id, { borderC: e.target.value })} /></Row>
                </Card>
              )}
              {sel.type === "confetti" && (
                <Card title="Confetti">
                  <SliderRow label="Burst" min={0} max={Math.max(100, ctxDur - 500)} step={10} value={sel.props.burst} onChange={(v) => patchProps(sel.id, { burst: v })} />
                  <SliderRow label="Particles" min={20} max={160} value={sel.props.count} onChange={(v) => patchProps(sel.id, { count: v })} />
                  <SliderRow label="Power" min={0.4} max={2} step={0.05} value={sel.props.power} onChange={(v) => patchProps(sel.id, { power: v })} />
                  <Row label="Seed"><button className="gd-btn" onClick={() => patchProps(sel.id, { seed: Math.floor(Math.random() * 9999) })} style={{ ...chipStyle, cursor: "pointer" }}>#{sel.props.seed} · shuffle</button></Row>
                </Card>
              )}

              {(sel.type === "shape" || sel.type === "text" || sel.type === "image" || sel.type === "number") && (
                <Card title="Motion path" hint={sel.props.path ? "object follows the line" : ""}>
                  {!sel.props.path ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="gd-btn" onClick={() => addPathTo(sel.id, "line")} style={{ ...chipStyle, cursor: "pointer" }}>─ Line path</button>
                      <button className="gd-btn" onClick={() => addPathTo(sel.id, "circle")} style={{ ...chipStyle, cursor: "pointer" }}>◯ Circle path</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => ({ ...p, show: !p.show }))} style={{ ...chipStyle, cursor: "pointer", borderColor: sel.props.path.show ? C.amber : C.line, color: sel.props.path.show ? C.amber : C.dim }}>{sel.props.path.show ? "Guide on" : "Guide off"}</button>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => ({ ...p, curved: !p.curved }))} style={{ ...chipStyle, cursor: "pointer", borderColor: sel.props.path.curved ? C.amber : C.line, color: sel.props.path.curved ? C.amber : C.dim }}>{sel.props.path.curved ? "Curved" : "Straight"}</button>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => ({ ...p, closed: !p.closed }))} style={{ ...chipStyle, cursor: "pointer", borderColor: sel.props.path.closed ? C.amber : C.line, color: sel.props.path.closed ? C.amber : C.dim }}>{sel.props.path.closed ? "Closed loop" : "Open ends"}</button>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => { const l = p.pts[p.pts.length - 1]; return { ...p, pts: [...p.pts, [Math.min(stage.w - 40, l[0] + 160), l[1]]] }; })} style={{ ...chipStyle, cursor: "pointer" }}>＋ Point</button>
                        <button className="gd-btn" onClick={() => patchProps(sel.id, { path: null })} style={{ ...chipStyle, cursor: "pointer", color: C.danger }}>✕ Remove</button>
                      </div>
                      {sel.type === "text" && <ChipRow label="Text" options={[["flow", "Flows on path"], ["travel", "Travels the path"]]} value={sel.props.pathMode || "flow"} onChange={(v) => patchProps(sel.id, { pathMode: v })} />}
                      <button className="gd-btn" onClick={() => animateAlongPath(sel.id)} style={{ width: "100%", background: C.bg2, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 6, padding: "7px 0", cursor: "pointer", fontWeight: 700, marginBottom: 6 }}>▶ Animate along path (adds ◆ 0 → 1)</button>
                      <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5 }}>Drag the round handles on stage to reshape · drag the object to move the whole path · keyframe "Path progress" below.</div>
                    </>
                  )}
                </Card>
              )}

              {sel.type !== "confetti" && (
                <Card title="Transform" hint="◆ keyframe · ‹ › jump">
                  {(sel.type === "world" ? (sel.props.autoZoom !== false ? ["x", "y", "scale", "rotation", "opacity"] : ["x", "y", "scale", "rotation", "opacity", "focus"]) : sel.props.path ? ["prog", "scale", "rotation", "opacity"] : ["x", "y", "scale", "rotation", "opacity"]).map((p) => (
                    <PropRow key={p} obj={sel} prop={p} time={time} ctxDur={ctxDur} stage={stage}
                      onEdit={(v) => editProp(sel.id, p, v)}
                      onKfToggle={(has, v) => { if (has) removeKeyframe(sel.id, p, Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, p, time, v); setSelKf({ objId: sel.id, prop: p, t: T }); } }}
                      onNav={(dir) => kfNav(sel, p, dir)} />
                  ))}
                </Card>
              )}
              {sel.type === "confetti" && (
                <Card title="Position">
                  {["x", "y"].map((p) => (
                    <PropRow key={p} obj={sel} prop={p} time={time} ctxDur={ctxDur} stage={stage}
                      onEdit={(v) => editProp(sel.id, p, v)}
                      onKfToggle={(has, v) => { if (has) removeKeyframe(sel.id, p, Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, p, time, v); setSelKf({ objId: sel.id, prop: p, t: T }); } }}
                      onNav={(dir) => kfNav(sel, p, dir)} />
                  ))}
                </Card>
              )}

              {selectedKfData && selectedKfData.objId === sel.id && (
                <Card title="Easing" hint={`${PROP_LABEL[selectedKfData.prop]} @ ${fmt(selectedKfData.t)}`}>
                  <EaseCurve ease={selectedKfData.k.ease} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {Object.keys(EASE).map((e) => (
                      <button key={e} className="gd-btn" onClick={() => setSegmentEase(sel.id, selectedKfData.prop, selectedKfData.t, e)}
                        style={{ ...chipStyle, cursor: "pointer", borderColor: selectedKfData.k.ease === e ? C.amber : C.line, color: selectedKfData.k.ease === e ? C.amber : C.dim }}>{EASE_LABEL[e]}</button>
                    ))}
                  </div>
                  <div style={{ color: C.faint, fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>Shapes the segment leaving this ◆. Tip: right-click between two ◆ on the timeline.</div>
                </Card>
              )}

              {sel.type !== "confetti" && sel.type !== "map" && sel.type !== "world" && !flowText && (
                <Card title="Motion presets" hint="applied at playhead">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    {PRESETS.map((pr) => (
                      <button key={pr.id} className="gd-btn" onClick={() => applyPreset(pr)}
                        style={{ background: C.bg2, border: `1px solid ${C.line}`, color: C.txt, borderRadius: 6, padding: "7px 5px", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                        <span style={{ color: C.amber }}>{pr.icon}</span>{pr.name}
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============ TIMELINE ============ */}
      <div style={{ height: tlH, background: C.bg1, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "relative" }}>
        {/* top-edge resize handle: 6px hit zone, drag to resize (160px…45vh), double-click resets to 240px */}
        <div className={tlDragging ? "gd-tl-handle gd-dragging" : "gd-tl-handle"} onPointerDown={onTlHandleDown} onDoubleClick={resetTlH}
          title="Drag to resize the timeline · double-click to reset"
          style={{ position: "absolute", top: -3, left: 0, right: 0, height: 6, cursor: "ns-resize", zIndex: 60 }}>
          <div className="gd-tl-handle-line" style={{ position: "absolute", top: 2, left: 0, right: 0, height: 1, background: C.amber }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 12px", height: 44, borderBottom: `1px solid ${C.line}` }}>
          <button className="gd-btn" onClick={() => { setPlaying(false); setTime(0); }} style={transportBtn}>⏮</button>
          <button onClick={() => setPlaying(!playing)} style={{ ...transportBtn, width: 34, height: 28, background: C.amber, color: "#1a1405", border: "none", fontWeight: 800 }}>{playing ? "❚❚" : "▶"}</button>
          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 600, color: C.amber, minWidth: 88, fontVariantNumeric: "tabular-nums" }}>{fmt(time)} <span style={{ color: C.faint }}>/ {fmt(ctxDur)}</span></span>
          <span style={{ color: C.faint, fontSize: 11, fontWeight: 600 }}>Dur</span>
          <input type="number" min={1} max={30} step={0.5} value={+(ctxDur / 1000).toFixed(1)}
            onChange={(e) => setCtxDurMs((parseFloat(e.target.value) || 1) * 1000, stretchClips)}
            style={{ ...inputStyle, width: 56, padding: "4px 6px", fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
          <label title="When duration changes, keyframes rescale proportionally" style={{ display: "flex", alignItems: "center", gap: 5, color: C.dim, fontSize: 10.5, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={stretchClips} onChange={(e) => setStretchClips(e.target.checked)} /> scale
          </label>
          <div style={{ width: 1, height: 20, background: C.line }} />
          <button className="gd-btn" onClick={() => setLoop(!loop)} style={{ background: C.bg2, border: `1px solid ${C.line}`, color: loop ? C.txt : C.faint, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Loop</button>
          <button className="gd-btn" onClick={() => setAutokey(!autokey)} title="Animate — ON: edits & drags record keyframes at the playhead. OFF: edits move the layer (or its whole animation) without adding keyframes."
            style={{ display: "flex", alignItems: "center", gap: 6, background: autokey ? C.amberSoft : C.bg2, border: `1px solid ${autokey ? C.amber : C.line}`, color: autokey ? C.amber : C.dim, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: autokey ? C.amber : C.faint, boxShadow: autokey ? `0 0 8px ${C.amber}` : "none" }} />Animate
          </button>
          <div style={{ flex: 1 }} />
          {selMany.length > 1 && <button className="gd-btn" onClick={groupSelection} style={{ ...chipStyle, cursor: "pointer", borderColor: C.amber, color: C.amber }}>⌘G Group {selMany.length} → Clip</button>}
          <span style={{ color: C.faint, fontSize: 10.5 }}>drag bar = move · edges = trim · right-click = easing</span>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0, overflowY: "auto" }}>
          <div style={{ width: 212, flexShrink: 0, borderRight: `1px solid ${C.line}` }}>
            <div style={{ height: 26 }} />
            {[...ctxLayers].reverse().map((o) => {
              const isSel = selIds.includes(o.id);
              return (
                <div key={o.id}
                  onClick={(e) => { if (e.ctrlKey || e.metaKey) setSelIds(isSel ? selIds.filter((i) => i !== o.id) : [...selIds, o.id]); else setSelIds([o.id]); setSelKf(null); }}
                  onDoubleClick={() => o.type === "clip" && enterClip(o.id)}
                  onContextMenu={(e) => onLayerContext(e, o)}
                  style={{ height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 6px", cursor: "pointer", background: isSel ? C.bg3 : "transparent", borderLeft: isSel ? `2px solid ${C.amber}` : "2px solid transparent", opacity: o.hidden ? 0.45 : o.locked ? 0.65 : 1 }}>
                  <button title={o.hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); toggleHide(o.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, width: 15, color: o.hidden ? C.amber : C.faint }}>{o.hidden ? "⊘" : "◉"}</button>
                  <button title={o.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); toggleLock(o.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: 0, width: 15, color: o.locked ? C.amber : C.faint }}>{o.locked ? "🔒" : "🔓"}</button>
                  {o.type === "clip"
                    ? <span style={{ width: 11, height: 10, flexShrink: 0, position: "relative" }}><span style={{ position: "absolute", inset: "0 2px 2px 0", border: `1.5px solid ${C.amber}`, borderRadius: 2 }} /><span style={{ position: "absolute", inset: "2px 0 0 2px", border: `1.5px solid ${C.amber}`, borderRadius: 2, background: C.bg1 }} /></span>
                    : <span style={{ width: 9, height: 9, borderRadius: 3, background: o.type === "confetti" ? "linear-gradient(135deg,#F5A524,#E5636A)" : o.type === "map" || o.type === "world" ? o.props.stroke : o.type === "image" ? "#939BAD" : colorAt(o, "fill", time), flexShrink: 0, border: `1px solid ${C.line}` }} />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? C.txt : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                    {o.name}{o.type === "clip" && <span style={{ color: C.faint, fontWeight: 500 }}> ·{o.children.length}</span>}
                  </span>
                  {isSel && selIds.length === 1 && (
                    <span style={{ display: "flex", gap: 1 }}>
                      <MiniBtn title="Front" onClick={(e) => { e.stopPropagation(); reorder(o.id, +1); }}>▲</MiniBtn>
                      <MiniBtn title="Back" onClick={(e) => { e.stopPropagation(); reorder(o.id, -1); }}>▼</MiniBtn>
                      <MiniBtn title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateSelected(); }}>⧉</MiniBtn>
                      <MiniBtn title="Delete" danger onClick={(e) => { e.stopPropagation(); removeSelected(); }}>✕</MiniBtn>
                    </span>
                  )}
                </div>
              );
            })}
            {/* audio lane header (main timeline only — project audio lives at root) */}
            {!inClip && (
              <div onPointerDown={onAudioLaneDown} title={audioTrack ? `${audioTrack.name} — click to select` : "No audio attached — click to open the Audio panel"}
                style={{ height: 36, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", cursor: "pointer", borderTop: `1px solid ${C.line}`, background: audioLaneSel ? C.bg3 : "transparent", borderLeft: audioLaneSel ? `2px solid ${C.amber}` : "2px solid transparent", boxSizing: "border-box" }}>
                <NoteIcon size={13} color={audioTrack ? C.amber : C.faint} />
                <span style={{ fontSize: 12, fontWeight: 600, color: audioLaneSel ? C.txt : audioTrack ? C.dim : C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                  {audioTrack ? audioTrack.name : "Audio"}
                </span>
                {audioTrack && <span style={{ fontSize: 9.5, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>{fmt(audioTrack.startT)}</span>}
              </div>
            )}
          </div>

          <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            <div ref={rulerRef} onPointerDown={onRulerDown} style={{ height: 26, position: "relative", cursor: "col-resize", borderBottom: `1px solid ${C.line}`, background: C.bg2 }}>
              {Array.from({ length: 11 }).map((_, i) => (
                <div key={i} style={{ position: "absolute", left: `${i * 10}%`, top: 0, bottom: 0 }}>
                  <div style={{ width: 1, height: i % 2 === 0 ? 10 : 6, background: C.faint, opacity: 0.6 }} />
                  {i % 2 === 0 && <span style={{ position: "absolute", top: 9, left: 3, fontSize: 9.5, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>{((i * ctxDur) / 10000).toFixed(1)}s</span>}
                </div>
              ))}
            </div>

            <div onPointerDown={onRulerDown} style={{ position: "relative" }}>
              {[...ctxLayers].reverse().map((o) => {
                const isClip = o.type === "clip";
                const bIn = isClip ? o.props.start : o.props.inT || 0;
                const bOut = isClip ? Math.min(ctxDur, o.props.start + o.props.dur / (o.props.speed || 1)) : Math.min(ctxDur, layerOut(o, ctxDur));
                const kfs = [];
                [...KF_PROPS, "shape"].forEach((p) => (o.tracks[p] || []).forEach((k) => kfs.push({ p, k })));
                const isSel = selIds.includes(o.id);
                return (
                  <div key={o.id} onDoubleClick={() => isClip && enterClip(o.id)} onContextMenu={(e) => onLaneContext(e, o)}
                    style={{ height: 30, position: "relative", borderBottom: `1px solid ${C.bg2}`, background: isSel ? "rgba(245,165,36,.04)" : "transparent" }}>
                    {/* layer bar: dark, draggable, trim handles */}
                    <div onPointerDown={(e) => onBarDown(e, o, "move")}
                      title={o.locked ? `${o.name} · locked` : isClip ? `${o.name} · drag to retime · dbl-click to open` : "Drag to move (keyframes travel with the bar) · drag edges to trim"}
                      style={{ position: "absolute", left: `${(bIn / ctxDur) * 100}%`, width: `${((bOut - bIn) / ctxDur) * 100}%`, top: 5, height: 20, background: TYPE_BAR[o.type] || "#3A4356", filter: isSel ? "brightness(1.35)" : "none", border: `1px solid ${isSel ? C.amber : "rgba(255,255,255,.2)"}`, borderRadius: 6, cursor: o.locked ? "not-allowed" : "grab", overflow: "hidden" }}>
                      
                      {isClip && <span style={{ position: "absolute", left: 7, top: 3, fontSize: 9.5, fontWeight: 700, color: C.amber, whiteSpace: "nowrap", pointerEvents: "none" }}>{o.name}{o.props.speed !== 1 ? ` · ${o.props.speed}×` : ""}{o.props.end === "loop" ? " · ∞" : ""}</span>}
                      {!o.locked && <>
                        <div onPointerDown={(e) => onBarDown(e, o, "in")} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(255,255,255,.07)", borderRight: `1px solid rgba(255,255,255,.12)` }} />
                        <div onPointerDown={(e) => onBarDown(e, o, "out")} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(255,255,255,.07)", borderLeft: `1px solid rgba(255,255,255,.12)` }} />
                      </>}
                    </div>
                    {/* keyframe markers */}
                    {kfs.map(({ p, k }, i) => {
                      const isSelK = selKf && selKf.objId === o.id && selKf.prop === p && Math.abs(selKf.t - k.t) <= 5;
                      const isColor = p === "fill";
                      const isShape = p === "shape";
                      const isProg = p === "prog";
                      const bg = isSelK ? C.txt : isColor ? k.v : isShape ? "#C084FC" : isProg ? "#6EE7B7" : C.amber;
                      return (
                        <span key={i} className={isColor || isShape ? "gd-kfc" : "gd-kf"} onPointerDown={(e) => onKfDown(e, o.id, p, k)}
                          title={`${PROP_LABEL[p]} @ ${fmt(k.t)}${isColor ? ` · ${k.v}` : ""} · ${EASE_LABEL[k.ease] || "Linear"}`}
                          style={{ position: "absolute", left: `${(k.t / ctxDur) * 100}%`, top: "50%", width: 9, height: 9, transform: isColor || isShape ? "translate(-50%,-50%)" : "translate(-50%,-50%) rotate(45deg)", background: bg, borderRadius: isColor || isShape ? "50%" : 1.5, border: isColor ? `1.5px solid #fff` : "none", cursor: "ew-resize", transition: "transform .1s", boxShadow: isSelK ? "0 0 0 3px rgba(245,165,36,.4)" : "none", zIndex: 2 }} />
                      );
                    })}
                    {o.type === "world" && normHi(o.props.hi).map((hh, wi) => {
                      const zw = worldZoomWindow(hh, o.props);
                      return (
                      <span key={"w" + wi}>
                        <span className="gd-kfc" onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "t", hh.t)} title={`${WORLD[hh.cc]?.n || hh.cc} appears @ ${fmt(hh.t)} · drag to retime`}
                          style={{ position: "absolute", left: `${(hh.t / ctxDur) * 100}%`, top: "50%", width: 9, height: 9, transform: "translate(-50%,-50%)", background: o.props.hiFill, border: "1.5px solid #fff", borderRadius: 2.5, cursor: "ew-resize", transition: "transform .1s", zIndex: 2 }} />
                        {hh.out != null && (
                          <span className="gd-kfc" onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "out", hh.out)} title={`${WORLD[hh.cc]?.n || hh.cc} hides @ ${fmt(hh.out)} · drag to retime`}
                            style={{ position: "absolute", left: `${(hh.out / ctxDur) * 100}%`, top: "50%", width: 9, height: 9, transform: "translate(-50%,-50%)", background: "transparent", border: `2px solid ${o.props.hiFill}`, borderRadius: 2.5, cursor: "ew-resize", transition: "transform .1s", zIndex: 2 }} />
                        )}
                        {hh.zoom !== false && <>
                          <span onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "zoomIn", zw.zin)}
                            title={`${WORLD[hh.cc]?.n || hh.cc} zoom-in @ ${fmt(zw.zin)}${zw.zinAuto ? " (auto — drag to set)" : " · drag to retime"}`}
                            style={{ position: "absolute", left: `${(zw.zin / ctxDur) * 100}%`, top: "50%", width: 0, height: 0, transform: "translate(-2px,-50%)", borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #5B8DEF", opacity: zw.zinAuto ? 0.4 : 1, cursor: "ew-resize", zIndex: 2 }} />
                          <span onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "zoomOut", zw.zout)}
                            title={`${WORLD[hh.cc]?.n || hh.cc} zoom-out @ ${fmt(zw.zout)}${zw.zoutAuto ? " (auto — drag to set)" : " · drag to retime"}`}
                            style={{ position: "absolute", left: `${(zw.zout / ctxDur) * 100}%`, top: "50%", width: 0, height: 0, transform: "translate(-6px,-50%)", borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: "8px solid #5B8DEF", opacity: zw.zoutAuto ? 0.4 : 1, cursor: "ew-resize", zIndex: 2 }} />
                        </>}
                      </span>
                      );
                    })}
                  </div>
                );
              })}
              {/* audio lane — flat labeled bar (waveform deliberately deferred); drag the bar to retime startT */}
              {!inClip && (
                <div onPointerDown={onAudioLaneDown} title={audioTrack ? undefined : "No audio attached — click to open the Audio panel"}
                  style={{ height: 36, position: "relative", borderTop: `1px solid ${C.line}`, background: audioLaneSel ? "rgba(245,165,36,.04)" : "transparent" }}>
                  {audioTrack ? (
                    <div onPointerDown={onAudioBarDown}
                      title={`${audioTrack.name} · starts ${fmt(audioTrack.startT)} · drag to retime (100ms snap)`}
                      style={{ position: "absolute", left: `${(audioTrack.startT / ctxDur) * 100}%`, width: `${(audioBarMs / ctxDur) * 100}%`, minWidth: 48, top: 6, height: 24, background: "#1F3D33", filter: audioLaneSel ? "brightness(1.35)" : "none", border: `1px solid ${audioLaneSel ? C.amber : "rgba(255,255,255,.2)"}`, borderRadius: 6, cursor: "grab", overflow: "hidden", display: "flex", alignItems: "center", gap: 6, padding: "0 8px", boxSizing: "border-box" }}>
                      <span style={{ display: "flex", flexShrink: 0, pointerEvents: "none" }}><NoteIcon size={12} color="#3FB68B" /></span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#9AD9BE", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{audioTrack.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 9, color: "#6FA98E", fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums", pointerEvents: "none", flexShrink: 0 }}>{fmt(audioTrack.startT)}</span>
                    </div>
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 10px", gap: 6, color: C.faint, fontSize: 10.5, pointerEvents: "none" }}>
                      <NoteIcon size={12} color={C.faint} /> No audio attached — open the Audio panel to add a track
                    </div>
                  )}
                </div>
              )}
              <div style={{ position: "absolute", top: -26, bottom: 0, left: `${(time / ctxDur) * 100}%`, width: 2, background: C.amber, boxShadow: "0 0 6px rgba(245,165,36,.45)", pointerEvents: "none", zIndex: 5 }}>
                <div style={{ position: "absolute", top: 0, left: -5, width: 0, height: 0, borderLeft: "5.5px solid transparent", borderRight: "5.5px solid transparent", borderTop: `7px solid ${C.amber}` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ CONTEXT MENU ============ */}
      {menu && (
        <div className="gd-panel" onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 250), top: Math.min(menu.y, window.innerHeight - 260), width: 236, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, zIndex: 200, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
          {menu.kind === "segment" && (
            <>
              <div style={{ ...sectionLabel, marginBottom: 7 }}>SEGMENT EASING</div>
              {menu.locked && <div style={{ color: C.amber, fontSize: 11 }}>Layer is locked.</div>}
              {!menu.locked && menu.segs.length === 0 && <div style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5 }}>No keyframe segment under the cursor — right-click between two ◆ of the same property.</div>}
              {!menu.locked && menu.segs.map((sg, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.txt, marginBottom: 5 }}>{PROP_LABEL[sg.prop]} <span style={{ color: C.faint, fontWeight: 500 }}>{fmt(sg.a.t)} → {fmt(sg.b.t)}</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {Object.keys(EASE).map((e) => (
                      <button key={e} className="gd-btn" onClick={() => { setSegmentEase(menu.objId, sg.prop, sg.a.t, e); setMenu(null); }}
                        style={{ ...chipStyle, cursor: "pointer", padding: "3px 8px", fontSize: 10.5, borderColor: sg.a.ease === e ? C.amber : C.line, color: sg.a.ease === e ? C.amber : C.dim }}>{EASE_LABEL[e]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
          {menu.kind === "layer" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {menu.multi && <MenuBtn onClick={() => { groupSelection(); setMenu(null); }}>▣ Group into clip</MenuBtn>}
              {menu.isClip && <MenuBtn onClick={() => { enterClip(menu.objId); setMenu(null); }}>▶ Open clip timeline</MenuBtn>}
              {menu.isClip && <MenuBtn onClick={() => { ungroupClip(menu.objId); setMenu(null); }}>⛓ Ungroup</MenuBtn>}
              <MenuBtn onClick={() => { copySelection(); setMenu(null); }}>⧉ Copy (⌘C)</MenuBtn>
              {clipCount > 0 && <MenuBtn onClick={() => { pasteClipboard(); setMenu(null); }}>📋 Paste (⌘V)</MenuBtn>}
              <MenuBtn onClick={() => { duplicateSelected(); setMenu(null); }}>⧉ Duplicate (⌘D)</MenuBtn>
              <MenuBtn onClick={() => { toggleHide(menu.objId); setMenu(null); }}>{menu.hidden ? "◉ Show" : "⊘ Hide"}</MenuBtn>
              <MenuBtn onClick={() => { toggleLock(menu.objId); setMenu(null); }}>{menu.locked ? "🔓 Unlock" : "🔒 Lock (timeline + stage)"}</MenuBtn>
              <MenuBtn danger onClick={() => { removeSelected(); setMenu(null); }}>✕ Delete</MenuBtn>
            </div>
          )}
        </div>
      )}

      {/* ============ BRAND MODAL ============ */}
      {brandOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,12,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onPointerDown={() => setBrandOpen(false)}>
          <div className="gd-panel" onPointerDown={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 15 }}>Brand profiles</div>
              <button onClick={() => setBrandOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {brands.map((b) => (
                <button key={b.id} className="gd-btn" onClick={() => setBrandId(b.id)}
                  style={{ ...chipStyle, cursor: "pointer", borderColor: b.id === brandId ? C.amber : C.line, color: b.id === brandId ? C.amber : C.dim }}>{b.name}</button>
              ))}
              <button className="gd-btn" onClick={() => { const nb = { id: "b" + Date.now(), name: "New brand", colors: ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#F9F9F9"], headFont: "Space Grotesk", bodyFont: "Inter" }; setBrands([...brands, nb]); setBrandId(nb.id); }}
                style={{ ...chipStyle, cursor: "pointer" }}>＋ New</button>
            </div>
            <Row label="Name"><input value={brand.name} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, name: e.target.value } : b)))} style={inputStyle} /></Row>
            <Row label="Palette">
              <div style={{ display: "flex", gap: 5 }}>
                {brand.colors.map((c, i) => (
                  <input key={i} type="color" value={c} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, colors: b.colors.map((cc, j) => (j === i ? e.target.value : cc)) } : b)))} />
                ))}
              </div>
            </Row>
            <Row label="Head font"><select value={brand.headFont} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, headFont: e.target.value } : b)))}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Row>
            <Row label="Body font"><select value={brand.bodyFont} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, bodyFont: e.target.value } : b)))}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Row>
            <div style={{ color: C.faint, fontSize: 11, lineHeight: 1.55, marginTop: 8 }}>The active brand's palette becomes the swatches across the app, and new text layers use its heading font. Brands are saved inside the project JSON.</div>
          </div>
        </div>
      )}

      {/* ============ SAVE / LOAD MODAL ============ */}
      {ioOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,12,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onPointerDown={() => setIoOpen(false)}>
          <div className="gd-panel" onPointerDown={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 15 }}>Save / Load project</div>
              <button onClick={() => setIoOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.55, marginBottom: 12 }}>This preview sandbox blocks file downloads, so projects travel as JSON — copy to save, paste to load. Clips, brands, paths and stage size included.</div>
            <button className="gd-btn" onClick={copyProject}
              style={{ background: ioCopied ? "rgba(63,182,139,0.12)" : C.amber, color: ioCopied ? "#3FB68B" : "#1a1405", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: 700, marginBottom: 14 }}>
              {ioCopied ? "✓ Copied to clipboard" : "Copy project JSON"}
            </button>
            <div style={{ ...sectionLabel, marginBottom: 6 }}>LOAD — paste a composition</div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"app":"graphic-destination-motion", ...}'
              style={{ ...inputStyle, height: 88, resize: "none", fontFamily: "'JetBrains Mono'", fontSize: 10.5 }} />
            {importErr && <div style={{ color: C.danger, fontSize: 11, marginTop: 6 }}>{importErr}</div>}
            <button className="gd-btn" onClick={importProject} disabled={!importText.trim()}
              style={{ background: C.bg2, border: `1px solid ${C.line}`, color: importText.trim() ? C.txt : C.faint, borderRadius: 6, padding: "8px 16px", cursor: importText.trim() ? "pointer" : "default", fontWeight: 700, marginTop: 8 }}>
              Load project
            </button>
          </div>
        </div>
      )}

      {/* ============ EXPORT DIALOG ============ */}
      {exportOpen && (
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} project={JSON.parse(projectJson())} projectId={null} projectName={name} />
      )}
    </div>
  );
}

/* ============================================================
   MAP HELPERS + WORLD PRECOMPUTE
   ============================================================ */
const TYPE_BAR = { chart: "#6E2E4A", clip: "#4A3B0C", text: "#3F2E66", number: "#283D63", shape: "#303F66", image: "#3A4356", map: "#274D40", world: "#274D40", confetti: "#584019" };

/* box styling for text/number layers */
function boxStyleOf(P, time) {
  if (!P.bg && !P.borderW) return null;
  const gc = P.borderC || P.bg || "#FFB224";
  const glow = P.boxFx === "glow" ? `0 0 16px ${gc}99, 0 0 40px ${gc}44`
    : P.boxFx === "pulse" ? `0 0 ${10 + 7 * Math.sin(time / 280)}px ${gc}BB` : "none";
  return { background: P.bg || "transparent", border: P.borderW ? `${P.borderW}px solid ${P.borderC}` : "none", borderRadius: P.radius, padding: `${Math.round(P.pad * 0.45)}px ${P.pad}px`, boxShadow: glow };
}

/* ============================================================
   STAGE OBJECT (recursive)
   ============================================================ */


/* Shared border-effect renderer for both single-country maps and
   multi-country continent maps — same styles (plain/draw/comet/neon/
   reveal/pulse), driven by a precomputed path `d` and its bbox. */
function MapEffectPaths({ id, d, P, time }) {
  const S = P.mapStyle === "march" ? "pulse" : P.mapStyle;
  const u = clamp01((time - P.start) / P.dur);
  const eu = EASE.easeInOutCubic(u);
  const gid = "g" + id, cid = "c" + id;
  const hot = lerpColor(P.stroke, "#ffffff", 0.75);
  const animDraw = S === "draw" || S === "reveal";
  const fillNow = animDraw ? P.fillOp * clamp01(u * 1.15) : P.fillOp;
  const drawDash = animDraw ? { strokeDasharray: 100, strokeDashoffset: 100 * (1 - eu) } : {};
  const gw = Math.min(P.strokeW, 2);
  let g = 0;
  if (S === "neon") g = 1;
  if (S === "reveal") g = clamp01((time - P.start - P.dur) / 550);
  if (S === "pulse") g = 0.55 + 0.45 * Math.sin(time / 430);
  if (S === "comet") g = 0.2;
  const tipOn = animDraw && u > 0.005 && u < 0.995;
  const lead = eu * 100;
  const off = -((time / 26) % 100);
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={lerpColor(P.fillC, "#ffffff", 0.14)} />
          <stop offset="1" stopColor={lerpColor(P.fillC, "#000000", 0.34)} />
        </linearGradient>
        <clipPath id={cid}><path d={d} /></clipPath>
      </defs>
      <path d={d} fill={`url(#${gid})`} fillOpacity={fillNow} stroke="none" style={{ filter: "drop-shadow(0 3px 10px rgba(0,0,0,.35))" }} />
      {fillNow > 0.2 && (
        <g clipPath={`url(#${cid})`}>
          <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.22 * (animDraw ? eu : 1)} strokeWidth={gw * 3.2} pathLength={100} style={{ filter: "blur(2.5px)" }} {...drawDash} />
        </g>
      )}
      {g > 0.02 && <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.12 * g} strokeWidth={gw * 5.5} pathLength={100} strokeLinejoin="round" style={{ filter: "blur(4.5px)" }} {...drawDash} />}
      {g > 0.02 && <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.32 * g} strokeWidth={gw * 2.4} pathLength={100} strokeLinejoin="round" style={{ filter: "blur(1.8px)" }} {...drawDash} />}
      <path d={d} fill="none" stroke={S === "neon" ? hot : P.stroke} strokeWidth={P.strokeW * (S === "neon" ? 1.15 : 1)} vectorEffect="non-scaling-stroke" pathLength={100} strokeLinejoin="round"
        style={g > 0.25 ? { filter: `drop-shadow(0 0 3px ${P.stroke})` } : {}} {...drawDash} />
      {tipOn && <>
        <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.75} strokeWidth={P.strokeW * 2.6} pathLength={100} strokeDasharray="5 95" strokeDashoffset={-(lead - 5)} strokeLinecap="round" style={{ filter: "blur(2px)" }} />
        <path d={d} fill="none" stroke={hot} strokeWidth={P.strokeW * 1.3} pathLength={100} strokeDasharray="2 98" strokeDashoffset={-(lead - 2)} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${P.stroke})` }} />
      </>}
      {S === "comet" && <>
        <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.45} strokeWidth={P.strokeW * 3} pathLength={100} strokeDasharray="11 89" strokeDashoffset={off + 8} strokeLinecap="round" style={{ filter: "blur(3px)" }} />
        <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.9} strokeWidth={P.strokeW * 1.8} pathLength={100} strokeDasharray="6 94" strokeDashoffset={off + 3} strokeLinecap="round" style={{ filter: "blur(1px)" }} />
        <path d={d} fill="none" stroke={hot} strokeWidth={P.strokeW * 1.1} pathLength={100} strokeDasharray="3 97" strokeDashoffset={off} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3.5px ${P.stroke}) drop-shadow(0 0 8px ${P.stroke})` }} />
      </>}
    </>
  );
}
function MapEffectShape({ id, d, box, P, time, down, common, rz }) {
  const h = (P.w * box.h) / box.w;
  const ox = box.ox || 0, oy = box.oy || 0;
  return (
    <div onPointerDown={down} style={common}>
      <svg width={P.w} height={h} viewBox={`${ox - 7} ${oy - 7} ${box.w + 14} ${box.h + 14}`} style={{ display: "block", overflow: "visible" }}>
        <MapEffectPaths id={id} d={d} P={P} time={time} />
      </svg>
      {rz}
    </div>
  );
}

export function StageObject({ obj, time, stage, selected, onDown, onEnterClip, displayValue, onResize, onRotate, interactive }) {
  const P = obj.props;
  if (obj.hidden && !(interactive && selected)) return null;
  if (obj.type !== "clip") {
    const inT = P.inT || 0;
    if (time < inT || (P.outT != null && time > P.outT)) return null;
  }
  const dv = interactive && displayValue ? displayValue : (o, p) => valueAt(o, p, time);
  const [x, y] = P.path && P.path.pts?.length >= 2 ? pointOnPath(P.path, valueAt(obj, "prog", time)) : [dv(obj, "x"), dv(obj, "y")];
  const scale = valueAt(obj, "scale", time);
  const rot = valueAt(obj, "rotation", time);
  const op = valueAt(obj, "opacity", time);

  if (obj.type === "clip") {
    const local = clipLocalTime(P, time);
    const tr = clipTransition(P, time);
    if (local === null && !interactive) return null;
    return (
      <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, transform: `translate(${x - stage.w / 2 + tr.tx}px, ${y - stage.h / 2 + tr.ty}px) rotate(${rot}deg) scale(${scale * tr.s})`, transformOrigin: `${stage.w / 2}px ${stage.h / 2}px`, opacity: local === null ? (interactive ? 0.15 : 0) : op * tr.o, pointerEvents: "none" }}>
        {local !== null && P.bg && <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, background: P.bg }} />}
        {/* full-canvas click target — a clip IS the canvas, so selecting/entering it works anywhere on the frame, not just around its content */}
        {interactive && (
          <div onPointerDown={(e) => onDown(e, obj)} onDoubleClick={() => onEnterClip(obj.id)}
            title={`${obj.name} — click empty space to select, double-click to open`}
            style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, pointerEvents: "auto", cursor: obj.locked ? "default" : "grab" }} />
        )}
        {local !== null && obj.children.map((ch) => <StageObject key={ch.id} obj={ch} time={local} stage={stage} selected={false} interactive={false} />)}
        {interactive && selected && (
          <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, pointerEvents: "none", border: `1.5px solid ${C.amber}` }}>
            <span style={{ position: "absolute", top: -20, left: 0, fontSize: 10, fontWeight: 700, color: "#1a1405", background: C.amber, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>{obj.name} · clip{obj.locked ? " 🔒" : ""}{local === null ? " · out of range" : ""}</span>
          </div>
        )}
      </div>
    );
  }

  if (obj.type === "confetti") {
    const parts = confettiParticles(obj);
    const dt = (time - P.burst) / 1000;
    const active = dt >= 0 && dt <= CONFETTI_LIFE / 1000;
    return (
      <div onPointerDown={interactive && !obj.locked ? (e) => onDown(e, obj) : undefined}
        style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", width: 44, height: 44, cursor: interactive && !obj.locked ? "grab" : "default", zIndex: 50, pointerEvents: interactive ? "auto" : "none" }}>
        {(selected || (!active && interactive)) && <div style={{ position: "absolute", inset: 0, border: selected ? `1.5px dashed ${C.amber}` : "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, opacity: active ? 1 : 0.35 }}>🎉</div>}
        {active && parts.map((p, i) => {
          const g = 1.9;
          const px = p.vx * 620 * dt + p.drift * dt * Math.sin(p.wob + dt * 5);
          const py = p.vy * 620 * dt + 0.5 * g * 620 * dt * dt;
          const fade = dt > 1.7 ? 1 - (dt - 1.7) / 0.7 : 1;
          return <div key={i} style={{ position: "absolute", left: 22 + px, top: 22 + py, width: p.size, height: p.size * (p.round ? 1 : 0.55), background: p.color, borderRadius: p.round ? "50%" : 1.5, transform: `rotate(${p.spin * dt}deg)`, opacity: Math.max(0, fade), pointerEvents: "none" }} />;
        })}
      </div>
    );
  }

  const rz = selected && interactive && !obj.locked && onResize
    ? <>
        <div onPointerDown={(e) => onResize(e, obj)} title="Drag to resize (records scale keyframes when Animate is on)"
          style={{ position: "absolute", right: -9, bottom: -9, width: 13, height: 13, background: C.amber, border: "2px solid #fff", borderRadius: 3, cursor: "nwse-resize", zIndex: 6, pointerEvents: "auto" }} />
        {onRotate && (
          <div onPointerDown={(e) => onRotate(e, obj)} title="Drag to rotate · shift = 15° steps (records rotation keyframes when Animate is on)"
            style={{ position: "absolute", top: -30, left: "50%", transform: "translateX(-50%)", width: 17, height: 17, borderRadius: "50%", background: "#10131A", border: `2px solid ${C.amber}`, cursor: "grab", zIndex: 6, pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "center", color: C.amber, fontSize: 10, fontWeight: 800, lineHeight: 1 }}>↻</div>
        )}
      </>
    : null;
  const common = {
    position: "absolute", left: x, top: y,
    transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${scale})`,
    opacity: obj.hidden ? op * 0.32 : op, cursor: interactive && !obj.locked ? "grab" : "default",
    outline: selected ? `1.5px solid ${obj.hidden ? C.faint : C.amber}` : "none", outlineOffset: 4,
    pointerEvents: interactive ? "auto" : "none",
  };
  const down = interactive && !obj.locked ? (e) => onDown(e, obj) : interactive ? (e) => { e.stopPropagation(); onDown(e, obj); } : undefined;

  if (obj.type === "shape") {
    const pts = morphPtsAt(obj, time);
    const fill = colorAt(obj, "fill", time);
    const fm = P.fillMode || "fill";
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={P.h} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
          <polygon points={ptsToStr(pts)} fill={fm === "stroke" ? "none" : fill} stroke={fm !== "fill" ? P.sC : "none"} strokeWidth={fm !== "fill" ? P.sW : 0} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {rz}
      </div>
    );
  }

  if (obj.type === "text" && P.path && P.path.pts.length >= 2 && (P.pathMode || "flow") === "flow") {
    const sp = pathSamples(P.path);
    const dPath = sp.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    const prog = valueAt(obj, "prog", time);
    const color = colorAt(obj, "fill", time);
    const raw = P.upper ? P.text.toUpperCase() : P.text;
    let pcx = 0, pcy = 0;
    sp.forEach((p) => { pcx += p[0]; pcy += p[1]; });
    pcx /= Math.max(1, sp.length); pcy /= Math.max(1, sp.length);
    return (
      <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", opacity: op, pointerEvents: "none" }}>
        <defs><path id={"tp" + obj.id} d={dPath} /></defs>
        <g transform={`translate(${pcx} ${pcy}) rotate(${rot}) scale(${scale}) translate(${-pcx} ${-pcy})`}>
          {selected && <path d={dPath} fill="none" stroke={C.amber} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="4 4" />}
          <text onPointerDown={down} letterSpacing={P.ls} style={{ fontFamily: `'${P.fontFamily}'`, fontWeight: P.fontWeight, fontSize: P.fontSize, letterSpacing: P.ls, cursor: interactive && !obj.locked ? "grab" : "default", pointerEvents: interactive ? "auto" : "none" }} fill={color}>
            <textPath href={"#tp" + obj.id} startOffset={`${(prog * 100).toFixed(2)}%`}>{raw}</textPath>
          </text>
        </g>
      </svg>
    );
  }

  if (obj.type === "text") {
    const fx = P.textFx;
    const raw = P.upper ? P.text.toUpperCase() : P.text;
    const chars = fx ? raw.split("") : null;
    const box = boxStyleOf(P, time);
    const color = colorAt(obj, "fill", time);
    return (
      <div onPointerDown={down} style={common}>
        <div style={{ ...(box || {}), whiteSpace: "pre", fontFamily: `'${P.fontFamily}'`, fontWeight: P.fontWeight, fontSize: P.fontSize, color, letterSpacing: P.ls, display: "flex", alignItems: "center" }}>
          {!fx ? raw : chars.map((ch, i) => {
            const f = charFx(fx, i, chars.length, time, ch);
            return <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: f.o, transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.s})` }}>{f.ch}</span>;
          })}
        </div>
        {rz}
      </div>
    );
  }

  if (obj.type === "image") {
    return (
      <div onPointerDown={down} style={{ ...common, width: P.w, height: P.h }}>
        {P.src
          ? <img src={P.src} alt="" draggable={false} style={{ width: P.w, height: P.h, maxWidth: "none", maxHeight: "none", objectFit: "cover", borderRadius: 8, display: "block", pointerEvents: "none" }} />
          : <div style={{ width: P.w, height: P.h, border: `2px dashed ${C.faint}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 13 }}>No image</div>}
        {rz}
      </div>
    );
  }

  if (obj.type === "number") {
    const emH = 1.08;
    const box = boxStyleOf(P, time);
    const color = colorAt(obj, "fill", time);
    const inner = P.style === "count"
      ? <span style={{ whiteSpace: "pre" }}>{P.prefix}{Math.max(0, numberValue(P, time)).toFixed(P.decimals)}{P.suffix}</span>
      : (
        <span style={{ display: "flex", alignItems: "center" }}>
          {P.prefix && <span style={{ whiteSpace: "pre" }}>{P.prefix}</span>}
          {numberColumns(P, time).map((c, i) => c.ch
            ? <span key={i}>{c.ch}</span>
            : <span key={i} style={{ display: "inline-block", height: `${emH}em`, overflow: "hidden", opacity: c.dim ? 0.22 : 1 }}>
                <span style={{ display: "block", transform: `translateY(${-c.d * emH}em)` }}>
                  {"01234567890".split("").map((d, j) => <span key={j} style={{ display: "block", height: `${emH}em` }}>{d}</span>)}
                </span>
              </span>)}
          {P.suffix && <span style={{ whiteSpace: "pre" }}>{P.suffix}</span>}
        </span>
      );
    const ring = P.ring || "none";
    if (ring !== "none") {
      const uLin = clamp01((time - P.start) / P.dur);
      const p = P.to < P.from ? 1 - uLin : uLin; /* countdown depletes, count-up fills */
      const R = P.fontSize * 1.15;
      const size = R * 2 + (P.ringW || 8) * 2 + 10;
      const c = size / 2;
      return (
        <div onPointerDown={down} style={common}>
          <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              {ring === "pie" ? <>
                <circle cx={c} cy={c} r={R} fill={P.bg || "rgba(0,0,0,.55)"} />
                <path d={arcPath(c, c, R, -90, -90 + 359.9 * p)} fill={P.ringC} fillOpacity={0.38} />
                <circle cx={c} cy={c} r={R} fill="none" stroke={P.ringC} strokeWidth={2} strokeOpacity={0.9} />
              </> : <>
                {P.bg && <circle cx={c} cy={c} r={R} fill={P.bg} />}
                <circle cx={c} cy={c} r={R} fill="none" stroke={P.ringC} strokeOpacity={0.16} strokeWidth={P.ringW} />
                <circle cx={c} cy={c} r={R} fill="none" stroke={P.ringC} strokeWidth={P.ringW} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - p)} transform={`rotate(-90 ${c} ${c})`} style={{ filter: `drop-shadow(0 0 6px ${P.ringC})` }} />
              </>}
            </svg>
            <div style={{ position: "relative", zIndex: 1, fontFamily: `'${P.fontFamily}'`, fontWeight: 700, fontSize: P.fontSize, color, lineHeight: 1, display: "flex", alignItems: "center" }}>{inner}</div>
          </div>
          {rz}
        </div>
      );
    }
    return (
      <div onPointerDown={down} style={common}>
        <div style={{ ...(box || {}), fontFamily: `'${P.fontFamily}'`, fontWeight: 600, fontSize: P.fontSize, color, lineHeight: 1, display: "flex", alignItems: "center" }}>{inner}</div>
        {rz}
      </div>
    );
  }

  if (obj.type === "chart") {
    const data = parseChart(P.dataStr);
    const n = data.length;
    const W = P.w, Hh = P.h;
    const padL = 14, padB = P.showVals ? 30 : 18, padT = 20;
    const plotW = W - padL * 2, plotH = Hh - padT - padB;
    const vmax = Math.max(1, ...data.map((d) => d.v));
    const eAll = EASE.easeInOutSine(clamp01((time - P.start) / P.dur));
    const els = [];
    /* faint grid */
    for (let gI = 1; gI <= 3; gI++) els.push(<line key={"g" + gI} x1={padL} x2={W - padL} y1={padT + (plotH * gI) / 4} y2={padT + (plotH * gI) / 4} stroke="#FFFFFF" strokeOpacity={0.07} />);
    if (P.chartType === "bar" && n) {
      const bw = Math.min(72, (plotW / n) * 0.56);
      data.forEach((d, i) => {
        const ui = clamp01((time - P.start - i * 110) / Math.max(300, P.dur * 0.55));
        const eh = Math.min(1.04, EASE.easeOutBack(ui)) * (d.v / vmax) * plotH;
        const bx = padL + (plotW / n) * (i + 0.5) - bw / 2;
        const col = SWATCHES[i % 5];
        els.push(<rect key={"b" + i} x={bx} y={padT + plotH - Math.max(0, eh)} width={bw} height={Math.max(0, eh)} rx={Math.min(8, bw / 4)} fill={col} style={{ filter: `drop-shadow(0 4px 10px ${col}44)` }} />);
        els.push(<text key={"l" + i} x={bx + bw / 2} y={Hh - 4} textAnchor="middle" fill="#98A0B4" fontSize={12} fontFamily="'Inter'" fontWeight={600} opacity={eAll}>{d.l}</text>);
        if (P.showVals) els.push(<text key={"v" + i} x={bx + bw / 2} y={padT + plotH - Math.max(0, eh) - 7} textAnchor="middle" fill="#E9EBF2" fontSize={13} fontFamily="'JetBrains Mono'" fontWeight={600} opacity={clamp01(ui * 1.4)}>{Math.round(d.v * EASE.easeOutCubic(ui))}</text>);
      });
    }
    if (P.chartType === "line" && n > 1) {
      const pts2 = data.map((d, i) => [padL + (plotW * i) / (n - 1), padT + plotH - (d.v / vmax) * plotH]);
      const dStr = pts2.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
      const areaStr = dStr + `L${(padL + plotW).toFixed(1)} ${(padT + plotH).toFixed(1)}L${padL} ${(padT + plotH).toFixed(1)}Z`;
      els.push(<path key="ar" d={areaStr} fill={SWATCHES[2]} fillOpacity={0.12 * eAll} />);
      els.push(<path key="ln" d={dStr} fill="none" stroke={SWATCHES[2]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - eAll)} style={{ filter: `drop-shadow(0 0 6px ${SWATCHES[2]}66)` }} />);
      pts2.forEach((p, i) => {
        const ui = clamp01((eAll * (n - 1) - i + 0.5) * 2);
        els.push(<circle key={"d" + i} cx={p[0]} cy={p[1]} r={4.5 * Math.min(1.15, EASE.easeOutBack(ui))} fill="#fff" stroke={SWATCHES[2]} strokeWidth={2.5} opacity={ui} />);
        if (P.showVals) els.push(<text key={"v" + i} x={p[0]} y={p[1] - 12} textAnchor="middle" fill="#E9EBF2" fontSize={12.5} fontFamily="'JetBrains Mono'" fontWeight={600} opacity={ui}>{data[i].v}</text>);
        els.push(<text key={"l" + i} x={p[0]} y={Hh - 4} textAnchor="middle" fill="#98A0B4" fontSize={12} fontFamily="'Inter'" fontWeight={600} opacity={eAll}>{data[i].l}</text>);
      });
    }
    if (P.chartType === "donut" && n) {
      const total = data.reduce((a, d) => a + d.v, 0) || 1;
      const cx2 = W / 2, cy2 = padT + plotH / 2, R2 = Math.min(plotW, plotH) / 2 - 6;
      const sweep = eAll * 359.9;
      let acc = 0;
      data.forEach((d, i) => {
        const a0 = (acc / total) * 359.9;
        acc += d.v;
        const a1 = (acc / total) * 359.9;
        const vis0 = Math.min(a0, sweep), vis1 = Math.min(a1, sweep);
        if (vis1 <= vis0) return;
        els.push(<path key={"s" + i} d={arcPath(cx2, cy2, R2, -90 + vis0, -90 + vis1)} fill={SWATCHES[i % 5]} style={{ filter: `drop-shadow(0 3px 8px ${SWATCHES[i % 5]}33)` }} />);
      });
      els.push(<circle key="hole" cx={cx2} cy={cy2} r={R2 * 0.62} fill="#12151C" />);
      if (P.showVals) els.push(<text key="tot" x={cx2} y={cy2 + 6} textAnchor="middle" fill="#E9EBF2" fontSize={Math.max(16, R2 * 0.34)} fontFamily="'JetBrains Mono'" fontWeight={700}>{Math.round(total * EASE.easeOutCubic(eAll))}</text>);
      data.forEach((d, i) => {
        els.push(<circle key={"lg" + i} cx={14} cy={16 + i * 18} r={5} fill={SWATCHES[i % 5]} opacity={eAll} />);
        els.push(<text key={"lt" + i} x={25} y={20 + i * 18} fill="#98A0B4" fontSize={11.5} fontFamily="'Inter'" fontWeight={600} opacity={eAll}>{d.l}</text>);
      });
    }
    const pad = P.pad || 0;
    return (
      <div onPointerDown={down} style={common}>
        <div style={{ width: W + pad * 2, height: Hh + pad * 2, padding: pad, boxSizing: "border-box", background: P.bg || "transparent", opacity: P.bg ? P.bgOp : 1, borderRadius: P.radius, border: P.borderW ? `${P.borderW}px solid ${P.borderC}` : "none" }}>
          <svg width={W} height={Hh} style={{ display: "block", overflow: "visible" }}>{els}</svg>
        </div>
        {rz}
      </div>
    );
  }

  if (obj.type === "map") {
    const m = MAPS[P.country];
    const box = mapBox(m);
    return <MapEffectShape id={obj.id} d={ringsToPath(m.rings)} box={box} P={P} time={time} down={down} common={common} rz={rz} />;
  }

  if (obj.type === "continent") {
    const codes = CONTINENTS[P.continent] || [];
    const d = codes.map((cc) => WORLD_D[cc]).filter(Boolean).join(" ");
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    codes.forEach((cc) => { const e = WORLD_EXT[cc]; if (!e) return; mnx = Math.min(mnx, e[0]); mny = Math.min(mny, e[1]); mxx = Math.max(mxx, e[2]); mxy = Math.max(mxy, e[3]); });
    if (mnx > mxx) return null;
    const box = { w: mxx - mnx, h: mxy - mny, ox: mnx, oy: mny };
    const his = normHi(P.hi).filter((hh) => codes.includes(hh.cc));
    if (!his.length) return <MapEffectShape id={obj.id} d={d} box={box} P={P} time={time} down={down} common={common} rz={rz} />;
    /* highlights present: same zoom-and-spotlight behavior as the World map,
       just cropped to this continent's own bounding box instead of the globe */
    const fallbackCenter = { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 };
    const zk = P.zoomK || 2.2;
    const cam = P.autoZoom !== false ? worldCameraAt({ ...P, hi: his }, time, fallbackCenter) : { focus: 0, cx: fallbackCenter.cx, cy: fallbackCenter.cy };
    const k = 1 + (zk - 1) * cam.focus;
    const gT = `translate(${cam.cx.toFixed(2)} ${cam.cy.toFixed(2)}) scale(${k.toFixed(3)}) translate(${(-cam.cx).toFixed(2)} ${(-cam.cy).toFixed(2)})`;
    const rd = Math.max(120, P.revealDur || 600);
    const hh_ = (P.w * box.h) / box.w;
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={hh_} viewBox={`${box.ox - 7} ${box.oy - 7} ${box.w + 14} ${box.h + 14}`} style={{ display: "block", overflow: "visible" }}>
          <g transform={gT}>
            <g style={{ filter: cam.focus > 0.02 ? `blur(${(2.5 * cam.focus).toFixed(2)}px)` : "none", opacity: 1 - 0.35 * cam.focus }}>
              <MapEffectPaths id={obj.id} d={d} P={P} time={time} />
            </g>
            {his.map((hh) => {
              const { cc, t } = hh;
              if (!WORLD_D[cc]) return null;
              const u = clamp01((time - t) / rd);
              if (u <= 0) return null;
              const ou = hh.out != null ? clamp01((time - hh.out) / Math.max(150, rd * 0.6)) : 0;
              if (ou >= 1) return null;
              const aMul = 1 - EASE.easeInQuad(ou);
              const R = P.reveal || "simple";
              const e = WORLD_EXT[cc] || [0, 0, 0, 0];
              const ccx = (e[0] + e[2]) / 2, ccy = (e[1] + e[3]) / 2;
              const glow = P.glow ? { filter: `drop-shadow(0 0 2.5px ${P.hiFill}) drop-shadow(0 0 ${(6 + 2.5 * Math.sin(time / 350)).toFixed(1)}px ${P.hiFill})` } : {};
              let el = null;
              if (R === "electric") {
                if (!highlightFlick(u, cc.charCodeAt(0) * 7 + cc.charCodeAt(1))) return null;
                el = <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />;
              } else if (R === "pop") {
                const sc = 0.2 + 0.8 * EASE.easeOutBack(u);
                el = (
                  <g transform={`translate(${ccx} ${ccy}) scale(${sc.toFixed(3)}) translate(${-ccx} ${-ccy})`} opacity={clamp01(u * 2)}>
                    <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else if (R === "trace") {
                const teu = EASE.easeInOutCubic(u);
                el = (
                  <g>
                    <path d={WORLD_D[cc]} fill={P.hiFill} fillOpacity={clamp01((u - 0.6) / 0.4)} stroke="none" />
                    <path d={WORLD_D[cc]} fill="none" stroke={P.hiStroke} strokeWidth={P.strokeW * 2.2} vectorEffect="non-scaling-stroke" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - teu)} strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else {
                const fillc = lerpColor(P.fillC, P.hiFill, EASE.easeOutCubic(u));
                el = <path d={WORLD_D[cc]} fill={fillc} stroke={P.hiStroke} strokeOpacity={u} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={u > 0.5 ? glow : {}} />;
              }
              return <g key={cc} opacity={aMul}>{el}</g>;
            })}
          </g>
        </svg>
        {rz}
      </div>
    );
  }

  if (obj.type === "world") {
    const h = (P.w * WORLD_H) / 200;
    const his = normHi(P.hi);
    const zk = P.zoomK || 2.6;
    const auto = P.autoZoom !== false;
    const cam = auto ? worldCameraAt(P, time) : (() => {
      const fo2 = clamp01(valueAt(obj, "focus", time));
      let gx2 = 100, gy2 = WORLD_H / 2;
      if (his.length) {
        let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
        his.forEach(({ cc }) => { const e = WORLD_EXT[cc]; if (!e) return; mnx = Math.min(mnx, e[0]); mny = Math.min(mny, e[1]); mxx = Math.max(mxx, e[2]); mxy = Math.max(mxy, e[3]); });
        if (mnx < 1e9) { gx2 = (mnx + mxx) / 2; gy2 = (mny + mxy) / 2; }
      }
      return { focus: fo2, cx: gx2, cy: gy2 };
    })();
    const fo = cam.focus, gx = cam.cx, gy = cam.cy;
    const k = 1 + (zk - 1) * fo;
    const tx = (100 - gx) * fo, ty = (WORLD_H / 2 - gy) * fo;
    const gT = `translate(${(gx + tx).toFixed(2)} ${(gy + ty).toFixed(2)}) scale(${k.toFixed(3)}) translate(${(-gx).toFixed(2)} ${(-gy).toFixed(2)})`;
    const rd = Math.max(120, P.revealDur || 600);
    const flick = highlightFlick;
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={h} viewBox={`-2 -2 204 ${WORLD_H + 4}`} style={{ display: "block", overflow: "visible" }}>
          <g style={{ filter: fo > 0.02 ? `blur(${(3.5 * fo).toFixed(2)}px)` : "none", opacity: 1 - 0.45 * fo }}>
            {Object.keys(WORLD_D).map((cc) => (
              <path key={cc} d={WORLD_D[cc]} fill={P.base} fillOpacity={P.baseOp} stroke={P.stroke} strokeWidth={P.strokeW} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ))}
          </g>
          <g transform={gT}>
            {his.map((hh) => {
              const { cc, t } = hh;
              if (!WORLD_D[cc]) return null;
              const u = clamp01((time - t) / rd);
              if (u <= 0) return null;
              const ou = hh.out != null ? clamp01((time - hh.out) / Math.max(150, rd * 0.6)) : 0;
              if (ou >= 1) return null;
              const aMul = 1 - EASE.easeInQuad(ou);
              const R = P.reveal || "simple";
              const e = WORLD_EXT[cc] || [0, 0, 0, 0];
              const ccx = (e[0] + e[2]) / 2, ccy = (e[1] + e[3]) / 2;
              const glow = P.glow ? { filter: `drop-shadow(0 0 2.5px ${P.hiFill}) drop-shadow(0 0 ${(6 + 2.5 * Math.sin(time / 350)).toFixed(1)}px ${P.hiFill})` } : {};
              let el = null;
              if (R === "electric") {
                if (!flick(u, cc.charCodeAt(0) * 7 + cc.charCodeAt(1))) return null;
                el = <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />;
              } else if (R === "pop") {
                const sc = 0.2 + 0.8 * EASE.easeOutBack(u);
                el = (
                  <g transform={`translate(${ccx} ${ccy}) scale(${sc.toFixed(3)}) translate(${-ccx} ${-ccy})`} opacity={clamp01(u * 2)}>
                    <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else if (R === "trace") {
                const teu = EASE.easeInOutCubic(u);
                el = (
                  <g>
                    <path d={WORLD_D[cc]} fill={P.hiFill} fillOpacity={clamp01((u - 0.6) / 0.4)} stroke="none" />
                    <path d={WORLD_D[cc]} fill="none" stroke={P.hiStroke} strokeWidth={P.strokeW * 2.2} vectorEffect="non-scaling-stroke" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - teu)} strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else {
                const fillc = lerpColor(P.base, P.hiFill, EASE.easeOutCubic(u));
                el = <path d={WORLD_D[cc]} fill={fillc} stroke={P.hiStroke} strokeOpacity={u} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={u > 0.5 ? glow : {}} />;
              }
              return <g key={cc} opacity={aMul}>{el}</g>;
            })}
          </g>
        </svg>
        {rz}
      </div>
    );
  }

  return null;
}

/* ============================================================
   PATH EDITOR OVERLAY
   ============================================================ */
function PathEditor({ obj, onPtDown, patchPath, locked }) {
  const path = obj.props.path;
  const sp = pathSamples(path);
  const d = sp.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", zIndex: 60 }}>
      <path d={d} fill="none" stroke="#6EE7B7" strokeOpacity={0.35} strokeWidth={5} />
      <path d={d} fill="none" stroke="#6EE7B7" strokeWidth={1.5} strokeDasharray="6 6" />
      {!locked && path.pts.map((p, i) => (
        <g key={i} style={{ pointerEvents: "auto" }}>
          <circle cx={p[0]} cy={p[1]} r={13} fill="transparent" style={{ cursor: "grab" }}
            onPointerDown={(e) => { e.stopPropagation(); onPtDown(e, obj.id, i); }}
            onDoubleClick={() => path.pts.length > 2 && patchPath(obj.id, (pp) => ({ ...pp, pts: pp.pts.filter((_, j) => j !== i) }))} />
          <circle cx={p[0]} cy={p[1]} r={6.5} fill="#0A0C10" stroke="#6EE7B7" strokeWidth={2.5} style={{ pointerEvents: "none" }} />
        </g>
      ))}
      {!locked && path.pts.slice(0, -1).map((p, i) => {
        const q = path.pts[i + 1];
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        return (
          <g key={"m" + i} style={{ pointerEvents: "auto", cursor: "copy" }}
            onPointerDown={(e) => { e.stopPropagation(); patchPath(obj.id, (pp) => { const pts = [...pp.pts]; pts.splice(i + 1, 0, [Math.round(mx), Math.round(my)]); return { ...pp, pts }; }); }}>
            <circle cx={mx} cy={my} r={8} fill="#10131A" stroke="#6EE7B7" strokeWidth={1.5} strokeOpacity={0.7} />
            <text x={mx} y={my + 3.5} textAnchor="middle" fill="#6EE7B7" fontSize={11} fontWeight={700} style={{ pointerEvents: "none" }}>+</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   UI PIECES
   ============================================================ */
function Card({ title, hint, children }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "11px 12px", marginBottom: 10 }}>
      <div style={{ ...sectionLabel, marginBottom: 9 }}>
        {title} {hint && <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: C.faint }}>· {hint}</span>}
      </div>
      {children}
    </div>
  );
}
function ChipRow({ label, options, value, onChange, wrap }) {
  return (
    <div style={{ display: "flex", alignItems: wrap ? "flex-start" : "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 11, fontWeight: 600, flexShrink: 0, paddingTop: wrap ? 4 : 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map(([v, nm]) => (
          <button key={String(v)} className="gd-btn" onClick={() => onChange(v)}
            style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: value === v ? C.amber : C.line, color: value === v ? C.amber : C.dim }}>{nm}</button>
        ))}
      </div>
    </div>
  );
}
function ColorKfRow({ label, obj, time, sw, onEdit, onKf }) {
  const track = obj.tracks.fill || [];
  const cur = colorAt(obj, "fill", time);
  const has = !!kfAt(track, Math.round(time / 10) * 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
      <button onClick={() => onKf(has, cur)} title={has ? "Remove color keyframe" : "Add color keyframe (shown as ● on the timeline)"}
        style={{ width: 18, height: 18, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: has ? cur : "transparent", border: `1.5px solid ${track.length ? C.amber : C.faint}`, display: "block" }} />
      </button>
      <span style={{ width: 44, color: C.dim, fontSize: 11, fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {sw.map((c) => <div key={c} onClick={() => onEdit(c)} style={{ width: 16, height: 16, borderRadius: 5, background: c, cursor: "pointer", border: cur.toLowerCase() === c.toLowerCase() ? `2px solid ${C.txt}` : `1px solid ${C.line}` }} />)}
        <input type="color" value={cur.slice(0, 7)} onChange={(e) => onEdit(e.target.value)} />
      </div>
    </div>
  );
}
function PropRow({ obj, prop, time, ctxDur, stage, onEdit, onKfToggle, onNav }) {
  const v = valueAt(obj, prop, time);
  const track = obj.tracks[prop] || [];
  const has = !!kfAt(track, Math.round(time / 10) * 10);
  const cfg = { x: [0, stage.w, 1], y: [0, stage.h, 1], prog: [0, 1, 0.005], focus: [0, 1, 0.005], scale: [0, 3, 0.01], rotation: [-360, 360, 1], opacity: [0, 1, 0.01] }[prop];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <button onClick={() => onKfToggle(has, v)} title={has ? "Remove keyframe" : "Add keyframe at playhead"}
        style={{ width: 17, height: 17, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 9, height: 9, transform: "rotate(45deg)", background: has ? C.amber : "transparent", border: `1.5px solid ${track.length ? C.amber : C.faint}`, display: "block", borderRadius: 1.5 }} />
      </button>
      {track.length > 0 ? (
        <span style={{ display: "flex", gap: 0 }}>
          <button onClick={() => onNav(-1)} title="Previous keyframe" style={navBtn}>‹</button>
          <button onClick={() => onNav(1)} title="Next keyframe" style={navBtn}>›</button>
        </span>
      ) : <span style={{ width: 26 }} />}
      <span style={{ width: 56, color: C.dim, fontSize: 10.5, fontWeight: 600 }}>{PROP_LABEL[prop]}</span>
      <input type="range" min={cfg[0]} max={cfg[1]} step={cfg[2]} value={v} onChange={(e) => onEdit(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 38, textAlign: "right", fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{prop === "opacity" || prop === "scale" || prop === "prog" ? v.toFixed(2) : Math.round(v)}</span>
    </div>
  );
}
function FontControls({ P, onChange, showSpacing, brand }) {
  return (
    <>
      <Row label="Font">
        <div style={{ display: "flex", gap: 5 }}>
          <select value={P.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} style={{ fontFamily: `'${P.fontFamily}'` }}>
            {FONTS.map((f) => <option key={f} style={{ fontFamily: `'${f}'` }}>{f}</option>)}
          </select>
          <button className="gd-btn" title={`Use brand font (${brand.headFont})`} onClick={() => onChange({ fontFamily: brand.headFont })} style={{ ...chipStyle, cursor: "pointer", flexShrink: 0 }}>Brand</button>
        </div>
      </Row>
      <ChipRow label="Weight" options={[[400, "Reg"], [600, "Semi"], [700, "Bold"], [800, "Heavy"]]} value={P.fontWeight} onChange={(v) => onChange({ fontWeight: v })} />
      <SliderRow label="Size" min={12} max={220} value={P.fontSize} onChange={(v) => onChange({ fontSize: v })} />
      {showSpacing && <SliderRow label="Spacing" min={-2} max={24} step={0.5} value={P.ls} onChange={(v) => onChange({ ls: v })} />}
      {showSpacing && <ChipRow label="Case" options={[[false, "As typed"], [true, "UPPERCASE"]]} value={P.upper} onChange={(v) => onChange({ upper: v })} />}
    </>
  );
}
function WorldPicker({ hi, onAdd, onRetime, onRemove, onSetOut, onClearOut, onSetZoomIn, onClearZoomIn, onSetZoomOut, onClearZoomOut, onToggleZoom, zoomHoldMs, scopeCodes, fmt }) {
  const [q, setQ] = useState("");
  const selected = hi.map((h) => h.cc);
  const pool = scopeCodes ? WORLD_LIST.filter((c) => scopeCodes.includes(c.cc)) : WORLD_LIST;
  const matches = q.trim() ? pool.filter((c) => c.n.toLowerCase().includes(q.toLowerCase()) && !selected.includes(c.cc)).slice(0, 12) : [];
  return (
    <div style={{ marginBottom: 9 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={scopeCodes ? "Search this region…" : "Search a country — it appears at the playhead…"} style={{ ...inputStyle, marginBottom: 6 }} />
      {matches.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {matches.map((c) => (
            <button key={c.cc} className="gd-btn" onClick={() => { onAdd(c.cc); setQ(""); }} style={{ ...chipStyle, cursor: "pointer" }}>{c.n}</button>
          ))}
        </div>
      )}
      {hi.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hi.map((h) => {
            const zw = worldZoomWindow(h, { zoomHoldMs });
            const zoomOn = h.zoom !== false;
            return (
              <div key={h.cc} style={{ background: "#171B24", border: "1px solid #232936", borderRadius: 8, padding: "8px 9px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: "#F5A524", flex: 1 }}>{WORLD[h.cc]?.n || h.cc}</span>
                  <span onClick={() => onToggleZoom(h.cc)} title={zoomOn ? "Camera pushes in for this country — click to disable" : "Camera ignores this country — click to enable"}
                    style={{ ...chipStyle, cursor: "pointer", fontSize: 10, borderColor: zoomOn ? "#5B8DEF" : "#232936", color: zoomOn ? "#5B8DEF" : "#5D667A" }}>{zoomOn ? "🔍 zoom on" : "🔍 zoom off"}</span>
                  <span onClick={() => onRemove(h.cc)} title="Remove country" style={{ cursor: "pointer", color: "#E5636A", fontWeight: 800, fontSize: 13 }}>✕</span>
                </div>
                {/* 4 independent points, each: label • time • click-to-retime, click-to-set when unset */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  <PointBtn label="Appears" time={h.t} onClick={() => onRetime(h.cc)} color="#F5A524" />
                  <PointBtn label="Hides" time={h.out} auto={h.out == null} onClick={() => onSetOut(h.cc)} onClear={h.out != null ? () => onClearOut(h.cc) : null} color="#E5636A" placeholder="never" />
                  {zoomOn && <PointBtn label="Zoom in" time={zw.zin} auto={zw.zinAuto} onClick={() => onSetZoomIn(h.cc)} onClear={!zw.zinAuto ? () => onClearZoomIn(h.cc) : null} color="#5B8DEF" />}
                  {zoomOn && <PointBtn label="Zoom out" time={zw.zout} auto={zw.zoutAuto} onClick={() => onSetZoomOut(h.cc)} onClear={!zw.zoutAuto ? () => onClearZoomOut(h.cc) : null} color="#5B8DEF" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ color: "#5D667A", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>Timeline markers: ■ filled = appear, ◻ hollow = hide, ▶/◀ blue triangles = zoom in/out (faint = auto, solid = set by you). Drag any of them, or click a point above to set it at the playhead.</div>
    </div>
  );
}
function PointBtn({ label, time, auto, onClick, onClear, color, placeholder }) {
  return (
    <div onClick={onClick} title={time == null ? `Set ${label.toLowerCase()} at the playhead` : `Click to re-time to the playhead`}
      style={{ cursor: "pointer", background: "#10131A", border: `1px solid ${time != null && !auto ? color : "#232936"}`, borderRadius: 6, padding: "4px 7px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#5D667A", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono'", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: time == null ? "#5D667A" : auto ? "#939BAD" : color }}>
          {time == null ? (placeholder || "+ set") : fmtMs(time)}{auto && time != null ? " · auto" : ""}
        </span>
        {onClear && <span onClick={(e) => { e.stopPropagation(); onClear(); }} title="Clear — back to auto" style={{ marginLeft: "auto", color: "#5D667A", fontSize: 10, fontWeight: 800 }}>∅</span>}
      </div>
    </div>
  );
}
function fmtMs(ms) { return `${Math.floor(ms / 1000)}:${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`; }
function MenuBtn({ children, onClick, danger }) {
  return <button className="gd-btn" onClick={onClick} style={{ background: "transparent", border: "none", color: danger ? C.danger : C.txt, borderRadius: 7, padding: "7px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12, textAlign: "left" }}>{children}</button>;
}
/* music note — 1.5px stroke, matches the design system's minimal icon style */
function NoteIcon({ size = 18, color = C.dim }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18.25V5.5l10-2v12.75" />
      <circle cx="6.75" cy="18.25" r="2.25" />
      <circle cx="16.75" cy="16.25" r="2.25" />
    </svg>
  );
}
function MiniBtn({ children, onClick, title, danger }) {
  return <button title={title} onClick={onClick} style={{ width: 16, height: 16, background: "none", border: "none", color: danger ? C.danger : C.faint, cursor: "pointer", fontSize: 9, padding: 0, lineHeight: 1 }}>{children}</button>;
}
function RailBtn({ label, glyph, onClick, active }) {
  return (
    <button className="gd-btn" onClick={onClick}
      style={{ width: 56, height: 50, background: active ? C.bg3 : C.bg2, border: `1px solid ${active ? C.amber : C.line}`, borderRadius: 6, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0 }}>
      {glyph}
      <span style={{ fontSize: 9, color: active ? C.amber : C.dim, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
function SliderRow({ label, min, max, step = 1, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: "right", fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{step < 1 ? (+value).toFixed(step < 0.1 ? 2 : 1) : Math.round(value)}</span>
    </div>
  );
}
function EaseCurve({ ease }) {
  const fn = EASE[ease] || EASE.linear;
  const pts = Array.from({ length: 41 }, (_, i) => { const u = i / 40; return `${8 + u * 104},${52 - fn(u) * 44}`; }).join(" ");
  return (
    <svg width="120" height="60" style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, display: "block" }}>
      <line x1="8" y1="52" x2="112" y2="52" stroke={C.line} />
      <line x1="8" y1="8" x2="112" y2="8" stroke={C.line} strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke={C.amber} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
const inputStyle = { width: "100%", background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", padding: "6px 9px", fontSize: 12.5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
const chipStyle = { background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#939BAD", padding: "4px 10px", fontSize: 11, fontWeight: 600 };
const transportBtn = { width: 30, height: 28, background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" };
const zoomCtlBtn = { height: 24, minWidth: 26, background: "transparent", border: "none", borderRadius: 4, color: "#939BAD", cursor: "pointer", fontSize: 14, padding: "0 6px", display: "flex", alignItems: "center", justifyContent: "center" };
const navBtn = { width: 13, height: 17, background: "none", border: "none", color: "#939BAD", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, fontWeight: 700 };
const sectionLabel = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5D667A" };
