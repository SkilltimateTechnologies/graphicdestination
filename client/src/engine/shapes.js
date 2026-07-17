/* ============================================================
   ENGINE · shapes, shape morphing + motion paths (pure)
   Extracted VERBATIM from components/GraphicDestinationMotion.jsx
   (zero-behavior-change refactor — pure engine code only).
   ============================================================ */

import { EASE, clamp01 } from "./easing.js";

/* ============================================================
   SHAPES — every shape is sampled to the SAME 64 outline points,
   so morphing between any two shapes is pure point interpolation.
   ============================================================ */
export const N_PTS = 64;

export function samplePoly(verts, n = N_PTS) {
  const segs = []; let per = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, l }); per += l;
  }
  const pts = []; const step = per / n; let si = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = k * step;
    while (si < segs.length - 1 && target > acc + segs[si].l - 1e-9) { acc += segs[si].l; si++; }
    const s = segs[si], u = s.l ? (target - acc) / s.l : 0;
    pts.push([s.a[0] + (s.b[0] - s.a[0]) * u, s.a[1] + (s.b[1] - s.a[1]) * u]);
  }
  return pts;
}
/* consistent start point (topmost) + winding, so morphs don't twist */
export function alignPts(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) if (pts[i][1] < pts[s][1] - 1e-6 || (Math.abs(pts[i][1] - pts[s][1]) < 1e-6 && pts[i][0] < pts[s][0])) s = i;
  let out = pts.slice(s).concat(pts.slice(0, s));
  let area = 0;
  for (let i = 0; i < out.length; i++) { const a = out[i], b = out[(i + 1) % out.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) out = [out[0], ...out.slice(1).reverse()];
  return out;
}
export function regular(n, r = 50) {
  const v = [];
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; v.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]); }
  return v;
}
export function starVerts(points = 5, R = 50, r = 21) {
  const v = [];
  for (let i = 0; i < points * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / points; const rad = i % 2 === 0 ? R : r; v.push([50 + rad * Math.cos(a), 50 + rad * Math.sin(a)]); }
  return v;
}
export function heartPts(n = N_PTS) {
  const raw = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    raw.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
  const mnx = Math.min(...xs), mxx = Math.max(...xs), mny = Math.min(...ys), mxy = Math.max(...ys);
  const s = 100 / Math.max(mxx - mnx, mxy - mny);
  return raw.map(([x, y]) => [(x - mnx) * s, (y - mny) * s]);
}
export function ellipsePts(n = N_PTS) {
  const v = [];
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; v.push([50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]); }
  return v;
}

export const SHAPE_DEFS = {
  rect:     { name: "Rectangle", pts: samplePoly([[0, 0], [100, 0], [100, 100], [0, 100]]) },
  ellipse:  { name: "Ellipse",   pts: ellipsePts() },
  triangle: { name: "Triangle",  pts: samplePoly([[50, 0], [100, 100], [0, 100]]) },
  diamond:  { name: "Diamond",   pts: samplePoly([[50, 0], [100, 50], [50, 100], [0, 50]]) },
  pentagon: { name: "Pentagon",  pts: samplePoly(regular(5)) },
  hexagon:  { name: "Hexagon",   pts: samplePoly(regular(6)) },
  star:     { name: "Star",      pts: samplePoly(starVerts()) },
  heart:    { name: "Heart",     pts: heartPts() },
  arrow:    { name: "Arrow",     pts: samplePoly([[0, 32], [58, 32], [58, 10], [100, 50], [58, 90], [58, 68], [0, 68]]) },
  cross:    { name: "Cross",     pts: samplePoly([[35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35]]) },
  bolt:     { name: "Bolt",      pts: samplePoly([[58, 0], [74, 0], [54, 42], [82, 42], [32, 100], [42, 56], [18, 56]]) },
};
Object.keys(SHAPE_DEFS).forEach((k) => (SHAPE_DEFS[k].pts = alignPts(SHAPE_DEFS[k].pts)));
export const SHAPE_IDS = Object.keys(SHAPE_DEFS);

export function lerpPts(A, B, u) {
  const out = new Array(A.length);
  for (let i = 0; i < A.length; i++) out[i] = [A[i][0] + (B[i][0] - A[i][0]) * u, A[i][1] + (B[i][1] - A[i][1]) * u];
  return out;
}
export function ptsToStr(pts) {
  let s = "";
  for (let i = 0; i < pts.length; i++) s += pts[i][0].toFixed(2) + "," + pts[i][1].toFixed(2) + " ";
  return s;
}

/* ---------- rounded rect (sampled to N_PTS so it can still morph) ---------- */
const _rrCache = {};
function roundedRectPts(r) {
  const key = Math.round(r);
  if (_rrCache[key]) return _rrCache[key];
  const R = Math.max(0, Math.min(49, key));
  if (R < 1) return SHAPE_DEFS.rect.pts;
  const v = [];
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 7; i++) { const a = a0 + ((a1 - a0) * i) / 7; v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); } };
  arc(R, R, Math.PI, Math.PI * 1.5);
  arc(100 - R, R, Math.PI * 1.5, Math.PI * 2);
  arc(100 - R, 100 - R, 0, Math.PI * 0.5);
  arc(R, 100 - R, Math.PI * 0.5, Math.PI);
  const pts = alignPts(samplePoly(v));
  _rrCache[key] = pts;
  return pts;
}
export function shapePtsOf(shapeId, cornerR) {
  if (shapeId === "rect" && cornerR > 0) return roundedRectPts(cornerR);
  return SHAPE_DEFS[shapeId].pts;
}

/* ---------- motion paths (Catmull-Rom, arc-length parameterized) ---------- */
function crSample(pts, seg = 16, closed = false) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const n = pts.length;
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let j = 0; j < seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? pts[0].slice() : pts[n - 1].slice());
  return out;
}
export const pathSamples = (path) => {
  if (path.curved) return crSample(path.pts, 16, !!path.closed);
  const pts = path.pts.map((p) => p.slice());
  if (path.closed && pts.length > 2) pts.push(pts[0].slice());
  return pts;
};
export function pointOnPath(path, u) {
  const sp = pathSamples(path);
  if (sp.length < 2) return sp[0] || [0, 0];
  let per = 0;
  const L = [0];
  for (let i = 1; i < sp.length; i++) { per += Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]); L.push(per); }
  const target = clamp01(u) * per;
  for (let i = 1; i < sp.length; i++) {
    if (L[i] >= target) {
      const f = (target - L[i - 1]) / (L[i] - L[i - 1] || 1e-9);
      return [sp[i - 1][0] + (sp[i][0] - sp[i - 1][0]) * f, sp[i - 1][1] + (sp[i][1] - sp[i - 1][1]) * f];
    }
  }
  return sp[sp.length - 1];
}

export function morphPtsAt(obj, time) {
  const R = obj.props.cornerR || 0;
  const pt = (id) => shapePtsOf(id, R);
  const tr = obj.tracks.shape;
  if (!tr || tr.length === 0) return pt(obj.props.shape);
  if (time <= tr[0].t) return pt(tr[0].v);
  const last = tr[tr.length - 1];
  if (time >= last.t) return pt(last.v);
  for (let i = 0; i < tr.length - 1; i++) {
    const a = tr[i], b = tr[i + 1];
    if (time >= a.t && time <= b.t) {
      if (a.v === b.v) return pt(a.v);
      const u = (EASE[a.ease] || EASE.easeInOutCubic)((time - a.t) / (b.t - a.t));
      return lerpPts(pt(a.v), pt(b.v), clamp01(u));
    }
  }
  return pt(last.v);
}
