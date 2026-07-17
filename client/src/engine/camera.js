/* ============================================================
   ENGINE · 2.5D scene camera + per-layer parallax depth (pure)
   ============================================================
   THE ONE FORMULA (used identically by the editor preview AND the export
   frame renderer — both go through StageObject, which imports this):

     parallax factor   f  = 1 + depth                    (depth ∈ [−1 … +1.5])
     screen translate  T  = (−camX·f, −camY·f)           (stage px)
     screen scale      s  = 1 + (zoom − 1)·f             (about stage center)

   Applied per root-level layer as CSS:
     transform: translate(−camX·f px, −camY·f px) scale(s)
     transform-origin: <stage.w/2>px <stage.h/2>px        (scale about center)

   depth  0    → f = 1  → world-locked layer (the default; old projects have
                         no depth prop and behave exactly like this)
   depth −0.9  → f = 0.1 → barely follows the camera (far background)
   depth −1    → f = 0  → camera-locked (UI overlays / watermarks — never
                         moves nor scales with the camera)
   depth +1.5  → f = 2.5 → whips past (foreground)

   Camera state is project-level and optional:
     camera: { tracks: { x: [{t,v,ease}…], y: […], zoom: […] } }
   x/y are stage px (0 = centered), zoom is clamped to 0.25…4 (1 = 100%).
   Keyframes are evaluated with the SAME valueAt() machinery as object
   props — the camera is a pseudo-object: { tracks, props: CAM_DEFAULTS }.
   Old projects have no `camera` field → cameraAt(null) = identity →
   StageObject adds no wrapper → byte-identical renders.

   Scope decision (documented in the camera report): the camera applies at
   the ROOT scene level only. Clip children render in raw clip space (no
   camera re-application inside clips), and inside-clip editing shows the
   raw clip space as well. The clip layer as a whole does carry depth.
   ============================================================ */

import { valueAt } from "./keyframes.js";

export const CAM_PROPS = ["x", "y", "zoom"];
export const CAM_DEFAULTS = { x: 0, y: 0, zoom: 1 };
export const CAM_ZOOM_MIN = 0.25;
export const CAM_ZOOM_MAX = 4;
/* UI slider range is −0.9…+1.5 (Inspector); evaluation additionally allows
   −1 exactly (f = 0, camera-locked overlays) and hard-clamps beyond that so
   f never goes negative (which would mirror the layer). */
export const CAM_DEPTH_MIN = -0.9;
export const CAM_DEPTH_MAX = 1.5;
const DEPTH_HARD_MIN = -1;

export const clampZoom = (z) => Math.max(CAM_ZOOM_MIN, Math.min(CAM_ZOOM_MAX, Number.isFinite(+z) ? +z : 1));
export const clampDepth = (d) => Math.max(DEPTH_HARD_MIN, Math.min(CAM_DEPTH_MAX, Number.isFinite(+d) ? +d : 0));

/* parallax factor for a layer depth (undefined/absent → 0 → f = 1) */
export const depthFactor = (depth) => 1 + clampDepth(depth == null ? 0 : depth);

/* camera as a valueAt-compatible pseudo-object */
export const camTrackHost = (camera) => ({ tracks: camera?.tracks || {}, props: CAM_DEFAULTS });

/* evaluated camera values at a time (ms). null/absent camera → identity. */
export function cameraAt(camera, time) {
  if (!camera || !camera.tracks) return { ...CAM_DEFAULTS };
  const host = camTrackHost(camera);
  return {
    x: valueAt(host, "x", time) || 0,
    y: valueAt(host, "y", time) || 0,
    zoom: clampZoom(valueAt(host, "zoom", time)),
  };
}

/* per-layer camera transform at a time. Returns { f, tx, ty, s }:
   tx/ty = screen translate in stage px, s = scale about stage center.
   s is clamped to ≥ 0.05: extreme foreground depth (f = 2.5) combined with a
   strong zoom-out could otherwise cross 0 and mirror-flip the layer. */
export function cameraTransform(camera, time, depth) {
  const f = depthFactor(depth);
  const c = cameraAt(camera, time);
  return { f, tx: -c.x * f, ty: -c.y * f, s: Math.max(0.05, 1 + (c.zoom - 1) * f) };
}

export const camIsIdentity = (t) => !t || (t.tx === 0 && t.ty === 0 && t.s === 1);

/* CSS transform string for one layer (origin: stage center, set by the caller) */
export const camTransformCss = (t) => `translate(${t.tx}px, ${t.ty}px) scale(${t.s})`;

/* ---------- schema: sanitize on load, normalize on save ----------
   Mirrors the audio seam (audioTrack.js): `camera` is an optional top-level
   project field, OMITTED entirely when the user never touched the camera. */
export function cameraFromJson(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw.tracks && typeof raw.tracks === "object" ? raw.tracks : {};
  const tracks = {};
  for (const p of CAM_PROPS) {
    const tr = Array.isArray(src[p]) ? src[p] : [];
    const clean = tr
      .filter((k) => k && Number.isFinite(+k.t) && Number.isFinite(+k.v))
      .map((k) => ({ t: Math.max(0, Math.round(+k.t)), v: p === "zoom" ? clampZoom(+k.v) : +k.v, ease: typeof k.ease === "string" ? k.ease : "easeInOutCubic" }))
      .sort((a, b) => a.t - b.t);
    if (clean.length) tracks[p] = clean;
  }
  return { tracks };
}

export function cameraToJson(camera) {
  if (!camera || typeof camera !== "object") return null;
  const tracks = {};
  for (const p of CAM_PROPS) {
    const tr = Array.isArray(camera.tracks?.[p]) ? camera.tracks[p] : [];
    const clean = tr
      .filter((k) => k && Number.isFinite(+k.t) && Number.isFinite(+k.v))
      .map((k) => ({ t: Math.max(0, Math.round(+k.t)), v: p === "zoom" ? clampZoom(+k.v) : +k.v, ease: typeof k.ease === "string" ? k.ease : "easeInOutCubic" }))
      .sort((a, b) => a.t - b.t);
    if (clean.length) tracks[p] = clean;
  }
  /* a camera with zero keyframes is identity — omit it from the JSON */
  return Object.keys(tracks).length ? { tracks } : null;
}

/* total keyframe count across the three camera tracks (lane badge) */
export const cameraKeyCount = (camera) =>
  !camera ? 0 : CAM_PROPS.reduce((n, p) => n + (Array.isArray(camera.tracks?.[p]) ? camera.tracks[p].length : 0), 0);
