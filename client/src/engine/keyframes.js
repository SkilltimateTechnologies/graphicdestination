/* ============================================================
   ENGINE · keyframe/track evaluation + clip timing (pure)
   Extracted VERBATIM from components/GraphicDestinationMotion.jsx
   (zero-behavior-change refactor — pure engine code only).
   ============================================================ */

import { EASE, clamp01 } from "./easing.js";
import { pointOnPath } from "./shapes.js";
import { FX_STAG, FX_CDUR } from "./fx.js";

/* ---------- color interpolation (for fill keyframes) ---------- */
function hexRgb(h) {
  if (!h) return [255, 255, 255];
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export function lerpColor(a, b, u) {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u);
}
export function colorAt(obj, prop, time) {
  const track = obj.tracks[prop];
  if (!track || track.length === 0) return obj.props[prop];
  if (time <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (time >= last.t) return last.v;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (time >= a.t && time <= b.t) {
      const u = b.t === a.t ? 1 : (time - a.t) / (b.t - a.t);
      return lerpColor(a.v, b.v, (EASE[a.ease] || EASE.linear)(u));
    }
  }
  return last.v;
}

export function valueAt(obj, prop, time) {
  const track = obj.tracks[prop];
  if (!track || track.length === 0) return obj.props[prop];
  if (time <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (time >= last.t) return last.v;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (time >= a.t && time <= b.t) {
      const u = b.t === a.t ? 1 : (time - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * (EASE[a.ease] || EASE.linear)(u);
    }
  }
  return last.v;
}

/* position of an object: motion path wins over x/y */
export function posOf(obj, time, dv) {
  if (obj.props.path && obj.props.path.pts.length >= 2) return pointOnPath(obj.props.path, valueAt(obj, "prog", time));
  return dv ? [dv(obj, "x"), dv(obj, "y")] : [valueAt(obj, "x", time), valueAt(obj, "y", time)];
}

export const fxDuration = (fx, n, dur = 5000) => (fx.type === "wave" ? dur : (n * FX_STAG + FX_CDUR + 200) / (fx.speed || 1));

export function clipTransition(P, time) {
  const td = P.tDur || 500;
  const out = { o: 1, tx: 0, ty: 0, s: 1 };
  const apply = (kind, u) => {
    const e = 1 - Math.pow(1 - u, 3);
    if (kind === "fade") out.o *= e;
    if (kind === "slideU") { out.ty += (1 - e) * 150; out.o *= Math.min(1, e * 1.6); }
    if (kind === "slideD") { out.ty -= (1 - e) * 150; out.o *= Math.min(1, e * 1.6); }
    if (kind === "slideL") { out.tx += (1 - e) * 200; out.o *= Math.min(1, e * 1.6); }
    if (kind === "slideR") { out.tx -= (1 - e) * 200; out.o *= Math.min(1, e * 1.6); }
    if (kind === "zoom") { out.s *= 0.55 + 0.45 * e; out.o *= Math.min(1, e * 1.5); }
    if (kind === "zoomOut") { out.s *= 1.6 - 0.6 * e; out.o *= Math.min(1, e * 1.5); }
  };
  if (P.tIn && P.tIn !== "none") apply(P.tIn, clamp01((time - P.start) / td));
  if (P.tOut && P.tOut !== "none" && P.end === "hide") {
    const winEnd = P.start + P.dur / (P.speed || 1);
    apply(P.tOut, clamp01((winEnd - time) / td));
  }
  return out;
}

export function clipLocalTime(P, time) {
  let local = (time - P.start) * P.speed;
  if (local < 0) return null;
  if (local > P.dur) {
    if (P.end === "hide") return null;
    if (P.end === "loop") local = local % P.dur;
    else local = P.dur;
  }
  return local;
}
