/* ============================================================
   KITS — icon + UI-element library (Jitter-grade motion grammar).
   Pure data + builders, NO React imports — unit-testable in node.

   Every kit builds ONE clip layer (the editor's insert-as-clip path,
   same shape as templates.js buildClip): children are 0-relative,
   the clip loops seamlessly (props.end = "loop"), and the whole
   composition is built from EXISTING primitives — shape/text/number
   layers + nested clips as groups — so preview, SSR checks and the
   export rasterizer all share the one StageObject render path.

   THE MOTION GRAMMAR (per part): in → hold → out
     · in:    back/overshoot entrance (easeOutBack pop, or an eased
              rise/fade "draw-on" reveal), 50–200 ms staggered.
     · hold:  recipe motion — pulse / spin / bob / blink / sway /
              flicker / fall / bounce — always returning to the rest
              pose before the exit.
     · out:   accelerate (ease-in) whip: scale 1 → 1.09 → 0 with the
              opacity gone by the clip end.
   SEAMLESS-LOOP CONTRACT: every child has inT > 0 and outT < dur, so
   StageObject renders NOTHING at t=0 and t=dur (both ends of the loop
   are the same empty frame) — the clip wraps with zero jump, and the
   exit always lands at the clip end (outT = dur − 60, the natural
   one-beat pause before re-entry).

   Customization: build({ color, accent, size, dur }) — stroke/ink
   color, accent color, geometry scale and loop length. All animation
   is a pure function of timeline time (keyframes only; the one
   "random" recipe — lightning flicker — is seeded via engine/random
   mulberry32) so the export path re-renders identical frames.
   ============================================================ */

import { mulberry32 } from "./random.js";

const STAGE_W = 1280;
const STAGE_H = 720;
const CX = STAGE_W / 2;
const CY = STAGE_H / 2;

/* engine palette (mirrors GraphicDestinationMotion SWATCHES) */
export const KIT_COLORS = ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#C084FC", "#F9F9F9"];
const [AMBER, CORAL, BLUE, MINT, , WHITE] = KIT_COLORS;
const INK = "#0F1116";
const DIM = "#939BAD";
const CARD = "#171B24";
const LINE = "#2E3546";

export const ICON_CATS = ["Arrows", "Media", "Interface", "Communication", "Devices", "Weather", "Commerce"];
export const UI_CATS = ["Controls", "Feedback", "Loaders", "Cards"];

const ICON_DUR = 3200;
const UI_DUR = 3600;
const DUR_MIN = 2400;
const DUR_MAX = 6000;

/* grammar timing constants (ms) — entrance/exit pacing is duration-
   independent; the hold phase stretches with the loop length. */
const IN0 = 140;      /* first part enters */
const STAG = 90;      /* entrance stagger between parts */
const EXIT0 = 560;    /* exit window length */
const OUT_TAIL = 60;  /* empty beat after the last exit (loop point) */

/* ---------- ids: fresh on every build (paste/duplicate re-issues anyway) ---------- */
let _id = 0;
const uid = () => `ob${(_id += 1)}`;

/* makeObject() twin — same base props, same per-type merges (templates.js pattern) */
const BOX_DEFAULTS = { bg: "", pad: 16, borderC: AMBER, borderW: 0, radius: 14, boxFx: "none" };
function layer(type, name, props = {}, tracks = {}, children = null) {
  const base = {
    id: uid(), type, name, tracks, locked: false, hidden: false,
    props: { x: CX, y: CY, scale: 1, rotation: 0, opacity: 1, fill: WHITE, w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0 },
  };
  if (type === "shape") Object.assign(base.props, { shape: "rect", w: 190, h: 190, fillMode: "fill", sC: AMBER, sW: 3, cornerR: 0 });
  if (type === "text") Object.assign(base.props, { text: "Headline", fontSize: 72, fontWeight: 700, w: 0, h: 0, textFx: null, fontFamily: "Inter", ls: 0.5, upper: false, pathMode: "flow", ...BOX_DEFAULTS });
  if (type === "number") Object.assign(base.props, { from: 0, to: 100, start: 200, dur: 1600, style: "count", decimals: 0, prefix: "", suffix: "", fontSize: 96, fill: WHITE, numEase: "easeOutCubic", fontFamily: "JetBrains Mono", ring: "none", ringC: AMBER, ringW: 8, ...BOX_DEFAULTS });
  if (type === "clip") { base.children = children || []; Object.assign(base.props, { start: 0, dur: 3000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500 }); }
  Object.assign(base.props, props);
  return base;
}

/* the kit wrapper: one seamlessly-looping clip at the stage center */
function kitClip(name, children, dur) {
  return layer("clip", name, {
    start: 0, dur, speed: 1, end: "loop",
    tIn: "none", tOut: "none", tDur: 400,
    x: CX, y: CY,
  }, {}, children);
}

/* ---------- keyframe helpers ---------- */
const kf = (t, v, ease) => ({ t: Math.round(t), v, ease });
/* merge track maps, keeping every track sorted by t */
const MT = (...maps) => {
  const out = {};
  for (const m of maps) for (const p in m) out[p] = [...(out[p] || []), ...m[p]];
  for (const p in out) out[p].sort((a, b) => a.t - b.t);
  return out;
};

/* ---------- entrance / exit recipes (Jitter grammar) ----------
   `ro` = the part's rest opacity (dimmed parts stay dimmed through in/out). */
/* pop: scale 0 → 1 with overshoot (≈ cubic-bezier(.34,1.56,.64,1)) + quick fade */
const popInTr = (t0, d = 470, ro = 1) => ({
  scale: [kf(t0, 0, "easeOutBack"), kf(t0 + d, 1, "linear")],
  opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + 220, ro, "linear")],
});
/* rise: settle from `rise` px below with a soft ease — the "draw-on" reveal */
const riseInTr = (t0, y, rise = 18, d = 560, ro = 1) => ({
  y: [kf(t0, y + rise, "easeOutCubic"), kf(t0 + d, y, "linear")],
  opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + d * 0.5, ro, "linear")],
});
const fadeInTr = (t0, d = 320, ro = 1) => ({ opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + d, ro, "linear")] });
/* whip out: anticipation grow, then accelerate to nothing, gone at `t2` */
const exitTr = (t1, t2, ro = 1) => ({
  scale: [kf(t1, 1, "easeOutQuad"), kf(t1 + 120, 1.09, "easeInCubic"), kf(t2, 0, "linear")],
  opacity: [kf(t1 + 40, ro, "easeInQuad"), kf(t2 - 60, 0, "linear")],
});
const exitFadeTr = (t1, t2, ro = 1) => ({ opacity: [kf(t1, ro, "easeInQuad"), kf(t2, 0, "linear")] });

/* ---------- hold recipes (always land back on the rest pose) ---------- */
function holdTr(h, x, y, t0, t1, ro = 1) {
  if (t1 < t0 + 240) return {};
  if (h.type === "pulse") {
    const per = h.period || 640, amp = h.amp || 1.07;
    const tr = [kf(t0, 1, "easeInOutSine")];
    let t = t0, up = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, up ? amp : 1, "easeInOutSine")); up = !up; }
    if (!up || tr[tr.length - 1].v !== 1) tr.push(kf(t1, 1, "easeInOutSine"));
    return { scale: tr };
  }
  if (h.type === "heartbeat") { /* double-thump: lub-dub per cycle */
    const per = h.period || 900;
    const tr = [];
    for (let t = t0; t + per <= t1 + 1; t += per) {
      tr.push(kf(t, 1, "easeOutQuad"), kf(t + 130, 1.13, "easeInOutSine"), kf(t + 260, 1, "easeOutQuad"), kf(t + 400, 1.19, "easeInOutSine"), kf(t + 560, 1, "linear"));
    }
    tr.push(kf(t1, 1, "linear"));
    return { scale: tr };
  }
  if (h.type === "spin") return { rotation: [kf(t0, h.from || 0, "linear"), kf(t1, (h.from || 0) + 360 * (h.turns || 1), "linear")] };
  if (h.type === "bob") {
    const per = h.period || 920, amp = h.amp || 6;
    const tr = [kf(t0, y, "easeInOutSine")];
    let t = t0, dn = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, dn ? y + amp : y, "easeInOutSine")); dn = !dn; }
    if (!dn || tr[tr.length - 1].v !== y) tr.push(kf(t1, y, "easeInOutSine"));
    return { y: tr };
  }
  if (h.type === "sway") {
    const per = h.period || 980, amp = h.amp || 7;
    const tr = [kf(t0, x, "easeInOutSine")];
    let t = t0, rt = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, rt ? x + amp : x, "easeInOutSine")); rt = !rt; }
    if (!rt || tr[tr.length - 1].v !== x) tr.push(kf(t1, x, "easeInOutSine"));
    return { x: tr };
  }
  if (h.type === "blink") {
    const per = h.period || 1060;
    const tr = [];
    for (let t = t0; t + per <= t1 + 1; t += per) tr.push(kf(t, ro, "linear"), kf(t + per / 2, 0, "linear"), kf(t + per / 2 + 60, ro, "linear"));
    tr.push(kf(t1, ro, "linear"));
    return { opacity: tr };
  }
  if (h.type === "flicker") { /* seeded deterministic flicker (lightning shimmer) */
    const rnd = mulberry32(h.seed || 7);
    const tr = [kf(t0, ro, "linear")];
    let t = t0;
    while (t + 140 <= t1 - 60) { t += 90 + Math.floor(rnd() * 4) * 50; tr.push(kf(t, ro * (0.25 + rnd() * 0.35), "linear"), kf(t + 70, ro, "linear")); }
    tr.push(kf(t1, ro, "linear"));
    return { opacity: tr };
  }
  if (h.type === "fall") { /* rain: fall amp px + fade, repeated (phase comes from inT) */
    const per = h.period || 720, amp = h.amp || 15;
    const tr = [], to = [];
    for (let t = t0; t + per <= t1 + 1; t += per) {
      tr.push(kf(t, y, "easeInQuad"), kf(t + per, y + amp, "linear"));
      to.push(kf(t, ro, "linear"), kf(t + per * 0.62, ro * 0.95, "easeInQuad"), kf(t + per, 0, "linear"));
    }
    tr.push(kf(t1, y, "linear"));
    to.push(kf(t1, ro, "linear"));
    return { y: tr, opacity: to };
  }
  if (h.type === "bounce") { /* loader bounce: up with out-quad, down with in-quad */
    const per = h.period || 560, amp = h.amp || 15;
    const tr = [];
    for (let t = t0; t + per <= t1 + 1; t += per) tr.push(kf(t, y, "easeOutQuad"), kf(t + per / 2, y - amp, "easeInQuad"), kf(t + per, y, "linear"));
    tr.push(kf(t1, y, "linear"));
    return { y: tr };
  }
  return {};
}

/* ============================================================
   PART FACTORY — one layer with the full in → hold → out grammar.
   p: base props (x/y/w/h/shape/fill…, already in stage coords).
   o: { stag, inT, outT, enter: "pop"|"rise"|"fade"|"none", rise,
        hold, exit: "whip"|"fade"|false, exitStart, tracks (extra) }
   ============================================================ */
function part(type, name, p, j, D, o = {}) {
  const inT = o.inT != null ? o.inT : IN0 + j * (o.stag != null ? o.stag : STAG);
  const outT = o.outT != null ? o.outT : D - OUT_TAIL;
  const ro = p.opacity != null ? p.opacity : 1; /* rest opacity — dimmed parts stay dimmed */
  const enter = o.enter === undefined ? "pop" : o.enter;
  let tracks = {};
  if (enter === "pop") tracks = MT(tracks, popInTr(inT, 470, ro));
  else if (enter === "rise") tracks = MT(tracks, riseInTr(inT, p.y, o.rise, 560, ro));
  else if (enter === "fade") tracks = MT(tracks, fadeInTr(inT, 320, ro));
  const ex0 = o.exitStart != null ? o.exitStart : D - EXIT0;
  if (o.exit !== false) tracks = MT(tracks, o.exit === "fade" ? exitFadeTr(ex0, outT, ro) : exitTr(ex0, outT, ro));
  if (o.hold) tracks = MT(tracks, holdTr(o.hold, p.x, p.y, inT + 480, ex0, ro));
  if (o.tracks) tracks = MT(tracks, o.tracks);
  return layer(type, name, { ...p, inT, outT }, tracks);
}

/* design-box → stage coords helpers (icons are drawn in a 100×100 box
   centered on the stage; u = size/100 scales them to stage px) */
const bx = (dx, u) => CX + dx * u;
const by = (dy, u) => CY + dy * u;

/* ============================================================
   OPTIONS
   ============================================================ */
const clampDur = (d, dflt) => Math.max(DUR_MIN, Math.min(DUR_MAX, Number.isFinite(+d) ? Math.round(+d) : dflt));
const iconOpts = (opts = {}) => ({
  color: typeof opts.color === "string" && opts.color ? opts.color : WHITE,
  size: Number.isFinite(+opts.size) ? Math.max(80, Math.min(720, +opts.size)) : 320,
  dur: clampDur(opts.dur, ICON_DUR),
});
const uiOpts = (opts = {}) => ({
  accent: typeof opts.accent === "string" && opts.accent ? opts.accent : AMBER,
  color: typeof opts.color === "string" && opts.color ? opts.color : WHITE,
  dur: clampDur(opts.dur, UI_DUR),
});

/* ============================================================
   ICONS — stroke-based line icons composed from shape/text layers.
   Every icon: { id, name, category, tags, recipe, build(opts) } —
   build returns one seamlessly-looping clip (0-relative, in→hold→out).
   ============================================================ */

/* compact prop-spec maker: g(shape, dx, dy, w, h, extra) in the 100-box */
const spec = (u) => (shape, dx, dy, w, h, extra = {}) => ({ shape, x: bx(dx, u), y: by(dy, u), w: w * u, h: h * u, ...extra });

/* group child: entrance-only part living inside a group clip (local time,
   outT null — the group's own fade/hide is the exit) */
function gpart(type, name, p, j, o = {}) {
  const inT = o.inT != null ? o.inT : 40 + j * (o.stag != null ? o.stag : 70);
  const ro = p.opacity != null ? p.opacity : 1;
  let tracks = {};
  const enter = o.enter || "pop";
  if (enter === "pop") tracks = popInTr(inT, 470, ro);
  else if (enter === "rise") tracks = riseInTr(inT, p.y, o.rise, 560, ro);
  else if (enter === "fade") tracks = fadeInTr(inT, 320, ro);
  if (o.tracks) tracks = MT(tracks, o.tracks);
  return layer(type, name, { ...p, inT, outT: null }, tracks);
}

/* nested clip = group: collective spin/fade window (start → D−60, hide) */
function groupClip(name, children, D, o = {}) {
  const start = o.start != null ? o.start : IN0;
  const end = o.end != null ? o.end : D - OUT_TAIL;
  const tracks = {};
  if (o.spin) tracks.rotation = [kf(start + 520, 0, "linear"), kf(end - 340, 360 * o.spin, "linear")];
  return layer("clip", name, {
    start, dur: end - start, speed: 1, end: "hide",
    tIn: o.tIn || "fade", tOut: o.tOut || "fade", tDur: o.tDur || 300,
    x: CX, y: CY,
  }, tracks, children);
}

/* shared per-icon build context */
function iconCtx(opts) {
  const { color, size, dur: D } = iconOpts(opts);
  const u = size / 100;
  const g = spec(u);
  const sw = Math.max(2.5, Math.round(size * 0.02 * 10) / 10); /* stroke px (non-scaling) */
  const stroke = { fillMode: "stroke", sC: color, sW: sw, fill: color };
  const S = (name, p, j, o) => part("shape", name, p, j, D, o);
  return { color, size, D, u, g, sw, stroke, S };
}

/* ---------- ARROWS ---------- */
function buildArrowRight(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Arrow Right", [
    S("Arrow", g("arrow", 0, 0, 64, 46, stroke), 0, { hold: { type: "sway", amp: 8 } }),
  ], D);
}
function buildArrowUpRight(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Arrow Up Right", [
    S("Arrow", g("arrow", 0, 0, 64, 46, { ...stroke, rotation: -45 }), 0, { hold: { type: "sway", amp: 7 } }),
  ], D);
}
function buildExpand(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  const a = (dx, dy, rot, j) => S(`Arrow ${j + 1}`, g("arrow", dx, dy, 30, 22, { ...stroke, rotation: rot }), j, { stag: 70 });
  return kitClip("Expand Arrows", [
    a(0, -26, -90, 0), a(26, 0, 0, 1), a(0, 26, 90, 2), a(-26, 0, 180, 3),
  ], D);
}
function buildTrendUp(opts) {
  const { color, D, u, g, S } = iconCtx(opts);
  /* three rising steps + an arrow that travels the trend (prog draw-on) */
  const steps = [[-30, 20, 16], [-8, 6, 30], [14, -10, 44]].map(([dx, dy, h], i) =>
    S(`Step ${i + 1}`, g("rect", dx, dy + 12, 16, h, { fill: color, cornerR: 18, opacity: 0.55 }), i, { enter: "rise", stag: 110 }));
  const pathPts = [[-38, 30], [-14, 8], [4, 14], [38, -30]].map(([dx, dy]) => [bx(dx, u), by(dy, u)]);
  const arrow = part("shape", "Trend arrow", {
    shape: "arrow", w: 30 * u, h: 22 * u, rotation: -32, fill: color,
    x: pathPts[0][0], y: pathPts[0][1], path: { pts: pathPts, curved: true }, prog: 0,
  }, 4, D, {
    inT: 620, enter: "fade", exit: "fade",
    tracks: { prog: [kf(620, 0, "easeInOutCubic"), kf(D - EXIT0 - 120, 1, "linear")] },
  });
  return kitClip("Trend Up", [...steps, arrow], D);
}
function buildRefresh(opts) {
  const { color, D, g, stroke } = iconCtx(opts);
  const ring = gpart("shape", "Ring", g("ellipse", 0, 0, 62, 62, { ...stroke, opacity: 0.9 }), 0);
  const head = gpart("shape", "Arrowhead", g("arrow", 24, -26, 26, 19, { fill: color, rotation: 115 }), 1);
  return kitClip("Refresh", [groupClip("Refresh spin", [ring, head], D, { spin: 1 })], D);
}
function buildSwap(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Swap Horizontal", [
    S("Arrow top", g("arrow", 0, -17, 52, 34, stroke), 0, { hold: { type: "sway", amp: 7, period: 880 } }),
    S("Arrow bottom", g("arrow", 0, 17, 52, 34, { ...stroke, rotation: 180 }), 1, { hold: { type: "sway", amp: -7, period: 880 } }),
  ], D);
}

/* ---------- MEDIA ---------- */
function buildPlay(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Play", [
    S("Ring", g("ellipse", 0, 0, 88, 88, stroke), 0),
    S("Triangle", g("triangle", 5, 0, 32, 30, { fill: color, rotation: 90 }), 1, { hold: { type: "pulse", amp: 1.1 } }),
  ], D);
}
function buildPause(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Pause", [
    S("Bar left", g("rect", -13, 0, 15, 46, { fill: color, cornerR: 32 }), 0),
    S("Bar right", g("rect", 13, 0, 15, 46, { fill: color, cornerR: 32 }), 1, { stag: 120 }),
  ], D);
}
function buildStop(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Stop", [
    S("Ring", g("ellipse", 0, 0, 88, 88, stroke), 0),
    S("Square", g("rect", 0, 0, 34, 34, { fill: color, cornerR: 12 }), 1, { hold: { type: "pulse", amp: 1.06 } }),
  ], D);
}
function buildRewind(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Rewind", [
    S("Triangle 1", g("triangle", -16, 0, 32, 28, { fill: color, rotation: -90 }), 0, { stag: 110 }),
    S("Triangle 2", g("triangle", 16, 0, 32, 28, { fill: color, rotation: -90 }), 1, { stag: 110, hold: { type: "sway", amp: -6 } }),
  ], D);
}
function buildForward(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Fast Forward", [
    S("Triangle 1", g("triangle", -16, 0, 32, 28, { fill: color, rotation: 90 }), 0, { stag: 110, hold: { type: "sway", amp: 6 } }),
    S("Triangle 2", g("triangle", 16, 0, 32, 28, { fill: color, rotation: 90 }), 1, { stag: 110 }),
  ], D);
}
function buildVolume(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Volume", [
    S("Speaker box", g("rect", -26, 0, 16, 26, { fill: color, cornerR: 16 }), 0),
    S("Speaker cone", g("triangle", -6, 0, 26, 40, { fill: color, rotation: 90, opacity: 0.9 }), 1),
    S("Wave near", g("rect", 16, 0, 6, 26, { fill: color, cornerR: 49 }), 2, { hold: { type: "pulse", amp: 1.22, period: 520 } }),
    S("Wave far", g("rect", 30, 0, 6, 42, { fill: color, cornerR: 49, opacity: 0.7 }), 3, { hold: { type: "pulse", amp: 1.16, period: 760 } }),
  ], D);
}

/* ---------- INTERFACE ---------- */
function buildSearch(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Search", [
    S("Lens", g("ellipse", -8, -8, 46, 46, stroke), 0, { enter: "rise" }),
    S("Handle", g("rect", 18, 18, 26, 7.5, { ...stroke, rotation: 45, cornerR: 49 }), 1, { enter: "rise", stag: 190, hold: { type: "bob", amp: 3 } }),
  ], D);
}
function buildMenu(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Menu", [
    S("Line 1", g("rect", 0, -16, 48, 6.5, { fill: color, cornerR: 49 }), 0, { enter: "rise", stag: 80 }),
    S("Line 2", g("rect", 0, 0, 48, 6.5, { fill: color, cornerR: 49 }), 1, { enter: "rise", stag: 80, hold: { type: "sway", amp: 5 } }),
    S("Line 3", g("rect", 0, 16, 48, 6.5, { fill: color, cornerR: 49 }), 2, { enter: "rise", stag: 80 }),
  ], D);
}
function buildPlus(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Plus", [
    S("Plus", g("cross", 0, 0, 52, 52, stroke), 0, { hold: { type: "spin", turns: 0.25 } }),
  ], D);
}
function buildClose(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Close", [
    S("Cross", g("cross", 0, 0, 50, 50, { ...stroke, rotation: 45 }), 0, { hold: { type: "pulse", amp: 1.08 } }),
  ], D);
}
function buildCheck(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Check", [
    S("Arm short", g("rect", -15, 8, 22, 7.5, { fill: color, cornerR: 49, rotation: 48 }), 0, { enter: "rise", stag: 130 }),
    S("Arm long", g("rect", 8, -1, 40, 7.5, { fill: color, cornerR: 49, rotation: -52 }), 1, { enter: "rise", stag: 130, hold: { type: "bob", amp: 3 } }),
  ], D);
}
function buildSliders(opts) {
  const { color, D, g, S } = iconCtx(opts);
  const rows = [[-17, -12, 13], [0, 10, -13], [17, -6, 10]];
  const kids = [];
  rows.forEach(([dy, kx, slide], i) => {
    kids.push(S(`Track ${i + 1}`, g("rect", 0, dy, 52, 5.5, { fill: color, cornerR: 49, opacity: 0.45 }), i * 2, { enter: "rise", stag: 70 }));
    kids.push(S(`Knob ${i + 1}`, g("ellipse", kx, dy, 13, 13, { fill: color }), i * 2 + 1, {
      stag: 70, hold: { type: "sway", amp: slide, period: 1480 + i * 240 },
    }));
  });
  return kitClip("Sliders", kids, D);
}
function buildHome(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Home", [
    S("Roof", g("triangle", 0, -13, 62, 40, stroke), 0, { enter: "rise" }),
    S("Body", g("rect", 0, 13, 44, 32, stroke), 1, { enter: "rise" }),
    S("Door", g("rect", 0, 19, 12, 20, { fill: color, cornerR: 20 }), 2, { enter: "rise" }),
  ], D);
}

/* ---------- COMMUNICATION ---------- */
function buildChat(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  const dots = [-14, 0, 14].map((dx, i) =>
    S(`Dot ${i + 1}`, g("ellipse", dx, -4, 7.5, 7.5, { fill: color }), i + 2, { stag: 130, hold: { type: "bob", amp: -3.5, period: 620 } }));
  return kitClip("Chat Bubble", [
    S("Bubble", g("rect", 0, -4, 64, 44, { ...stroke, cornerR: 28 }), 0),
    S("Tail", g("triangle", -18, 21, 15, 12, { ...stroke, rotation: 180 }), 1),
    ...dots,
  ], D);
}
function buildMail(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Mail", [
    S("Envelope", g("rect", 0, 0, 66, 44, { ...stroke, cornerR: 10 }), 0),
    S("Flap left", g("rect", -14, -6, 36, 5.5, { ...stroke, rotation: 32, cornerR: 49 }), 1, { enter: "rise", stag: 140 }),
    S("Flap right", g("rect", 14, -6, 36, 5.5, { ...stroke, rotation: -32, cornerR: 49 }), 2, { enter: "rise", stag: 140 }),
  ], D);
}
function buildMegaphone(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Megaphone", [
    S("Cone", g("triangle", 6, -4, 42, 48, { ...stroke, rotation: 90 }), 0),
    S("Mouth", g("rect", -20, -4, 14, 22, stroke), 1),
    S("Handle", g("rect", -12, 16, 8, 18, { fill: color, cornerR: 20 }), 2, { hold: { type: "sway", amp: 4 } }),
  ], D);
}
function buildHeart(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Heart", [
    S("Heart", g("heart", 0, 0, 62, 58, stroke), 0, { hold: { type: "heartbeat", period: 940 } }),
  ], D);
}
function buildStar(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Star", [
    S("Star", g("star", 0, 0, 64, 64, stroke), 0, { hold: { type: "pulse", amp: 1.09, period: 760 } }),
  ], D);
}
function buildShare(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Share Nodes", [
    S("Link up", g("rect", 1, -11, 30, 4.5, { fill: color, cornerR: 49, rotation: -33, opacity: 0.75 }), 1, { enter: "rise" }),
    S("Link down", g("rect", 1, 11, 30, 4.5, { fill: color, cornerR: 49, rotation: 33, opacity: 0.75 }), 2, { enter: "rise" }),
    S("Node left", g("ellipse", -20, 0, 15, 15, { fill: color }), 0, { hold: { type: "bob", amp: 3 } }),
    S("Node up", g("ellipse", 17, -21, 15, 15, { fill: color }), 3),
    S("Node down", g("ellipse", 17, 21, 15, 15, { fill: color }), 4),
  ], D);
}

/* ---------- DEVICES ---------- */
function buildPhone(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Phone", [
    S("Body", g("rect", 0, 0, 42, 70, { ...stroke, cornerR: 18 }), 0),
    S("Speaker", g("rect", 0, -24, 15, 4, { fill: color, cornerR: 49, opacity: 0.8 }), 1),
    S("Home dot", g("ellipse", 0, 26, 8, 8, { fill: color }), 2, { hold: { type: "pulse", amp: 1.18, period: 820 } }),
  ], D);
}
function buildLaptop(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Laptop", [
    S("Screen", g("rect", 0, -9, 64, 40, { ...stroke, cornerR: 8 }), 0, { enter: "rise" }),
    S("Base", g("rect", 0, 17, 78, 6, { fill: color, cornerR: 49 }), 1, { enter: "rise" }),
  ], D);
}
function buildMonitor(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Monitor", [
    S("Screen", g("rect", 0, -11, 68, 44, { ...stroke, cornerR: 8 }), 0),
    S("Stand", g("rect", 0, 20, 6, 15, { fill: color }), 1),
    S("Foot", g("rect", 0, 29, 30, 5, { fill: color, cornerR: 49 }), 2),
  ], D);
}
function buildTablet(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Tablet", [
    S("Body", g("rect", 0, 0, 52, 68, { ...stroke, cornerR: 12 }), 0),
    S("Dot", g("ellipse", 0, 26, 6.5, 6.5, { fill: color }), 1, { hold: { type: "blink", period: 1400 } }),
  ], D);
}
function buildWatch(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Watch", [
    S("Strap top", g("rect", 0, -27, 17, 13, { fill: color, cornerR: 24, opacity: 0.75 }), 0, { enter: "rise" }),
    S("Face", g("rect", 0, 0, 36, 42, { ...stroke, cornerR: 26 }), 1),
    S("Hand hour", g("rect", 4, 0, 3.4, 12, { fill: color, cornerR: 49, rotation: 62 }), 2),
    S("Hand minute", g("rect", 0, -4, 3.4, 15, { fill: color, cornerR: 49 }), 3, { hold: { type: "spin", turns: 2 } }),
    S("Strap bottom", g("rect", 0, 27, 17, 13, { fill: color, cornerR: 24, opacity: 0.75 }), 4, { enter: "rise" }),
  ], D);
}
function buildCamera(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Camera", [
    S("Bump", g("rect", -14, -26, 20, 10, { fill: color, cornerR: 24 }), 1, { enter: "rise" }),
    S("Body", g("rect", 0, 0, 66, 46, { ...stroke, cornerR: 16 }), 0),
    S("Lens", g("ellipse", 2, 0, 22, 22, stroke), 2, { hold: { type: "pulse", amp: 1.12, period: 900 } }),
    S("Flash", g("ellipse", 24, -14, 5.5, 5.5, { fill: color }), 3),
  ], D);
}

/* ---------- WEATHER ---------- */
function buildSun(opts) {
  const { color, D, g, stroke } = iconCtx(opts);
  const kids = [gpart("shape", "Core", g("ellipse", 0, 0, 30, 30, stroke), 0)];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    kids.push(gpart("shape", `Ray ${i + 1}`, g("rect", Math.cos(a) * 32, Math.sin(a) * 32, 13, 5.5, { fill: color, cornerR: 49, rotation: i * 45 }), i + 1, { stag: 60 }));
  }
  return kitClip("Sun", [groupClip("Sun spin", kids, D, { spin: 0.5 })], D);
}
function buildCloud(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Cloud", [
    S("Puff left", g("ellipse", -18, 8, 36, 26, { fill: color }), 0, { enter: "rise" }),
    S("Puff mid", g("ellipse", 4, -2, 44, 36, { fill: color }), 1, { enter: "rise" }),
    S("Puff right", g("ellipse", 22, 10, 30, 22, { fill: color }), 2, { enter: "rise" }),
    S("Base", g("rect", 2, 16, 62, 16, { fill: color, cornerR: 49 }), 3, { enter: "rise", hold: { type: "sway", amp: 5 } }),
  ], D);
}
function buildRain(opts) {
  const { color, D, g, S } = iconCtx(opts);
  const drops = [-16, 0, 16].map((dx, i) =>
    S(`Drop ${i + 1}`, g("rect", dx, 26, 4.5, 12, { fill: color, cornerR: 49, rotation: 12 }), i + 3, {
      stag: 150, hold: { type: "fall", amp: 15, period: 700 },
    }));
  return kitClip("Rain", [
    S("Puff", g("ellipse", -4, -8, 46, 32, { fill: color }), 0, { enter: "rise" }),
    S("Puff right", g("ellipse", 16, -2, 30, 24, { fill: color }), 1, { enter: "rise" }),
    S("Base", g("rect", 2, 8, 58, 14, { fill: color, cornerR: 49 }), 2, { enter: "rise" }),
    ...drops,
  ], D);
}
function buildBolt(opts) {
  const { D, g, stroke, S } = iconCtx(opts);
  return kitClip("Lightning", [
    S("Bolt", g("bolt", 0, 0, 48, 64, stroke), 0, { hold: { type: "flicker", seed: 11 } }),
  ], D);
}
function buildSnow(opts) {
  const { color, D, g, stroke } = iconCtx(opts);
  const kids = [0, 60, 120].map((rot, i) =>
    gpart("shape", `Arm ${i + 1}`, g("rect", 0, 0, 52, 6, { fill: color, cornerR: 49, rotation: rot }), i, { stag: 90 }));
  kids.push(gpart("shape", "Core", g("ellipse", 0, 0, 11, 11, stroke), 3));
  return kitClip("Snowflake", [groupClip("Snow spin", kids, D, { spin: 0.5 })], D);
}
function buildWind(opts) {
  const { color, D, g, S } = iconCtx(opts);
  return kitClip("Wind", [
    S("Gust 1", g("rect", -4, -14, 42, 5.5, { fill: color, cornerR: 49 }), 0, { enter: "rise", stag: 110, hold: { type: "sway", amp: 9, period: 900 } }),
    S("Gust 2", g("rect", 6, 2, 34, 5.5, { fill: color, cornerR: 49, opacity: 0.8 }), 1, { enter: "rise", stag: 110, hold: { type: "sway", amp: 12, period: 760 } }),
    S("Gust 3", g("rect", -8, 18, 38, 5.5, { fill: color, cornerR: 49, opacity: 0.6 }), 2, { enter: "rise", stag: 110, hold: { type: "sway", amp: 7, period: 1040 } }),
  ], D);
}

/* ---------- COMMERCE ---------- */
function buildTag(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Price Tag", [
    S("Tag", g("diamond", 0, 0, 52, 52, stroke), 0, { hold: { type: "bob", amp: 5 } }),
    S("Hole", g("ellipse", -7, -7, 9, 9, { fill: color }), 1),
  ], D);
}
function buildCart(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Cart", [
    S("Handle", g("rect", -27, -15, 15, 5.5, { fill: color, cornerR: 49, rotation: 28 }), 0, { enter: "rise" }),
    S("Basket", g("rect", 2, -2, 46, 26, { ...stroke, cornerR: 10 }), 1, { hold: { type: "sway", amp: 7 } }),
    S("Wheel left", g("ellipse", -11, 21, 9.5, 9.5, { fill: color }), 2),
    S("Wheel right", g("ellipse", 15, 21, 9.5, 9.5, { fill: color }), 3),
  ], D);
}
function buildCreditCard(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Credit Card", [
    S("Card", g("rect", 0, 0, 66, 42, { ...stroke, cornerR: 12 }), 0),
    S("Stripe", g("rect", 0, -9, 66, 8, { fill: color, opacity: 0.55 }), 1, { enter: "rise" }),
    S("Chip", g("rect", -18, 9, 13, 10, { fill: color, cornerR: 18 }), 2, { enter: "rise" }),
  ], D);
}
function buildGift(opts) {
  const { color, D, g, stroke, S } = iconCtx(opts);
  return kitClip("Gift", [
    S("Box", g("rect", 0, 10, 50, 36, stroke), 0),
    S("Lid", g("rect", 0, -12, 58, 11, { ...stroke, cornerR: 16 }), 1, { enter: "rise" }),
    S("Ribbon", g("rect", 0, 8, 9, 52, { fill: color, opacity: 0.85 }), 2, { enter: "rise" }),
    S("Bow left", g("ellipse", -9, -24, 14, 9, { fill: color, rotation: -28 }), 3, { hold: { type: "pulse", amp: 1.12, period: 700 } }),
    S("Bow right", g("ellipse", 9, -24, 14, 9, { fill: color, rotation: 28 }), 4, { hold: { type: "pulse", amp: 1.12, period: 820 } }),
  ], D);
}
function buildCoins(opts) {
  const { color, D, u, g, stroke, S } = iconCtx(opts);
  const dollar = part("text", "Dollar", {
    text: "$", fontSize: Math.round(30 * u), fontWeight: 800, fill: color, fontFamily: "Inter",
    x: bx(12, u), y: by(-6, u),
  }, 2, D, { hold: { type: "bob", amp: 3 } });
  return kitClip("Coins", [
    S("Coin back", g("ellipse", -14, 8, 34, 34, { ...stroke, opacity: 0.75 }), 0),
    S("Coin front", g("ellipse", 12, -6, 38, 38, stroke), 1),
    dollar,
  ], D);
}

export const ICONS = [
  { id: "arrow-right", name: "Arrow Right", category: "Arrows", tags: ["arrow", "next", "forward", "go"], recipe: "pop + sway", build: buildArrowRight },
  { id: "arrow-up-right", name: "Arrow Up Right", category: "Arrows", tags: ["arrow", "diagonal", "external", "link"], recipe: "pop + sway", build: buildArrowUpRight },
  { id: "expand", name: "Expand Arrows", category: "Arrows", tags: ["arrows", "expand", "fullscreen", "directions"], recipe: "stagger pop", build: buildExpand },
  { id: "trend-up", name: "Trend Up", category: "Arrows", tags: ["chart", "growth", "arrow", "stonks", "up"], recipe: "rise + prog travel", build: buildTrendUp },
  { id: "refresh", name: "Refresh", category: "Arrows", tags: ["reload", "sync", "rotate", "loop"], recipe: "pop + spin", build: buildRefresh },
  { id: "swap", name: "Swap Horizontal", category: "Arrows", tags: ["swap", "exchange", "arrows", "transfer"], recipe: "stagger + counter-sway", build: buildSwap },
  { id: "play", name: "Play", category: "Media", tags: ["play", "video", "start", "media"], recipe: "pop + pulse", build: buildPlay },
  { id: "pause", name: "Pause", category: "Media", tags: ["pause", "hold", "stop", "media"], recipe: "stagger pop", build: buildPause },
  { id: "stop", name: "Stop", category: "Media", tags: ["stop", "square", "record", "media"], recipe: "pop + pulse", build: buildStop },
  { id: "rewind", name: "Rewind", category: "Media", tags: ["rewind", "back", "previous", "media"], recipe: "stagger + sway", build: buildRewind },
  { id: "fast-forward", name: "Fast Forward", category: "Media", tags: ["forward", "next", "skip", "media"], recipe: "stagger + sway", build: buildForward },
  { id: "volume", name: "Volume", category: "Media", tags: ["sound", "audio", "speaker", "eq"], recipe: "stagger + EQ pulse", build: buildVolume },
  { id: "search", name: "Search", category: "Interface", tags: ["search", "find", "magnifier", "lens"], recipe: "draw-on rise", build: buildSearch },
  { id: "menu", name: "Menu", category: "Interface", tags: ["menu", "hamburger", "lines", "nav"], recipe: "stagger rise", build: buildMenu },
  { id: "plus", name: "Plus", category: "Interface", tags: ["plus", "add", "new", "create"], recipe: "pop + spin", build: buildPlus },
  { id: "close", name: "Close", category: "Interface", tags: ["close", "x", "dismiss", "remove"], recipe: "pop + pulse", build: buildClose },
  { id: "check", name: "Check", category: "Interface", tags: ["check", "done", "tick", "ok"], recipe: "draw-on rise", build: buildCheck },
  { id: "sliders", name: "Sliders", category: "Interface", tags: ["settings", "sliders", "adjust", "controls", "eq"], recipe: "stagger + knob sway", build: buildSliders },
  { id: "home", name: "Home", category: "Interface", tags: ["home", "house", "main", "start"], recipe: "draw-on rise", build: buildHome },
  { id: "chat", name: "Chat Bubble", category: "Communication", tags: ["chat", "message", "talk", "comment", "typing"], recipe: "pop + typing dots", build: buildChat },
  { id: "mail", name: "Mail", category: "Communication", tags: ["mail", "email", "envelope", "send"], recipe: "pop + flap rise", build: buildMail },
  { id: "megaphone", name: "Megaphone", category: "Communication", tags: ["megaphone", "announce", "shout", "promo"], recipe: "pop + sway", build: buildMegaphone },
  { id: "heart", name: "Heart", category: "Communication", tags: ["heart", "like", "love", "favorite"], recipe: "pop + heartbeat", build: buildHeart },
  { id: "star", name: "Star", category: "Communication", tags: ["star", "rate", "favorite", "bookmark"], recipe: "pop + pulse", build: buildStar },
  { id: "share", name: "Share Nodes", category: "Communication", tags: ["share", "nodes", "network", "social"], recipe: "stagger + bob", build: buildShare },
  { id: "phone", name: "Phone", category: "Devices", tags: ["phone", "mobile", "cell", "device"], recipe: "pop + dot pulse", build: buildPhone },
  { id: "laptop", name: "Laptop", category: "Devices", tags: ["laptop", "computer", "macbook", "device"], recipe: "draw-on rise", build: buildLaptop },
  { id: "monitor", name: "Monitor", category: "Devices", tags: ["monitor", "screen", "display", "desktop"], recipe: "stagger pop", build: buildMonitor },
  { id: "tablet", name: "Tablet", category: "Devices", tags: ["tablet", "ipad", "device", "screen"], recipe: "pop + blink", build: buildTablet },
  { id: "watch", name: "Watch", category: "Devices", tags: ["watch", "time", "clock", "wearable"], recipe: "stagger + hand spin", build: buildWatch },
  { id: "camera", name: "Camera", category: "Devices", tags: ["camera", "photo", "lens", "shoot"], recipe: "stagger + lens pulse", build: buildCamera },
  { id: "sun", name: "Sun", category: "Weather", tags: ["sun", "sunny", "day", "bright", "weather"], recipe: "ray stagger + spin", build: buildSun },
  { id: "cloud", name: "Cloud", category: "Weather", tags: ["cloud", "sky", "weather", "drift"], recipe: "rise + sway", build: buildCloud },
  { id: "rain", name: "Rain", category: "Weather", tags: ["rain", "drops", "weather", "storm"], recipe: "rise + falling drops", build: buildRain },
  { id: "bolt", name: "Lightning", category: "Weather", tags: ["bolt", "lightning", "flash", "energy", "storm"], recipe: "pop + seeded flicker", build: buildBolt },
  { id: "snow", name: "Snowflake", category: "Weather", tags: ["snow", "winter", "cold", "flake"], recipe: "stagger + spin", build: buildSnow },
  { id: "wind", name: "Wind", category: "Weather", tags: ["wind", "gust", "air", "breeze"], recipe: "rise + gust sway", build: buildWind },
  { id: "tag", name: "Price Tag", category: "Commerce", tags: ["tag", "price", "label", "sale"], recipe: "pop + bob", build: buildTag },
  { id: "cart", name: "Cart", category: "Commerce", tags: ["cart", "shop", "buy", "ecommerce"], recipe: "stagger + roll sway", build: buildCart },
  { id: "credit-card", name: "Credit Card", category: "Commerce", tags: ["card", "payment", "credit", "pay"], recipe: "stagger rise", build: buildCreditCard },
  { id: "gift", name: "Gift", category: "Commerce", tags: ["gift", "present", "reward", "box"], recipe: "stagger + bow pulse", build: buildGift },
  { id: "coins", name: "Coins", category: "Commerce", tags: ["coins", "money", "dollar", "finance"], recipe: "stagger + bob", build: buildCoins },
];

/* ============================================================
   UI ELEMENTS — Jitter-grade interface motion pieces, same clip
   contract as the icons. Every element: { id, name, category, tags,
   recipe, build(opts) } with opts.accent driving the highlight color.
   ============================================================ */

/* shared per-element build context */
function uiCtx(opts) {
  const { accent, color, dur: D } = uiOpts(opts);
  const S = (name, p, j, o) => part("shape", name, p, j, D, o);
  const T = (name, text, x, y, fs, fw, fill, j, o = {}) =>
    part("text", name, { text, fontSize: fs, fontWeight: fw, fill, fontFamily: "Inter", x, y }, j, D, o);
  return { accent, color, D, S, T };
}

/* glassmorphism triple: soft blurred shadow + translucent white pane + hairline rim */
function glassParts(cx, cy, w, h, r, D, o = {}) {
  return [
    part("shape", "Soft shadow", { shape: "rect", x: cx, y: cy + Math.round(h * 0.09), w: Math.round(w * 0.96), h: Math.round(h * 0.9), cornerR: r, fill: "#000000", opacity: 0.32, blur: 14 }, 0, D, { enter: "fade", exit: "fade", ...o }),
    part("shape", "Glass pane", { shape: "rect", x: cx, y: cy, w, h, cornerR: r, fill: "#FFFFFF", opacity: 0.13 }, 0, D, { enter: "fade", exit: "fade", ...o }),
    part("shape", "Glass rim", { shape: "rect", x: cx, y: cy, w, h, cornerR: r, fillMode: "stroke", sC: "#FFFFFF", sW: 1.5, fill: "#FFFFFF", opacity: 0.35 }, 0, D, { enter: "fade", exit: "fade", ...o }),
  ];
}

/* ---------- 1 · iOS NOTIFICATION — scale 0.6 → 1 back-pop, glass card ---------- */
function buildNotification(opts) {
  const { accent, D } = uiCtx(opts);
  const Y = 330;
  /* group carries the drop + back-pop + float + accelerate-away exit */
  const gTracks = {
    scale: [kf(IN0, 0.6, "easeOutBack"), kf(IN0 + 640, 1, "linear"), kf(D - EXIT0, 1, "easeInCubic"), kf(D - OUT_TAIL, 0.82, "linear")],
    y: [kf(IN0, Y - 170, "easeOutBack"), kf(IN0 + 640, Y, "easeInOutSine"), kf(1700, Y - 5, "easeInOutSine"), kf(2400, Y, "easeInOutSine"), kf(D - EXIT0, Y, "easeInCubic"), kf(D - OUT_TAIL, Y - 46, "linear")],
    opacity: [kf(IN0, 0, "easeOutQuad"), kf(IN0 + 300, 1, "linear"), kf(D - EXIT0 + 60, 1, "easeInQuad"), kf(D - OUT_TAIL, 0, "linear")],
  };
  const kids = [
    gpart("shape", "Soft shadow", { shape: "rect", x: 640, y: Y + 12, w: 442, h: 104, cornerR: 30, fill: "#000000", opacity: 0.3, blur: 14 }, 0, { enter: "fade", inT: 60 }),
    gpart("shape", "Glass pane", { shape: "rect", x: 640, y: Y, w: 460, h: 116, cornerR: 28, fill: "#FFFFFF", opacity: 0.13 }, 0, { enter: "fade", inT: 60 }),
    gpart("shape", "Glass rim", { shape: "rect", x: 640, y: Y, w: 460, h: 116, cornerR: 28, fillMode: "stroke", sC: "#FFFFFF", sW: 1.5, fill: "#FFFFFF", opacity: 0.35 }, 0, { enter: "fade", inT: 60 }),
    gpart("shape", "App icon", { shape: "rect", x: 452, y: Y, w: 46, h: 46, cornerR: 12, fill: accent }, 1, { inT: 300 }),
    gpart("shape", "App glyph", { shape: "bolt", x: 452, y: Y, w: 20, h: 20, fill: INK }, 2, { inT: 380 }),
    gpart("text", "Title", { text: "Zwoosh", fontSize: 20, fontWeight: 700, fill: "#F9F9F9", fontFamily: "Inter", x: 528, y: Y - 16 }, 3, { enter: "fade", inT: 420 }),
    gpart("text", "Subtitle", { text: "Your export is ready — 1080p", fontSize: 15, fontWeight: 500, fill: "#C9D1E0", fontFamily: "Inter", x: 595, y: Y + 12 }, 4, { enter: "fade", inT: 500 }),
    gpart("text", "Time", { text: "now", fontSize: 13, fontWeight: 500, fill: DIM, fontFamily: "Inter", x: 848, y: Y - 18 }, 5, { enter: "fade", inT: 560 }),
  ];
  const grp = layer("clip", "Notification card", {
    start: IN0, dur: D - OUT_TAIL - IN0, speed: 1, end: "hide",
    tIn: "none", tOut: "none", tDur: 300, x: CX, y: CY,
  }, gTracks, kids);
  return kitClip("iOS Notification", [grp], D);
}

/* ---------- 2 · TOGGLE SWITCH — squash-stretch knob (widens while moving) ---------- */
function buildToggle(opts) {
  const { accent, D, S } = uiCtx(opts);
  const GRAY = "#3A4356";
  const tOn0 = 1000, tOnM = 1180, tOn1 = 1360;              /* flip ON */
  const tOff0 = D - 1150, tOffM = D - 970, tOff1 = D - 790; /* flip back OFF (loop pose) */
  const L = 606, R = 674, M1 = 633, M2 = 647;               /* rest L/R + widened mid-travel pair */
  const knobX = (a, m, b) => [
    kf(tOn0, a, "easeInOutCubic"), kf(tOnM, m, "easeInOutCubic"), kf(tOn1, b, "linear"),
    kf(tOff0, b, "easeInOutCubic"), kf(tOffM, m, "easeInOutCubic"), kf(tOff1, a, "linear"),
  ];
  const knobS = [kf(tOn0, 1, "easeInOutSine"), kf(tOnM, 1.07, "easeInOutSine"), kf(tOn1, 1, "linear"), kf(tOff0, 1, "easeInOutSine"), kf(tOffM, 1.07, "easeInOutSine"), kf(tOff1, 1, "linear")];
  return kitClip("Toggle Switch", [
    S("Halo", { shape: "ellipse", x: 640, y: 360, w: 220, h: 130, fill: accent, opacity: 0.12 }, 0, { enter: "fade", exit: "fade", hold: { type: "pulse", amp: 1.06, period: 900 } }),
    S("Track", { shape: "rect", x: 640, y: 360, w: 132, h: 64, cornerR: 49, fill: GRAY }, 0, {
      inT: 140,
      tracks: { fill: [kf(tOn0 - 60, GRAY, "easeInOutSine"), kf(tOn1 + 60, accent, "linear"), kf(tOff0 - 60, accent, "easeInOutSine"), kf(tOff1 + 60, GRAY, "linear")] },
    }),
    S("Knob A", { shape: "ellipse", x: L, y: 360, w: 52, h: 52, fill: "#F9F9F9" }, 0, { inT: 220, tracks: { x: knobX(L, M1, R), scale: knobS } }),
    S("Knob B", { shape: "ellipse", x: L, y: 360, w: 52, h: 52, fill: "#F9F9F9" }, 0, { inT: 220, tracks: { x: knobX(L, M2, R), scale: knobS } }),
  ], D);
}

/* ---------- 3 · FAB RADIAL MENU — items fan out with stagger + overshoot ---------- */
function buildFab(opts) {
  const { accent, D, S } = uiCtx(opts);
  const FX = 640, FY = 380, R = 118;
  const glyphs = ["heart", "star", "bolt", "diamond"];
  const kids = [
    S("Halo", { shape: "ellipse", x: FX, y: FY, w: 176, h: 176, fill: accent, opacity: 0.16 }, 0, { enter: "fade", exit: "fade", hold: { type: "pulse", amp: 1.08, period: 840 } }),
  ];
  [-140, -105, -70, -35].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const tx = FX + Math.cos(a) * R, ty = FY + Math.sin(a) * R;
    const t0 = 800 + i * 75, tc = D - 1050 + i * 55;
    const travel = {
      x: [kf(t0, FX, "easeOutBack"), kf(t0 + 430, tx, "linear"), kf(tc, tx, "easeInCubic"), kf(tc + 330, FX, "linear")],
      y: [kf(t0, FY, "easeOutBack"), kf(t0 + 430, ty, "linear"), kf(tc, ty, "easeInCubic"), kf(tc + 330, FY, "linear")],
      opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + 150, 1, "linear"), kf(tc, 1, "easeInQuad"), kf(tc + 300, 0, "linear")],
    };
    kids.push(S(`Item ${i + 1}`, { shape: "ellipse", x: FX, y: FY, w: 56, h: 56, fill: "#F9F9F9" }, 0, { enter: "none", exit: false, inT: t0, outT: tc + 330, tracks: travel }));
    kids.push(S(`Glyph ${i + 1}`, { shape: glyphs[i], x: FX, y: FY, w: 20, h: 20, fill: accent }, 0, { enter: "none", exit: false, inT: t0 + 60, outT: tc + 330, tracks: travel }));
  });
  kids.push(S("FAB", { shape: "ellipse", x: FX, y: FY, w: 88, h: 88, fill: accent }, 0, { inT: 140, hold: { type: "pulse", amp: 1.05, period: 900 } }));
  kids.push(S("Plus", { shape: "cross", x: FX, y: FY, w: 30, h: 30, fill: INK }, 0, {
    inT: 260,
    tracks: { rotation: [kf(780, 0, "easeOutBack"), kf(1060, 45, "linear"), kf(D - 1080, 45, "easeInCubic"), kf(D - 820, 0, "linear")] },
  }));
  return kitClip("FAB Radial Menu", kids, D);
}

/* ---------- 4 · SPINNER — arc sweep (number-ring primitive) + rotation ---------- */
function buildSpinner(opts) {
  const { accent, D, T } = uiCtx(opts);
  const num = part("number", "Arc", {
    from: 0, to: 100, start: 760, dur: D - 1440, style: "count", decimals: 0, prefix: "", suffix: "",
    fontSize: 66, fill: "transparent", numEase: "linear", fontFamily: "JetBrains Mono",
    ring: "ring", ringC: accent, ringW: 10, x: 640, y: 350,
  }, 0, D, { inT: 140, exit: "fade", tracks: { rotation: [kf(700, 0, "linear"), kf(D - EXIT0, 720, "linear")] } });
  return kitClip("Spinner", [
    num,
    T("Caption", "LOADING", 640, 474, 13, 600, DIM, 0, { enter: "fade", inT: 420, exit: "fade", hold: { type: "blink", period: 1320 } }),
  ], D);
}

/* ---------- 5 · BOUNCING DOTS loader — 100 ms stagger ---------- */
function buildDots(opts) {
  const { accent, D, S } = uiCtx(opts);
  return kitClip("Bouncing Dots", [-40, 0, 40].map((dx, i) =>
    S(`Dot ${i + 1}`, { shape: "ellipse", x: 640 + dx, y: 360, w: 26, h: 26, fill: accent }, i, {
      stag: 100, hold: { type: "bounce", amp: 16, period: 520 },
    })), D);
}

/* ---------- 6 · PROGRESS BAR — eased fill (anchored-scale) + live % ---------- */
function buildProgress(opts) {
  const { accent, D, S, T } = uiCtx(opts);
  const L = 420, W = 440; /* left edge + width of the track */
  const pct = part("number", "Percent", {
    from: 0, to: 100, start: 820, dur: D - 1760, style: "count", decimals: 0, prefix: "", suffix: "%",
    fontSize: 20, fill: DIM, numEase: "easeInOutCubic", fontFamily: "JetBrains Mono", x: 706, y: 318,
  }, 0, D, { enter: "fade", inT: 760, exit: "fade" });
  const fill = S("Fill", { shape: "rect", x: L + 1, y: 356, w: W, h: 14, cornerR: 49, fill: accent }, 0, {
    enter: "none", exit: "fade", inT: 800,
    tracks: {
      scale: [kf(820, 0.002, "easeInOutCubic"), kf(D - 940, 1, "linear")],
      x: [kf(820, L + (W * 0.002) / 2, "easeInOutCubic"), kf(D - 940, L + W / 2, "linear")],
    },
  });
  const check = S("Done check", { shape: "cross", x: 884, y: 356, w: 18, h: 18, fill: accent, rotation: 45 }, 0, { inT: D - 880 });
  return kitClip("Progress Bar", [
    T("Label", "Rendering…", 586, 318, 17, 600, "#F9F9F9", 0, { enter: "fade", inT: 300, exit: "fade" }),
    pct,
    S("Track", { shape: "rect", x: L + W / 2, y: 356, w: W, h: 14, cornerR: 49, fill: LINE }, 0, { inT: 220, exit: "fade" }),
    fill,
    check,
  ], D);
}

/* ---------- 7 · GLASSMORPHISM CARD — skeleton rows stagger in ---------- */
function buildGlassCard(opts) {
  const { accent, D, S, T } = uiCtx(opts);
  const rows = [
    S("Avatar", { shape: "ellipse", x: 548, y: 316, w: 52, h: 52, fill: accent }, 1, { enter: "rise", stag: 70 }),
    T("Initial", "J", 548, 316, 20, 800, INK, 2, { enter: "fade", stag: 70 }),
    S("Name bar", { shape: "rect", x: 652, y: 308, w: 130, h: 13, cornerR: 49, fill: "#F9F9F9", opacity: 0.85 }, 3, { enter: "rise", stag: 70 }),
    S("Sub bar", { shape: "rect", x: 631, y: 330, w: 88, h: 9, cornerR: 49, fill: "#F9F9F9", opacity: 0.3 }, 4, { enter: "rise", stag: 70 }),
    S("Line 1", { shape: "rect", x: 640, y: 372, w: 252, h: 10, cornerR: 49, fill: "#F9F9F9", opacity: 0.22 }, 5, { enter: "rise", stag: 70 }),
    S("Line 2", { shape: "rect", x: 619, y: 394, w: 210, h: 10, cornerR: 49, fill: "#F9F9F9", opacity: 0.16 }, 6, { enter: "rise", stag: 70 }),
    S("Button", { shape: "rect", x: 640, y: 438, w: 116, h: 36, cornerR: 49, fill: accent }, 7, { stag: 70, hold: { type: "pulse", amp: 1.06, period: 900 } }),
    T("Button label", "Follow", 640, 438, 15, 700, INK, 8, { enter: "fade", stag: 70 }),
  ];
  return kitClip("Glass Card", [...glassParts(640, 356, 340, 232, 24, D), ...rows], D);
}

/* ---------- 8 · BUTTON — press animation with ripple + synced shadow ---------- */
function buildButton(opts) {
  const { accent, D, S, T } = uiCtx(opts);
  const pressAt = [950, 2100];
  const pressTr = (lo, hi) => {
    const tr = [kf(140, 0, "easeOutBack"), kf(610, 1, "linear")];
    pressAt.forEach((t) => tr.push(kf(t, 1, "easeOutQuad"), kf(t + 85, lo, "easeInOutSine"), kf(t + 210, hi, "easeInOutSine"), kf(t + 330, 1, "linear")));
    tr.push(kf(D - EXIT0, 1, "easeOutQuad"), kf(D - EXIT0 + 120, 1.09, "easeInCubic"), kf(D - OUT_TAIL, 0, "linear"));
    return tr;
  };
  const opTr = [kf(140, 0, "easeOutQuad"), kf(360, 1, "linear"), kf(D - EXIT0 + 40, 1, "easeInQuad"), kf(D - OUT_TAIL - 60, 0, "linear")];
  const ripples = pressAt.map((t, i) =>
    S(`Ripple ${i + 1}`, { shape: "ellipse", x: 640, y: 372, w: 230, h: 80, fillMode: "stroke", sC: accent, sW: 4, fill: accent }, 0, {
      enter: "none", exit: false, inT: t, outT: t + 780,
      tracks: { scale: [kf(t, 0.55, "easeOutCubic"), kf(t + 700, 1.9, "linear")], opacity: [kf(t, 0.8, "easeOutQuad"), kf(t + 700, 0, "linear")] },
    }));
  return kitClip("Button Press", [
    S("Halo", { shape: "ellipse", x: 640, y: 372, w: 310, h: 150, fill: accent, opacity: 0.13 }, 0, { enter: "fade", exit: "fade", hold: { type: "pulse", amp: 1.05, period: 900 } }),
    S("Shadow", { shape: "ellipse", x: 640, y: 428, w: 210, h: 26, fill: "#000000", opacity: 0.3, blur: 6 }, 0, {
      enter: "none", exit: false, inT: 140, outT: D - OUT_TAIL, tracks: { scale: pressTr(0.82, 1.04), opacity: opTr },
    }),
    S("Button", { shape: "rect", x: 640, y: 372, w: 230, h: 80, cornerR: 49, fill: accent }, 0, {
      enter: "none", exit: false, inT: 140, outT: D - OUT_TAIL, tracks: { scale: pressTr(0.9, 1.05), opacity: opTr },
    }),
    T("Label", "Press me", 640, 372, 23, 700, INK, 0, {
      enter: "none", exit: false, inT: 260, outT: D - OUT_TAIL, tracks: { scale: pressTr(0.9, 1.05), opacity: opTr },
    }),
    ...ripples,
  ], D);
}

/* ---------- 9 · BADGE PILL — elastic pop + sonar ping ---------- */
function buildBadge(opts) {
  const { accent, D, S, T } = uiCtx(opts);
  const ping = { scale: [], opacity: [] };
  for (let t = 1000; t + 1100 < D - 700; t += 1100) {
    ping.scale.push(kf(t, 0.6, "easeOutCubic"), kf(t + 1050, 2.3, "linear"));
    ping.opacity.push(kf(t, 0.8, "easeOutQuad"), kf(t + 1050, 0, "linear"));
  }
  ping.scale.push(kf(D - 700, 2.3, "linear"));
  ping.opacity.push(kf(D - 700, 0, "linear"));
  return kitClip("Badge Pill", [
    S("Pill", { shape: "rect", x: 640, y: 360, w: 160, h: 64, cornerR: 49, fill: CARD }, 0, {
      enter: "none", tracks: { scale: [kf(140, 0, "easeOutElastic"), kf(1090, 1, "linear")], opacity: [kf(140, 0, "easeOutQuad"), kf(400, 1, "linear")] },
    }),
    S("Pill rim", { shape: "rect", x: 640, y: 360, w: 160, h: 64, cornerR: 49, fillMode: "stroke", sC: LINE, sW: 1.5, fill: LINE }, 0, { enter: "fade", inT: 300, exit: "fade" }),
    S("Dot", { shape: "ellipse", x: 594, y: 360, w: 15, h: 15, fill: accent }, 1),
    S("Ping", { shape: "ellipse", x: 594, y: 360, w: 15, h: 15, fillMode: "stroke", sC: accent, sW: 3, fill: accent }, 0, {
      enter: "none", exit: false, inT: 900, tracks: ping,
    }),
    T("Count", "3 new", 652, 360, 22, 700, "#F9F9F9", 2),
  ], D);
}

/* ---------- 10 · AVATAR STACK — staggered pops + wave bob ---------- */
function buildAvatars(opts) {
  const { D, S, T } = uiCtx(opts);
  const fills = [AMBER, CORAL, BLUE, MINT, CARD];
  const names = ["J", "A", "K", "M", "+9"];
  const kids = [];
  fills.forEach((f, i) => {
    kids.push(S(`Avatar ${i + 1}`, { shape: "ellipse", x: 640 + (i - 2) * 44, y: 360, w: 74, h: 74, fill: f, fillMode: "both", sC: "#10131A", sW: 6 }, i, {
      stag: 90, hold: { type: "bob", amp: i % 2 ? 5 : -5, period: 960 },
    }));
  });
  names.forEach((n, i) => {
    kids.push(T(`Label ${i + 1}`, n, 640 + (i - 2) * 44, 360, i === 4 ? 19 : 22, 800, i === 4 ? "#F9F9F9" : INK, i, { enter: "fade", inT: 300 + i * 90 }));
  });
  return kitClip("Avatar Stack", kids, D);
}

/* ---------- 11 · SEARCH BAR — glass, query + blinking cursor ---------- */
function buildSearchBar(opts) {
  const { accent, D, S, T } = uiCtx(opts);
  return kitClip("Search Bar", [
    S("Bar", { shape: "rect", x: 640, y: 360, w: 470, h: 80, cornerR: 49, fill: CARD }, 0),
    S("Bar rim", { shape: "rect", x: 640, y: 360, w: 470, h: 80, cornerR: 49, fillMode: "stroke", sC: LINE, sW: 1.5, fill: LINE }, 0, { enter: "fade", inT: 240, exit: "fade" }),
    S("Glass", { shape: "ellipse", x: 466, y: 354, w: 19, h: 19, fillMode: "stroke", sC: DIM, sW: 5, fill: DIM }, 1),
    S("Glass handle", { shape: "rect", x: 479, y: 367, w: 11, h: 4.5, cornerR: 49, fill: DIM, rotation: 45 }, 2),
    T("Query", "Motion templates", 582, 360, 20, 500, "#C9D1E0", 3, { enter: "fade", inT: 640 }),
    S("Cursor", { shape: "rect", x: 668, y: 360, w: 3, h: 28, cornerR: 49, fill: accent }, 4, { enter: "fade", inT: 700, hold: { type: "blink", period: 1060 } }),
  ], D);
}

/* ---------- 12 · BRIGHTNESS SLIDER — anchored fill + knob + sun feedback ---------- */
function buildSlider(opts) {
  const { accent, D, S } = uiCtx(opts);
  const L = 472, W = 380, t0 = 900, t1 = D - 1000;
  const sunScale = [kf(t0, 0.7, "easeInOutCubic"), kf(t1, 1.25, "linear")];
  const kids = [
    S("Sun core", { shape: "ellipse", x: 462, y: 360, w: 17, h: 17, fill: accent }, 0, { tracks: { scale: sunScale } }),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    kids.push(S(`Sun ray ${i + 1}`, { shape: "rect", x: 462 + Math.cos(a) * 16, y: 360 + Math.sin(a) * 16, w: 8, h: 3.5, cornerR: 49, fill: accent, rotation: i * 60 }, 0, { enter: "fade", inT: 260 + i * 40, tracks: { scale: sunScale } }));
  }
  kids.push(S("Track", { shape: "rect", x: L + W / 2, y: 360, w: W, h: 8, cornerR: 49, fill: LINE }, 1, { exit: "fade" }));
  kids.push(S("Fill", { shape: "rect", x: L + 4, y: 360, w: W, h: 8, cornerR: 49, fill: accent }, 2, {
    enter: "none", exit: "fade", inT: t0 - 40,
    tracks: {
      scale: [kf(t0, 0.04, "easeInOutCubic"), kf(t1, 1, "linear")],
      x: [kf(t0, L + (W * 0.04) / 2, "easeInOutCubic"), kf(t1, L + W / 2, "linear")],
    },
  }));
  kids.push(S("Knob", { shape: "ellipse", x: L + W * 0.04, y: 360, w: 30, h: 30, fill: "#F9F9F9" }, 3, {
    tracks: { x: [kf(t0, L + W * 0.04, "easeInOutCubic"), kf(t1, L + W, "linear")] },
  }));
  return kitClip("Brightness Slider", kids, D);
}

/* ---------- 13 · TOAST — slides up, holds, slides away (mirrored) ---------- */
function buildToast(opts) {
  const { accent, D } = uiCtx(opts);
  const Y = 560;
  const slideTr = (y0) => ({
    y: [kf(160, y0 + 110, "easeOutBack"), kf(700, y0, "linear"), kf(D - EXIT0, y0, "easeInCubic"), kf(D - 120, y0 + 130, "linear")],
    opacity: [kf(160, 0, "easeOutQuad"), kf(420, 1, "linear"), kf(D - EXIT0, 1, "easeInQuad"), kf(D - 140, 0, "linear")],
  });
  const P = (type, name, p, o = {}) => part(type, name, p, 0, D, { enter: "none", exit: false, inT: 160, outT: D - 100, ...o, tracks: MT(slideTr(p.y), o.tracks || {}) });
  return kitClip("Toast", [
    P("shape", "Toast", { shape: "rect", x: 640, y: Y, w: 430, h: 76, cornerR: 20, fill: CARD }),
    P("shape", "Toast rim", { shape: "rect", x: 640, y: Y, w: 430, h: 76, cornerR: 20, fillMode: "stroke", sC: LINE, sW: 1.5, fill: LINE }),
    P("shape", "Check circle", { shape: "ellipse", x: 478, y: Y, w: 36, h: 36, fill: accent }),
    P("shape", "Check arm 1", { shape: "rect", x: 473, y: Y + 1, w: 10, h: 3.5, cornerR: 49, fill: INK, rotation: 48 }),
    P("shape", "Check arm 2", { shape: "rect", x: 482, y: Y - 1, w: 16, h: 3.5, cornerR: 49, fill: INK, rotation: -52 }),
    P("text", "Message", { text: "Saved to projects", fontSize: 19, fontWeight: 600, fill: "#F9F9F9", fontFamily: "Inter", x: 612, y: Y }),
    P("text", "Action", { text: "UNDO", fontSize: 15, fontWeight: 700, fill: accent, fontFamily: "Inter", x: 812, y: Y }),
  ], D);
}

export const UI_ELEMENTS = [
  { id: "notification-ios", name: "iOS Notification", category: "Feedback", tags: ["notification", "ios", "glass", "alert", "banner"], recipe: "back-pop drop + glassmorphism", build: buildNotification },
  { id: "toggle-switch", name: "Toggle Switch", category: "Controls", tags: ["toggle", "switch", "ios", "control", "settings"], recipe: "squash-stretch knob + color flip", build: buildToggle },
  { id: "fab-radial", name: "FAB Radial Menu", category: "Controls", tags: ["fab", "menu", "radial", "fan", "material"], recipe: "fan-out stagger + overshoot", build: buildFab },
  { id: "spinner-arc", name: "Spinner", category: "Loaders", tags: ["spinner", "loader", "arc", "loading", "progress"], recipe: "arc sweep + rotation", build: buildSpinner },
  { id: "loader-dots", name: "Bouncing Dots", category: "Loaders", tags: ["dots", "bounce", "loader", "loading", "typing"], recipe: "bounce · 100 ms stagger", build: buildDots },
  { id: "progress-bar", name: "Progress Bar", category: "Feedback", tags: ["progress", "bar", "loading", "percent", "upload"], recipe: "eased fill + live count", build: buildProgress },
  { id: "glass-card", name: "Glass Card", category: "Cards", tags: ["glass", "card", "glassmorphism", "profile", "skeleton"], recipe: "glass + staggered rows", build: buildGlassCard },
  { id: "button-press", name: "Button Press", category: "Controls", tags: ["button", "press", "cta", "tap", "ripple"], recipe: "press cycle + ripple", build: buildButton },
  { id: "badge-pill", name: "Badge Pill", category: "Feedback", tags: ["badge", "pill", "count", "notification", "new"], recipe: "elastic pop + sonar ping", build: buildBadge },
  { id: "avatar-stack", name: "Avatar Stack", category: "Cards", tags: ["avatars", "stack", "team", "faces", "social"], recipe: "stagger pop + wave bob", build: buildAvatars },
  { id: "search-bar", name: "Search Bar", category: "Controls", tags: ["search", "bar", "input", "field", "query"], recipe: "pop + blinking cursor", build: buildSearchBar },
  { id: "slider-bright", name: "Brightness Slider", category: "Controls", tags: ["slider", "brightness", "volume", "control", "knob"], recipe: "synced fill + knob + sun", build: buildSlider },
  { id: "toast", name: "Toast", category: "Feedback", tags: ["toast", "snackbar", "confirm", "saved", "undo"], recipe: "slide up · mirrored exit", build: buildToast },
];

/* ============================================================
   FRAME — content bounding box of a built kit clip (stage coords),
   used by the panel thumbnails to crop-zoom the live preview.
   ============================================================ */
export function frameOf(clip, pad = 16) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const eat = (cx, cy, w, h) => {
    if (![cx, cy, w, h].every(Number.isFinite)) return;
    x0 = Math.min(x0, cx - w / 2); y0 = Math.min(y0, cy - h / 2);
    x1 = Math.max(x1, cx + w / 2); y1 = Math.max(y1, cy + h / 2);
  };
  const walk = (o) => {
    const P = o.props || {};
    if (o.type === "clip") { (o.children || []).forEach(walk); return; }
    /* parts that travel (FAB fan items, path prog arrows…): widen the box to
       the min/max of the x/y keyframes so thumbs never crop the travel */
    let px = P.x, py = P.y;
    const xs = (o.tracks && o.tracks.x || []).map((k) => k.v).filter(Number.isFinite);
    const ys = (o.tracks && o.tracks.y || []).map((k) => k.v).filter(Number.isFinite);
    if (xs.length) px = (Math.min(P.x, ...xs) + Math.max(P.x, ...xs)) / 2;
    if (ys.length) py = (Math.min(P.y, ...ys) + Math.max(P.y, ...ys)) / 2;
    const spanX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    const spanY = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    if (o.type === "text") {
      const fs = P.fontSize || 20;
      const lines = String(P.text || "").split("\n");
      eat(px, py, Math.max(...lines.map((l) => l.length), 1) * fs * 0.62 + (P.pad || 0) * 2 + spanX, lines.length * fs * 1.3 + spanY);
      return;
    }
    if (o.type === "number") {
      if ((P.ring || "none") !== "none") { const s = (P.fontSize || 24) * 1.15 * 2 + (P.ringW || 8) * 2 + 12; eat(px, py, s + spanX, s + spanY); }
      else eat(px, py, (P.fontSize || 24) * 3 + spanX, (P.fontSize || 24) * 1.4 + spanY);
      return;
    }
    eat(px, py, (P.w || 40) + (P.blur ? P.blur * 2 : 0) + spanX, (P.h || 40) + (P.blur ? P.blur * 2 : 0) + spanY);
  };
  (clip.children || []).forEach(walk);
  if (x0 > x1) return { x: 0, y: 0, w: STAGE_W, h: STAGE_H };
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export default { ICONS, UI_ELEMENTS, ICON_CATS, UI_CATS, KIT_COLORS, frameOf };
