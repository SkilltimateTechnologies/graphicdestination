/* ============================================================
   ENGINE · real-geography maps — helpers over engine/mapdata.js
   (Natural Earth 50m, 239 countries, 7 true continent unions).

   Style grammar: simple · electric · pop.
     · single country  → TRACE: the outline draws from one point around the
       border, CLOSES and STAYS; a soft flat fill fades in behind it.
     · continent/world → flat neutral landmass + timed country HIGHLIGHTS
       (props.hi: [{cc, t, out, color?}] — appear with an easeOutBack pop at
       `t`, hide at `out`; per-country electric colors fall back to the
       HI_PALETTE by index, or to the legacy single P.hiFill).

   Legacy contract (old project JSON keeps rendering):
     · MAPS/WORLD/WORLD_D/WORLD_EXT/WORLD_LIST/CONTINENTS/CONTINENT_NAMES keep
       their old shapes (now fed by REAL 50m outlines; every legacy id exists).
     · legacy hi entries ({cc, t, out, zoom}) and legacy mapStyle values map to
       the nearest new behavior — nothing throws, nothing crashes.
   ============================================================ */
import { COUNTRIES, CONTINENT_NAMES, CONT_CODE, WORLD_H } from "./mapdata.js";
import { EASE, clamp01 } from "./easing.js";

export { COUNTRIES, CONTINENT_NAMES, CONT_CODE, WORLD_H };

/* ---------- continent unions (full-name keys, legacy-compatible) ---------- */
export const CONTINENTS = {};
Object.keys(CONTINENT_NAMES).forEach((name) => (CONTINENTS[name] = []));
Object.keys(COUNTRIES).forEach((id) => {
  const name = CONT_CODE[COUNTRIES[id].c];
  if (CONTINENTS[name]) CONTINENTS[name].push(id);
});
Object.keys(CONTINENTS).forEach((name) => CONTINENTS[name].sort());

/* ---------- world-space paths / extents (legacy shapes) ---------- */
export const WORLD = {};
Object.keys(COUNTRIES).forEach((id) => (WORLD[id] = { n: COUNTRIES[id].n, r: COUNTRIES[id].r }));

export function ringsToPath(rings) {
  let d = "";
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) d += (i === 0 ? "M" : "L") + r[i] + " " + r[i + 1];
    d += "Z";
  }
  return d;
}
export function arcPath(cx, cy, r, a0, a1) {
  const rad = (a) => (a * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  const laf = a1 - a0 > 180 ? 1 : 0;
  return `M${cx} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${laf} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
}

export const WORLD_D = {};
Object.keys(WORLD).forEach((cc) => (WORLD_D[cc] = ringsToPath(WORLD[cc].r)));
export const WORLD_EXT = {};
Object.keys(WORLD).forEach((cc) => (WORLD_EXT[cc] = COUNTRIES[cc].bb.slice()));
export const WORLD_LIST = Object.keys(WORLD).map((cc) => ({ cc, n: WORLD[cc].n })).sort((a, b) => a.n.localeCompare(b.n));

const bboxOfRings = (rings) => {
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  rings.forEach((r) => { for (let i = 0; i < r.length; i += 2) { mnx = Math.min(mnx, r[i]); mxx = Math.max(mxx, r[i]); mny = Math.min(mny, r[i + 1]); mxy = Math.max(mxy, r[i + 1]); } });
  return [mnx, mny, mxx, mxy];
};

/* Antimeridian unwrap: countries whose rings touch both edges (Fiji, Russia,
   USA's Aleutians, Kiribati…) get re-based so the bbox is the SMALLEST honest
   span — candidate A raw, candidate B west-edge rings shifted +200, candidate
   C east-edge rings shifted −200. Pure & deterministic. */
export function unwrapRings(rings) {
  const span = (bb) => bb[2] - bb[0];
  const raw = bboxOfRings(rings);
  if (span(raw) <= 150) return { rings, bb: raw };
  const shift = (rs, pred, dx) => rs.map((r) => {
    let mnx = 1e9, mxx = -1e9;
    for (let i = 0; i < r.length; i += 2) { mnx = Math.min(mnx, r[i]); mxx = Math.max(mxx, r[i]); }
    if (!pred(mnx, mxx)) return r;
    const o = r.slice();
    for (let i = 0; i < o.length; i += 2) o[i] += dx;
    return o;
  });
  const west = shift(rings, (mnx, mxx) => mxx < 100, 200);
  const east = shift(rings, (mnx) => mnx > 100, -200);
  const bbW = bboxOfRings(west), bbE = bboxOfRings(east);
  if (span(bbW) < span(raw) && span(bbW) <= span(bbE)) return { rings: west, bb: bbW };
  if (span(bbE) < span(raw)) return { rings: east, bb: bbE };
  return { rings, bb: raw };
}

/* single-country normalized view: rings unwrapped, longest side → 100 */
export function rings100(id) {
  const c = COUNTRIES[id];
  if (!c) return null;
  const { rings, bb } = unwrapRings(c.r);
  const w = bb[2] - bb[0], h = bb[3] - bb[1];
  const k = 100 / Math.max(w, h, 1e-6);
  const q = (v) => Math.round(v * 10) / 10;
  const norm = rings.map((r) => {
    const o = [];
    for (let i = 0; i < r.length; i += 2) { o[i] = q((r[i] - bb[0]) * k); o[i + 1] = q((r[i + 1] - bb[1]) * k); }
    return o;
  });
  return { name: c.n, aspect: w / Math.max(h, 1e-6), rings: norm, cont: CONT_CODE[c.c] };
}

/* MAPS — legacy shape ({ name, aspect, rings }), now every country on Earth */
export const MAPS = {};
Object.keys(COUNTRIES).forEach((id) => (MAPS[id] = rings100(id)));
export function mapBox(m) {
  const a = Number.isFinite(m && m.aspect) ? Math.min(100, Math.max(0.01, m.aspect)) : 1;
  return a >= 1 ? { w: 100, h: 100 / a } : { w: 100 * a, h: 100 };
}

/* ---------- continent view: union bbox (viewport crop for a readable Europe) ----------
   Europe per UN membership includes all of Russia to the Pacific — as a VIEW
   that reads as "Eurasia", so the Europe map crops its viewport at ~62°E
   (x = 134.4), standard cartographic practice. Rings render fully; the SVG
   viewBox clips. Antimeridian-crossing countries contribute only rings within
   ±100 of their largest ring's centre to the extent (drops far specks). */
export const CONTINENT_VIEW = {
  EUROPE: { minX: 86, maxX: 134.4, minY: 3, maxY: 32 }, /* Iceland → Urals, Svalbard → Cyprus */
  OCEANIA: { minX: 140 },                               /* Australia → Samoa; far Polynesian specks overflow */
};
export function continentBox(name) {
  const codes = CONTINENTS[name] || [];
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  codes.forEach((cc) => {
    const c = COUNTRIES[cc];
    if (!c) return;
    const bb = c.bb;
    if (bb[2] - bb[0] <= 150 && bb[0] <= bb[2]) {
      mnx = Math.min(mnx, bb[0]); mny = Math.min(mny, bb[1]); mxx = Math.max(mxx, bb[2]); mxy = Math.max(mxy, bb[3]);
      return;
    }
    /* antimeridian crosser: anchor on the largest ring's centre */
    let big = null, ba = -1;
    c.r.forEach((r) => { const rb = bboxOfRings([r]); const a = (rb[2] - rb[0]) * (rb[3] - rb[1]); if (a > ba) { ba = a; big = rb; } });
    if (!big) return;
    const cx = (big[0] + big[2]) / 2;
    c.r.forEach((r) => {
      const rb = bboxOfRings([r]);
      const rcx = (rb[0] + rb[2]) / 2;
      if (Math.abs(rcx - cx) > 100) return;
      mnx = Math.min(mnx, rb[0]); mny = Math.min(mny, rb[1]); mxx = Math.max(mxx, rb[2]); mxy = Math.max(mxy, rb[3]);
    });
  });
  if (mnx > mxx) return null;
  const view = CONTINENT_VIEW[name];
  if (view) {
    if (view.minX != null) mnx = Math.max(mnx, view.minX);
    if (view.maxX != null) mxx = Math.min(mxx, view.maxX);
    if (view.minY != null) mny = Math.max(mny, view.minY);
    if (view.maxY != null) mxy = Math.min(mxy, view.maxY);
    if (mnx >= mxx || mny >= mxy) return null;
  }
  return { w: mxx - mnx, h: mxy - mny, ox: mnx, oy: mny };
}
export function countryCenter(cc) {
  const e = WORLD_EXT[cc] || [0, 0, 0, 0];
  return { cx: (e[0] + e[2]) / 2, cy: (e[1] + e[3]) / 2 };
}

/* ---------- highlights: normalization, colors, timing (pure) ---------- */
/* accepts legacy strings ("USA"), legacy objects ({cc, t, out, zoom…}) and the
   new shape ({id, color, inT, outT}); output always {cc, t, out?, color?, …}. */
export const normHi = (hi) => (hi || []).map((h) => {
  if (typeof h === "string") return { cc: h, t: 0, zoom: true };
  if (h && h.id != null && h.cc == null) {
    const { id, inT, outT, ...rest } = h;
    return { zoom: true, ...rest, cc: id, t: inT != null ? inT : 0, ...(outT != null ? { out: outT } : {}) };
  }
  return { zoom: true, ...h };
});

/* electric pop palette — default per-country highlight colors by index */
export const HI_PALETTE = ["#00E5FF", "#FF2E88", "#FFE93A", "#7CFF4F", "#B26BFF", "#FF8A3D", "#3D7BFF", "#00FFC2"];
/* color for every highlight: explicit h.color wins; when NO entry carries a
   color (legacy projects) fall back to the single P.hiFill so old JSON keeps
   its exact look; mixed sets use the palette by position. */
export function hiColors(his, P) {
  const anyExplicit = his.some((h) => h.color);
  return his.map((h, i) => h.color || (anyExplicit ? HI_PALETTE[i % HI_PALETTE.length] : (P && P.hiFill) || HI_PALETTE[0]));
}

/* timed visibility: hidden before t, pops in over rd ms, holds, pops out at
   `out` over max(150, rd*0.5) ms. Returns {u, ou, aMul, scale, on}. */
export function hiState(h, time, rd) {
  const dur = Math.max(120, rd || 600);
  const u = clamp01((time - h.t) / dur);
  if (u <= 0) return { u, ou: 0, aMul: 0, scale: 0, on: false };
  const outDur = Math.max(150, dur * 0.5);
  const ou = h.out != null ? clamp01((time - h.out) / outDur) : 0;
  if (ou >= 1) return { u, ou, aMul: 0, scale: 0, on: false };
  const pop = EASE.easeOutBack(u);
  const scale = Math.max(0.001, pop * (1 - 0.35 * EASE.easeInCubic(ou)));
  const aMul = clamp01(u * 2.5) * (1 - EASE.easeInQuad(ou));
  return { u, ou, aMul, scale, on: true };
}

/* single-country trace: outline draws 0→1 (easeInOutCubic) over [start, start+dur],
   CLOSES and stays; soft fill fades in during the last 45%; a tiny settle-pop
   at close. fillK multiplies the caller's fill opacity. */
export function traceState(P, time) {
  const start = (P && P.start) || 0;
  const dur = Math.max(1, (P && P.dur) || 1800);
  const u = clamp01((time - start) / dur);
  const e = EASE.easeInOutCubic(u);
  const popT = clamp01((time - start - dur) / 260);
  return {
    u, e,
    dash: u >= 1 ? 0 : 100 * (1 - e),
    fillK: u >= 1 ? 1 : clamp01((u - 0.55) / 0.45),
    closed: u >= 1,
    popScale: 1 + 0.04 * Math.sin(popT * Math.PI) * (popT > 0 && popT < 1 ? 1 : 0),
  };
}

/* Each country now has 4 independent timeline points: appear (t), zoom-in,
   zoom-out, hide (out). zoom-in/zoom-out are optional — when unset they
   fall back sensibly (zoom-in = appear time; zoom-out = hide time, or a
   default hold after zoom-in if no hide is set either) so a country works
   immediately, but every point can be dragged to its own explicit moment.
   (Zoom camera itself was retired with the real-geography rewrite — these
   stay so Timeline markers + Inspector points keep working on old JSON.) */
export function worldZoomWindow(h, P) {
  const hold = Math.max(200, (P && P.zoomHoldMs) || 1600);
  const zin = h.zoomIn != null ? h.zoomIn : h.t;
  const zout = h.zoomOut != null ? h.zoomOut : (h.out != null ? h.out : zin + hold);
  return { zin, zout, zinAuto: h.zoomIn == null, zoutAuto: h.zoomOut == null };
}
