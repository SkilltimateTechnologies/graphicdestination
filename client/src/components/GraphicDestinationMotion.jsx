import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ExportDialog from "./ExportDialog";
import { api } from "../api";
import { prepareImageFile } from "../lib/imagePrep";
import { makeAudioTrack, audioToJson, audioFromJson, audioGainAt, audioWithinAt, validateAudioFile, AUDIO_ACCEPT_ATTR } from "../lib/audioTrack";
import { clamp01 } from "../engine/easing.js";
import { SHAPE_DEFS } from "../engine/shapes.js";
import { valueAt, posOf, clipLocalTime } from "../engine/keyframes.js";
import { MAPS, WORLD_H, CONTINENTS, WORLD_EXT, mapBox, normHi } from "../engine/maps.js";
import { FONT_IMPORT } from "../engine/fx.js";
import { C, KF_PROPS, STAGE_PRESETS, kfAt, layerOut } from "./editor/model";
import TopBar from "./editor/TopBar";
import IconRail from "./editor/IconRail";
import ShapesPanel from "./editor/panels/ShapesPanel";
import MapsPanel from "./editor/panels/MapsPanel";
import ImagePanel from "./editor/panels/ImagePanel";
import AudioPanel from "./editor/panels/AudioPanel";
import StageView from "./editor/StageView";
import Inspector from "./editor/Inspector";
import Timeline from "./editor/Timeline";
import { ContextMenu, BrandModal, IOModal } from "./editor/modals";

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

export { STAGE_PRESETS } from "./editor/model";
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
  /* stage size preset picker (top bar + inspector share it): apply by "WxH" value */
  const applyStagePreset = (v) => { const p = STAGE_PRESETS.find((s) => `${s.w}x${s.h}` === v); if (p) setStage({ w: p.w, h: p.h }); };
  const stageIsPreset = STAGE_PRESETS.some((s) => s.w === stage.w && s.h === stage.h);
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
      <TopBar name={name} setName={setName} exitToDepth={exitToDepth} inClip={inClip} ctx={ctx}
        stage={stage} applyStagePreset={applyStagePreset} stageIsPreset={stageIsPreset} brand={brand}
        setBrandOpen={setBrandOpen} setIoOpen={setIoOpen} setImportErr={setImportErr} setExportOpen={setExportOpen} />

      {/* ============ MAIN ============ */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        <IconRail shapesOpen={shapesOpen} setShapesOpen={setShapesOpen} imagesOpen={imagesOpen} setImagesOpen={setImagesOpen}
          audioOpen={audioOpen} setAudioOpen={setAudioOpen} mapsOpen={mapsOpen} setMapsOpen={setMapsOpen}
          audioTrack={audioTrack} addObject={addObject} />

        {/* shapes folder with search */}
        {shapesOpen && <ShapesPanel shapeQ={shapeQ} setShapeQ={setShapeQ} addObject={addObject} />}

        {/* maps drawer */}
        {mapsOpen && <MapsPanel addObject={addObject} setMapsOpen={setMapsOpen} />}

        {/* images drawer: upload + your asset library */}
        {imagesOpen && <ImagePanel assetFileRef={assetFileRef} assetUploading={assetUploading} assetErr={assetErr} assets={assets} assetsBusy={assetsBusy} refreshAssets={refreshAssets} addAssetLayer={addAssetLayer} onDeleteAsset={onDeleteAsset} />}

        {/* audio drawer: upload + attached track + reusable audio assets */}
        {audioOpen && <AudioPanel audioFileRef={assetFileRef} audioUploading={audioUploading} audioErr={audioErr} audioTrack={audioTrack} detachAudio={detachAudio} assets={assets} assetsBusy={assetsBusy} assetErr={assetErr} refreshAssets={refreshAssets} audioAssets={audioAssets} attachAudioAsset={attachAudioAsset} onDeleteAudioAsset={onDeleteAudioAsset} fmtBytes={fmtBytes} fmt={fmt} />}

        {/* ---- stage ---- */}
        <StageView stageWrapRef={stageWrapRef} stageScrollRef={stageScrollRef} tlDragging={tlDragging} zoomed={zoomed}
          stage={stage} stageScale={stageScale} stageBg={stageBg} inClip={inClip} ctx={ctx} ctxLayers={ctxLayers} time={time}
          selIds={selIds} sel={sel} overflowShow={overflowShow} zoomMode={zoomMode}
          onObjectDown={onObjectDown} enterClip={enterClip} displayValue={displayValue} onResizeDown={onResizeDown} onRotateDown={onRotateDown}
          onPathPtDown={onPathPtDown} patchPath={patchPath} setOverflowShow={setOverflowShow}
          setSelIds={setSelIds} setSelKf={setSelKf} setAudioSel={setAudioSel} setShapesOpen={setShapesOpen} setMapsOpen={setMapsOpen} setImagesOpen={setImagesOpen} setAudioOpen={setAudioOpen}
          stepZoom={stepZoom} cycleZoom={cycleZoom} setZoom={setZoom} />

        {/* ---- inspector ---- */}
        <Inspector audioLaneSel={audioLaneSel} audioTrack={audioTrack} patchAudio={patchAudio} detachAudio={detachAudio} fmt={fmt}
          selMany={selMany} groupSelection={groupSelection} align={align} duplicateSelected={duplicateSelected} removeSelected={removeSelected}
          inClip={inClip} ctx={ctx} sel={sel} patchObject={patchObject} toggleHide={toggleHide} toggleLock={toggleLock}
          stage={stage} stageBg={stageBg} setStageBg={setStageBg} applyStagePreset={applyStagePreset} stageIsPreset={stageIsPreset}
          enterClip={enterClip} patchProps={patchProps} ctxDur={ctxDur} stretchClipDur={stretchClipDur} stretchClips={stretchClips} setStretchClips={setStretchClips} ungroupClip={ungroupClip}
          morphQ={morphQ} setMorphQ={setMorphQ} time={time} timeRef={timeRef} setShapeAt={setShapeAt} editProp={editProp}
          removeKeyframe={removeKeyframe} setKeyframe={setKeyframe} setSelKf={setSelKf} flowText={flowText} brand={brand} SW={SW}
          addPathTo={addPathTo} patchPath={patchPath} animateAlongPath={animateAlongPath} kfNav={kfNav} selectedKfData={selectedKfData}
          setSegmentEase={setSegmentEase} applyPreset={applyPreset} fileRef={fileRef} />
      </div>

      {/* ============ TIMELINE ============ */}
      <Timeline tlH={tlH} tlDragging={tlDragging} onTlHandleDown={onTlHandleDown} resetTlH={resetTlH}
        setPlaying={setPlaying} setTime={setTime} playing={playing} time={time} fmt={fmt} ctxDur={ctxDur} setCtxDurMs={setCtxDurMs}
        stretchClips={stretchClips} setStretchClips={setStretchClips} loop={loop} setLoop={setLoop} autokey={autokey} setAutokey={setAutokey}
        selMany={selMany} groupSelection={groupSelection} ctxLayers={ctxLayers} selIds={selIds} setSelIds={setSelIds} setSelKf={setSelKf}
        enterClip={enterClip} onLayerContext={onLayerContext} onLaneContext={onLaneContext} toggleHide={toggleHide} toggleLock={toggleLock}
        reorder={reorder} duplicateSelected={duplicateSelected} removeSelected={removeSelected}
        inClip={inClip} onAudioLaneDown={onAudioLaneDown} audioTrack={audioTrack} audioLaneSel={audioLaneSel} audioBarMs={audioBarMs} onAudioBarDown={onAudioBarDown}
        rulerRef={rulerRef} onRulerDown={onRulerDown} onBarDown={onBarDown} onKfDown={onKfDown} selKf={selKf} onWorldKfDown={onWorldKfDown} />

      {/* ============ CONTEXT MENU ============ */}
      {menu && <ContextMenu menu={menu} setMenu={setMenu} setSegmentEase={setSegmentEase} groupSelection={groupSelection} enterClip={enterClip} ungroupClip={ungroupClip} copySelection={copySelection} pasteClipboard={pasteClipboard} clipCount={clipCount} duplicateSelected={duplicateSelected} toggleHide={toggleHide} toggleLock={toggleLock} removeSelected={removeSelected} fmt={fmt} />}

      {/* ============ BRAND MODAL ============ */}
      {brandOpen && <BrandModal setBrandOpen={setBrandOpen} brands={brands} brandId={brandId} setBrandId={setBrandId} setBrands={setBrands} brand={brand} />}

      {/* ============ SAVE / LOAD MODAL ============ */}
      {ioOpen && <IOModal setIoOpen={setIoOpen} copyProject={copyProject} ioCopied={ioCopied} importText={importText} setImportText={setImportText} importErr={importErr} importProject={importProject} />}

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
