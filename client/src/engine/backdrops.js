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
   integer-trip lattice traversals (loopNoise), so motion is continuous
   across the wrap and exported videos loop cleanly. props.speed is a
   multiplier on the loop rate (0.25–2), props.intensity scales
   opacity/energy (0.4–1.5), props.colors is the 5-slot theme palette
   [base, field1, field2, glow, accent].

   SLOW BY DESIGN — the dominant motion in every variant is the k = 1
   harmonic (one full cycle per loop; 8 s at the default loopMs), higher
   harmonics only add gentle texture. Large soft forms, no harsh edges,
   no grain overlays — depth comes from big gradient-falloff shapes.

   PERF — blur() at full-canvas is expensive, so the model uses ONLY
   gradient falloff (radial/linear, alpha stops) for softness: zero CSS
   filter blur is emitted by the backdrop renderer (asserted in
   check-backdrops.mjs). Wide multi-stop falloffs (`feather`) stand in for
   the classic 60–120 px blur blobs.

   FLAGSHIP — `procedural` reproduces the Jitter.video "Procedural
   Gradient Background" recipe: N full-height columns side by side, each
   filled by one shared 3-stop vertical gradient (theme light → vivid →
   deep). Every column's gradient is TALLER than the stage and scrolls
   vertically, driven by per-column seeded 1D looping value-noise; columns
   alternate scroll direction and run at hashed integer speeds. Column
   count is configurable (3–8, default 5) via props.columns; the 3 stop
   colors are palette slots PROCEDURAL_STOPS ([glow, field1, base]) so
   they recolor with the theme and are individually editable.
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
export const BACKDROP_COLUMNS_MIN = 3;
export const BACKDROP_COLUMNS_MAX = 8;
export const BACKDROP_COLUMNS_DEFAULT = 5;
/* palette slots the procedural column gradient reads, top → bottom
   (light glow → vivid field → deep base: the #fff → #28a9ff → #000 recipe) */
export const PROCEDURAL_STOPS = [3, 1, 0];

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
  { id: "procedural", name: "Procedural Columns", blurb: "Jitter-style gradient columns scrolling on per-column smooth noise, alternating direction" },
  { id: "mesh", name: "Mesh Drift", blurb: "Six huge color fields wandering slow seeded noise paths" },
  { id: "aurora", name: "Aurora Bands", blurb: "Broad vertical light curtains with a slow horizontal sway and soft edges" },
  { id: "glowfield", name: "Glow Field", blurb: "Layered deep glows drifting like light through fog" },
  { id: "beams", name: "Beam Sweep", blurb: "Soft diagonal light beams on a slow rotation sway" },
  { id: "silk", name: "Silk Waves", blurb: "Wide translucent gradient waves undulating slowly" },
  { id: "nebula", name: "Nebula", blurb: "Counter-rotating color rings around a breathing aurora core" },
  { id: "bokeh", name: "Bokeh", blurb: "Soft out-of-focus circles drifting upward with a gentle pulse" },
  { id: "horizon", name: "Horizon", blurb: "Soft sun over a gradient sky cycling slowly through the palette" },
  { id: "ribbons", name: "Ribbons", blurb: "Broad curved bands sweeping gently across the frame" },
  { id: "pulse", name: "Pulse", blurb: "One subtle breathing glow — a single slow breath per loop" },
];
export const BACKDROP_VARIANT_IDS = BACKDROP_VARIANTS.map((v) => v.id);

/* ---------- clamps / normalizers (pure; junk → inert defaults) ---------- */
const fin = (v, d) => (Number.isFinite(+v) ? +v : d);
export const clampSpeed = (v) => Math.max(BACKDROP_SPEED_MIN, Math.min(BACKDROP_SPEED_MAX, fin(v, 1)));
export const clampIntensity = (v) => Math.max(BACKDROP_INTENSITY_MIN, Math.min(BACKDROP_INTENSITY_MAX, fin(v, 1)));
export const clampLoopMs = (v) => Math.max(BACKDROP_LOOP_MIN, Math.min(BACKDROP_LOOP_MAX, Math.round(fin(v, BACKDROP_LOOP_MS))));
export const clampColumns = (v) => Math.max(BACKDROP_COLUMNS_MIN, Math.min(BACKDROP_COLUMNS_MAX, Math.round(fin(v, BACKDROP_COLUMNS_DEFAULT))));
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
  return { variant: variantOf(variant), theme: th.id, colors: [...th.colors], speed: 1, intensity: 1, loopMs: BACKDROP_LOOP_MS, seed: 11, columns: BACKDROP_COLUMNS_DEFAULT };
}

/* THE loop phase — u ∈ [0,1). At t = loopMs/speed the modulo wraps to
   exactly 0, so frame(t=0) === frame(t=loop) to machine precision. */
export function backdropPhase(P, time) {
  const loop = clampLoopMs(P && P.loopMs);
  const s = clampSpeed(P && P.speed);
  const u = ((fin(time, 0) * s) / loop) % 1;
  return u < 0 ? u + 1 : u;
}

/* looping 1D value noise — `latt` lattice values on a ring (built from
   mulberry32), smoothstep-interpolated; `trips` full ring traversals per
   loop (integer ⇒ value(u→1) === value(u=0) exactly, seamless) and
   `phase` shifts the start offset. Returns [0,1]. This is the per-column
   "smooth noise" of the Jitter recipe and the path driver for mesh/glow
   fields — smooth, seeded, drift (never bounce). */
export function loopNoise(latt, u, trips = 1, phase = 0) {
  const N = latt.length;
  if (!N) return 0.5;
  const x = ((((fin(u, 0) * Math.max(1, Math.round(trips))) + fin(phase, 0)) % 1) + 1) % 1;
  const p = x * N;
  const i = Math.floor(p) % N;
  const f = p - Math.floor(p);
  const s = f * f * (3 - 2 * f); /* smoothstep — C1-continuous across lattice points */
  const a = latt[i], b = latt[(i + 1) % N];
  return a + (b - a) * s;
}

/* per-column configuration for the `procedural` flagship — pure f(props).
   Column i gets: an 8-value noise lattice, a hashed integer speed
   (1–2 lattice trips per loop), a hashed phase, and an ALTERNATING
   scroll direction (+1 even, −1 odd). Exported so the panel hint and the
   node check can assert the recipe (count, alternation, hashed speeds). */
export function proceduralColumnCfg(P) {
  const cols = clampColumns(P && P.columns);
  const seed = fin(P && P.seed, 11) | 0;
  const cfgs = [];
  for (let i = 0; i < cols; i++) {
    const rng = mulberry32(seed * 4099 + i * 131 + 7);
    const latt = [];
    for (let j = 0; j < 8; j++) latt.push(rng());
    cfgs.push({ i, dir: i % 2 === 0 ? 1 : -1, trips: 1 + Math.floor(rng() * 2), phase: rng(), latt });
  }
  return cfgs;
}

/* color on a 4-entry ring of the theme's field colors — continuous across
   the wrap (ring(p→1) → ring(0)), used by horizon sky stops */
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
     poly    { k, pts:[[x,y]…], close, fill|grad, op, stroke, sw }
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
  const feather = (color, a) => rgrad([[0, color, op(a)], [0.35, color, op(a * 0.55)], [0.7, color, op(a * 0.16)], [1, color, 0]]); /* extra-wide falloff — reads as a 60–120px blur */
  const hsoft = (color, a) => lgrad(0, 0, 1, 0, [[0, color, 0], [0.5, color, op(a)], [1, color, 0]]); /* soft horizontal band falloff */
  const vsoft = (color, a) => lgrad(0, 0, 0, 1, [[0, color, 0], [0.5, color, op(a)], [1, color, 0]]); /* soft vertical band falloff */

  if (variant === "procedural") {
    /* JITTER RECIPE — N full-height columns share ONE 3-stop vertical
       gradient (light → vivid → deep); each column rect is 3× the stage
       height and scrolls vertically on per-column looping value-noise,
       alternating direction, hashed integer speeds. The visible window
       always straddles the mid stop, so every column shows a rich
       drifting slice of the same gradient. */
    const cfgs = proceduralColumnCfg(P);
    const cols = cfgs.length;
    base(C[0]); /* deep base — guarantees no seam can ever show through */
    const colGrad = lgrad(0, 0, 0, 1, [[0, C[PROCEDURAL_STOPS[0]], 1], [0.5, C[PROCEDURAL_STOPS[1]], 1], [1, C[PROCEDURAL_STOPS[2]], 1]]);
    const cw = w / cols;
    cfgs.forEach((cfg, i) => {
      const n = loopNoise(cfg.latt, u, cfg.trips, cfg.phase); /* [0,1], seamless (integer trips) */
      const dy = (n - 0.5) * cfg.dir * h * 0.9; /* ±0.45h — the tall gradient slides through the window */
      shapes.push({ k: "rect", col: i, x: i * cw - 0.5, y: -h + dy - 0.5, w: cw + 1, h: 3 * h + 1, grad: colGrad, op: 1 });
    });
    /* depth: a whisper of top glow breathing once per loop + a grounded
       bottom vignette — big soft forms, no texture overlays */
    shapes.push({ k: "ellipse", cx: w * 0.5, cy: -h * 0.3, rx: w * 0.72, ry: h * 0.62, grad: feather(C[3], 0.10 + 0.04 * Math.sin(TAU * u)), op: 1 });
    shapes.push({ k: "rect", x: 0, y: 0, w, h, grad: lgrad(0, 0, 0, 1, [[0, "#000000", 0], [0.72, "#000000", 0], [1, "#000000", op(0.24)]]), op: 1 });
  } else if (variant === "mesh") {
    /* MESH DRIFT — 6 huge color fields on independent seeded noise paths
       (2 lattices per blob: x and y; integer trips ⇒ seamless). Far bigger
       and slower than a classic mesh: centers roam 12–88% of the stage,
       radii breathe on the k=1 harmonic. */
    base(C[0]);
    const rng = mulberry32(seed * 919 + 31);
    for (let i = 0; i < 6; i++) {
      const lx = [], ly = [];
      for (let j = 0; j < 6; j++) { lx.push(rng()); ly.push(rng()); }
      const trips = 1 + Math.floor(rng() * 2);
      const ph = rng();
      const a = 0.30 + rng() * 0.16;
      const cx = w * (0.12 + 0.76 * loopNoise(lx, u, trips, ph));
      const cy = h * (0.12 + 0.76 * loopNoise(ly, u, trips, (ph + 0.37) % 1));
      const breathe = 1 + 0.10 * Math.sin(TAU * u + i * 1.7);
      shapes.push({ k: "ellipse", cx, cy, rx: w * 0.44 * breathe, ry: h * 0.48 * breathe, grad: soft(C[1 + (i % 4)], a), op: 1 });
    }
  } else if (variant === "aurora") {
    /* AURORA BANDS — 4 broad vertical light curtains. Each curtain is a
       sheared parallelogram filled with a soft horizontal falloff; the
       center sways (k=1 dominant + a whisper of k=2), width and lean
       breathe slowly. Sky gradient + a low ground glow for depth. */
    base(lgrad(0, 0, 0, 1, [[0, lerpColor(C[0], "#000000", 0.3), 1], [0.55, C[0], 1], [1, lerpColor(C[0], C[1], 0.22), 1]]));
    for (let i = 0; i < 4; i++) {
      const fx = 0.16 + 0.23 * i;
      const sway = 0.09 * Math.sin(TAU * u + i * 1.9) + 0.03 * Math.sin(TAU * 2 * u + i * 0.7);
      const cx = w * (fx + sway);
      const bw = w * (0.17 + 0.035 * Math.sin(TAU * u + i * 2.6));
      const lean = w * 0.09 * Math.sin(TAU * u + i * 1.3 + 0.8);
      const a = 0.36 - 0.045 * i + 0.06 * Math.sin(TAU * u + i * 2.1);
      shapes.push({
        k: "poly", close: true, grad: hsoft(C[1 + i], a), op: 1,
        pts: [[cx - bw / 2 + lean, -h * 0.06], [cx + bw / 2 + lean, -h * 0.06], [cx + bw / 2 - lean, h * 1.06], [cx - bw / 2 - lean, h * 1.06]],
      });
    }
    shapes.push({ k: "ellipse", cx: w * 0.5, cy: h * 1.04, rx: w * 0.72, ry: h * 0.34, grad: feather(C[2], 0.15 + 0.04 * Math.sin(TAU * u)), op: 1 });
  } else if (variant === "glowfield") {
    /* GLOW FIELD — layered deep glows, the "light through fog" look.
       Far layer: 3 enormous, very dim feathered glows on slow noise
       paths. Near layer: 2 smaller, slightly brighter glows drifting the
       other way. A static vignette grounds the field. */
    base(C[0]);
    const rng = mulberry32(seed * 701 + 13);
    for (let L = 0; L < 2; L++) {
      const nB = L === 0 ? 3 : 2;
      for (let j = 0; j < nB; j++) {
        const lx = [], ly = [];
        for (let q = 0; q < 6; q++) { lx.push(rng()); ly.push(rng()); }
        const ph = rng();
        const a = (L === 0 ? 0.17 : 0.26) + rng() * 0.06;
        const col = C[1 + Math.floor(rng() * 3)]; /* field1 / field2 / glow */
        const drift = loopNoise(lx, u, 1, ph), rise = loopNoise(ly, u, 1, (ph + 0.53) % 1);
        const dir = L === 0 ? 1 : -1;
        const cx = w * (0.5 + dir * (drift - 0.5) * 0.66);
        const cy = h * (0.5 - dir * (rise - 0.5) * 0.6);
        const R = (L === 0 ? 0.62 : 0.40) * (1 + 0.07 * Math.sin(TAU * u + j * 2.4 + L));
        shapes.push({ k: "ellipse", cx, cy, rx: w * R, ry: h * R, grad: feather(col, a), op: 1 });
      }
    }
    shapes.push({ k: "rect", x: 0, y: 0, w, h, grad: rgrad([[0, "#000000", 0], [0.68, "#000000", 0], [1, "#000000", op(0.30)]]), op: 1 });
  } else if (variant === "beams") {
    /* BEAM SWEEP — 2 soft diagonal light beams, each a long strip whose
       angle sways slowly around its diagonal (k=1 rotation sway, returns
       exactly). Softness comes from a gradient PERPENDICULAR to the beam:
       the strip's long-edge midpoints are expressed in bbox space so the
       falloff runs edge → center → edge regardless of the sway angle. */
    base(lgrad(0, 0, 0, 1, [[0, lerpColor(C[0], "#000000", 0.2), 1], [1, lerpColor(C[0], C[2], 0.22), 1]]));
    const L = Math.hypot(w, h);
    const beams = [
      { mx: 0.30, my: 0.42, ang0: 0.62, amp: 0.13, ph: 0, col: C[3], a: 0.34, tf: 0.135 },
      { mx: 0.68, my: 0.60, ang0: 0.62, amp: 0.11, ph: 2.4, col: C[1], a: 0.26, tf: 0.105 },
    ];
    beams.forEach((b) => {
      const ang = b.ang0 + b.amp * Math.sin(TAU * u + b.ph);
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const nx = -dy, ny = dx;
      const mx = w * b.mx, my = h * b.my;
      const t = Math.min(w, h) * b.tf * (1 + 0.14 * Math.sin(TAU * u + b.ph + 1.2));
      const pts = [
        [mx - dx * L - nx * t, my - dy * L - ny * t],
        [mx + dx * L - nx * t, my + dy * L - ny * t],
        [mx + dx * L + nx * t, my + dy * L + ny * t],
        [mx - dx * L + nx * t, my - dy * L + ny * t],
      ];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const bw = Math.max(1e-6, maxX - minX), bh = Math.max(1e-6, maxY - minY);
      const e1 = [mx - nx * t, my - ny * t], e2 = [mx + nx * t, my + ny * t]; /* long-edge midpoints */
      const g = lgrad((e1[0] - minX) / bw, (e1[1] - minY) / bh, (e2[0] - minX) / bw, (e2[1] - minY) / bh,
        [[0, b.col, 0], [0.5, b.col, op(b.a * (0.85 + 0.15 * Math.sin(TAU * u + b.ph)))], [1, b.col, 0]]);
      shapes.push({ k: "poly", pts, close: true, grad: g, op: 1 });
    });
    shapes.push({ k: "ellipse", cx: w * 0.5, cy: h * 0.5, rx: w * 0.55, ry: h * 0.55, grad: feather(C[1], 0.06 + 0.02 * Math.sin(TAU * 2 * u)), op: 1 });
  } else if (variant === "silk") {
    /* SILK WAVES — 3 wide translucent gradient waves. Each band is a
       thick smooth curve region (summed integer-harmonic sines), filled
       with a soft vertical falloff — no crest lines, no hard edges;
       the layers glide at integer speeds for a seamless slow undulation. */
    base(lgrad(0, 0, 0, 1, [[0, lerpColor(C[0], "#000000", 0.25), 1], [1, lerpColor(C[0], C[1], 0.16), 1]]));
    const N = 40;
    for (let i = 0; i < 3; i++) {
      const yBase = h * (0.40 + 0.19 * i);
      const A = h * (0.055 + 0.02 * i);
      const thick = h * (0.17 + 0.05 * i) * (1 + 0.08 * Math.sin(TAU * u + i * 2.4));
      const f1 = 1 + i, k1 = 1 + i; /* spatial frequency + integer time harmonic */
      const ph = i * 1.37;
      const top = [], bot = [];
      for (let s = 0; s <= N; s++) {
        const x = (w * s) / N;
        const yc = yBase + A * Math.sin(TAU * (f1 * s / N + k1 * u) + ph) + A * 0.4 * Math.sin(TAU * (2 * s / N + 2 * u) + ph * 2);
        top.push([x, yc - thick / 2]);
        bot.push([x, yc + thick / 2]);
      }
      shapes.push({ k: "poly", pts: [...top, ...bot.reverse()], close: true, grad: vsoft(C[1 + i], 0.30 - 0.05 * i), op: 1 });
    }
    shapes.push({ k: "ellipse", cx: w * 0.5, cy: h * 0.24, rx: w * 0.6, ry: h * 0.4, grad: feather(C[3], 0.07 + 0.03 * Math.sin(TAU * u)), op: 1 });
  } else if (variant === "nebula") {
    /* 2 counter-rotating conic-ish rings (wedge fans — SVG has no native
       conic gradient; 12 hue-interpolated wedges per ring read as one) +
       a pulsing aurora core. Rotation is precomputed into the points so the
       model stays plain numbers; 360°·u wraps to 0° exactly at the loop. */
    base(rgrad([[0, lerpColor(C[0], C[1], 0.30), 1], [1, C[0], 1]]));
    const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) * 0.58, N = 12; /* broad hue-lerped sectors read as a rotating conic field */
    const rings = [[C[1], C[2], C[3]], [C[2], C[3], C[4]]];
    rings.forEach((ring, Li) => {
      const deg = ((360 * u * (Li ? -1 : 1)) % 360) * (Math.PI / 180);
      const cs = Math.cos(deg), sn = Math.sin(deg);
      for (let j = 0; j < N; j++) {
        const p = j / N;
        const col = (() => { const x = p * 3, i = Math.floor(x); return lerpColor(ring[i % 3], ring[(i + 1) % 3], x - i); })();
        const pts = [[0, 0]];
        for (let a = 0; a <= 2; a++) {
          const ang = TAU * (j + Li * 0.5 + a / 2) / N + (a === 2 ? 0.002 : 0); /* hairline overlap hides AA gaps; ring 2 phase-offset interleaves sectors */
          pts.push([R * Math.cos(ang), R * Math.sin(ang)]);
        }
        shapes.push({ k: "poly", pts: pts.map(([px, py]) => [cx + px * cs - py * sn, cy + px * sn + py * cs]), close: true, fill: col, op: op(0.13) });
      }
    });
    shapes.push({ k: "ellipse", cx, cy, rx: w * 0.16 * (1 + 0.18 * Math.sin(TAU * 2 * u)), ry: h * 0.18 * (1 + 0.18 * Math.sin(TAU * 2 * u + 0.9)), grad: soft(C[3], 0.5), op: 1 });
  } else if (variant === "bokeh") {
    /* ~14 seeded soft circles drifting upward (integer wrap trips per loop)
       with a gentle opacity pulse — out-of-focus highlights, no edges */
    base(lgrad(0, 0, 0, 1, [[0, C[0], 1], [1, lerpColor(C[0], "#000000", 0.35), 1]]));
    const softGs = C.slice(1).map((c) => rgrad([[0, c, 0.95], [0.55, c, 0.5], [1, c, 0]]));
    const rng = mulberry32(seed * 1013 + 77);
    const dim = Math.min(w, h);
    for (let j = 0; j < 14; j++) {
      const bx = rng() * w;
      const r = (0.05 + rng() * 0.09) * dim;
      const cy0 = rng();
      const k = 1 + Math.floor(rng() * 2); /* full bottom→top trips per loop */
      const ci = Math.floor(rng() * 4);
      const m = 1 + Math.floor(rng() * 2); /* pulse harmonic */
      const ph = rng() * TAU;
      const span = h + 2 * r;
      const yy = (cy0 + u * k) % 1; /* seamless for integer k */
      const cy = h + r - yy * span; /* rises from below the stage to above it */
      const tw = 0.5 + 0.5 * Math.sin(TAU * m * u + ph);
      shapes.push({ k: "circle", cx: bx, cy, r, grad: softGs[ci], op: op(0.14 + 0.30 * tw) });
    }
  } else if (variant === "horizon") {
    /* HORIZON — a soft sun over a gradient sky whose 3 stops slowly cycle
       the theme's color ring (ring is wrap-continuous ⇒ seamless). The
       sun drifts and breathes on k=1/k=2; a glow band hugs the horizon
       line and a ground haze darkens the lower third. */
    const stops = [0, 1, 2].map((j) => [j / 2, ringColor(C, j * 0.33 + u), 1]);
    base(lgrad(0, 0, 0, 1, stops));
    const sx = w * (0.5 + 0.06 * Math.sin(TAU * u));
    const sy = h * (0.66 + 0.03 * Math.sin(TAU * u + 1.1));
    const sr = 0.20 * Math.min(w, h) * (1 + 0.05 * Math.sin(TAU * 2 * u));
    shapes.push({ k: "circle", cx: sx, cy: sy, r: sr, grad: feather(C[4], 0.55), op: 1 });
    shapes.push({ k: "rect", x: 0, y: h * 0.60, w, h: h * 0.14, grad: vsoft(C[3], 0.16 + 0.05 * Math.sin(TAU * u)), op: 1 });
    shapes.push({ k: "rect", x: 0, y: h * 0.72, w, h: h * 0.28, grad: lgrad(0, 0, 0, 1, [[0, "#000000", 0], [1, "#000000", op(0.30)]]), op: 1 });
  } else if (variant === "ribbons") {
    /* RIBBONS — 3 broad curved bands sweeping across the frame. Each
       ribbon enters at the left edge and exits at the right with a sine
       bow between; edge heights and bow depth drift on k=1 (one slow
       sweep per loop), thickness breathes gently. Soft vertical falloff
       across each band — no hard edges. */
    base(C[0]);
    const N = 36;
    for (let i = 0; i < 3; i++) {
      const yl = h * (0.24 + 0.18 * i) + h * 0.08 * Math.sin(TAU * u + i * 2.2);
      const yr = h * (0.62 - 0.13 * i) + h * 0.08 * Math.sin(TAU * u + i * 2.2 + 1.4);
      const bow = h * (0.10 + 0.05 * Math.sin(TAU * u + i * 1.1));
      const thick = h * (0.11 + 0.035 * i) * (1 + 0.12 * Math.sin(TAU * u + i * 2.1));
      const top = [], bot = [];
      for (let s = 0; s <= N; s++) {
        const x = (w * s) / N;
        const yc = yl + (yr - yl) * (s / N) + bow * Math.sin(Math.PI * s / N);
        top.push([x, yc - thick / 2]);
        bot.push([x, yc + thick / 2]);
      }
      shapes.push({ k: "poly", pts: [...top, ...bot.reverse()], close: true, grad: vsoft(C[1 + i], 0.34 - 0.04 * i), op: 1 });
    }
    shapes.push({ k: "rect", x: 0, y: 0, w, h, grad: rgrad([[0, "#000000", 0], [0.7, "#000000", 0], [1, "#000000", op(0.26)]]), op: 1 });
  } else if (variant === "pulse") {
    /* PULSE — the minimal one: a single large glow taking one slow breath
       per loop (breathe runs 0→1→0, k=1), an even fainter counter-glow
       behind it, and a soft vignette. Almost still — pure atmosphere. */
    base(C[0]);
    const breathe = 0.5 + 0.5 * Math.sin(TAU * u - Math.PI / 2); /* 0 at both loop ends ⇒ seamless */
    shapes.push({ k: "ellipse", cx: w / 2, cy: h * 0.46, rx: w * (0.44 + 0.05 * breathe), ry: h * (0.48 + 0.06 * breathe), grad: feather(C[1], 0.14 + 0.10 * breathe), op: 1 });
    shapes.push({ k: "ellipse", cx: w / 2, cy: h * 0.46, rx: w * (0.62 - 0.04 * breathe), ry: h * (0.64 - 0.04 * breathe), grad: feather(C[3], 0.08 - 0.04 * breathe), op: 1 });
    shapes.push({ k: "rect", x: 0, y: 0, w, h, grad: rgrad([[0, "#000000", 0], [0.7, "#000000", 0], [1, "#000000", op(0.24)]]), op: 1 });
  }

  return { variant, w, h, grads, shapes };
}
