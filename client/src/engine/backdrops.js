/* ============================================================
   ENGINE · animated BACKDROPS (pure, deterministic, seamlessly looping)
   ------------------------------------------------------------
   A `backdrop` layer renders a full-stage animated background as a PURE
   function of (time, props, stageW, stageH). No wall-clock, no Math.random
   (seeds go through mulberry32) — the editor preview and the export frame
   renderer (both share components/StageObject.jsx) produce identical frames.

   SEAMLESS LOOP — every time-varying quantity derives from ONE loop phase

     u = (time · speed / loopMs) mod 1        (engine: backdropPhase)

   so at the loop boundary u wraps to EXACTLY 0 and the frame at t = loopMs
   equals the frame at t = 0 (speed 1; generally t = loopMs/speed). All
   oscillators use INTEGER harmonics of u (sin/cos of 2π·k·u, k ∈ ℤ) or
   integer-cycle wraps, so motion is continuous across the wrap and exported
   videos loop cleanly. props.speed is a multiplier on the loop rate
   (0.25–2), props.intensity scales opacity/energy (0.4–1.5), props.colors
   is the 5-slot theme palette [base, field1, field2, glow, accent].

   PERF — blur() at full-canvas is expensive, so the model uses ONLY
   gradient falloff (radial/linear, alpha stops) for softness: zero CSS
   filter blur is emitted by the backdrop renderer (asserted in
   check-backdrops.mjs). Layered low-opacity gradients stand in for the
   classic 40px-blur blobs.
   ============================================================ */

import { mulberry32 } from "./random.js";
import { lerpColor } from "./keyframes.js";

const TAU = Math.PI * 2;

export const BACKDROP_LOOP_MS = 8000;
export const BACKDROP_SPEED_MIN = 0.25;
export const BACKDROP_SPEED_MAX = 2;
export const BACKDROP_INTENSITY_MIN = 0.4;
export const BACKDROP_INTENSITY_MAX = 1.5;
export const BACKDROP_LOOP_MIN = 500;
export const BACKDROP_LOOP_MAX = 60000;

/* ---------- color themes — colors: [deep base, field 1, field 2, glow, accent] ---------- */
export const BACKDROP_THEMES = [
  { id: "amberDusk", name: "Amber Dusk", colors: ["#160B06", "#F5A524", "#FF7847", "#FFD984", "#E5636A"] },
  { id: "tealDeep", name: "Teal Deep", colors: ["#03171A", "#2DD4BF", "#0E7490", "#7EF0E0", "#5B8DEF"] },
  { id: "roseEmber", name: "Rose Ember", colors: ["#1B0810", "#F472B6", "#E5636A", "#FFB0A1", "#F5A524"] },
  { id: "forestNight", name: "Forest Night", colors: ["#06130C", "#34D399", "#1D7A5F", "#A7F3D0", "#EAB308"] },
  { id: "midnightBlue", name: "Midnight Blue", colors: ["#060A18", "#5B8DEF", "#7C6BF5", "#9CC2FF", "#22D3EE"] },
];
export const DEFAULT_BACKDROP_THEME = "amberDusk";

export const BACKDROP_VARIANTS = [
  { id: "aurora", name: "Aurora", blurb: "Three soft color fields drifting on slow Lissajous paths" },
  { id: "mesh", name: "Mesh Gradient", blurb: "Four corner color fields with slowly migrating centers" },
  { id: "waves", name: "Waves", blurb: "Stacked translucent sine silhouettes, phase-scrolled" },
  { id: "bokeh", name: "Bokeh", blurb: "Soft defocused circles drifting upward with a gentle pulse" },
  { id: "starfield", name: "Starfield", blurb: "Twinkling seeded stars with slow parallax drift" },
  { id: "gridpulse", name: "Grid Pulse", blurb: "Perspective floor grid with a light sweep on the loop" },
  { id: "nebula", name: "Nebula", blurb: "Counter-rotating color rings around an aurora core" },
  { id: "sunset", name: "Sunset", blurb: "Horizontal gradient bands cycling through the palette" },
];
export const BACKDROP_VARIANT_IDS = BACKDROP_VARIANTS.map((v) => v.id);

/* ---------- clamps / normalizers (pure; junk → inert defaults) ---------- */
const fin = (v, d) => (Number.isFinite(+v) ? +v : d);
export const clampSpeed = (v) => Math.max(BACKDROP_SPEED_MIN, Math.min(BACKDROP_SPEED_MAX, fin(v, 1)));
export const clampIntensity = (v) => Math.max(BACKDROP_INTENSITY_MIN, Math.min(BACKDROP_INTENSITY_MAX, fin(v, 1)));
export const clampLoopMs = (v) => Math.max(BACKDROP_LOOP_MIN, Math.min(BACKDROP_LOOP_MAX, Math.round(fin(v, BACKDROP_LOOP_MS))));
export const themeOf = (id) => BACKDROP_THEMES.find((t) => t.id === id) || BACKDROP_THEMES[0];
export const variantOf = (id) => (BACKDROP_VARIANT_IDS.includes(id) ? id : "aurora");

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/* effective 5-slot palette: per-slot validation, missing/junk slots fall
   back to the layer's theme (then to the default theme) — old/junk props
   can never paint garbage */
export function backdropColors(P) {
  const fb = themeOf(P && P.theme).colors;
  const src = P && Array.isArray(P.colors) ? P.colors : [];
  return fb.map((c, i) => (HEX.test(src[i] || "") ? src[i] : c));
}

/* default props for a freshly inserted backdrop layer */
export function backdropDefaults(variant = "aurora", themeId = DEFAULT_BACKDROP_THEME) {
  const th = themeOf(themeId);
  return { variant: variantOf(variant), theme: th.id, colors: [...th.colors], speed: 1, intensity: 1, loopMs: BACKDROP_LOOP_MS, seed: 11 };
}

/* THE loop phase — u ∈ [0,1). At t = loopMs/speed the modulo wraps to
   exactly 0, so frame(t=0) === frame(t=loop) to machine precision. */
export function backdropPhase(P, time) {
  const loop = clampLoopMs(P && P.loopMs);
  const s = clampSpeed(P && P.speed);
  const u = ((fin(time, 0) * s) / loop) % 1;
  return u < 0 ? u + 1 : u;
}

/* color on a 4-entry ring of the theme's field colors — continuous across
   the wrap (ring(p→1) → ring(0)), used by sunset band stops */
function ringColor(C, p) {
  const x = (((p % 1) + 1) % 1) * 4;
  const i = Math.floor(x);
  return lerpColor(C[1 + (i % 4)], C[1 + ((i + 1) % 4)], x - i);
}

/* ============================================================
   backdropModel(P, time, stageW, stageH) → { variant, w, h, grads, shapes }
   Pure data description of one frame — the renderer (StageObject.jsx)
   maps it 1:1 to SVG. grads are objectBoundingBox radial/linear
   (stops: [offset, color, opacity]); shapes:
     rect    { k, x, y, w, h, fill|grad, op }
     ellipse { k, cx, cy, rx, ry, fill|grad, op }
     circle  { k, cx, cy, r, fill|grad, op }
     poly    { k, pts:[[x,y]…], close, fill, op, stroke, sw }
     line    { k, x1, y1, x2, y2, stroke, sw, op }
   ============================================================ */
export function backdropModel(P, time, stageW, stageH) {
  const w0 = fin(stageW, 1280), h0 = fin(stageH, 720);
  const w = w0 > 0 ? w0 : 1280;
  const h = h0 > 0 ? h0 : 720;
  const C = backdropColors(P);
  const int = clampIntensity(P && P.intensity);
  const u = backdropPhase(P, time);
  const variant = variantOf(P && P.variant);
  const seed = fin(P && P.seed, 11) | 0;
  const op = (v) => Math.max(0, Math.min(1, v * int)); /* intensity → opacity scale */

  const grads = [];
  const shapes = [];
  let gid = 0;
  const rgrad = (stops) => { const id = "g" + gid++; grads.push({ id, type: "radial", stops }); return id; };
  const lgrad = (x1, y1, x2, y2, stops) => { const id = "g" + gid++; grads.push({ id, type: "linear", x1, y1, x2, y2, stops }); return id; };
  const base = (v) => shapes.push(v && v[0] === "g" ? { k: "rect", x: 0, y: 0, w, h, grad: v, op: 1 } : { k: "rect", x: 0, y: 0, w, h, fill: v, op: 1 }); /* grad ids are "g<n>", colors are "#hex" */
  const soft = (color, a) => rgrad([[0, color, op(a)], [0.55, color, op(a * 0.45)], [1, color, 0]]); /* soft radial falloff — the blur-free "blob" */

  if (variant === "aurora") {
    /* 3 large soft radial blobs on slow Lissajous paths — integer x/y
       harmonics (1,2) (2,1) (1,1) keep every path loop-seamless */
    base(C[0]);
    const cfg = [
      { kx: 1, ky: 2, px: 0.0, py: 1.1, r: 0.46 },
      { kx: 2, ky: 1, px: 2.1, py: 3.9, r: 0.40 },
      { kx: 1, ky: 1, px: 4.2, py: 5.6, r: 0.52 },
    ];
    cfg.forEach((b, i) => {
      const cx = w * (0.5 + 0.30 * Math.sin(TAU * b.kx * u + b.px));
      const cy = h * (0.5 + 0.28 * Math.sin(TAU * b.ky * u + b.py));
      const rx = w * b.r * (0.9 + 0.1 * Math.sin(TAU * u + i * 2.1));
      const ry = h * b.r * (0.9 + 0.1 * Math.sin(TAU * 2 * u + i * 1.3));
      shapes.push({ k: "ellipse", cx, cy, rx, ry, grad: soft(C[1 + i], 0.6), op: 1 });
    });
  } else if (variant === "mesh") {
    /* 4 corner color fields whose centers migrate slowly */
    base(C[0]);
    const corners = [[0.16, 0.18], [0.84, 0.16], [0.18, 0.84], [0.82, 0.82]];
    corners.forEach(([fx, fy], i) => {
      const ph = i * 1.7 + 0.4;
      const cx = w * (fx + 0.10 * Math.sin(TAU * u + ph));
      const cy = h * (fy + 0.09 * Math.sin(TAU * u + ph * 1.7));
      const breathe = 0.95 + 0.05 * Math.sin(TAU * u + i);
      shapes.push({ k: "ellipse", cx, cy, rx: w * 0.52 * breathe, ry: h * 0.55 * breathe, grad: soft(C[1 + i], 0.5), op: 1 });
    });
  } else if (variant === "waves") {
    /* 3 stacked translucent sine silhouettes (summed sines), phase-scrolled */
    base(lgrad(0, 0, 0, 1, [[0, C[0], 1], [1, lerpColor(C[0], "#000000", 0.45), 1]]));
    const N = 48;
    for (let i = 0; i < 3; i++) {
      const yBase = h * (0.55 + 0.15 * i);
      const A1 = h * (0.05 + 0.018 * i), A2 = h * 0.022;
      const f1 = 1 + i, f2 = 2 + i * 0.5; /* x-frequency across the width */
      const k1 = 1 + i, k2 = 2 + i; /* integer time harmonics → seamless */
      const pts = [];
      for (let s = 0; s <= N; s++) {
        const x = (w * s) / N;
        pts.push([x, yBase + A1 * Math.sin(TAU * (f1 * s / N + k1 * u)) + A2 * Math.sin(TAU * (f2 * s / N + k2 * u) + 1.7)]);
      }
      shapes.push({ k: "poly", pts: [...pts, [w, h], [0, h]], close: true, fill: C[1 + i], op: op(0.34 - 0.06 * i) }); /* silhouette filled to the stage bottom */
      shapes.push({ k: "poly", pts, close: false, fill: "none", stroke: C[1 + i], sw: 1.6, op: op(0.55 - 0.1 * i) }); /* bright crest line */
    }
  } else if (variant === "bokeh") {
    /* ~14 seeded soft circles drifting upward (integer wrap trips per loop)
       with a gentle opacity pulse */
    base(lgrad(0, 0, 0, 1, [[0, C[0], 1], [1, lerpColor(C[0], "#000000", 0.35), 1]]));
    const softGs = C.slice(1).map((c) => rgrad([[0, c, 0.85], [0.65, c, 0.4], [1, c, 0]]));
    const rng = mulberry32(seed * 1013 + 77);
    const dim = Math.min(w, h);
    for (let j = 0; j < 14; j++) {
      const bx = rng() * w;
      const r = (0.035 + rng() * 0.075) * dim;
      const cy0 = rng();
      const k = 1 + Math.floor(rng() * 2); /* full bottom→top trips per loop */
      const ci = Math.floor(rng() * 4);
      const m = 1 + Math.floor(rng() * 2); /* pulse harmonic */
      const ph = rng() * TAU;
      const span = h + 2 * r;
      const yy = (cy0 + u * k) % 1; /* seamless for integer k */
      const cy = h + r - yy * span; /* rises from below the stage to above it */
      const tw = 0.5 + 0.5 * Math.sin(TAU * m * u + ph);
      shapes.push({ k: "circle", cx: bx, cy, r, grad: softGs[ci], op: op(0.10 + 0.26 * tw) });
    }
  } else if (variant === "starfield") {
    /* seeded stars, per-star twinkle (integer harmonics), 3-layer parallax
       drift (0/1/2 stage widths per loop — all seamless) */
    base(C[0]);
    shapes.push({ k: "ellipse", cx: w * 0.72, cy: h * 0.28, rx: w * 0.5, ry: h * 0.55, grad: soft(C[1], 0.10 + 0.03 * Math.sin(TAU * u)), op: 1 });
    const rng = mulberry32(seed * 733 + 19);
    const dim = Math.min(w, h);
    for (let j = 0; j < 90; j++) {
      const x = rng() * w, y = rng() * h;
      const layer = j % 3;
      const r = Math.max(0.3, (0.7 + rng() * 1.6) * (dim / 720));
      const bright = 0.35 + rng() * 0.5;
      const m = 1 + Math.floor(rng() * 3);
      const ph = rng() * TAU;
      const col = rng() < 0.72 ? "#F9FBFF" : C[3 + (j % 2)];
      const cx = (((x + u * layer * w) % w) + w) % w;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * m * u + ph));
      shapes.push({ k: "circle", cx, cy: y, r, fill: col, op: op(bright * tw) });
    }
  } else if (variant === "gridpulse") {
    /* faint perspective floor grid (bottom-vanishing) + a light sweep that
       fades in/out at the loop ends (opacity 0 at u=0 and u→1 ⇒ seamless) */
    base(lgrad(0, 0, 0, 1, [[0, lerpColor(C[0], "#000000", 0.25), 1], [0.62, C[0], 1], [1, lerpColor(C[0], C[1], 0.38), 1]]));
    const vpx = w / 2, vpy = h * 0.62, yb = h * 1.03;
    const gop = op(0.24 * (0.75 + 0.25 * Math.sin(TAU * u)));
    for (let i = -6; i <= 6; i++) shapes.push({ k: "line", x1: vpx, y1: vpy, x2: vpx + i * w * 0.24, y2: yb, stroke: C[1], sw: 1, op: gop });
    for (let k = 1; k <= 8; k++) {
      const y = vpy + (yb - vpy) * Math.pow(k / 8, 2.2);
      shapes.push({ k: "line", x1: 0, y1: y, x2: w, y2: y, stroke: C[1], sw: 1, op: gop });
    }
    const ys = vpy + (yb - vpy) * u;
    const sop = op(0.55 * Math.sin(Math.PI * u));
    shapes.push({ k: "line", x1: 0, y1: ys, x2: w, y2: ys, stroke: C[4], sw: 7, op: sop * 0.35 });
    shapes.push({ k: "line", x1: 0, y1: ys, x2: w, y2: ys, stroke: C[4], sw: 2, op: sop });
  } else if (variant === "nebula") {
    /* 2 counter-rotating conic-ish rings (wedge fans — SVG has no native
       conic gradient; 24 hue-interpolated wedges per ring read as one) +
       a pulsing aurora core. Rotation is precomputed into the points so the
       model stays plain numbers; 360°·u wraps to 0° exactly at the loop. */
    base(rgrad([[0, lerpColor(C[0], C[1], 0.30), 1], [1, C[0], 1]]));
    const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) * 0.58, N = 12; /* broad hue-lerped sectors read as a rotating conic field */
    const rings = [[C[1], C[2], C[3]], [C[2], C[3], C[4]]];
    rings.forEach((ring, L) => {
      const deg = ((360 * u * (L ? -1 : 1)) % 360) * (Math.PI / 180);
      const cs = Math.cos(deg), sn = Math.sin(deg);
      for (let j = 0; j < N; j++) {
        const p = j / N;
        const col = (() => { const x = p * 3, i = Math.floor(x); return lerpColor(ring[i % 3], ring[(i + 1) % 3], x - i); })();
        const pts = [[0, 0]];
        for (let a = 0; a <= 2; a++) {
          const ang = TAU * (j + L * 0.5 + a / 2) / N + (a === 2 ? 0.002 : 0); /* hairline overlap hides AA gaps; ring 2 phase-offset interleaves sectors */
          pts.push([R * Math.cos(ang), R * Math.sin(ang)]);
        }
        shapes.push({ k: "poly", pts: pts.map(([px, py]) => [cx + px * cs - py * sn, cy + px * sn + py * cs]), close: true, fill: col, op: op(0.13) });
      }
    });
    shapes.push({ k: "ellipse", cx, cy, rx: w * 0.16 * (1 + 0.18 * Math.sin(TAU * 2 * u)), ry: h * 0.18 * (1 + 0.18 * Math.sin(TAU * 2 * u + 0.9)), grad: soft(C[3], 0.5), op: 1 });
  } else if (variant === "sunset") {
    /* 3 horizontal bands whose stops slowly cycle the theme's color ring
       (ring is wrap-continuous ⇒ seamless), plus a drifting low sun */
    for (let i = 0; i < 3; i++) {
      const stops = [0, 1, 2].map((j) => [j / 2, ringColor(C, i * 0.25 + j * 0.33 + u), 1]);
      shapes.push({ k: "rect", x: 0, y: (h * i) / 3, w, h: h / 3 + 1, grad: lgrad(0, 0, 0, 1, stops), op: 1 });
    }
    shapes.push({ k: "circle", cx: w * (0.5 + 0.05 * Math.sin(TAU * u)), cy: h * (0.68 + 0.04 * Math.sin(TAU * 2 * u + 1.2)), r: 0.14 * Math.min(w, h), grad: rgrad([[0, C[4], op(0.75)], [0.5, C[4], op(0.3)], [1, C[4], 0]]), op: 1 });
    shapes.push({ k: "line", x1: 0, y1: h * 0.68, x2: w, y2: h * 0.68, stroke: C[3], sw: 1.5, op: op(0.35 + 0.15 * Math.sin(TAU * u)) });
  }

  return { variant, w, h, grads, shapes };
}
