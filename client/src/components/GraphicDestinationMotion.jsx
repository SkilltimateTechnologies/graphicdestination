import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ExportDialog from "./ExportDialog";
import { api } from "../api";
import { prepareImageFile } from "../lib/imagePrep";
import { makeAudioTrack, audioToJson, audioFromJson, audioGainAt, audioWithinAt, validateAudioFile, AUDIO_ACCEPT_ATTR } from "../lib/audioTrack";
import { clamp01 } from "../engine/easing.js";
import { SHAPE_DEFS } from "../engine/shapes.js";
import { valueAt, posOf, clipLocalTime } from "../engine/keyframes.js";
import { cameraAt, cameraTransform, cameraFromJson, cameraToJson, clampZoom, depthFactor } from "../engine/camera.js";
import { normHi } from "../engine/maps.js";
import { FONT_IMPORT } from "../engine/fx.js";
import { kitRenderSpec } from "../engine/kits.js";
import { C, KF_PROPS, STAGE_PRESETS, kfAt, layerOut, layerSpan, packRows, objSize, reframeClipToContent, objectsInRect, DEFAULT_INSERT_SIZE } from "./editor/model";
import { svgDataUri, iconInsertSize } from "../engine/svgIcon.js";
import { computeSnap, SNAP_THRESHOLD } from "./editor/snapping";
import TopBar from "./editor/TopBar";
import IconRail from "./editor/IconRail";
import ShapesPanel from "./editor/panels/ShapesPanel";
import NumberPanel from "./editor/panels/NumberPanel";
import MapsPanel from "./editor/panels/MapsPanel";
import ImagePanel from "./editor/panels/ImagePanel";
import AudioPanel from "./editor/panels/AudioPanel";
import TemplatesPanel from "./editor/panels/TemplatesPanel";
import IconsPanel from "./editor/panels/IconsPanel";
import UIElementsPanel from "./editor/panels/UIElementsPanel";
import ConfettiPanel from "./editor/panels/ConfettiPanel";
import ChartsPanel from "./editor/panels/ChartsPanel";
import BackgroundsPanel from "./editor/panels/BackgroundsPanel";
import TextPanel from "./editor/panels/TextPanel";
import { useUserSettings, readCachedSettings, resolveLoadedStageBg, resolveTextStyles, kitToBrand, upsertBrand, defaultStageBg, ENGINE_STAGE_BG } from "../lib/settings.js";
import { BACKDROP_VARIANTS, backdropDefaults, themeOf, variantOf } from "../engine/backdrops.js";
import StageView from "./editor/StageView";
import Inspector from "./editor/Inspector";
import Timeline, { rowJumpTarget, TL_ROW_H, rippleShift, TAG_PALETTE } from "./editor/Timeline";
import { ContextMenu } from "./editor/modals";

/* Re-export the pure engine API so the export pipeline
   (export/frameRenderer.js, export/exportWebm.js, export/validateFrameMath.mjs)
   keeps importing it from this module, unchanged. */
export { EASE, clamp01 } from "../engine/easing.js";
export { mulberry32 } from "../engine/random.js";
export { lerpPts, shapePtsOf, morphPtsAt, pointOnPath } from "../engine/shapes.js";
export { valueAt, colorAt, lerpColor, posOf, fxDuration, clipLocalTime, clipTransition } from "../engine/keyframes.js";
export { CAM_DEFAULTS, CAM_ZOOM_MIN, CAM_ZOOM_MAX, CAM_DEPTH_MIN, CAM_DEPTH_MAX, CAM_PROPS, clampZoom, clampDepth, depthFactor, cameraAt, cameraTransform, camIsIdentity, camTransformCss, cameraFromJson, cameraToJson, cameraKeyCount } from "../engine/camera.js";
export { FONT_IMPORT, charFx, numberValue, numberColumns, numMode, formatNumber, contrastOn, confettiParticles, parseChart, highlightFlick, worldCameraAt } from "../engine/fx.js";

/* ============================================================
   GRAPHIC DESTINATION — Motion  (prototype v0.2)
   shapes folder · shape morphing · text FX · number rollers ·
   real country maps + border FX · images · export/import
   ============================================================ */

const STAGE_W = 1280;
const STAGE_H = 720;
const DRAG_MIN_VISIBLE = 40; /* stage drag: px of an object that must stay inside the stage bounds on every axis (live clamp) */

/* timeline vertical resize + stage zoom */
const TL_H_KEY = "gd:timelineH";
const TL_H_DEFAULT = 240;
const TL_H_MIN = 160;
const clampTlH = (h) => Math.max(TL_H_MIN, Math.min(window.innerHeight * 0.45, h));
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5];
/* Animate arm (R9w1 — restored at the user's request, beside the Grid toggle
   in the timeline transport bar). ARMED (default): every canvas-transform
   drop writes/replaces a ◆ at the playhead through the one withKeyframe /
   setKeyframe path (the R8 always-on behavior). DISARMED: canvas edits patch
   the base layer and write NO keyframes. Persisted under its own key — the
   removed R8 autokey pref ("gd:autokey") stays gone for good. */
const ARM_KEY = "gd:animateArm";
const readArm = () => { try { const v = localStorage.getItem(ARM_KEY); return v === null ? true : v === "1"; } catch { return true; } };
/* canvas alignment grid (timeline-bar toggle, persisted): a subtle 40px
   lattice overlay on the stage — pure visual aid, never exported */
const GRID_KEY = "gd:grid";
const readGrid = () => { try { return localStorage.getItem(GRID_KEY) === "1"; } catch { return false; } };
/* smart snapping (stage zoom-cluster magnet toggle, persisted): body-drags and
   resize-grip drags snap to sibling edges/centers + canvas center/edges with
   alignment guides; Alt-drag inverts the toggle for the gesture */
const SNAP_KEY = "gd:snapping";
const readSnapping = () => { try { const v = localStorage.getItem(SNAP_KEY); return v === null ? true : v === "1"; } catch { return true; } };

/* ============================================================
   KEYFRAMES + INTERPOLATION
   ============================================================ */
const ANIM_PROPS = ["x", "y", "scale", "rotation", "opacity"];

function withKeyframe(track = [], t, v, ease) {
  const T = Math.round(t / 10) * 10;
  const old = track.find((k) => Math.abs(k.t - T) <= 5);
  const next = track.filter((k) => Math.abs(k.t - T) > 5);
  next.push({ t: T, v, ease: ease || (old && old.ease) || "easeInOutCubic" });
  next.sort((a, b) => a.t - b.t);
  return next;
}

/* ============================================================
   R8w3 — CANVAS-DROP KEYFRAME MODEL (pure, exported)
   Every canvas transform drop lands ◆ keyframes at the playhead through the
   one withKeyframe/setKeyframe path (autokey is ALWAYS-ON):
     move   → x ◆ + y ◆          (every type — incl. confetti + backdrop)
     rotate → rotation ◆         (every gripped type — all but confetti/backdrop)
     resize → scale ◆ + a base-compensation patch
   Resize rides the `scale` prop because it is the ONLY size channel that is
   keyframable end-to-end: it renders (valueAt in StageObject), it shows on
   the timeline lanes (KF_PROPS) and it interpolates — w/h/fontSize tracks
   would be inert in the renderer and invisible on the timeline. The pure
   helpers below are extracted and exercised by check-r8w3.mjs so the node
   audit runs the exact drop math the gestures use.
   ============================================================ */
export function resizeDropPlan({ fw, fh, s0, lo = 0.05, hi = 10 }) {
  /* pick the DOMINANT axis factor (a corner drag's bigger change), clamp the
     resulting scale into [lo, hi], and derive g — the base-compensation
     divisor that keeps the drop-time render pixel-identical to the live drag
     (base := dragged / g under the new scale s0·g). A bare grip click
     (fw = fh = 1) reports changed:false so no stray ◆ is written. */
  const f = Math.abs(Math.log(Math.max(1e-9, fw))) >= Math.abs(Math.log(Math.max(1e-9, fh))) ? fw : fh;
  const ns = Math.max(lo, Math.min(hi, Math.round(s0 * f * 100) / 100));
  const g = ns / Math.max(1e-9, s0);
  return { ns, g, changed: Math.abs(g - 1) > 1e-6 };
}

/* ============================================================
   R8w3 — OBJECT-LEVEL CAMERA ACTIONS (pure, exported)
   One-click camera moves a selected object drives WITHOUT manual track
   editing: each action anchors the current framing at the playhead and lands
   eased (withKeyframe default easeInOutCubic) one beat later. The math below
   inverts the engine's own transform (engine/camera.js):
     screen(p) = (p − c0)·s + c0 + (−camX·f, −camY·f),  s = 1 + (zoom−1)·f
   so centering p means camX = (px − c0x)·s / f (and likewise for y).
   ============================================================ */
export const CAM_ACT_BEAT = 600; /* ms — every one-click move lands one beat after the playhead */
export const CAM_FIT_FILL = 0.8; /* zoom-to-fit leaves a 10% margin on the limiting axis */
export function cameraFocusXY({ ox, oy, zoom, depth, stage }) {
  /* camera x/y that centers an object sitting at stage point (ox, oy), given
     the zoom it will be under. f floors at 0.1 (the depth slider's own min)
     so a camera-locked layer (depth −1 ⇒ f 0) still yields a finite pan. */
  const f = Math.max(0.1, depthFactor(depth));
  const s = 1 + (zoom - 1) * f;
  return { x: Math.round(((ox - stage.w / 2) * s) / f), y: Math.round(((oy - stage.h / 2) * s) / f) };
}
export function cameraFitZoom({ w, h, depth, stage, fill = CAM_FIT_FILL }) {
  /* zoom at which an object of RENDERED size w×h (objSize × its scale prop)
     fills `fill` of the stage on the limiting axis: screen = size·(1+(z−1)f) */
  const f = Math.max(0.1, depthFactor(depth));
  const k = Math.min((stage.w * fill) / Math.max(1e-6, w), (stage.h * fill) / Math.max(1e-6, h));
  return Math.round(clampZoom(1 + (k - 1) / f) * 100) / 100;
}
export function cameraPushZoom(zoom, dir) {
  /* Push in (dir +1) / Pull out (dir −1): a gentle 1.25× zoom step, clamped */
  return Math.round(clampZoom(zoom * (dir > 0 ? 1.25 : 1 / 1.25)) * 100) / 100;
}

/* ============================================================
   OBJECTS
   ============================================================ */
let _uid = 100;
const uid = () => `ob${_uid++}`;
const BOX_DEFAULTS = { bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none" };

function makeObject(type, over = {}) {
  const base = {
    id: uid(), type, name: type[0].toUpperCase() + type.slice(1), tracks: {}, locked: false, hidden: false,
    props: { x: STAGE_W / 2, y: STAGE_H / 2, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: DEFAULT_INSERT_SIZE, h: DEFAULT_INSERT_SIZE, inT: 0, outT: null, path: null, prog: 0 },
  };
  /* cap (w,h) so the LONGEST side is DEFAULT_INSERT_SIZE, aspect preserved */
  const capToDefault = (w, h) => { const k = DEFAULT_INSERT_SIZE / Math.max(w, h, 1); return { w: Math.round(w * k), h: Math.round(h * k) }; };
  if (type === "shape") { base.props.shape = over.shape || "rect"; base.name = SHAPE_DEFS[base.props.shape].name; Object.assign(base.props, { w: DEFAULT_INSERT_SIZE, h: DEFAULT_INSERT_SIZE, fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0 }); }
  if (type === "text") { Object.assign(base.props, { text: "Headline", fontSize: 72, fontWeight: 700, w: 0, h: 0, textFx: null, fontFamily: "Space Grotesk", ls: 0.5, upper: false, pathMode: "flow", ...BOX_DEFAULTS }); }
  if (type === "image") { Object.assign(base.props, { src: over.src || "", ...capToDefault(320, 220) }); }
  if (type === "number") { base.name = "Number"; Object.assign(base.props, { from: 0, to: 100, start: 200, dur: 1600, style: "odometer", decimals: 0, prefix: "", suffix: "", fontSize: 96, fill: "#F9F9F9", numEase: "easeOutCubic", fontFamily: "JetBrains Mono", ring: "none", ringC: "#FFB224", ringW: 8, ...BOX_DEFAULTS }); }
  if (type === "map") { base.name = "Map"; Object.assign(base.props, { country: "IND", mapStyle: "comet", stroke: "#FFB224", fillC: "#FFB224", fillOp: 0.85, strokeW: 1.6, start: 200, dur: 1800, w: 420 }); }
  if (type === "continent") { base.name = "Continent"; Object.assign(base.props, { continent: "ASIA", mapStyle: "comet", stroke: "#FFB224", fillC: "#FFB224", fillOp: 0.7, strokeW: 1, start: 200, dur: 2200, w: 620, hi: [], reveal: "simple", revealDur: 600, hiFill: "#FFD984", hiStroke: "#ffffff", glow: true, autoZoom: true, zoomK: 2.2, zoomHoldMs: 1600, zoomTransMs: 550 }); }
  if (type === "confetti") { base.name = "Confetti"; Object.assign(base.props, { burst: 500, count: 70, power: 1, seed: 7, style: "burst" }); }
  if (type === "backdrop") { base.name = "Backdrop"; Object.assign(base.props, backdropDefaults()); }
  if (type === "chart") { base.name = "Chart"; Object.assign(base.props, { chartType: "bar", dataStr: "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84", start: 200, dur: 1400, ...capToDefault(560, 340), showVals: true, bg: "#171B24", bgOp: 1, radius: 18, borderC: "#2B3140", borderW: 1, pad: 20 }); }
  if (type === "world") { base.name = "World map"; Object.assign(base.props, { hi: [{ cc: "IND", t: 0, zoom: true }], reveal: "simple", revealDur: 600, zoomK: 2.6, autoZoom: true, zoomHoldMs: 1600, zoomTransMs: 550, focus: 0, base: "#2A3350", baseOp: 1, hiFill: "#FFB224", hiStroke: "#FFD984", stroke: "#3D4A6E", strokeW: 0.7, glow: true, w: 780 }); }
  if (type === "kit") {
    /* locked kit object (R7a): ONE layer, no children — props.kit is the
       engine/kits.js registry id, variant "animated"|"static" (icons),
       color = icon primary (null → the icon's natural), accent = UI accent.
       w/h are the display box the art scales into. */
    base.name = over.name || "Kit";
    Object.assign(base.props, { kit: "", variant: "animated", color: null, accent: "#FFB224", ...capToDefault(320, 320) });
  }
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
  const title = makeObject("text", { name: "Title", props: { text: "ZWOOSH", fontSize: 72, x: 640, y: 300, fill: "#F9F9F9", textFx: { type: "rise", start: 250, seed: 3 } } });
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
/* objSize + bboxOfLayers live in editor/model.js now (R7a) — ONE shared
   source for the editor, StageObject and the node checks. */
function layerVisible(o, t, dur) {
  if (o.type === "clip") return true;
  return t >= (o.props.inT || 0) && t <= layerOut(o, dur);
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

export { STAGE_PRESETS } from "./editor/model";
const DEFAULT_BRAND = { id: "b1", name: "Zwoosh", colors: ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#F9F9F9"], headFont: "Space Grotesk", bodyFont: "Inter" };

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
export default function GraphicDestinationMotion({ initialProject, onChange, saveState, onSaveNow, user, onLogout, onProfile, onDashboard, onSettings } = {}) {
  const [objects, setObjects] = useState(demoProject);
  const [stage, setStage] = useState({ w: 1280, h: 720 });
  const [compDur, setCompDur] = useState(6000);
  const [brands, setBrands] = useState([DEFAULT_BRAND]);
  const [brandId, setBrandId] = useState("b1");
  /* R9w3: the Brand modal is gone — brand kits live in user settings and
     apply through the TopBar switcher (same setBrands/setBrandId mechanism). */
  const { settings: userSettings, remote: settingsRemote } = useUserSettings();
  /* a factory-fresh blank project adopts the user's default bg — also when
     the server settings only arrive AFTER the project was loaded (cold
     localStorage cache): one-shot re-resolve while it is still untouched */
  const freshBlankRef = useRef(false);
  const settingsSettledRef = useRef(false);
  useEffect(() => {
    if (settingsRemote === null || settingsSettledRef.current) return;
    settingsSettledRef.current = true;
    if (freshBlankRef.current) { freshBlankRef.current = false; setStageBg(defaultStageBg(userSettings)); }
  }, [settingsRemote]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyBrandKit = useCallback((kit) => {
    if (!kit) return;
    const asBrand = kitToBrand(kit);
    setBrands((bs) => upsertBrand(bs, asBrand).brands);
    setBrandId(asBrand.id);
  }, []);
  const [path, setPath] = useState([]);
  const [selIds, setSelIds] = useState([]);
  const [selKf, setSelKf] = useState(null);
  const [rotLive, setRotLive] = useState(null); /* {id, deg} while a rotation-grip drag is active — drives the on-canvas angle readout */
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  /* autokey follows the Animate arm (R9w1): armed = keyframe every canvas
     edit (R8 behavior), disarmed = patch the base layer without keyframes. */
  const [animateArm, setAnimateArm] = useState(readArm);
  const autokey = animateArm;
  const setAnimateArmPersist = useCallback((v) => {
    setAnimateArm(v);
    try { localStorage.setItem(ARM_KEY, v ? "1" : "0"); } catch { /* storage unavailable — the arm just won't persist */ }
  }, []);
  /* R9w3 default stage background: a brand-new project starts on the user's
     configured default bg (Settings page); none selected → black. Loaded
     projects keep their own saved stage.bg (importProject below). */
  const [stageBg, setStageBg] = useState(() => resolveLoadedStageBg(null, readCachedSettings(), "#101218"));
  const [stageScale, setStageScale] = useState(0.6);
  const [zoomMode, setZoomMode] = useState("fit"); /* "fit" (auto) or a manual factor from ZOOM_STEPS */
  const [tlH, setTlH] = useState(() => { try { const v = parseFloat(localStorage.getItem(TL_H_KEY)); return Number.isFinite(v) ? clampTlH(v) : TL_H_DEFAULT; } catch { return TL_H_DEFAULT; } });
  const [tlDragging, setTlDragging] = useState(false);
  const [shapesOpen, setShapesOpenRaw] = useState(false);
  const [textOpen, setTextOpenRaw] = useState(false);
  const [numbersOpen, setNumbersOpenRaw] = useState(false);
  const [mapsOpen, setMapsOpenRaw] = useState(false);
  const [imagesOpen, setImagesOpenRaw] = useState(false);
  const [templatesOpen, setTemplatesOpenRaw] = useState(false);
  const [chartsOpen, setChartsOpenRaw] = useState(false);
  const [confettiOpen, setConfettiOpenRaw] = useState(false);
  const [bgOpen, setBgOpenRaw] = useState(false);
  const [tplQ, setTplQ] = useState(""); /* templates panel search (persists across open/close, like shapeQ) */
  const [tplCat, setTplCat] = useState("All");
  const [uiOpen, setUiOpenRaw] = useState(false); /* UI elements drawer (engine/kits.js) */
  const [svgIconsOpen, setSvgIconsOpenRaw] = useState(false); /* SVG icon library drawer (admin store) */
  /* rail panels are MUTUALLY EXCLUSIVE: every panel anchors at the same
     left:84 / top:12 / zIndex:30, so two open panels stack exactly and the
     one mounted first dead-blocks the other's clicks (R8w4 smoke: a Backdrop
     insert leaves its panel open — the Templates panel then opened UNDER it,
     unclickable). Opening one rail panel closes the rest; closing any panel
     keeps working (it just closes the others too — a no-op when they are
     already shut). */
  const RAIL_PANEL_SETTERS = [setShapesOpenRaw, setTextOpenRaw, setNumbersOpenRaw, setMapsOpenRaw, setImagesOpenRaw, setTemplatesOpenRaw, setChartsOpenRaw, setConfettiOpenRaw, setBgOpenRaw, setUiOpenRaw, setSvgIconsOpenRaw];
  const openOnly = (setter) => (v) => {
    RAIL_PANEL_SETTERS.forEach((s) => { if (s !== setter) s(false); });
    setter(v);
  };
  const setShapesOpen = openOnly(setShapesOpenRaw);
  const setTextOpen = openOnly(setTextOpenRaw);
  const setNumbersOpen = openOnly(setNumbersOpenRaw);
  const setMapsOpen = openOnly(setMapsOpenRaw);
  const setImagesOpen = openOnly(setImagesOpenRaw);
  const setTemplatesOpen = openOnly(setTemplatesOpenRaw);
  const setChartsOpen = openOnly(setChartsOpenRaw);
  const setConfettiOpen = openOnly(setConfettiOpenRaw);
  const setBgOpen = openOnly(setBgOpenRaw);
  const setUiOpen = openOnly(setUiOpenRaw);
  const setSvgIconsOpen = openOnly(setSvgIconsOpenRaw);
  const [uiQ, setUiQ] = useState("");
  const [uiCat, setUiCat] = useState("All");
  const [assets, setAssets] = useState(null); /* null = not fetched yet; [] = fetched, empty */
  const [assetsBusy, setAssetsBusy] = useState(false);
  const [assetErr, setAssetErr] = useState("");
  const [assetUploading, setAssetUploading] = useState(false);
  /* project-level audio track: { src, name, startT, volume, fadeIn, fadeOut } | null — all times engine ms */
  const [audioTrack, setAudioTrack] = useState(null);
  const [audioSel, setAudioSel] = useState(false); /* audio lane selected → inspector shows audio props */
  /* 2.5D scene camera: null = absent (identity — old projects) · { tracks:{x,y,zoom} }.
     Keyframes are evaluated with the same valueAt machinery as object props (engine/camera.js). */
  const [camera, setCamera] = useState(null);
  const [cameraSel, setCameraSel] = useState(false); /* camera lane selected → inspector shows camera props */
  const [selCamKf, setSelCamKf] = useState(null); /* {prop, t} — selected camera keyframe (easing card) */
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioErr, setAudioErr] = useState("");
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioDurMs, setAudioDurMs] = useState(null); /* attached file's own duration once metadata loads (null = unknown) */
  const [shapeQ, setShapeQ] = useState("");
  const [morphQ, setMorphQ] = useState("");
  const [overflowShow, setOverflowShow] = useState(true);
  const [snapOn, setSnapOn] = useState(readSnapping);
  const snapOnRef = useRef(true); /* read inside drag closures (Alt inverts it live via ev.altKey) */
  snapOnRef.current = snapOn;
  const [snapGuides, setSnapGuides] = useState(null); /* alignment guides — set only while a canvas drag is active */
  const clipboardRef = useRef([]);
  /* R10: single-slot undo snapshot for deletions. Delete/Backspace, the
     timeline lane ✕ and the context-menu delete all funnel through
     removeSelected/removeLayer, which snapshot the FULL root layer tree +
     selection + clip path here first; Ctrl/Cmd+Z then restores objects
     deleted on the canvas OR the timeline. Text inputs keep their native
     undo (the keydown handler bails on form fields). */
  const undoRef = useRef(null);
  const [clipCount, setClipCount] = useState(0);
  const [menu, setMenu] = useState(null); // context menu {x,y,kind,...}
  const [stretchClips, setStretchClips] = useState(false); /* duration edits PIN timings by default (extend adds empty room); the checkbox opts into proportional stretching */
  const [name] = useState("Untitled project"); /* R10: the shell header is gone — this still feeds the export dialog */
  const [exportOpen, setExportOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(readGrid); /* canvas alignment grid overlay (StageView) */
  const [selGap, setSelGap] = useState(null); /* selected empty-gap pill: { leftId, rightId, start, end } */
  const [barDrag, setBarDrag] = useState(null); /* live bar body-drag row pin: { id, row } — deadzone keeps horizontal drags in-row */

  const timeRef = useRef(0);
  timeRef.current = time;
  const stageWrapRef = useRef(null);
  const stageScrollRef = useRef(null);
  const stageElRef = useRef(null); /* the scaled stage div — screen↔stage mapping for the marquee */
  const [marquee, setMarquee] = useState(null); /* rubber-band select rect (viewport coords) while dragging empty canvas */
  const rulerRef = useRef(null);
  const rowsRef = useRef(null); /* packed-lanes container — the row-jump deadzone maps pointer y through its rect */
  const barDragRef = useRef(null); /* live drag pin { id, row, rowCount } — read inside the pointermove closure */
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

  /* ---------- scene camera (project-level, root timeline) ----------
     The camera is a pseudo-object: keyframes live on camera.tracks.x/y/zoom
     and evaluate with the same valueAt/withKeyframe machinery. It exists
     lazily — null until the first camera edit, so old projects keep their
     exact JSON (field omitted) and renders (no wrapper). */
  const patchCamera = useCallback((fn) => setCamera((c) => fn(c || { tracks: { x: [], y: [], zoom: [] } })), []);
  const setCameraKeyframe = useCallback((prop, t, v, ease) => {
    const T = Math.max(0, Math.min(compDur, t)); /* camera keyframes live on the root timeline */
    const V = prop === "zoom" ? clampZoom(v) : v;
    patchCamera((c) => ({ ...c, tracks: { ...c.tracks, [prop]: withKeyframe(c.tracks[prop], T, V, ease) } }));
    return Math.round(T / 10) * 10;
  }, [patchCamera, compDur]);
  const removeCameraKeyframe = useCallback((prop, t) => patchCamera((c) => {
    const next = (c.tracks[prop] || []).filter((k) => Math.abs(k.t - t) > 5);
    const tracks = { ...c.tracks };
    if (next.length) tracks[prop] = next; else delete tracks[prop];
    return { ...c, tracks };
  }), [patchCamera]);
  const resetCamera = useCallback(() => { setCamera(null); setSelCamKf(null); }, []);
  const setCameraSegmentEase = useCallback((prop, aT, ease) => patchCamera((c) => ({ ...c, tracks: { ...c.tracks, [prop]: (c.tracks[prop] || []).map((k) => (Math.abs(k.t - aT) <= 5 ? { ...k, ease } : k)) } })), [patchCamera]);
  /* one-click camera presets (Inspector camera card): reset the prop's track
     to exactly two keyframes spanning the whole composition — written through
     the same setCameraKeyframe/withKeyframe path with the default ease. */
  const applyCameraPreset = useCallback((prop, v0, v1) => {
    patchCamera((c) => ({ ...c, tracks: { ...c.tracks, [prop]: [] } }));
    setCameraKeyframe(prop, 0, v0, "easeInOutCubic");
    setCameraKeyframe(prop, compDur, v1, "easeInOutCubic");
    setSelCamKf(null);
  }, [patchCamera, setCameraKeyframe, compDur]);
  const cameraKfNav = (prop, dir) => {
    const tr = camera?.tracks?.[prop] || [];
    const t = timeRef.current;
    const cand = dir > 0 ? tr.find((k) => k.t > t + 5) : [...tr].reverse().find((k) => k.t < t - 5);
    if (cand) { setTime(cand.t); setSelCamKf({ prop, t: cand.t }); }
  };
  /* camera prop edit (inspector sliders): Animate ON → ◆ at the playhead; no
     track yet → a single ◆ (a lone keyframe is a constant everywhere, which
     doubles as "set a static camera value"); Animate OFF + existing track →
     shift the whole track by the delta — mirrors editProp for objects. */
  const editCameraProp = (prop, v) => {
    const V = prop === "zoom" ? clampZoom(v) : v;
    const tr = camera?.tracks?.[prop];
    if (autokey || !tr?.length) { setCameraKeyframe(prop, timeRef.current, V); return; }
    const dv = V - cameraAt(camera, timeRef.current)[prop];
    patchCamera((c) => ({ ...c, tracks: { ...c.tracks, [prop]: c.tracks[prop].map((k) => ({ ...k, v: k.v + dv })) } }));
  };
  const selectCamera = useCallback(() => { setCameraSel(true); setAudioSel(false); setSelIds([]); setSelKf(null); }, []);

  /* ---------- R8w3: OBJECT-LEVEL one-click camera moves ----------
     The Inspector "Camera" card of the SELECTED object calls this — no manual
     track editing: every action anchors the current framing at the playhead
     and lands eased (withKeyframe's default easeInOutCubic) one beat later
     (CAM_ACT_BEAT, clamped to the comp end). All keyframes go through the one
     setCameraKeyframe path onto project camera.tracks; the pure math helpers
     above (cameraFocusXY / cameraFitZoom / cameraPushZoom) are shared with
     check-r8w3.mjs. Root-scene only (the camera never applies inside clips),
     so the card only shows on the root timeline. */
  const applyCameraAction = useCallback((objId, action) => {
    if (action === "reset") { resetCamera(); return; }
    const o = ctxLayers.find((x) => x.id === objId);
    if (!o || path.length > 0) return;
    const t = Math.max(0, Math.min(compDur, timeRef.current));
    const land = Math.min(compDur, t + CAM_ACT_BEAT);
    const cam = cameraAt(camera, t);
    const depth = o.props.depth || 0;
    if (action === "push" || action === "pull") {
      setCameraKeyframe("zoom", t, cam.zoom); /* anchor the current zoom */
      setCameraKeyframe("zoom", land, cameraPushZoom(cam.zoom, action === "push" ? 1 : -1));
      return;
    }
    const [ox, oy] = posOf(o, t); /* live, track/path-aware position at the playhead */
    if (action === "fit") {
      const { w, h } = objSize(o, t);
      const sObj = Math.max(0.05, valueAt(o, "scale", t) ?? 1);
      const zoom = cameraFitZoom({ w: w * sObj, h: h * sObj, depth, stage });
      const p = cameraFocusXY({ ox, oy, zoom, depth, stage });
      setCameraKeyframe("x", t, Math.round(cam.x));
      setCameraKeyframe("y", t, Math.round(cam.y));
      setCameraKeyframe("zoom", t, cam.zoom);
      setCameraKeyframe("x", land, p.x);
      setCameraKeyframe("y", land, p.y);
      setCameraKeyframe("zoom", land, zoom);
      return;
    }
    if (action === "focus") {
      const p = cameraFocusXY({ ox, oy, zoom: cam.zoom, depth, stage });
      setCameraKeyframe("x", t, Math.round(cam.x));
      setCameraKeyframe("y", t, Math.round(cam.y));
      setCameraKeyframe("x", land, p.x);
      setCameraKeyframe("y", land, p.y);
    }
  }, [ctxLayers, path, compDur, camera, stage, setCameraKeyframe, resetCamera]);

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

  /* canvas grid toggle (timeline bar), persisted */
  const setShowGridPersist = useCallback((v) => {
    setShowGrid(v);
    try { localStorage.setItem(GRID_KEY, v ? "1" : "0"); } catch { /* storage unavailable — the toggle just won't persist */ }
  }, []);
  /* snapping toggle (stage zoom-cluster magnet), persisted */
  const setSnapOnPersist = useCallback((v) => {
    setSnapOn(v);
    try { localStorage.setItem(SNAP_KEY, v ? "1" : "0"); } catch { /* storage unavailable — the toggle just won't persist */ }
  }, []);

  /* AUTO-KEYFRAME mode — CANVAS gestures only (move / rotate / clip-scale):
     with the Animate toggle ARMED (default), EVERY canvas drop writes/replaces
     a ◆ at the playhead through the exact setKeyframe path (default easing) —
     R8w3: previously a fresh prop silently patched its base value instead, so
     a first canvas edit left NO keyframe on the timeline (the user's text
     test). A repeated drop at the same playhead updates that ◆ in place
     (withKeyframe ±5ms replace), identical for every object type.
     DISARMED (R9w1): the edit patches the BASE layer and writes NO keyframes. */
  const canvasEditProp = useCallback((id, prop, v) => {
    const obj = ctxLayers.find((o) => o.id === id);
    if (!obj || obj.locked) return;
    if (!autokey) { patchProps(id, { [prop]: v }); return; }
    setKeyframe(id, prop, timeRef.current, v);
  }, [autokey, patchProps, ctxLayers, setKeyframe]);

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
      /* R10: Ctrl/Cmd+Z restores the last deletion — but NEVER inside text
         inputs, where the browser's own undo must keep working. */
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        const t = e.target.tagName;
        if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.target.isContentEditable) return;
        e.preventDefault();
        undoDelete();
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") { e.preventDefault(); groupSelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); copySelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); pasteClipboard(); }
      if (e.key === "Escape") {
        if (menu) setMenu(null);
        else if (selKf) setSelKf(null);
        else if (selCamKf) setSelCamKf(null);
        else if (selGap) setSelGap(null);
        else if (selIds.length) setSelIds([]);
        else if (audioSel) setAudioSel(false);
        else if (cameraSel) setCameraSel(false);
        else if (path.length) exitToDepth(path.length - 1);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selGap) closeGap();
        else if (selKf) { removeKeyframe(selKf.objId, selKf.prop, selKf.t); setSelKf(null); }
        else if (selIds.length) removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  /* gap selection is exclusive: picking any layer (or diving into a clip)
     drops it; closeGap revalidates against the live packing anyway */
  useEffect(() => { if (selIds.length) setSelGap(null); }, [selIds]);
  useEffect(() => { setSelGap(null); setBarDrag(null); barDragRef.current = null; }, [path]);
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
    setNumbersOpen(false);
    if (type === "clip" && !over.children) enterClip(o.id);
  };
  /* animated backdrop layers (Backgrounds rail panel) — same makeObject
     insert as every other type, but prepended so the backdrop paints FIRST
     (bottom of the layer stack, behind all content) at full stage dims.
     Stays inside the current clip context, like any other insert. */
  const addBackdrop = (variantId, themeId) => {
    const theme = themeOf(themeId);
    const variant = variantOf(variantId);
    const vName = (BACKDROP_VARIANTS.find((v) => v.id === variant) || BACKDROP_VARIANTS[0]).name;
    const o = makeObject("backdrop", { name: `${vName} Background`, props: { variant, theme: theme.id, colors: [...theme.colors] } });
    o.props.x = stage.w / 2; o.props.y = stage.h / 2;
    o.props.w = stage.w; o.props.h = stage.h;
    o.props.outT = ctxDur;
    setLayers((ls) => [o, ...ls]);
    setSelIds([o.id]);
  };
  /* insert a gallery template as ONE editable GROUP-STYLE clip at the
     playhead (R7a): the clip is reframed to its content — children shift so
     their occupied bbox lands centered on the stage and the clip's x/y sits
     at the stage center, the exact geometry a Ctrl+G group has (movable,
     content-clamped, corner-scale + rotate grips, double-click to open).
     buildClip() ships a full clip layer whose children carry the template
     file's own ob<n> ids — cloneLayer re-issues editor ids for the whole
     subtree, the same fresh-id path paste/duplicate uses (mirrors how
     importProject walks ids and bumps _uid). The clip keeps the template's
     name and is selected after insert. Genuinely full-bleed scenes
     (backdrop-driven templates) are left stage-sized — they ARE the canvas.
     Camera stays project-level: layers/depths carry over unchanged. */
  const insertTemplateClip = (tpl) => {
    const built = cloneLayer(tpl.buildClip());
    const { clip } = reframeClipToContent(built, stage);
    clip.locked = false;
    clip.props.start = Math.max(0, Math.min(Math.max(0, ctxDur - 400), Math.round(timeRef.current / 10) * 10));
    setLayers((ls) => [...ls, clip]);
    setSelIds([clip.id]);
    setTemplatesOpen(false);
  };
  /* insert an icon / UI-element kit as ONE LOCKED kit object (R7a): a single
     movable/resizable/rotatable layer — NO editable children, no clip to
     enter. The document stores only { kit, variant, color, accent } + the
     w/h box (content-sized from the kit's frame); StageObject re-derives
     the art tree read-only via engine/kits.js kitRenderSpec. Old kit CLIPS
     (inserted before R7a) still render — this is only the new insert path. */
  const insertKitClip = (kit, opts = {}) => {
    const spec = kitRenderSpec(kit.id, opts);
    if (!spec) return;
    /* content-sized from the kit's frame, capped to the standard insert size
       (longest side = DEFAULT_INSERT_SIZE, aspect preserved) */
    const k = Math.min(1, DEFAULT_INSERT_SIZE / Math.max(spec.frame.w, spec.frame.h, 1));
    const w = Math.max(40, Math.round(spec.frame.w * k));
    const h = Math.max(40, Math.round(spec.frame.h * k));
    const o = makeObject("kit", {
      name: kit.name,
      props: {
        kit: kit.id,
        variant: opts.variant === "static" ? "static" : "animated",
        color: typeof opts.color === "string" && opts.color ? opts.color : null,
        accent: typeof opts.accent === "string" && opts.accent ? opts.accent : "#FFB224",
        w, h,
      },
    });
    o.props.x = stage.w / 2; o.props.y = stage.h / 2;
    o.props.outT = ctxDur;
    setLayers((ls) => [...ls, o]);
    setSelIds([o.id]);
    setUiOpen(false);
  };
  /* insert a sanitized SVG icon (admin library) as a plain IMAGE layer: the
     src is an inline-SVG DATA-URI (never a blob URL — blob SVGs taint the
     export canvas), so it resizes/exports exactly like emoji/images. The box
     is the icon's own aspect capped to the standard insert size. */
  const insertSvgIcon = (icon) => {
    const o = makeObject("image", {
      name: icon.name,
      props: { src: svgDataUri(icon.svg), ...iconInsertSize(icon.svg, DEFAULT_INSERT_SIZE) },
    });
    o.props.x = stage.w / 2; o.props.y = stage.h / 2;
    o.props.outT = ctxDur;
    setLayers((ls) => [...ls, o]);
    setSelIds([o.id]);
    setSvgIconsOpen(false);
  };
  const copySelection = () => { if (!selMany.length) return; clipboardRef.current = selMany.map((o) => JSON.parse(JSON.stringify(o))); setClipCount(clipboardRef.current.length); };
  const pasteClipboard = () => {
    if (!clipboardRef.current.length) return;
    const clones = clipboardRef.current.map((o) => { const c = cloneLayer(o); c.locked = false; c.props = { ...c.props, x: c.props.x + 28, y: c.props.y + 28 }; if (c.props.path) c.props.path = { ...c.props.path, pts: c.props.path.pts.map(([px, py]) => [px + 28, py + 28]) }; return c; });
    setLayers((ls) => [...ls, ...clones]);
    setSelIds(clones.map((c) => c.id));
  };
  /* R10 undo-delete: snapshot the tree right before a destructive removal… */
  const pushUndo = () => {
    undoRef.current = { objects: JSON.parse(JSON.stringify(objects)), selIds: [...selIds], path: [...path] };
  };
  /* …and restore it on Ctrl/Cmd+Z. Returns false when there is nothing to undo. */
  const undoDelete = () => {
    const snap = undoRef.current;
    if (!snap) return false;
    undoRef.current = null;
    setObjects(snap.objects);
    setPath(snap.path);
    setSelIds(snap.selIds);
    setSelKf(null);
    setSelGap(null);
    return true;
  };
  const removeSelected = () => {
    if (selIds.some((id) => { const l = ctxLayers.find((x) => x.id === id); return l && !l.locked; })) pushUndo();
    setLayers((ls) => ls.filter((o) => !selIds.includes(o.id) || o.locked));
    setSelIds([]);
  };
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
  /* R9w1 lane quick actions — per-OBJECT duplicate/delete for the timeline
     lane-label hover cluster (duplicateSelected/removeSelected act on the
     selection; these act on the hovered lane's object directly). Delete
     respects the lock; duplicate lands offset like the selection variant. */
  const removeLayer = (id) => {
    const o = ctxLayers.find((x) => x.id === id);
    if (!o || o.locked) return;
    pushUndo();
    setLayers((ls) => ls.filter((x) => x.id !== id));
    setSelIds((s) => s.filter((i) => i !== id));
  };
  const duplicateLayer = (id) => {
    const o = ctxLayers.find((x) => x.id === id);
    if (!o) return;
    const c = cloneLayer(o);
    c.name = o.name + " copy";
    c.locked = false;
    c.props = { ...c.props, x: c.props.x + 24, y: c.props.y + 24 };
    if (c.props.path) c.props.path = { ...c.props.path, pts: c.props.path.pts.map(([px, py]) => [px + 24, py + 24]) };
    setLayers((ls) => [...ls, c]);
    setSelIds([c.id]);
  };
  /* lane color tag — click cycles TAG_PALETTE; "" removes the key entirely
     so untagged objects keep their old JSON shape. */
  const cycleTag = (id) => patchObject(id, (o) => {
    const i = TAG_PALETTE.indexOf(o.tag || "");
    const next = TAG_PALETTE[(i + 1) % TAG_PALETTE.length];
    if (!next) { const rest = { ...o }; delete rest.tag; return rest; }
    return { ...o, tag: next };
  });
  /* rename a layer (timeline double-click on the name) */
  const renameLayer = (id, name) => patchObject(id, (o) => ({ ...o, name: String(name || "").slice(0, 80) || o.name }));

  /* ---------- empty-gap pills (R8w1) ----------
     A gap pill selects the empty stretch between two clips of ONE packed
     row; closing it ripples that row's later clips left by the gap width
     (same shiftLayerTimes path a bar move uses — keyframes travel). Other
     rows and the playhead are untouched; locked layers never move. */
  const onGapDown = (e, g) => {
    if (e.button === 2) return;
    e.stopPropagation();
    setSelGap(g);
    setSelIds([]); setSelKf(null); setSelCamKf(null); setAudioSel(false); setCameraSel(false);
  };
  const closeGap = useCallback(() => {
    const g = selGap;
    if (!g) return;
    const spans = ctxLayers.map((o) => { const [start, end] = layerSpan(o, ctxDur); return { id: o.id, start, end }; });
    const rowIds = packRows(spans).find((ids) => ids.includes(g.leftId) && ids.includes(g.rightId));
    if (rowIds) {
      const shifts = rippleShift(rowIds.map((id) => spans.find((s) => s.id === id)), g);
      if (shifts.length) {
        const dtById = new Map(shifts.map((s) => [s.id, s.dt]));
        setLayers((ls) => ls.map((o) => (dtById.has(o.id) && !o.locked ? shiftLayerTimes(o, dtById.get(o.id), ctxDur) : o)));
      }
    }
    setSelGap(null);
  }, [selGap, ctxLayers, ctxDur, setLayers]);

  /* groups are FOLDERS, nested up to 3 levels (folder 1 › folder 2 › folder 3):
     path.length is how many folders deep we already are, so grouping while
     already 3 deep would open a 4th level — block it. */
  const GROUP_MAX_DEPTH = 3;
  const canGroup = path.length < GROUP_MAX_DEPTH;
  const groupSelection = () => {
    if (!selIds.length || !canGroup) return;
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
  const selectAudio = useCallback(() => { setAudioSel(true); setCameraSel(false); setSelIds([]); setSelKf(null); }, []);
  /* attach an asset-library audio file with the schema defaults */
  const attachAudioAsset = useCallback((asset) => {
    setAudioTrack(makeAudioTrack({ src: asset.url, name: asset.name }));
    setAudioSel(true); setCameraSel(false); setSelIds([]); setSelKf(null);
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
  /* optional top-level "audio" + "camera" fields — each OMITTED entirely when
     unset (audio: no track attached · camera: no camera keyframes), so old
     projects keep byte-identical JSON. Both restore through sanitizers on load. */
  const projectJson = () => JSON.stringify({ app: "graphic-destination-motion", v: 5, stage: { ...stage, dur: compDur, bg: stageBg }, brands, brandId, objects, ...(audioToJson(audioTrack) ? { audio: audioToJson(audioTrack) } : {}), ...(cameraToJson(camera) ? { camera: cameraToJson(camera) } : {}) }, null, 2);
  /* restore a serialized project (cloud load on mount). The top-bar
     Save/Load modal was removed in R8w1 — this is now the only import path. */
  const importProject = (raw) => {
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data.objects)) throw new Error("no objects array");
      const walk = (l) => { const m = /^ob(\d+)$/.exec(l.id || ""); if (m) _uid = Math.max(_uid, parseInt(m[1]) + 1); (l.children || []).forEach(walk); };
      data.objects.forEach(walk);
      setObjects(data.objects);
      if (data.stage) {
        setStage({ w: data.stage.w || 1280, h: data.stage.h || 720 });
        if (data.stage.dur) setCompDur(data.stage.dur);
        const loadedBg = typeof data.stage.bg === "string" ? data.stage.bg : null;
        freshBlankRef.current = (!Array.isArray(data.objects) || data.objects.length === 0) && (!loadedBg || loadedBg.toUpperCase() === ENGINE_STAGE_BG.toUpperCase());
        setStageBg((cur) => resolveLoadedStageBg(data, readCachedSettings(), cur));
      }
      if (Array.isArray(data.brands) && data.brands.length) { setBrands(data.brands); setBrandId(data.brandId || data.brands[0].id); }
      setAudioTrack(audioFromJson(data.audio)); /* restore attached audio (null when the field is absent) */
      setAudioSel(false);
      setCamera(cameraFromJson(data.camera)); /* restore scene camera (null when the field is absent) */
      setCameraSel(false); setSelCamKf(null);
      setPath([]); setSelIds([]); setSelKf(null); setTime(0);
    } catch { /* malformed project JSON — keep the current project */ }
  };

  /* ---------- cloud project seam (dashboard load/save) ----------
     initialProject: restore once on mount through importProject above.
     onChange: single central notification fired with projectJson() after any
     project mutation (the shell autosaves + the timeline save control). */
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
  }, [objects, stage, compDur, stageBg, brands, brandId, audioTrack, camera]);

  /* ---------- stage drag (group + path aware, lock aware, canvas-bounds clamped) ---------- */
  const dragRef = useRef(null);
  /* a layer's stage-space bbox at time t — the same box align() and the drag
     clamp use (live size × scale around the path-aware position) */
  const layerBBox = (o, t) => {
    const s = Math.max(0.05, valueAt(o, "scale", t) ?? 1);
    const { w, h } = objSize(o, t);
    const [px, py] = posOf(o, t);
    return { x: px - (w * s) / 2, y: py - (h * s) / 2, w: w * s, h: h * s };
  };
  /* snap targets for a canvas drag: bboxes of the visible, unlocked, NON-selected
     layers of the CURRENT editing context (root scene or the open clip) */
  const snapTargetsFor = (excludeIds, t) =>
    ctxLayers.filter((o) => !excludeIds.includes(o.id) && !o.locked && !o.hidden && layerVisible(o, t, ctxDur)).map((o) => layerBBox(o, t));
  /* on-screen scale of a layer under the scene camera (1 when the camera is off
     or inside a clip). Pointer deltas divide by it so objects, resize grips and
     path points track the pointer 1:1 even when the camera scales the layer. */
  const camVisScale = (o) => (camera && path.length === 0 ? cameraTransform(camera, timeRef.current, o?.props?.depth).s : 1);
  const onObjectDown = (e, obj) => {
    e.stopPropagation();
    setSelKf(null); setShapesOpen(false); setMenu(null);
    let ids;
    if (e.ctrlKey || e.metaKey || e.shiftKey) { ids = selIds.includes(obj.id) ? selIds.filter((i) => i !== obj.id) : [...selIds, obj.id]; setSelIds(ids); if (!ids.includes(obj.id)) return; }
    else if (selIds.includes(obj.id)) ids = selIds;
    else { ids = [obj.id]; setSelIds(ids); }
    const t = timeRef.current;
    const members = ids.map((id) => ctxLayers.find((o) => o.id === id)).filter((o) => o && !o.locked)
      .map((o) => {
        /* bounds clamp setup: a drag may never push an object fully off-stage —
           at least DRAG_MIN_VISIBLE px of it stays inside the stage on every
           axis (clips included). Half-extents come from the live size × scale
           at drag start (the same box align() uses); path objects clamp by
           their on-path position since the path carries them. */
        const { w, h } = objSize(o, t);
        const s = Math.max(0.05, valueAt(o, "scale", t) ?? 1);
        const [px, py] = o.props.path ? posOf(o, t) : [0, 0];
        return { id: o.id, hasPath: !!o.props.path, pts: o.props.path ? o.props.path.pts.map((p) => p.slice()) : null, ox: valueAt(o, "x", t), oy: valueAt(o, "y", t), px, py, hw: (w * s) / 2, hh: (h * s) / 2, cs: camVisScale(o) };
      });
    if (!members.length) return;
    dragRef.current = { members, sx: e.clientX, sy: e.clientY, moved: false, live: {}, targets: snapTargetsFor(ids, t) };
    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.sx) / stageScale, dy = (ev.clientY - d.sy) / stageScale;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      /* smart snapping: snap the dragged SELECTION bbox to sibling edges/centers
         + canvas center/edges, applied BEFORE the 40px clamp so a snapped drop
         still clamps identically. Threshold is 6 screen px (stage-zoom × camera
         scale aware). Alt-drag inverts the toggle for the gesture. */
      let sdx = 0, sdy = 0, guides = null;
      if (d.moved && snapOnRef.current !== ev.altKey) {
        const th = SNAP_THRESHOLD / Math.max(0.05, stageScale * (d.members[0]?.cs || 1));
        const cx = (m) => (m.hasPath ? m.px : m.ox) + dx / m.cs, cy = (m) => (m.hasPath ? m.py : m.oy) + dy / m.cs;
        const L = Math.min(...d.members.map((m) => cx(m) - m.hw)), R = Math.max(...d.members.map((m) => cx(m) + m.hw));
        const T = Math.min(...d.members.map((m) => cy(m) - m.hh)), B = Math.max(...d.members.map((m) => cy(m) + m.hh));
        const r = computeSnap({ moving: { x: L, y: T, w: R - L, h: B - T }, others: d.targets, stageW: stage.w, stageH: stage.h, threshold: th });
        sdx = r.dx; sdy = r.dy;
        guides = r.guides.length ? r.guides : null;
      }
      setSnapGuides(guides);
      d.members.forEach((m) => {
        /* divide by the layer's camera screen-scale: under a zoomed camera a
           stage-px move covers more screen px, so the pointer delta shrinks
           back to stage units (1 while the camera is off). The snap delta is a
           stage-unit translation of the whole selection, added after. */
        const mdx = dx / m.cs + sdx, mdy = dy / m.cs + sdy;
        /* clamp AFTER rounding so the visible overlap stays >= DRAG_MIN_VISIBLE:
           center ∈ [MIN − half, stage − MIN + half] ⇔ [center−half, center+half]
           overlaps [0, stage] by at least MIN px on that axis — applied live,
           on every pointer move (and the clamped values land in keyframes). */
        const clX = (v) => Math.max(DRAG_MIN_VISIBLE - m.hw, Math.min(stage.w - DRAG_MIN_VISIBLE + m.hw, Math.round(v)));
        const clY = (v) => Math.max(DRAG_MIN_VISIBLE - m.hh, Math.min(stage.h - DRAG_MIN_VISIBLE + m.hh, Math.round(v)));
        if (m.hasPath) {
          const dxc = clX(m.px + mdx) - m.px, dyc = clY(m.py + mdy) - m.py;
          const npts = m.pts.map(([px, py]) => [Math.round(px + dxc), Math.round(py + dyc)]);
          d.live[m.id] = { pathPts: npts };
          patchPath(m.id, (p) => ({ ...p, pts: npts }));
        } else {
          const nx = clX(m.ox + mdx), ny = clY(m.oy + mdy);
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
      setSnapGuides(null); /* guides live only for the duration of the drag */
      if (!d || !d.moved) return;
      /* drop lands through the auto-keyframe path: with the Animate toggle
         ARMED every move writes/updates an x ◆ and a y ◆ at the playhead
         (R8w3 — identical for every object type); DISARMED it patches the
         base x/y only (R9w1). Path-dragged members shift their path points
         instead, position comes from the path. */
      d.members.forEach((m) => { const lv = d.live[m.id]; if (lv && !m.hasPath) { canvasEditProp(m.id, "x", lv.x); canvasEditProp(m.id, "y", lv.y); } });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const displayValue = (obj, prop) => {
    const d = dragRef.current;
    if (d && d.moved && d.live[obj.id] && d.live[obj.id][prop] !== undefined) return d.live[obj.id][prop];
    return valueAt(obj, prop, time);
  };
  /* ---------- on-canvas camera control ----------
     Empty-stage pointerdown clears the selection (unchanged behavior); when
     NOTHING was selected and we're on the root timeline, the same gesture is
     also a camera pan scrub: the camera follows the pointer (drag right = the
     camera view moves right, the scene shifts left) and both axes record ◆ at
     the playhead — the same write path the inspector sliders use. */
  /* Empty-canvas pointer-down. Plain left-drag = MARQUEE select (rubber-band);
     middle-mouse or Alt+left-drag = CAMERA PAN (the former plain-drag gesture,
     moved so marquee can be the intuitive default). Space stays play/pause. */
  const onStageEmptyDown = (e) => {
    setSelKf(null); setSelCamKf(null); setAudioSel(false); setCameraSel(false);
    setShapesOpen(false); setMapsOpen(false); setImagesOpen(false); setAudioOpen(false); setNumbersOpen(false);
    if (e.button !== 0 && e.button !== 1) return; /* ignore right-click etc. */
    if (path.length > 0) return; /* path-editing mode keeps its own gestures */

    /* ---- camera pan: middle-mouse OR Alt+left-drag ---- */
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      const t = timeRef.current;
      const c0 = cameraAt(camera, t);
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      const move = (ev) => {
        const dx = (ev.clientX - sx) / stageScale, dy = (ev.clientY - sy) / stageScale;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        if (!moved) return;
        setCameraKeyframe("x", t, Math.round(c0.x + dx));
        setCameraKeyframe("y", t, Math.round(c0.y + dy));
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    /* ---- marquee select (plain left-drag) ---- */
    setSelIds([]);
    const rectEl = stageElRef.current?.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    /* viewport px → stage coords: getBoundingClientRect already folds in the
       scale/zoom transform, so dividing the offset by stageScale is exact. */
    const toStage = (cx, cy) => [rectEl ? (cx - rectEl.left) / stageScale : 0, rectEl ? (cy - rectEl.top) / stageScale : 0];
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
      if (!moved) return;
      setMarquee({ x0: sx, y0: sy, x1: ev.clientX, y1: ev.clientY });
      const [ax, ay] = toStage(sx, sy);
      const [bx, by] = toStage(ev.clientX, ev.clientY);
      setSelIds(objectsInRect(ctxLayers, { x0: ax, y0: ay, x1: bx, y1: by }, timeRef.current));
    };
    const up = () => { setMarquee(null); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* wheel = camera zoom, GATED so it never fights the stage zoom-to-fit
     controls: it only records a zoom ◆ when the Camera lane is selected OR
     Alt/Option is held (documented in the camera card + lane tooltip).
     Attached non-passively so preventDefault keeps the page from scrolling. */
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (path.length > 0) return;
      /* gated: only when the Camera lane is effectively selected or Alt/Option is held */
      if (!((cameraSel && !audioSel && selIds.length === 0) || e.altKey)) return;
      e.preventDefault();
      const t = timeRef.current;
      const z0 = cameraAt(camera, t).zoom;
      const z1 = clampZoom(z0 * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      setCameraKeyframe("zoom", t, Math.round(z1 * 100) / 100);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [camera, cameraSel, audioSel, selIds, path, setCameraKeyframe]);
  /* ---------- on-canvas direct manipulation: 8-way resize grips + rotation grip ----------
     The drag itself keeps writing BASE PROPS live (pixel-true preview). On the
     DROP the resize becomes a ◆ on the `scale` lane at the playhead + a
     base-compensation patch (resizeDropPlan above): the render at the drop is
     identical to the live drag, and scrubbing interpolates the resize like any
     other keyframed motion (R8w3 — before, resize never wrote a keyframe).
     Resize target by type: w/h for box types (shape/image/chart/kit), `w` for
     the map types (their height is derived), fontSize for text/number. */
  const onResizeDown = (e, obj, hid, cursor) => {
    e.stopPropagation();
    if (obj.locked) return;
    const t = timeRef.current;
    const s0 = Math.max(0.05, valueAt(obj, "scale", t)); /* object scale — w/h render under it */
    let sz0 = objSize(obj, t); /* current size in prop units */
    /* ring counters render a fixed circle box around the digits (see StageObject) —
       use its real size, not the text-flow estimate, so the delta ratio tracks the pointer */
    if (obj.type === "number" && (obj.props.ring || "none") !== "none") {
      const rs = (obj.props.fontSize || 96) * 1.15 * 2 + (obj.props.ringW || 8) * 2 + 10;
      sz0 = { w: rs, h: rs };
    }
    const fs0 = obj.props.fontSize || 0;
    const w0 = obj.props.w || 0;
    const rot = valueAt(obj, "rotation", t) || 0;
    const th = (rot * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
    const hx = hid.includes("e") ? 1 : hid.includes("w") ? -1 : 0; /* grip's horizontal side */
    const hy = hid.includes("s") ? 1 : hid.includes("n") ? -1 : 0; /* grip's vertical side */
    const textual = obj.type === "text" || obj.type === "number"; /* fontSize-driven */
    const singleW = obj.type === "map" || obj.type === "continent" || obj.type === "world"; /* w-only, h derived */
    const cs = camVisScale(obj); /* camera screen-scale of this layer (1 when camera off) */
    const [ox, oy] = posOf(obj, t); /* the center stays fixed — resize grows symmetrically */
    const targets = snapTargetsFor([obj.id], t); /* snap context, captured once per drag */
    /* the would-be size (prop units) for a given local delta — mirrors the three
       patch branches below so the snap bbox measures exactly what will render */
    const sizeAt = (lx, ly) => {
      if (textual) { const f = Math.max(0.05, hy !== 0 ? (sz0.h + 2 * hy * ly) / sz0.h : (sz0.w + 2 * hx * lx) / sz0.w); return { w: sz0.w * f, h: sz0.h * f }; }
      if (singleW) { const fx = hx !== 0 ? (sz0.w + 2 * hx * lx) / sz0.w : 1; const fy = hy !== 0 ? (sz0.h + 2 * hy * ly) / sz0.h : 1; const f = Math.max(0.05, hx !== 0 && hy !== 0 ? Math.max(fx, fy) : hx !== 0 ? fx : fy); return { w: sz0.w * f, h: sz0.h * f }; }
      return { w: hx !== 0 ? sz0.w + 2 * hx * lx : sz0.w, h: hy !== 0 ? sz0.h + 2 * hy * ly : sz0.h };
    };
    const sx = e.clientX, sy = e.clientY;
    let last = null; /* latest live patch + its size factors (vs the pre-drag base) — the drop converts them into a scale ◆ */
    const prevCursor = document.body.style.cursor;
    if (cursor) document.body.style.cursor = cursor;
    const move = (ev) => {
      /* pointer delta → stage units → the object's local axes (undo its rotation) → prop units (undo its scale) */
      const dx = (ev.clientX - sx) / (stageScale * cs), dy = (ev.clientY - sy) / (stageScale * cs);
      let ddx = (dx * cos + dy * sin) / s0, ddy = (-dx * sin + dy * cos) / s0;
      /* smart snapping (the grip's own edges only): measure the would-be bbox,
         snap it, then fold the stage-space snap delta back into the local delta —
         the symmetric resize then lands the dragged edge exactly on the guide.
         Same Alt-invert + zoom-aware threshold as the body drag. */
      if (snapOnRef.current !== ev.altKey) {
        const uns = sizeAt(ddx, ddy);
        const th = SNAP_THRESHOLD / Math.max(0.05, stageScale * cs);
        const r = computeSnap({
          moving: { x: ox - (uns.w * s0) / 2, y: oy - (uns.h * s0) / 2, w: uns.w * s0, h: uns.h * s0 },
          others: targets, stageW: stage.w, stageH: stage.h, threshold: th,
          points: { x: hx > 0 ? ["right"] : hx < 0 ? ["left"] : [], y: hy > 0 ? ["bottom"] : hy < 0 ? ["top"] : [] },
        });
        ddx += (r.dx * cos + r.dy * sin) / s0;
        ddy += (-r.dx * sin + r.dy * cos) / s0;
        setSnapGuides(r.guides.length ? r.guides : null);
      } else setSnapGuides(null);
      let patch, fw = 1, fh = 1;
      if (textual) {
        /* scale fontSize proportionally — the vertical delta ratio drives (corners + N/S);
           E/W grips fall back to the horizontal ratio so no grip is dead on auto-width text */
        const f = hy !== 0 ? (sz0.h + 2 * hy * ddy) / sz0.h : (sz0.w + 2 * hx * ddx) / sz0.w;
        patch = { fontSize: Math.max(10, Math.round(fs0 * Math.max(0.05, f))) };
        fw = fh = patch.fontSize / fs0; /* the whole text box scales with fontSize */
      } else if (singleW) {
        const fx = hx !== 0 ? (sz0.w + 2 * hx * ddx) / sz0.w : 1;
        const fy = hy !== 0 ? (sz0.h + 2 * hy * ddy) / sz0.h : 1;
        const f = Math.max(0.05, hx !== 0 && hy !== 0 ? Math.max(fx, fy) : hx !== 0 ? fx : fy);
        patch = { w: Math.max(10, Math.round(w0 * f)) };
        fw = fh = patch.w / w0; /* map height is derived — resize is uniform */
      } else {
        let nw = hx !== 0 ? sz0.w + 2 * hx * ddx : sz0.w;
        let nh = hy !== 0 ? sz0.h + 2 * hy * ddy : sz0.h;
        if (ev.shiftKey) { /* uniform scale — aspect locked */
          const f = hx !== 0 && hy !== 0 ? Math.max(nw / sz0.w, nh / sz0.h) : hx !== 0 ? nw / sz0.w : nh / sz0.h;
          nw = sz0.w * f; nh = sz0.h * f;
        }
        patch = { w: Math.max(10, Math.round(nw)), h: Math.max(10, Math.round(nh)) };
        fw = patch.w / sz0.w; fh = patch.h / sz0.h;
      }
      last = { fw, fh, patch };
      patchProps(obj.id, patch);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = prevCursor;
      setSnapGuides(null); /* guides live only for the duration of the drag */
      /* R8w3 — resize drop lands as a ◆ on the scale lane at the playhead
         (autokey always-on, same setKeyframe path as move/rotate). The base
         prop is compensated by g so the drop frame renders pixel-identically
         to the live drag; a bare grip click (f ≈ 1) writes nothing. */
      if (last) {
        const plan = resizeDropPlan({ fw: last.fw, fh: last.fh, s0 });
        if (plan.changed) {
          const g = plan.g, p = last.patch;
          setKeyframe(obj.id, "scale", t, plan.ns);
          if (p.fontSize != null) patchProps(obj.id, { fontSize: Math.max(10, Math.round(p.fontSize / g)) });
          else if (p.h == null) patchProps(obj.id, { w: Math.max(10, Math.round(p.w / g)) });
          else patchProps(obj.id, { w: Math.max(10, Math.round(p.w / g)), h: Math.max(10, Math.round(p.h / g)) });
          /* mirror the base scale to the ◆ value — the compensated w/h/fontSize
             are only exact UNDER that scale, so keeping base scale in sync means
             deleting the ◆ still renders the resized size (move/rotate/clip-scale
             end base+◆ the same way) */
          patchProps(obj.id, { scale: plan.ns });
        }
        last = null;
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* rotation grip — drag around the object's center; 1° steps, shift snaps to 15°.
     Autokey is always-on (R8w3): EVERY rotate drag writes/updates a rotation ◆
     at the playhead, live, so the layer visibly spins mid-drag — a fresh prop
     starts its track here, an existing track gets its playhead ◆ replaced.
     rotLive feeds the on-canvas readout either way. */
  const onRotateDown = (e, obj) => {
    e.stopPropagation();
    if (obj.locked) return;
    const wrap = e.currentTarget.parentElement.getBoundingClientRect(); /* the object wrapper — its AABB center is the rotation center */
    const cx = wrap.left + wrap.width / 2, cy = wrap.top + wrap.height / 2;
    /* start from the LIVE angle (track-aware): with a rotation ◆ at the
       playhead the base prop is stale — reading it jumped the layer mid-drag */
    const r0 = valueAt(obj, "rotation", timeRef.current) || 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    const move = (ev) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let nr = Math.round(r0 + ((a - a0) * 180) / Math.PI);
      if (ev.shiftKey) nr = Math.round(nr / 15) * 15;
      nr = Math.max(-360, Math.min(360, nr));
      if (autokey && (obj.tracks.rotation || []).length) setKeyframe(obj.id, "rotation", timeRef.current, nr);
      else if (autokey) setKeyframe(obj.id, "rotation", timeRef.current, nr); /* R8w3: fresh prop starts its track at the playhead too (was: silent base patch) */
      else patchProps(obj.id, { rotation: nr });
      /* R8w3: the ◆ drives the render while it exists; mirror the base prop so
         the angle survives ◆ deletion — the same base+◆ end state the move
         drag has always produced */
      if (autokey) patchProps(obj.id, { rotation: nr });
      setRotLive({ id: obj.id, deg: nr });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = prevCursor;
      setRotLive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* clip corner grips — drag scales the WHOLE clip wrapper uniformly through the
     `scale` prop (children live inside the wrapper, so contents scale with it).
     The ratio is measured from the clip's x/y — the wrapper's transform origin —
     so it's exact under rotation and needs no Shift. Corner grips only. Autokey
     is always-on (R8w3): the drag writes/updates a scale ◆ at the playhead,
     live — a fresh prop starts its track, an existing track gets its ◆
     replaced (same setKeyframe path). `box` is the grip's reference rect in
     clip-internal coords — the content bbox for group-style clips (StageObject
     passes it); absent ⇒ the full stage (legacy). */
  const onClipScaleDown = (e, obj, hid, cursor, box = null) => {
    e.stopPropagation();
    if (obj.locked) return;
    const t = timeRef.current;
    const s0 = Math.max(0.05, valueAt(obj, "scale", t) || 1);
    const rot = ((valueAt(obj, "rotation", t) || 0) * Math.PI) / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    /* the wrapper is stage-sized with its transform origin at its center (=
       the clip's x/y), so the grip corner in stage coords at drag start is
       origin + rotate(local − center) × s0 — distances from the origin are
       rotation-invariant, which keeps the ratio exact at any angle */
    const lx = hid.includes("e") ? (box ? box.x + box.w : stage.w) : (box ? box.x : 0);
    const ly = hid.includes("s") ? (box ? box.y + box.h : stage.h) : (box ? box.y : 0);
    const vx = (lx - stage.w / 2) * s0, vy = (ly - stage.h / 2) * s0;
    const ax = vx * cos - vy * sin, ay = vx * sin + vy * cos;
    const r0 = Math.max(1, Math.hypot(ax, ay));
    const cs = camVisScale(obj); /* camera screen-scale (1 when the camera is off) */
    const sx = e.clientX, sy = e.clientY;
    const prevCursor = document.body.style.cursor;
    if (cursor) document.body.style.cursor = cursor;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / (stageScale * cs), dy = (ev.clientY - sy) / (stageScale * cs);
      const ns = Math.max(0.05, Math.min(10, Math.round(s0 * (Math.hypot(ax + dx, ay + dy) / r0) * 100) / 100));
      if (autokey) setKeyframe(obj.id, "scale", timeRef.current, ns); /* R8w3: always ◆ at the playhead (fresh props start their track) */
      else patchProps(obj.id, { scale: ns });
      if (autokey) patchProps(obj.id, { scale: ns }); /* R8w3: mirror the base — the scale survives ◆ deletion (move/rotate end base+◆ too) */
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = prevCursor;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* drag a single path point */
  const onPathPtDown = (e, objId, idx) => {
    e.stopPropagation();
    const obj = ctxLayers.find((o) => o.id === objId);
    if (!obj || obj.locked) return;
    const start = obj.props.path.pts[idx].slice();
    const cs = camVisScale(obj); /* path points live in the layer's camera space */
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      const nx = Math.round(start[0] + (ev.clientX - sx) / (stageScale * cs));
      const ny = Math.round(start[1] + (ev.clientY - sy) / (stageScale * cs));
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
    /* ROW-JUMP DEADZONE (move drags only): pin the bar to its current packed
       row for the gesture. The pin changes only when the pointer crosses a
       row boundary with intent (rowJumpTarget: ≥60% into another row or ≥20px
       past the edge) — a purely horizontal drag can no longer hop lanes just
       because the bar re-packs over a neighbour. Display-only: the pin is
       released on pointer-up and normal packing resumes. */
    if (mode === "move") {
      const startSpans = ctxLayers.map((o) => { const [s0, s1] = layerSpan(o, ctxDur); return { id: o.id, start: s0, end: s1 }; });
      const startRows = packRows(startSpans, { stable: true });
      const startRow = Math.max(0, startRows.findIndex((ids) => ids.includes(obj.id)));
      barDragRef.current = { id: obj.id, row: startRow, rowCount: startRows.length };
      setBarDrag({ id: obj.id, row: startRow });
    }
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
      /* deadzone tracking runs on EVERY move (even below the 10ms time
         threshold) so vertical intent is never swallowed by a horizontal drag */
      if (mode === "move" && barDragRef.current && rowsRef.current) {
        const rr = rowsRef.current.getBoundingClientRect();
        const b = barDragRef.current;
        /* stickier deadzone than the default (0.85 into the next row, or 44px
           past the edge) so a horizontal drag with a little vertical drift no
           longer hops lanes — professional-timeline feel. */
        const target = Math.max(0, Math.min(b.rowCount, rowJumpTarget(ev.clientY - rr.top, TL_ROW_H, b.row, 44, 0.85)));
        if (target !== b.row) { b.row = target; setBarDrag({ id: b.id, row: target }); }
      }
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
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      barDragRef.current = null;
      setBarDrag(null); /* release the row pin — natural packing resumes */
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /* ---------- audio lane: click selects (R10: the EMPTY lane no longer pops
     the Audio panel — an unexpected upload window opening mid-work was the
     reported bug; the rail's Audio button remains the way to open it), bar
     drag retimes startT ---------- */
  const onAudioLaneDown = (e) => {
    if (e.button === 2) return;
    e.stopPropagation();
    if (audioTrack) selectAudio();
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
  /* ---------- camera lane: click selects the camera; ◆ click seeks, drag retimes (root timeline only) ---------- */
  const onCameraLaneDown = (e) => {
    if (e.button === 2) return;
    e.stopPropagation();
    selectCamera();
  };
  const onCameraKfDown = (e, prop, k0) => {
    if (e.button === 2) return;
    e.stopPropagation();
    selectCamera();
    let moved = false;
    let curT = k0.t;
    const { v: kv, ease: ke } = k0;
    const r = rulerRef.current.getBoundingClientRect();
    const move = (ev) => {
      const nt = Math.round(clamp01((ev.clientX - r.left) / r.width) * ctxDur / 10) * 10;
      if (Math.abs(nt - k0.t) > 20) moved = true;
      if (moved && nt !== curT) {
        const prev = curT;
        curT = nt;
        patchCamera((c) => {
          const track = (c.tracks[prop] || []).filter((kk) => Math.abs(kk.t - prev) > 5 && Math.abs(kk.t - nt) > 5);
          track.push({ t: nt, v: kv, ease: ke });
          track.sort((a, b) => a.t - b.t);
          return { ...c, tracks: { ...c.tracks, [prop]: track } };
        });
        setSelCamKf({ prop, t: nt });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) { setTime(k0.t); setSelCamKf({ prop, t: k0.t }); }
    };
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
  /* R9w3: text style presets resolve the user's settings config over the
     active brand's fonts (heading tiers ← headFont, body tiers ← bodyFont) */
  const resolvedTextStyles = useMemo(() => resolveTextStyles(userSettings, brand), [userSettings, brand]);
  /* audio lane is selected only while no layer selection supersedes it */
  const audioLaneSel = audioSel && !!audioTrack && selIds.length === 0;
  /* camera lane selected: mirrors audioLaneSel — a layer or audio selection supersedes it */
  const cameraLaneSel = cameraSel && !audioSel && selIds.length === 0;
  const selCamKfData = useMemo(() => {
    if (!selCamKf || !camera) return null;
    const k = kfAt(camera.tracks?.[selCamKf.prop], selCamKf.t);
    return k ? { ...selCamKf, k } : null;
  }, [selCamKf, camera]);
  /* bar length: the file's own duration once known, else to the end of the comp (min 100ms so it stays grabbable) */
  const audioBarMs = audioTrack ? Math.max(100, Math.min(ctxDur - audioTrack.startT, audioDurMs != null ? Math.min(audioDurMs, ctxDur) : ctxDur - audioTrack.startT)) : 0;
  const audioAssets = (assets || []).filter((a) => a.kind === "audio");
  const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  /* save control relocated into the docked timeline bar (R8w1): the editor
     shell (Editor.jsx) passes saveState + onSaveNow; the standalone/demo
     route passes neither and the button stays hidden. */
  const saveCtl = saveState && onSaveNow ? { state: saveState, onSave: onSaveNow } : null;
  /* stage size preset picker (top bar + inspector share it): apply by "WxH" value */
  const applyStagePreset = (v) => { const p = STAGE_PRESETS.find((s) => `${s.w}x${s.h}` === v); if (p) setStage({ w: p.w, h: p.h }); };
  const stageIsPreset = STAGE_PRESETS.some((s) => s.w === stage.w && s.h === stage.h);
  const flowText = !!(sel && sel.type === "text" && sel.props.path && (sel.props.pathMode || "flow") === "flow");
  return (
    /* height:100% (not 100vh) — the editor shell renders its own 44px header
       above this component; 100vh here overflowed the shell by 44px, pushing
       the docked timeline below the fold and making the page scroll (which is
       what hid the header). 100% keeps header, stage and timeline inside the
       viewport at all times. */
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg0, color: C.txt, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, userSelect: "none", overflow: "hidden" }}>
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
        .gd-kf:hover{transform:translate(-50%,-50%) scale(1.3) !important}
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
        .gd-rzh::after{content:"";position:absolute;inset:-55%} /* fat-finger hit zone around the 8px selection grips */
        /* R10: ALL left-rail drawers share one width (inline panel styles vary,
           this wins) so the rail reads as one consistent column */
        .gd-main > .gd-panel{width:268px !important}
      `}</style>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickImage} />
      <input ref={assetFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={onPickAsset} />
      <input ref={audioFileRef} type="file" accept={AUDIO_ACCEPT_ATTR} style={{ display: "none" }} onChange={onPickAudioAsset} />

      {/* ============ TOP BAR (R10 slim 40px row) ============ */}
      {/* BrandMark + "Zwoosh" left · BrandSwitcher kept · avatar menu at the
          right end (Dashboard / Profile / Settings / Logout — real handlers
          wired by the Editor shell; standalone renders disabled stubs). The
          old Main breadcrumb moved into the timeline transport bar; the
          stage preset lives in the Inspector. */}
      <TopBar brand={brand}
        brandKits={userSettings.brandKits} onApplyKit={applyBrandKit} onManageBrand={() => window.location.assign("/settings")}
        user={user} onDashboard={onDashboard} onProfile={onProfile} onSettings={onSettings} onLogout={onLogout} />

      {/* ============ MAIN ============ */}
      <div className="gd-main" style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        <IconRail shapesOpen={shapesOpen} setShapesOpen={setShapesOpen} textOpen={textOpen} setTextOpen={setTextOpen} imagesOpen={imagesOpen} setImagesOpen={setImagesOpen}
          audioOpen={audioOpen} setAudioOpen={setAudioOpen} mapsOpen={mapsOpen} setMapsOpen={setMapsOpen}
          templatesOpen={templatesOpen} setTemplatesOpen={setTemplatesOpen} chartsOpen={chartsOpen} setChartsOpen={setChartsOpen}
          confettiOpen={confettiOpen} setConfettiOpen={setConfettiOpen}
          numbersOpen={numbersOpen} setNumbersOpen={setNumbersOpen}
          bgOpen={bgOpen} setBgOpen={setBgOpen}
          uiOpen={uiOpen} setUiOpen={setUiOpen}
          svgIconsOpen={svgIconsOpen} setSvgIconsOpen={setSvgIconsOpen}
          audioTrack={audioTrack} addObject={addObject} />

        {/* templates drawer: search + categories, inserts as one editable clip at the playhead */}
        {templatesOpen && <TemplatesPanel tplQ={tplQ} setTplQ={setTplQ} tplCat={tplCat} setTplCat={setTplCat} insertTemplateClip={insertTemplateClip} />}

        {/* SVG icons drawer: the admin-managed library (sanitized server-side); inserts as a plain image */}
        {svgIconsOpen && <IconsPanel insertSvgIcon={insertSvgIcon} />}

        {/* UI elements drawer: 13 animated interface pieces, insert as looping clips */}
        {uiOpen && <UIElementsPanel uiQ={uiQ} setUiQ={setUiQ} uiCat={uiCat} setUiCat={setUiCat} insertKitClip={insertKitClip} />}

        {/* shapes folder with search */}
        {shapesOpen && <ShapesPanel shapeQ={shapeQ} setShapeQ={setShapeQ} addObject={addObject} />}

        {/* text drawer: style presets (settings text styles). R10: the ten
            drop-in effect cards are gone — textFx lives in the Inspector. */}
        {textOpen && <TextPanel addObject={addObject} setTextOpen={setTextOpen} textStyles={resolvedTextStyles} brand={brand} />}

        {/* charts drawer: 7 chart types as separate insertables */}
        {chartsOpen && <ChartsPanel addObject={addObject} setChartsOpen={setChartsOpen} />}

        {/* numbers drawer: 3 counter modes (count up / countdown / odometer) */}
        {numbersOpen && <NumberPanel addObject={addObject} setNumbersOpen={setNumbersOpen} />}

        {/* confetti drawer: 8 emission styles */}
        {confettiOpen && <ConfettiPanel addObject={addObject} setConfettiOpen={setConfettiOpen} />}

        {/* backgrounds drawer: 10 animated looping backdrops, inserted at the bottom of the stack */}
        {bgOpen && <BackgroundsPanel addBackdrop={addBackdrop} sel={sel} patchProps={patchProps} />}

        {/* maps drawer */}
        {mapsOpen && <MapsPanel addObject={addObject} setMapsOpen={setMapsOpen} />}

        {/* images drawer: upload + your asset library */}
        {imagesOpen && <ImagePanel assetFileRef={assetFileRef} assetUploading={assetUploading} assetErr={assetErr} assets={assets} assetsBusy={assetsBusy} refreshAssets={refreshAssets} addAssetLayer={addAssetLayer} onDeleteAsset={onDeleteAsset} />}

        {/* audio drawer: upload + attached track + reusable audio assets.
            R10: the panel's Upload button must click the REAL audio input
            (audioFileRef — AUDIO_ACCEPT_ATTR + onPickAudioAsset), not the
            image-asset input (assetFileRef) it was mistakenly wired to. */}
        {audioOpen && <AudioPanel audioFileRef={audioFileRef} audioUploading={audioUploading} audioErr={audioErr} audioTrack={audioTrack} detachAudio={detachAudio} assets={assets} assetsBusy={assetsBusy} assetErr={assetErr} refreshAssets={refreshAssets} audioAssets={audioAssets} attachAudioAsset={attachAudioAsset} onDeleteAudioAsset={onDeleteAudioAsset} fmtBytes={fmtBytes} fmt={fmt} />}

        {/* ---- stage ----
            R10: hidden layers are FULLY invisible on the canvas (they used to
            linger at 32% opacity while selected). The timeline still lists
            them (eye toggle un-hides); export already drops them via
            StageObject's non-interactive early return — unchanged. */}
        <StageView stageWrapRef={stageWrapRef} stageScrollRef={stageScrollRef} tlDragging={tlDragging} zoomed={zoomed}
          stage={stage} stageScale={stageScale} stageBg={stageBg} inClip={inClip} ctx={ctx} ctxLayers={ctxLayers.filter((o) => !o.hidden)} time={time}
          selIds={selIds} sel={sel} overflowShow={overflowShow} zoomMode={zoomMode} playing={playing} rotLive={rotLive}
          onObjectDown={onObjectDown} enterClip={enterClip} displayValue={displayValue} onResizeDown={onResizeDown} onRotateDown={onRotateDown}
          onClipScaleDown={onClipScaleDown}
          onPathPtDown={onPathPtDown} patchPath={patchPath} setOverflowShow={setOverflowShow}
          setSelIds={setSelIds} setSelKf={setSelKf} setAudioSel={setAudioSel} setShapesOpen={setShapesOpen} setMapsOpen={setMapsOpen} setImagesOpen={setImagesOpen} setAudioOpen={setAudioOpen}
          camera={camera} cameraLaneSel={cameraLaneSel} onStageEmptyDown={onStageEmptyDown} stageElRef={stageElRef} marquee={marquee}
          snapGuides={snapGuides} snapOn={snapOn} onToggleSnap={() => setSnapOnPersist(!snapOn)}
          showGrid={showGrid}
          stepZoom={stepZoom} cycleZoom={cycleZoom} setZoom={setZoom} />

        {/* ---- inspector ---- */}
        <Inspector audioLaneSel={audioLaneSel} audioTrack={audioTrack} patchAudio={patchAudio} detachAudio={detachAudio} fmt={fmt}
          cameraLaneSel={cameraLaneSel} camera={camera} editCameraProp={editCameraProp} setCameraKeyframe={setCameraKeyframe} removeCameraKeyframe={removeCameraKeyframe}
          cameraKfNav={cameraKfNav} resetCamera={resetCamera} selCamKfData={selCamKfData} setCameraSegmentEase={setCameraSegmentEase} applyCameraPreset={applyCameraPreset}
          selMany={selMany} groupSelection={groupSelection} align={align} duplicateSelected={duplicateSelected} removeSelected={removeSelected}
          inClip={inClip} ctx={ctx} sel={sel} patchObject={patchObject}
          stage={stage} stageBg={stageBg} setStageBg={setStageBg} applyStagePreset={applyStagePreset} stageIsPreset={stageIsPreset}
          enterClip={enterClip} patchProps={patchProps} ctxDur={ctxDur} stretchClipDur={stretchClipDur} stretchClips={stretchClips} setStretchClips={setStretchClips} ungroupClip={ungroupClip}
          morphQ={morphQ} setMorphQ={setMorphQ} time={time} timeRef={timeRef} setShapeAt={setShapeAt} editProp={editProp}
          removeKeyframe={removeKeyframe} setKeyframe={setKeyframe} setSelKf={setSelKf} flowText={flowText} brand={brand} SW={SW}
          addPathTo={addPathTo} patchPath={patchPath} animateAlongPath={animateAlongPath} kfNav={kfNav} selectedKfData={selectedKfData}
          setSegmentEase={setSegmentEase} applyPreset={applyPreset} fileRef={fileRef} applyCameraAction={applyCameraAction} />
      </div>

      {/* ============ TIMELINE ============ */}
      <Timeline tlH={tlH} tlDragging={tlDragging} onTlHandleDown={onTlHandleDown} resetTlH={resetTlH}
        setPlaying={setPlaying} setTime={setTime} playing={playing} time={time} fmt={fmt} ctxDur={ctxDur} setCtxDurMs={setCtxDurMs}
        stretchClips={stretchClips} setStretchClips={setStretchClips} loop={loop} setLoop={setLoop}
        selMany={selMany} groupSelection={groupSelection} ungroupClip={ungroupClip} ctxLayers={ctxLayers} selIds={selIds} setSelIds={setSelIds} setSelKf={setSelKf}
        enterClip={enterClip} exitToDepth={exitToDepth} crumbs={ctx.names} onLayerContext={onLayerContext} onLaneContext={onLaneContext} toggleHide={toggleHide} toggleLock={toggleLock}
        reorder={reorder}
        inClip={inClip} onAudioLaneDown={onAudioLaneDown} audioTrack={audioTrack} audioLaneSel={audioLaneSel} audioBarMs={audioBarMs} onAudioBarDown={onAudioBarDown}
        camera={camera} cameraLaneSel={cameraLaneSel} onCameraLaneDown={onCameraLaneDown} onCameraKfDown={onCameraKfDown} selCamKf={selCamKf}
        rowsRef={rowsRef} barDrag={barDrag} selGap={selGap} onGapDown={onGapDown} onCloseGap={closeGap}
        saveCtl={saveCtl} showGrid={showGrid} onToggleGrid={() => setShowGridPersist(!showGrid)}
        animateArm={animateArm} onToggleAnimate={() => setAnimateArmPersist(!animateArm)}
        exportCtl={{ onExport: () => setExportOpen(true) }}
        duplicateLayer={duplicateLayer} removeLayer={removeLayer} cycleTag={cycleTag} renameLayer={renameLayer}
        rulerRef={rulerRef} onRulerDown={onRulerDown} onBarDown={onBarDown} onKfDown={onKfDown} selKf={selKf} onWorldKfDown={onWorldKfDown} />

      {/* ============ CONTEXT MENU ============ */}
      {menu && <ContextMenu menu={menu} setMenu={setMenu} setSegmentEase={setSegmentEase} groupSelection={groupSelection} enterClip={enterClip} ungroupClip={ungroupClip} copySelection={copySelection} pasteClipboard={pasteClipboard} clipCount={clipCount} duplicateSelected={duplicateSelected} toggleHide={toggleHide} toggleLock={toggleLock} removeSelected={removeSelected} fmt={fmt} />}

      {/* ============ EXPORT DIALOG ============ */}
      {exportOpen && (
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} project={JSON.parse(projectJson())} projectId={null} projectName={name} />
      )}
    </div>
  );
}

/* ============================================================
   STAGE OBJECT (recursive) — extracted to ./StageObject.jsx and
   re-exported here so existing imports from this module keep working
   ============================================================ */
export { StageObject } from "./StageObject";
