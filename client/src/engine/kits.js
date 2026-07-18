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

   Customization: build({ color, accent, size, dur, variant }) —
   primary fill color (icon shades/highlights re-derive from it),
   accent color (UI), geometry scale, loop length, and the icon
   variant ("animated" default | "static" — identical art, zero
   tracks). All animation is a pure function of timeline time
   (keyframes only; the one "random" recipe — lightning flicker —
   is seeded via engine/random mulberry32) so the export path
   re-renders identical frames.
   ============================================================ */

import { mulberry32 } from "./random.js";
import { lerpColor } from "./keyframes.js";

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

export const ICON_CATS = ["Emoji", "Reactions", "Objects", "Weather", "Media", "Commerce"];
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
  if (h.type === "rock") { /* rotation oscillation around the rest pose (bell swing, laugh rock) */
    const per = h.period || 900, amp = h.amp || 5;
    const tr = [kf(t0, 0, "easeInOutSine")];
    let t = t0, dir = 1;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, dir * amp, "easeInOutSine")); dir = -dir; }
    if (tr[tr.length - 1].v !== 0) tr.push(kf(t1, 0, "easeInOutSine"));
    return { rotation: tr };
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
  color: typeof opts.color === "string" && opts.color ? opts.color : null, /* null → the icon's natural primary */
  size: Number.isFinite(+opts.size) ? Math.max(80, Math.min(720, +opts.size)) : 320,
  dur: clampDur(opts.dur, ICON_DUR),
  animated: opts.variant !== "static", /* "animated" (default) | "static" — same art, zero tracks */
});
const uiOpts = (opts = {}) => ({
  accent: typeof opts.accent === "string" && opts.accent ? opts.accent : AMBER,
  color: typeof opts.color === "string" && opts.color ? opts.color : WHITE,
  dur: clampDur(opts.dur, UI_DUR),
});

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

/* nested clip = group: collective spin/hold window (start → D−60, hide) */
function groupClip(name, children, D, o = {}) {
  const start = o.start != null ? o.start : IN0;
  const end = o.end != null ? o.end : D - OUT_TAIL;
  let tracks = {};
  if (o.spin) tracks.rotation = [kf(start + 520, 0, "linear"), kf(end - 340, 360 * o.spin, "linear")];
  if (o.hold) tracks = MT(tracks, holdTr(o.hold, CX, CY, start + 520, end - 340));
  if (o.tr) tracks = MT(tracks, o.tr);
  return layer("clip", name, {
    start, dur: end - start, speed: 1, end: "hide",
    tIn: o.tIn || "fade", tOut: o.tOut || "fade", tDur: o.tDur || 300,
    x: CX, y: CY,
  }, tracks, children);
}

/* ============================================================
   ICONS — flat, colored, filled icons in the Flaticon genre:
   soft rounded geometry, solid fills, 2–4 colors per icon, one
   shared visual language (bottom-rim shade twin + top-left light
   blob for depth, dark navy-brown feature ink, 1–2 accents).

   Every icon builds TWO variants from ONE art spec:
     · animated (default) — the Jitter grammar: easeOutBack pop
       entrances with 50–150 ms staggers, an icon-specific hold
       motion (blink / heartbeat / flicker / fall / rock / drift…),
       whip exit; structurally seamless (frame(0) ≡ frame(dur)).
     · static — identical art, ZERO animation tracks, always
       visible (inT 0 / outT null), for users who want still icons.
   build(opts): { color, size, dur, variant: "animated"|"static" }
     · color recolors the icon's PRIMARY fill (shades/highlights
       re-derive from it via tone()); every icon has its own
       natural default when no color is passed.
   ============================================================ */

/* flat-icon accent palette (shared across the family) */
const FACE_Y = "#FFD54A";  /* emoji face warm yellow */
const FEAT = "#3D3548";    /* feature ink — dark navy-brown */
const CHEEK = "#FF8FA3";
const TONGUE_C = "#FF6E8A";
const TEAR_C = "#5BC8F5";
const GOLD = "#FFC53D";
const RED = "#FF5D5D";
const PINK = "#FF7BA9";
const ORANGE = "#FF9F43";
const GREEN = "#3ED598";
const VIOLET = "#C084FC";
const NAVY = "#2E2A33";
const PURE = "#FFFFFF";

/* tone(): lighten (u>0, toward white) / darken (u<0, toward black) */
const tone = (hex, u) => (u < 0 ? lerpColor(hex, "#000000", -u) : lerpColor(hex, "#FFFFFF", u));

/* ---------- design-box spec DSL ----------
   L:  shape spec  — L(shape, dx, dy, w, h, extras, anim)
       extras: fill · cr(cornerR) · rot · op · fm+sC+sW · blur
       anim:   j (stagger idx) · in · stag · hold · tr (extra
               tracks) · out · es · inT · outT
   LT: text spec   — LT(text, dx, dy, fontSize, extras, anim)
   LG: group spec  — LG(name, kids, anim{ spin, hold })        */
const L = (shape, dx, dy, w, h, x = {}, a = {}) => ({ k: "s", shape, dx, dy, w, h, x, a });
const LT = (text, dx, dy, fs, x = {}, a = {}) => ({ k: "t", text, dx, dy, fs, x, a });
const LG = (n, kids, a = {}) => ({ k: "g", n, kids, a });

/* ---------- looped track factories (all pure f(D)) ---------- */
/* blink crossfade: open eye hides / closed lid shows for ~200 ms at tb */
function blinkTr(D, tb) {
  return {
    open: [kf(tb, 1, "linear"), kf(tb + 70, 0, "linear"), kf(tb + 200, 0, "linear"), kf(tb + 270, 1, "linear")],
    closed: [kf(220, 0, "linear"), kf(tb, 0, "linear"), kf(tb + 70, 1, "linear"), kf(tb + 200, 1, "linear"), kf(tb + 270, 0, "linear"), kf(D - 80, 0, "linear")],
  };
}
/* drift loop: the part repeatedly travels (ddx,ddy) box units from its
   rest spot while fading in→out (flying tears, steam, confetti, shine).
   Use with enter "none" + exit false — the part lives only in drifts. */
function driftTr(c, dx, dy, ddx, ddy, per, o = {}) {
  const D = c.D, u = c.u;
  const x = bx(dx, u), y = by(dy, u);
  const t0 = o.t0 != null ? o.t0 : 760 + (o.phase || 0);
  const t1 = D - EXIT0, ro = o.ro != null ? o.ro : 0.95;
  const tr = { x: [], y: [], opacity: [], scale: [] };
  for (let t = t0; t + per <= t1 - 30; t += per) {
    tr.x.push(kf(t, x, "easeOutQuad"), kf(t + per, x + ddx * u, "linear"));
    tr.y.push(kf(t, y, "easeOutQuad"), kf(t + per, y + ddy * u, "linear"));
    tr.opacity.push(kf(t, 0, "easeOutQuad"), kf(t + per * 0.26, ro, "linear"), kf(t + per * 0.66, ro, "easeInQuad"), kf(t + per, 0, "linear"));
    tr.scale.push(kf(t, o.s0 != null ? o.s0 : 0.55, "easeOutQuad"), kf(t + per * 0.3, 1, "linear"));
  }
  tr.x.push(kf(t1, x, "linear")); tr.y.push(kf(t1, y, "linear"));
  tr.opacity.push(kf(t1, 0, "linear")); tr.scale.push(kf(t1, 1, "linear"));
  return tr;
}
/* ripple loop: scale s0→s1 while fading out (play-button ping) */
function rippleTr(c, s0, s1, per, o = {}) {
  const D = c.D;
  const t0 = o.t0 != null ? o.t0 : 900, t1 = D - EXIT0, ro = o.ro != null ? o.ro : 0.7;
  const tr = { scale: [], opacity: [] };
  for (let t = t0; t + per <= t1 - 30; t += per) {
    tr.scale.push(kf(t, s0, "easeOutCubic"), kf(t + per, s1, "linear"));
    tr.opacity.push(kf(t, ro, "easeOutQuad"), kf(t + per, 0, "linear"));
  }
  tr.scale.push(kf(t1, s1, "linear")); tr.opacity.push(kf(t1, 0, "linear"));
  return tr;
}
/* one mid-hold hop: y dips amp box units and settles back (gift lid pop) */
function hopTr(c, y, amp, tm) {
  return { y: [kf(tm, y, "easeOutBack"), kf(tm + 190, y + amp * c.u, "easeInOutSine"), kf(tm + 520, y, "linear")] };
}

/* ============================================================
   EMOJI COMPOSERS — one shared face language. All generate spec
   arrays in the 100-box; the face is a 74-unit circle at (0,−1).
   ============================================================ */
/* face: warm bottom-rim shade twin + base + top-left light blob */
const faceBase = (c, j, a = {}) => [
  L("ellipse", 0, 2.1, 74, 74, { fill: c.faceShade || lerpColor(c.color, "#E8871E", 0.45) }, { j, ...a }),
  L("ellipse", 0, -1.1, 74, 74, { fill: c.color }, { j, ...a }),
  L("ellipse", -15, -24, 27, 12, { fill: PURE, op: 0.2, rot: -22 }, { j: j + 1, ...a }),
];
const cheeks = (c, j, dy = 8) => [
  L("ellipse", -21.5, dy, 10, 6.5, { fill: CHEEK, op: 0.5 }, { j }),
  L("ellipse", 21.5, dy, 10, 6.5, { fill: CHEEK, op: 0.5 }, { j }),
];
/* dot eyes; o.blink adds closed lids + a mid-hold blink crossfade */
const dotEyes = (c, j, dy = -9, o = {}) => {
  const w = o.w || 7.5, h = o.h || 10, dx = o.dx || 13.5;
  const tb = o.tb || Math.round(c.D * 0.52);
  const pair = o.blink ? blinkTr(c.D, tb) : null;
  const parts = [];
  [-dx, dx].forEach((x, i) => {
    parts.push(L("ellipse", x, dy, w, h, { fill: FEAT }, { j: j + i, hold: o.hold, tr: pair ? { opacity: pair.open } : undefined }));
    if (pair) parts.push(L("ellipse", x, dy + 2.5, w + 2.5, 5, { fill: FEAT }, { j: j + i, in: "none", out: false, tr: { opacity: pair.closed } }));
  });
  return parts;
};
/* happy closed eyes ∩∩ (dark arc = ellipse + face cover below) */
const arcEyes = (c, j, dy = -9, o = {}) => [-13.5, 13.5].flatMap((x, i) => [
  L("ellipse", x, dy, 11, 9, { fill: FEAT }, { j: j + i, hold: o.hold }),
  L("ellipse", x, dy + 5, 12.5, 10, { fill: c.color }, { j: j + i, hold: o.hold }),
]);
/* calm shut eyes ∪∪ */
const shutEyes = (c, j, dy = -7, o = {}) => [-13.5, 13.5].flatMap((x, i) => [
  L("ellipse", x, dy, 11, 8, { fill: FEAT }, { j: j + i, hold: o.hold }),
  L("ellipse", x, dy - 4.5, 12.5, 9, { fill: c.color }, { j: j + i, hold: o.hold }),
]);
/* smile crescent (dark ellipse + face cover above) */
const smileM = (c, j, dy = 13, o = {}) => [
  L("ellipse", 0, dy - 5, 30, 23, { fill: FEAT }, { j, hold: o.hold }),
  L("ellipse", 0, dy - 12, 34, 24, { fill: c.color }, { j, hold: o.hold }),
];
/* grin: open mouth with a teeth band */
const grinM = (c, j, dy = 14, o = {}) => [
  L("ellipse", 0, dy - 3, 33, 25, { fill: FEAT }, { j, hold: o.hold }),
  L("rect", 0, dy - 1, 25, 8, { fill: PURE, cr: 30 }, { j, hold: o.hold }),
  L("ellipse", 0, dy - 12, 37, 24, { fill: c.color }, { j, hold: o.hold }),
];
/* laugh: open mouth with tongue */
const laughM = (c, j, dy = 14, o = {}) => [
  L("ellipse", 0, dy - 2, 33, 26, { fill: FEAT }, { j, hold: o.hold }),
  L("ellipse", 0, dy + 5, 20, 12, { fill: TONGUE_C }, { j, hold: o.hold }),
  L("ellipse", 0, dy - 12, 37, 24, { fill: c.color }, { j, hold: o.hold }),
];
/* frown ∩ (dark ellipse + face cover below) */
const frownM = (c, j, dy = 12, o = {}) => [
  L("ellipse", 0, dy + 9, 24, 15, { fill: FEAT }, { j, hold: o.hold }),
  L("ellipse", 0, dy + 15.5, 27, 14, { fill: c.color }, { j, hold: o.hold }),
];
/* smirk: off-center shallow crescent */
const smirkM = (c, j, dy = 14, o = {}) => [
  L("ellipse", 4, dy - 4, 26, 20, { fill: FEAT }, { j, hold: o.hold }),
  L("ellipse", 4, dy - 11, 30, 21, { fill: c.color }, { j, hold: o.hold }),
];
const flatM = (c, j, dy = 14) => [L("rect", 0, dy, 21, 4.5, { fill: FEAT, cr: 49 }, { j })];
const oMouth = (c, j, dy = 15, w = 11, h = 13, o = {}) => [L("ellipse", 0, dy, w, h, { fill: FEAT }, { j, hold: o.hold })];
/* brows */
const brow = (j, dx, dy, rot, o = {}) => L("rect", dx, dy, o.w || 13, o.h || 3.6, { fill: FEAT, cr: 49, rot }, { j, hold: o.hold });
const angryBrows = (j, dy = -19) => [brow(j, -12, dy, 24, { h: 4.4 }), brow(j + 1, 12, dy, -24, { h: 4.4 })];
const sadBrows = (j, dy = -20) => [brow(j, -12, dy, -22), brow(j + 1, 12, dy, 22)];
/* composed teardrop (round bulb + pointy top), pointing up */
const dropS = (j, dx, dy, s, fill, o = {}) => [
  L("ellipse", dx, dy + 2.4 * s, 7.4 * s, 7.4 * s, { fill, rot: o.rot }, { j, ...o }),
  L("triangle", dx, dy - 2.4 * s, 6.2 * s, 6.8 * s, { fill, rot: o.rot }, { j, ...o }),
];

/* ============================================================
   ICON ART SPECS — one function per icon: (c) => spec[].
   c = { color, shade, light, dark, D, u, g } (resolved per build).
   ============================================================ */

/* ---------- EMOJI (20) ---------- */
const specSmile = (c) => [
  LG("Smile idle", [
    ...faceBase(c, 0),
    ...dotEyes(c, 2, -9, { blink: true }),
    ...smileM(c, 4),
    ...cheeks(c, 5),
  ], { hold: { type: "bob", amp: 2, period: 1400 } }),
];
const specLaugh = (c) => [
  LG("Laugh rock", [
    ...faceBase(c, 0),
    ...arcEyes(c, 2),
    ...grinM(c, 4),
    ...cheeks(c, 5),
  ], { hold: { type: "rock", amp: 3.5, period: 620 } }),
];
const specLaughTears = (c) => [
  ...faceBase(c, 0),
  ...arcEyes(c, 2),
  ...laughM(c, 4),
  ...cheeks(c, 5),
  /* tears fly off both sides, looped */
  ...dropS(6, -25, -10, 1.15, TEAR_C, { in: "none", out: false, rot: 30, tr: driftTr(c, -25, -10, -11, -7, 900) }),
  ...dropS(7, 25, -10, 1.15, TEAR_C, { in: "none", out: false, rot: -30, tr: driftTr(c, 25, -10, 11, -7, 900, { phase: 450 }) }),
];
const specLoveEyes = (c) => [
  ...faceBase(c, 0),
  L("heart", -13.5, -9, 14, 13, { fill: PINK }, { j: 2, hold: { type: "heartbeat", period: 940 } }),
  L("heart", 13.5, -9, 14, 13, { fill: PINK }, { j: 3, hold: { type: "heartbeat", period: 940 } }),
  ...smileM(c, 4),
  ...cheeks(c, 5),
];
const specStarStruck = (c) => [
  ...faceBase(c, 0),
  L("star", -13.5, -9, 15, 15, { fill: GOLD }, { j: 2, hold: { type: "spin", turns: 1 } }),
  L("star", 13.5, -9, 15, 15, { fill: GOLD }, { j: 3, hold: { type: "spin", turns: 1 } }),
  ...laughM(c, 4),
  ...cheeks(c, 5),
];
const specWink = (c) => [
  ...faceBase(c, 0),
  /* left dot eye blinks, right eye is a static wink arc */
  L("ellipse", -13.5, -9, 7.5, 10, { fill: FEAT }, { j: 2, tr: { opacity: blinkTr(c.D, Math.round(c.D * 0.52)).open } }),
  L("ellipse", -13.5, -6.5, 10, 5, { fill: FEAT }, { j: 2, in: "none", out: false, tr: { opacity: blinkTr(c.D, Math.round(c.D * 0.52)).closed } }),
  L("ellipse", 13.5, -9, 11, 9, { fill: FEAT }, { j: 3 }),
  L("ellipse", 13.5, -4.5, 12.5, 10, { fill: c.color }, { j: 3 }),
  brow(4, 13, -19, -14),
  ...smirkM(c, 5),
  ...cheeks(c, 6, 9),
];
const specParty = (c) => [
  ...faceBase(c, 0),
  ...arcEyes(c, 2),
  ...laughM(c, 4),
  /* party hat */
  L("triangle", 6, -38, 26, 30, { fill: BLUE, rot: 12 }, { j: 6, hold: { type: "bob", amp: 2.5, period: 900 } }),
  L("rect", 6, -34, 21, 4, { fill: PURE, cr: 49, rot: 12 }, { j: 7 }),
  L("rect", 7, -42, 13, 4, { fill: GOLD, cr: 49, rot: 12 }, { j: 7 }),
  L("ellipse", 9.5, -53, 9, 9, { fill: PINK }, { j: 8, hold: { type: "bob", amp: 3, period: 900 } }),
  /* confetti bits drift up */
  L("rect", -30, -24, 6, 6, { fill: GOLD, rot: 24 }, { j: 9, in: "none", out: false, tr: driftTr(c, -30, -24, -4, -14, 1100) }),
  L("ellipse", 32, -16, 5.5, 5.5, { fill: MINT }, { j: 10, in: "none", out: false, tr: driftTr(c, 32, -16, 4, -16, 1250, { phase: 380 }) }),
  L("rect", -36, 2, 5, 5, { fill: PINK, rot: -18 }, { j: 11, in: "none", out: false, tr: driftTr(c, -36, 2, -5, -15, 1000, { phase: 700 }) }),
];
const specCry = (c) => [
  ...faceBase(c, 0),
  ...sadBrows(2),
  ...dotEyes(c, 3, -8),
  ...frownM(c, 4),
  /* big tears welling + falling from each eye */
  ...dropS(5, -13.5, 2, 1.25, TEAR_C, { in: "none", out: false, tr: driftTr(c, -13.5, 2, 0, 24, 1150) }),
  ...dropS(6, 13.5, 2, 1.25, TEAR_C, { in: "none", out: false, tr: driftTr(c, 13.5, 2, 0, 24, 1150, { phase: 560 }) }),
];
const specSad = (c) => [
  LG("Sad droop", [
    ...faceBase(c, 0),
    ...sadBrows(2),
    ...dotEyes(c, 3, -8),
    ...frownM(c, 4),
  ], { hold: { type: "bob", amp: 2.5, period: 1500 } }),
];
const specAngry = (c) => {
  const tm = Math.round(c.D * 0.5);
  return [
    ...faceBase(c, 0, { tr: { fill: [kf(tm, c.color, "easeInOutSine"), kf(tm + 320, lerpColor(c.color, "#FF4D3D", 0.28), "easeInOutSine"), kf(tm + 760, c.color, "linear")] } }),
    ...angryBrows(2),
    ...dotEyes(c, 3, -7, { h: 8.5 }),
    ...frownM(c, 4),
    L("cross", 27, -26, 12, 12, { fill: RED, rot: 45 }, { j: 5, hold: { type: "pulse", amp: 1.18, period: 620 } }),
  ];
};
const specSurprised = (c) => [
  ...faceBase(c, 0),
  brow(2, -13, -21, -6), brow(3, 13, -21, 6),
  ...dotEyes(c, 4, -9, { w: 9.5, h: 12, hold: { type: "pulse", amp: 1.08, period: 900 } }),
  L("ellipse", -16, -12, 3, 3, { fill: PURE, op: 0.85 }, { j: 5, hold: { type: "pulse", amp: 1.08, period: 900 } }),
  L("ellipse", 11, -12, 3, 3, { fill: PURE, op: 0.85 }, { j: 5, hold: { type: "pulse", amp: 1.08, period: 900 } }),
  ...oMouth(c, 6, 15, 12, 14, { hold: { type: "pulse", amp: 1.14, period: 900 } }),
];
const specNeutral = (c) => [
  LG("Neutral idle", [
    ...faceBase(c, 0),
    ...dotEyes(c, 2, -9, { blink: true }),
    ...flatM(c, 4),
  ], { hold: { type: "bob", amp: 1.8, period: 1500 } }),
];
const specSleepy = (c) => [
  ...faceBase(c, 0),
  ...shutEyes(c, 2),
  ...oMouth(c, 4, 16, 7, 8),
  /* snot bubble */
  L("ellipse", 19, 6, 13, 13, { fill: "#BFE8FF", op: 0.9 }, { j: 5, hold: { type: "pulse", amp: 1.22, period: 1150 } }),
  L("ellipse", 13.5, 11, 5, 5, { fill: "#BFE8FF", op: 0.9 }, { j: 5, hold: { type: "pulse", amp: 1.22, period: 1150 } }),
  /* floating Z's */
  LT("Z", 24, -18, 11, { fill: "#7FC4FF", fw: 800 }, { j: 6, in: "none", out: false, tr: driftTr(c, 24, -18, 7, -12, 1400, { ro: 0.95 }) }),
  LT("Z", 32, -28, 14, { fill: "#7FC4FF", fw: 800 }, { j: 7, in: "none", out: false, tr: driftTr(c, 32, -28, 8, -13, 1400, { phase: 460, ro: 0.95 }) }),
  LT("Z", 41, -39, 17, { fill: "#7FC4FF", fw: 800 }, { j: 8, in: "none", out: false, tr: driftTr(c, 41, -39, 8, -13, 1400, { phase: 920, ro: 0.95 }) }),
];
const specCool = (c) => [
  ...faceBase(c, 0),
  /* sunglasses */
  L("rect", -12.5, -9, 19, 13, { fill: NAVY, cr: 40 }, { j: 2 }),
  L("rect", 12.5, -9, 19, 13, { fill: NAVY, cr: 40 }, { j: 3 }),
  L("rect", 0, -10.5, 8, 3.5, { fill: NAVY, cr: 49 }, { j: 4 }),
  L("rect", -24.5, -11, 6, 3, { fill: NAVY, cr: 49, rot: 14 }, { j: 4 }),
  L("rect", 24.5, -11, 6, 3, { fill: NAVY, cr: 49, rot: -14 }, { j: 4 }),
  /* glint sweeping the left lens */
  L("rect", -15, -9, 2.6, 9, { fill: PURE, op: 0.85, rot: 22 }, { j: 5, in: "none", out: false, tr: driftTr(c, -15, -9, 7, 0, 1500, { ro: 0.9 }) }),
  ...smirkM(c, 6),
  ...cheeks(c, 7, 10),
];
const specAngel = (c) => [
  ...faceBase(c, 0),
  ...arcEyes(c, 2),
  ...smileM(c, 4),
  ...cheeks(c, 5),
  L("ellipse", 0, -43, 30, 9.5, { fill: "none", fm: "stroke", sC: GOLD, sW: 5 }, { j: 6, hold: { type: "bob", amp: 3, period: 1300 } }),
];
const specDevil = (c) => {
  c.faceShade = tone(c.color, -0.28);
  return [
    LG("Devil sway", [
      ...faceBase(c, 0),
      L("triangle", -20, -33, 13, 17, { fill: "#D64545", rot: -16 }, { j: 1, hold: { type: "pulse", amp: 1.08, period: 1100 } }),
      L("triangle", 20, -33, 13, 17, { fill: "#D64545", rot: 16 }, { j: 2, hold: { type: "pulse", amp: 1.08, period: 1100 } }),
      brow(3, -12, -18, 16), brow(4, 12, -18, -16),
      ...dotEyes(c, 5, -8, { h: 8.5 }),
      ...smirkM(c, 6),
    ], { hold: { type: "rock", amp: 2.5, period: 1100 } }),
  ];
};
const specTongueOut = (c) => [
  ...faceBase(c, 0),
  ...dotEyes(c, 2, -10, { blink: true }),
  /* tongue sticks out below the smile */
  L("rect", 3, 25, 13, 17, { fill: TONGUE_C, cr: 45 }, { j: 3, hold: { type: "rock", amp: 7, period: 700 } }),
  L("ellipse", 0, 13, 30, 22, { fill: FEAT }, { j: 4 }),
  L("ellipse", 0, 6, 34, 22, { fill: c.color }, { j: 4 }),
];
const specSick = (c) => {
  c.faceShade = tone(c.color, -0.22);
  return [
    ...faceBase(c, 0),
    ...shutEyes(c, 2, -8),
    /* queasy squiggle mouth: two small ∩ arcs side by side */
    L("ellipse", -6, 18, 12, 8, { fill: FEAT }, { j: 4 }),
    L("ellipse", -6, 22.5, 13, 8, { fill: c.color }, { j: 4 }),
    L("ellipse", 7, 18.5, 12, 8, { fill: FEAT }, { j: 4 }),
    L("ellipse", 7, 23, 13, 8, { fill: c.color }, { j: 4 }),
    /* cold sweat drop sliding down the temple */
    ...dropS(5, 27, -16, 1.05, TEAR_C, { in: "none", out: false, tr: driftTr(c, 27, -16, 0, 13, 1500, { ro: 0.9 }) }),
  ];
};
const specWorried = (c) => [
  ...faceBase(c, 0),
  brow(2, -13, -20, 2), brow(3, 13, -21, -14),
  ...dotEyes(c, 4, -9, { hold: { type: "sway", amp: 2, period: 850 } }),
  ...frownM(c, 5, 13),
  ...dropS(6, 27, -15, 1.05, TEAR_C, { in: "none", out: false, tr: driftTr(c, 27, -15, 0, 13, 1350, { ro: 0.9 }) }),
];
const specMindBlown = (c) => [
  ...faceBase(c, 0),
  ...dotEyes(c, 2, -7, { w: 6, h: 8 }),
  ...oMouth(c, 4, 16, 9, 11),
  /* the blast where the crown was */
  L("star", 0, -42, 34, 34, { fill: ORANGE }, { j: 5, hold: { type: "pulse", amp: 1.14, period: 640 } }),
  L("star", 0, -42, 20, 20, { fill: GOLD, rot: 18 }, { j: 6, hold: { type: "pulse", amp: 1.22, period: 820 } }),
  L("ellipse", -18, -50, 6, 6, { fill: ORANGE }, { j: 7, in: "none", out: false, tr: driftTr(c, -18, -50, -6, -12, 1050) }),
  L("ellipse", 17, -54, 5, 5, { fill: GOLD }, { j: 8, in: "none", out: false, tr: driftTr(c, 17, -54, 6, -12, 900, { phase: 420 }) }),
  L("ellipse", 0, -62, 4.5, 4.5, { fill: PURE }, { j: 9, in: "none", out: false, tr: driftTr(c, 0, -62, 0, -12, 1150, { phase: 700 }) }),
];

/* ---------- REACTIONS (9) ---------- */
const specHeart = (c) => [
  L("heart", 0, 2.5, 64, 60, { fill: tone(c.color, -0.28) }, { j: 0, hold: { type: "heartbeat", period: 940 } }),
  L("heart", 0, -1, 64, 60, { fill: c.color }, { j: 0, hold: { type: "heartbeat", period: 940 } }),
  L("ellipse", -14, -15, 20, 10, { fill: PURE, op: 0.28, rot: -25 }, { j: 1, hold: { type: "heartbeat", period: 940 } }),
  L("cross", 20, -18, 8, 8, { fill: PURE }, { j: 2, hold: { type: "blink", period: 1450 } }),
];
const specThumbsUp = (c) => [
  L("rect", -25, 12, 13, 30, { fill: BLUE, cr: 25 }, { j: 0 }),
  L("rect", -24, 14, 13, 30, { fill: tone(BLUE, -0.22), cr: 25, op: 0.55 }, { j: 0 }),
  L("rect", 4, 10, 34, 30, { fill: tone(c.color, -0.16), cr: 30 }, { j: 1 }),
  L("rect", 4, 8, 34, 30, { fill: c.color, cr: 30 }, { j: 1 }),
  L("rect", -12, -12, 13, 25, { fill: c.color, cr: 49, rot: -38 }, { j: 2, hold: { type: "bob", amp: 2.5, period: 800 } }),
  L("rect", 13, 2, 14, 3.4, { fill: tone(c.color, -0.3), cr: 49 }, { j: 3 }),
  L("rect", 13, 10, 14, 3.4, { fill: tone(c.color, -0.3), cr: 49 }, { j: 3 }),
  L("rect", 13, 18, 14, 3.4, { fill: tone(c.color, -0.3), cr: 49 }, { j: 3 }),
  L("rect", -8, -30, 3.5, 9, { fill: GOLD, cr: 49, rot: -20 }, { j: 4, hold: { type: "blink", period: 900 } }),
  L("rect", 2, -34, 3.5, 10, { fill: GOLD, cr: 49 }, { j: 5, hold: { type: "blink", period: 1100 } }),
  L("rect", 12, -30, 3.5, 9, { fill: GOLD, cr: 49, rot: 20 }, { j: 6, hold: { type: "blink", period: 1300 } }),
];
const specClap = (c) => {
  const t0 = 720, t1 = c.D - EXIT0, per = 720;
  const clap = (side) => {
    const rot = [], xs = [];
    for (let t = t0; t + per <= t1 + 1; t += per) {
      rot.push(kf(t, 18 * side, "easeOutQuad"), kf(t + per * 0.35, 7 * side, "easeInOutSine"), kf(t + per * 0.7, 18 * side, "linear"));
      xs.push(kf(t, bx(17 * side, c.u), "easeOutQuad"), kf(t + per * 0.35, bx(8 * side, c.u), "easeInOutSine"), kf(t + per * 0.7, bx(17 * side, c.u), "linear"));
    }
    rot.push(kf(t1, 18 * side, "linear")); xs.push(kf(t1, bx(17 * side, c.u), "linear"));
    return { rotation: rot, x: xs };
  };
  const hand = (side, j) => [
    L("rect", 17 * side, 2, 20, 28, { fill: c.color, cr: 40, rot: 18 * side }, { j, tr: clap(side) }),
    L("ellipse", 8 * side, -8, 9, 11, { fill: c.color, rot: 18 * side }, { j, tr: clap(side) }),
    L("rect", 18 * side, 9, 12, 3, { fill: tone(c.color, -0.25), cr: 49, rot: 18 * side }, { j: j + 1, tr: clap(side) }),
  ];
  return [
    ...hand(-1, 0),
    ...hand(1, 2),
    L("rect", -6, -26, 3.5, 9, { fill: GOLD, cr: 49, rot: -24 }, { j: 4, hold: { type: "blink", period: 720 } }),
    L("rect", 0, -29, 3.5, 10, { fill: GOLD, cr: 49 }, { j: 5, hold: { type: "blink", period: 720 } }),
    L("rect", 6, -26, 3.5, 9, { fill: GOLD, cr: 49, rot: 24 }, { j: 6, hold: { type: "blink", period: 720 } }),
  ];
};
const specFire = () => {
  const sway = { type: "sway", amp: 2, period: 900 };
  return [
    L("ellipse", 0, 6, 44, 44, { fill: ORANGE }, { j: 0, hold: sway }),
    L("triangle", 0, -16, 30, 38, { fill: ORANGE }, { j: 0, hold: sway }),
    L("ellipse", 0, 9, 29, 29, { fill: "#FFB64A" }, { j: 0, hold: { type: "flicker", seed: 5 } }),
    L("triangle", 0, -6, 19, 26, { fill: "#FFB64A" }, { j: 0, hold: { type: "flicker", seed: 5 } }),
    L("ellipse", 0, 12, 15, 15, { fill: GOLD }, { j: 0, hold: { type: "flicker", seed: 9 } }),
    L("triangle", 0, 4, 9, 15, { fill: GOLD }, { j: 0, hold: { type: "flicker", seed: 9 } }),
  ];
};
const specStarBadge = (c) => [
  L("star", 0, 2, 62, 62, { fill: tone(c.color, -0.25) }, { j: 0, hold: { type: "pulse", amp: 1.06, period: 820 } }),
  L("star", 0, -1, 62, 62, { fill: c.color }, { j: 0, hold: { type: "pulse", amp: 1.06, period: 820 } }),
  L("ellipse", -11, -14, 16, 9, { fill: PURE, op: 0.3, rot: -25 }, { j: 1, hold: { type: "pulse", amp: 1.06, period: 820 } }),
  L("cross", 25, -20, 8, 8, { fill: PURE }, { j: 2, hold: { type: "blink", period: 1100 } }),
  L("cross", -26, 12, 6, 6, { fill: PURE, op: 0.8 }, { j: 3, hold: { type: "blink", period: 1400 } }),
];
const specHundred = (c) => [
  LT("100", 0, -8, 36, { fill: c.color, fw: 800, ff: "Archivo Black" }, { j: 0, hold: { type: "bob", amp: 3.5, period: 1000 } }),
  L("rect", 0, 17, 46, 5.5, { fill: c.color, cr: 49 }, { j: 1, hold: { type: "bob", amp: 3.5, period: 1000 } }),
  L("rect", 0, 25, 46, 5.5, { fill: tone(c.color, -0.25), cr: 49 }, { j: 2, hold: { type: "bob", amp: 3.5, period: 1000 } }),
];
const specMuscles = (c) => [
  /* flexed arm 💪: upper arm horizontal, forearm + fist rise on the right */
  L("rect", 0, 15, 48, 18, { fill: tone(c.color, -0.18), cr: 45 }, { j: 0 }),
  L("rect", 0, 13, 48, 18, { fill: c.color, cr: 45 }, { j: 0 }),
  L("ellipse", 8, 2, 17, 15, { fill: c.color }, { j: 1, hold: { type: "pulse", amp: 1.08, period: 900 } }),
  L("rect", 19, -10, 17, 30, { fill: c.color, cr: 45 }, { j: 2, hold: { type: "rock", amp: 3, period: 900 } }),
  L("ellipse", 19, -27, 16, 15, { fill: c.color }, { j: 3, hold: { type: "rock", amp: 3, period: 900 } }),
  L("rect", 19, -28, 9, 2.6, { fill: tone(c.color, -0.28), cr: 49 }, { j: 4, hold: { type: "rock", amp: 3, period: 900 } }),
  L("rect", 19, -23.5, 9, 2.6, { fill: tone(c.color, -0.28), cr: 49 }, { j: 4, hold: { type: "rock", amp: 3, period: 900 } }),
  L("ellipse", 12, 9, 7, 10, { fill: tone(c.color, -0.24), op: 0.55, rot: -15 }, { j: 5 }),
  L("ellipse", 6, -2, 9, 5, { fill: PURE, op: 0.3, rot: -18 }, { j: 6 }),
];
const specBrokenHeart = (c) => [
  L("heart", 0, 2.5, 62, 58, { fill: tone(c.color, -0.32) }, { j: 0, hold: { type: "rock", amp: 3, period: 1300 } }),
  L("heart", 0, -1, 62, 58, { fill: c.color }, { j: 0, hold: { type: "rock", amp: 3, period: 1300 } }),
  L("bolt", 1, -1, 18, 34, { fill: tone(c.color, -0.55), rot: 6 }, { j: 1, hold: { type: "blink", period: 1600 } }),
  L("heart", -25, -18, 10, 9, { fill: c.color, rot: -18 }, { j: 2, in: "none", out: false, tr: driftTr(c, -25, -18, -7, -9, 1250, { ro: 0.85 }) }),
  L("heart", 25, -22, 8, 7.5, { fill: tone(c.color, -0.2), rot: 16 }, { j: 3, in: "none", out: false, tr: driftTr(c, 25, -22, 7, -9, 1100, { phase: 500, ro: 0.85 }) }),
];
const specPartyPopper = (c) => [
  L("triangle", -8, 16, 30, 36, { fill: c.color, rot: -38 }, { j: 0, hold: { type: "rock", amp: 4, period: 900 } }),
  L("rect", -8, 12, 20, 4.5, { fill: GOLD, cr: 49, rot: -38 }, { j: 1, hold: { type: "rock", amp: 4, period: 900 } }),
  L("rect", -11, 22, 14, 4.5, { fill: PURE, cr: 49, rot: -38 }, { j: 1, hold: { type: "rock", amp: 4, period: 900 } }),
  L("star", 12, -14, 13, 13, { fill: GOLD }, { j: 2, in: "none", out: false, tr: driftTr(c, 12, -14, 10, -10, 1150) }),
  L("rect", 20, -2, 6, 6, { fill: BLUE, rot: 20 }, { j: 3, in: "none", out: false, tr: driftTr(c, 20, -2, 13, -7, 950, { phase: 300 }) }),
  L("ellipse", 4, -22, 6, 6, { fill: PINK }, { j: 4, in: "none", out: false, tr: driftTr(c, 4, -22, 4, -13, 1050, { phase: 620 }) }),
  L("rect", 28, -16, 5, 5, { fill: MINT, rot: -20 }, { j: 5, in: "none", out: false, tr: driftTr(c, 28, -16, 11, -9, 1250, { phase: 850 }) }),
  L("ellipse", 14, 2, 5, 5, { fill: GOLD }, { j: 6, in: "none", out: false, tr: driftTr(c, 14, 2, 15, -4, 880, { phase: 150 }) }),
];

/* ---------- OBJECTS (8) ---------- */
const specBell = (c) => [
  LG("Bell swing", [
    L("ellipse", 0, -27, 9, 8, { fill: tone(c.color, -0.2) }, { j: 0 }),
    L("ellipse", 0, -4, 38, 36, { fill: tone(c.color, -0.22) }, { j: 0 }),
    L("ellipse", 0, -6, 38, 36, { fill: c.color }, { j: 0 }),
    L("rect", 0, 14, 48, 17, { fill: tone(c.color, -0.22), cr: 40 }, { j: 1 }),
    L("rect", 0, 12, 48, 17, { fill: c.color, cr: 40 }, { j: 1 }),
    L("ellipse", -9, -14, 12, 16, { fill: PURE, op: 0.25, rot: -18 }, { j: 2 }),
    L("ellipse", 0, 26, 12, 12, { fill: "#E8890C" }, { j: 3, hold: { type: "sway", amp: 3, period: 760 } }),
  ], { hold: { type: "rock", amp: 6, period: 760 } }),
  L("rect", -33, -12, 3.6, 10, { fill: GOLD, cr: 49, rot: -32 }, { j: 4, hold: { type: "blink", period: 780 } }),
  L("rect", -36, 2, 3.6, 10, { fill: GOLD, cr: 49, rot: -68 }, { j: 5, hold: { type: "blink", period: 920 } }),
  L("rect", 33, -12, 3.6, 10, { fill: GOLD, cr: 49, rot: 32 }, { j: 6, hold: { type: "blink", period: 780 } }),
  L("rect", 36, 2, 3.6, 10, { fill: GOLD, cr: 49, rot: 68 }, { j: 7, hold: { type: "blink", period: 920 } }),
];
const specGift = (c) => [
  L("rect", 0, 13, 46, 32, { fill: tone(c.color, -0.24), cr: 14 }, { j: 0 }),
  L("rect", 0, 11, 46, 32, { fill: c.color, cr: 14 }, { j: 0 }),
  L("rect", 0, 11, 10, 32, { fill: GOLD }, { j: 1 }),
  LG("Lid pop", [
    L("rect", 0, -9, 54, 15, { fill: tone(c.color, -0.24), cr: 18 }, { j: 2 }),
    L("rect", 0, -11, 54, 15, { fill: c.color, cr: 18 }, { j: 2 }),
    L("rect", 0, -11, 10, 15, { fill: GOLD }, { j: 3 }),
    L("ellipse", -8, -24, 14, 9, { fill: GOLD, rot: -28 }, { j: 4, hold: { type: "pulse", amp: 1.1, period: 720 } }),
    L("ellipse", 8, -24, 14, 9, { fill: GOLD, rot: 28 }, { j: 4, hold: { type: "pulse", amp: 1.1, period: 720 } }),
    L("ellipse", 0, -21, 7, 6, { fill: tone(GOLD, -0.25) }, { j: 5 }),
  ], { tr: hopTr(c, by(0, c.u), -7, Math.round(c.D * 0.55)) }),
];
const specTrophy = (c) => [
  L("ellipse", -25, -10, 17, 19, { fill: "none", fm: "stroke", sC: tone(c.color, -0.15), sW: 5.5 }, { j: 0 }),
  L("ellipse", 25, -10, 17, 19, { fill: "none", fm: "stroke", sC: tone(c.color, -0.15), sW: 5.5 }, { j: 0 }),
  L("rect", 0, -6, 40, 32, { fill: tone(c.color, -0.22), cr: 28 }, { j: 1 }),
  L("rect", 0, -8, 40, 32, { fill: c.color, cr: 28 }, { j: 1 }),
  L("star", 0, -9, 14, 14, { fill: PURE, op: 0.92 }, { j: 2 }),
  L("rect", 0, 14, 10, 13, { fill: tone(c.color, -0.15) }, { j: 3 }),
  L("rect", 0, 25, 32, 9, { fill: tone(c.color, -0.28), cr: 25 }, { j: 4 }),
  L("rect", -4, -8, 3.6, 22, { fill: PURE, op: 0.55, rot: 18 }, { j: 5, in: "none", out: false, tr: driftTr(c, -10, -8, 18, 0, 1600, { ro: 0.55 }) }),
];
const specRocket = (c) => {
  const hover = { type: "bob", amp: 4, period: 1100 };
  return [
    L("ellipse", 0, 36, 19, 19, { fill: ORANGE }, { j: 0, hold: { type: "flicker", seed: 6 } }),
    L("triangle", 0, 33, 13, 17, { fill: ORANGE, rot: 180 }, { j: 0, hold: { type: "flicker", seed: 6 } }),
    L("ellipse", 0, 37, 10, 10, { fill: GOLD }, { j: 0, hold: { type: "flicker", seed: 12 } }),
    L("triangle", 0, 34, 7, 10, { fill: GOLD, rot: 180 }, { j: 0, hold: { type: "flicker", seed: 12 } }),
    L("triangle", -17, 18, 15, 19, { fill: RED, rot: -90 }, { j: 1 }),
    L("triangle", 17, 18, 15, 19, { fill: RED, rot: 90 }, { j: 2 }),
    L("rect", 0, 0, 26, 52, { fill: tone(c.color, -0.32), cr: 45 }, { j: 3, hold: hover }),
    L("rect", 0, -2, 26, 52, { fill: c.color, cr: 45 }, { j: 3, hold: hover }),
    L("triangle", 0, -31, 26, 17, { fill: RED }, { j: 4, hold: hover }),
    L("ellipse", 0, -10, 14, 14, { fill: tone(c.color, -0.35) }, { j: 5, hold: hover }),
    L("ellipse", 0, -10, 9.5, 9.5, { fill: BLUE }, { j: 6, hold: hover }),
    L("ellipse", -2, -12, 3, 3, { fill: PURE, op: 0.85 }, { j: 7, hold: hover }),
  ];
};
const specLightning = (c) => [
  L("bolt", 1.5, 2, 46, 64, { fill: tone(c.color, -0.3) }, { j: 0, hold: { type: "pulse", amp: 1.05, period: 700 } }),
  L("bolt", 0, -1, 46, 64, { fill: c.color }, { j: 0, hold: { type: "flicker", seed: 11 } }),
  L("ellipse", -7, -17, 8, 15, { fill: PURE, op: 0.4, rot: 14 }, { j: 1 }),
];
const specCoffee = (c) => [
  L("rect", 0, 27, 54, 8, { fill: tone(c.color, -0.3), cr: 49 }, { j: 0 }),
  L("ellipse", 24, 5, 14, 17, { fill: "none", fm: "stroke", sC: tone(c.color, -0.38), sW: 5 }, { j: 1 }),
  L("rect", 0, 7, 42, 34, { fill: tone(c.color, -0.34), cr: 18 }, { j: 2 }),
  L("rect", 0, 5, 42, 34, { fill: c.color, cr: 18 }, { j: 2 }),
  L("ellipse", 0, -9, 34, 11, { fill: "#8A5A3B" }, { j: 3 }),
  L("ellipse", 0, -10, 34, 10, { fill: "#A06A42" }, { j: 3 }),
  L("rect", -6, -24, 4.5, 13, { fill: PURE, cr: 49, rot: -8 }, { j: 4, in: "none", out: false, tr: driftTr(c, -6, -24, -2, -13, 1500, { ro: 0.75 }) }),
  L("rect", 7, -27, 4.5, 13, { fill: PURE, cr: 49, rot: 8 }, { j: 5, in: "none", out: false, tr: driftTr(c, 7, -27, 2, -13, 1500, { phase: 700, ro: 0.75 }) }),
];
const specGem = (c) => {
  const rock = { type: "rock", amp: 3, period: 1400 };
  return [
    L("diamond", 0, 4, 56, 48, { fill: tone(c.color, -0.25) }, { j: 0, hold: rock }),
    L("diamond", 0, 1, 56, 48, { fill: c.color }, { j: 0, hold: rock }),
    L("diamond", 0, -10, 30, 20, { fill: tone(c.color, 0.32), op: 0.85 }, { j: 1, hold: rock }),
    L("rect", -9, 2, 3, 26, { fill: PURE, op: 0.4, cr: 49, rot: 28 }, { j: 2, hold: rock }),
    L("rect", 11, 0, 3, 30, { fill: PURE, op: 0.28, cr: 49, rot: -32 }, { j: 2, hold: rock }),
    L("cross", 25, -18, 9, 9, { fill: PURE }, { j: 3, hold: { type: "blink", period: 1200 } }),
    L("cross", -24, 16, 6.5, 6.5, { fill: PURE, op: 0.85 }, { j: 4, hold: { type: "blink", period: 1500 } }),
  ];
};
const specBalloon = (c) => {
  const bob = { type: "bob", amp: 6, period: 1400 };
  return [
    L("rect", 0, 36, 2.6, 22, { fill: tone(c.color, -0.45), cr: 49 }, { j: 0, hold: { type: "rock", amp: 8, period: 1300 } }),
    L("triangle", 0, 22, 10, 8, { fill: tone(c.color, -0.3), rot: 180 }, { j: 1, hold: bob }),
    L("ellipse", 0, -6, 45, 53, { fill: tone(c.color, -0.26) }, { j: 2, hold: bob }),
    L("ellipse", 0, -8, 45, 53, { fill: c.color }, { j: 2, hold: bob }),
    L("ellipse", -11, -22, 13, 19, { fill: PURE, op: 0.3, rot: -18 }, { j: 3, hold: bob }),
  ];
};

/* ---------- WEATHER / NATURE (6) ---------- */
const specSun = (c) => {
  const kids = [
    L("ellipse", 0, 1.5, 34, 34, { fill: tone(c.color, -0.2) }, { j: 0 }),
    L("ellipse", 0, 0, 34, 34, { fill: c.color }, { j: 0 }),
    L("ellipse", -6, -7, 10, 6, { fill: PURE, op: 0.35, rot: -20 }, { j: 1 }),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    kids.push(L("rect", Math.cos(a) * 28, Math.sin(a) * 28, 12, 5.5, { fill: c.color, cr: 49, rot: i * 45 }, { j: i + 2, stag: 60 }));
  }
  return [LG("Sun rays", kids, { spin: 0.5 })];
};
/* cloud: shade puffs offset down + main puffs (8 layers, one j → one motion) */
const cloudPuffs = (c, j, o = {}) => [
  L("ellipse", -18, 10, 34, 24, { fill: lerpColor(c.color, "#8FA3C8", 0.62) }, { j, hold: o.hold }),
  L("ellipse", 3, 0, 42, 32, { fill: lerpColor(c.color, "#8FA3C8", 0.62) }, { j, hold: o.hold }),
  L("ellipse", 21, 12, 28, 20, { fill: lerpColor(c.color, "#8FA3C8", 0.62) }, { j, hold: o.hold }),
  L("rect", 2, 17, 60, 15, { fill: tone(c.color, -0.3), cr: 49 }, { j, hold: o.hold }),
  L("ellipse", -18, 7, 34, 24, { fill: c.color }, { j, hold: o.hold }),
  L("ellipse", 3, -3, 42, 32, { fill: c.color }, { j, hold: o.hold }),
  L("ellipse", 21, 9, 28, 20, { fill: c.color }, { j, hold: o.hold }),
  L("rect", 2, 14, 60, 15, { fill: c.color, cr: 49 }, { j, hold: o.hold }),
];
const specCloud = (c) => cloudPuffs(c, 0, { hold: { type: "sway", amp: 4, period: 1500 } });
const specRain = (c) => [
  ...cloudPuffs(c, 0),
  ...dropS(1, -15, 27, 1.1, BLUE, { in: "none", out: false, tr: driftTr(c, -15, 27, 0, 17, 850) }),
  ...dropS(2, 1, 29, 1.1, BLUE, { in: "none", out: false, tr: driftTr(c, 1, 29, 0, 17, 850, { phase: 280 }) }),
  ...dropS(3, 16, 27, 1.1, BLUE, { in: "none", out: false, tr: driftTr(c, 16, 27, 0, 17, 850, { phase: 560 }) }),
];
const specRainbow = () => {
  const bob = { type: "bob", amp: 2.5, period: 1300 };
  return [
    L("ellipse", 0, 34, 84, 84, { fill: "none", fm: "stroke", sC: RED, sW: 8 }, { j: 0, in: "rise" }),
    L("ellipse", 0, 34, 66, 66, { fill: "none", fm: "stroke", sC: GOLD, sW: 8 }, { j: 1, in: "rise" }),
    L("ellipse", 0, 34, 48, 48, { fill: "none", fm: "stroke", sC: BLUE, sW: 8 }, { j: 2, in: "rise" }),
    /* cloud bank hides the lower half of the rings */
    L("rect", 0, 40, 92, 26, { fill: "#C7D3E8", cr: 49 }, { j: 3, hold: bob }),
    L("ellipse", -28, 30, 30, 20, { fill: PURE }, { j: 4, hold: bob }),
    L("ellipse", 0, 27, 36, 24, { fill: PURE }, { j: 4, hold: bob }),
    L("ellipse", 28, 30, 30, 20, { fill: PURE }, { j: 4, hold: bob }),
    L("rect", 0, 38, 92, 26, { fill: PURE, cr: 49 }, { j: 4, hold: bob }),
  ];
};
const specMoon = (c) => {
  const bob = { type: "bob", amp: 3, period: 1500 };
  return [
    L("ellipse", 0, 2, 58, 58, { fill: tone(c.color, -0.16) }, { j: 0, hold: bob }),
    L("ellipse", 0, 0, 58, 58, { fill: c.color }, { j: 0, hold: bob }),
    L("ellipse", -12, -10, 11, 11, { fill: tone(c.color, -0.22), op: 0.8 }, { j: 1, hold: bob }),
    L("ellipse", 10, 6, 14, 14, { fill: tone(c.color, -0.22), op: 0.8 }, { j: 1, hold: bob }),
    L("ellipse", -5, 17, 8, 8, { fill: tone(c.color, -0.22), op: 0.8 }, { j: 1, hold: bob }),
    L("star", 29, -23, 9, 9, { fill: GOLD }, { j: 2, hold: { type: "blink", period: 1200 } }),
    L("star", 36, 9, 6.5, 6.5, { fill: GOLD, op: 0.85 }, { j: 3, hold: { type: "blink", period: 1600 } }),
  ];
};
const specStorm = (c) => [
  ...cloudPuffs(c, 0),
  L("bolt", 1, 25, 17, 26, { fill: tone(GOLD, -0.3) }, { j: 1, hold: { type: "flicker", seed: 8 } }),
  L("bolt", 0, 24, 17, 26, { fill: GOLD }, { j: 1, hold: { type: "flicker", seed: 8 } }),
  ...dropS(2, -16, 26, 1, BLUE, { in: "none", out: false, tr: driftTr(c, -16, 26, 0, 15, 900) }),
  ...dropS(3, 16, 26, 1, BLUE, { in: "none", out: false, tr: driftTr(c, 16, 26, 0, 15, 900, { phase: 450 }) }),
];

/* ---------- COMMUNICATION / MEDIA (8) ---------- */
const specChat = (c) => [
  L("triangle", -17, 20, 16, 14, { fill: tone(c.color, -0.2), rot: 180 }, { j: 0 }),
  L("rect", 0, -3, 58, 42, { fill: tone(c.color, -0.2), cr: 30 }, { j: 0 }),
  L("rect", 0, -5, 58, 42, { fill: c.color, cr: 30 }, { j: 0 }),
  L("ellipse", -14, -5, 7.5, 7.5, { fill: PURE }, { j: 1, hold: { type: "bob", amp: -3.5, period: 620 } }),
  L("ellipse", 0, -5, 7.5, 7.5, { fill: PURE }, { j: 2, hold: { type: "bob", amp: -3.5, period: 620 } }),
  L("ellipse", 14, -5, 7.5, 7.5, { fill: PURE }, { j: 3, hold: { type: "bob", amp: -3.5, period: 620 } }),
];
const specMail = (c) => [
  L("rect", 0, 2, 60, 42, { fill: tone(c.color, -0.34), cr: 10 }, { j: 0 }),
  L("rect", 0, 0, 60, 42, { fill: c.color, cr: 10 }, { j: 0 }),
  L("triangle", 0, -8, 58, 26, { fill: tone(c.color, -0.44), rot: 180 }, { j: 1 }),
  L("ellipse", 27, -19, 15, 15, { fill: RED, fm: "both", sC: PURE, sW: 3 }, { j: 2, hold: { type: "pulse", amp: 1.16, period: 900 } }),
];
const specPhone = (c) => {
  const ring = { type: "rock", amp: 7, period: 520 };
  return [
    L("rect", 0, 0, 46, 15, { fill: tone(c.color, -0.22), cr: 49, rot: -45 }, { j: 0, hold: ring }),
    L("rect", 0, -1.5, 46, 15, { fill: c.color, cr: 49, rot: -45 }, { j: 0, hold: ring }),
    L("ellipse", -15, 15, 18, 18, { fill: c.color }, { j: 1, hold: ring }),
    L("ellipse", 15, -15, 18, 18, { fill: c.color }, { j: 2, hold: ring }),
    L("rect", 25, -25, 3.6, 10, { fill: tone(c.color, -0.35), cr: 49, rot: 45 }, { j: 3, hold: { type: "blink", period: 700 } }),
    L("rect", 31, -31, 3.6, 10, { fill: tone(c.color, -0.35), cr: 49, rot: 45, op: 0.7 }, { j: 4, hold: { type: "blink", period: 950 } }),
  ];
};
const specCamera = (c) => {
  const lens = { type: "pulse", amp: 1.07, period: 1100 };
  return [
    L("rect", -13, -21, 18, 10, { fill: tone(c.color, -0.2), cr: 24 }, { j: 0 }),
    L("rect", 0, 3, 60, 42, { fill: tone(c.color, -0.22), cr: 14 }, { j: 0 }),
    L("rect", 0, 1, 60, 42, { fill: c.color, cr: 14 }, { j: 0 }),
    L("ellipse", 2, 1, 30, 30, { fill: PURE }, { j: 1, hold: lens }),
    L("ellipse", 2, 1, 20, 20, { fill: NAVY }, { j: 2, hold: lens }),
    L("ellipse", -3, -4, 6, 6, { fill: PURE, op: 0.85 }, { j: 3, hold: lens }),
    L("ellipse", 21, -13, 6, 6, { fill: tone(c.color, -0.35) }, { j: 4 }),
    L("star", 21, -13, 13, 13, { fill: PURE }, { j: 5, hold: { type: "blink", period: 1700 } }),
  ];
};
const specMusic = (c) => [
  LG("Note groove", [
    L("ellipse", -13, 16, 13, 10, { fill: tone(c.color, -0.22), rot: -18 }, { j: 0 }),
    L("ellipse", -13, 14.5, 13, 10, { fill: c.color, rot: -18 }, { j: 0 }),
    L("rect", -6, -3, 3.6, 36, { fill: c.color }, { j: 1 }),
    L("ellipse", 13, 12, 13, 10, { fill: tone(c.color, -0.22), rot: -18 }, { j: 2 }),
    L("ellipse", 13, 10.5, 13, 10, { fill: c.color, rot: -18 }, { j: 2 }),
    L("rect", 20, -7, 3.6, 36, { fill: c.color }, { j: 3 }),
    L("rect", 7, -25, 29, 6.5, { fill: c.color, cr: 49, rot: -9 }, { j: 4 }),
  ], { hold: { type: "rock", amp: 4, period: 900 } }),
  L("rect", -26, -14, 3.2, 8, { fill: tone(c.color, -0.3), cr: 49, rot: -28 }, { j: 5, hold: { type: "blink", period: 900 } }),
  L("rect", 30, 14, 3.2, 8, { fill: tone(c.color, -0.3), cr: 49, rot: 28 }, { j: 6, hold: { type: "blink", period: 1150 } }),
];
const specPlay = (c) => [
  L("ellipse", 0, 0, 64, 64, { fill: "none", fm: "stroke", sC: c.color, sW: 4 }, { j: 0, in: "none", out: false, tr: rippleTr(c, 0.9, 1.35, 1500, { ro: 0.6 }) }),
  L("ellipse", 0, 2, 64, 64, { fill: tone(c.color, -0.24) }, { j: 1 }),
  L("ellipse", 0, 0, 64, 64, { fill: c.color }, { j: 1 }),
  L("ellipse", -12, -18, 18, 10, { fill: PURE, op: 0.25, rot: -22 }, { j: 2 }),
  L("triangle", 6, 0, 22, 26, { fill: PURE, rot: 90 }, { j: 3, hold: { type: "pulse", amp: 1.09, period: 900 } }),
];
const specMic = (c) => {
  const bob = { type: "bob", amp: 3, period: 1200 };
  return [
    L("rect", 0, 20, 5, 14, { fill: tone(c.color, -0.35) }, { j: 0 }),
    L("rect", 0, 30, 26, 6, { fill: tone(c.color, -0.35), cr: 49 }, { j: 0 }),
    L("rect", -13, 8, 4, 14, { fill: tone(c.color, -0.35), cr: 49, rot: -28 }, { j: 1 }),
    L("rect", 13, 8, 4, 14, { fill: tone(c.color, -0.35), cr: 49, rot: 28 }, { j: 1 }),
    L("rect", 0, -6, 24, 40, { fill: tone(c.color, -0.25), cr: 49 }, { j: 2, hold: bob }),
    L("rect", 0, -8, 24, 40, { fill: c.color, cr: 49 }, { j: 2, hold: bob }),
    L("rect", 0, -16, 14, 3, { fill: PURE, op: 0.45, cr: 49 }, { j: 3, hold: bob }),
    L("rect", 0, -8, 14, 3, { fill: PURE, op: 0.45, cr: 49 }, { j: 3, hold: bob }),
  ];
};
const specVolume = (c) => [
  L("rect", -23, 0, 16, 26, { fill: c.color, cr: 20 }, { j: 0 }),
  L("triangle", -3, 0, 26, 42, { fill: tone(c.color, -0.16), rot: 90 }, { j: 1 }),
  L("rect", 14, 0, 6, 22, { fill: tone(c.color, -0.35), cr: 49 }, { j: 2, hold: { type: "pulse", amp: 1.28, period: 520 } }),
  L("rect", 26, 0, 6, 34, { fill: tone(c.color, -0.35), cr: 49, op: 0.75 }, { j: 3, hold: { type: "pulse", amp: 1.16, period: 760 } }),
];

/* ---------- COMMERCE / MISC (6) ---------- */
const specCart = (c) => {
  const roll = { type: "sway", amp: 4, period: 900 };
  return [
    L("rect", -26, -15, 15, 5, { fill: tone(c.color, -0.3), cr: 49, rot: 24 }, { j: 0 }),
    L("rect", 6, -18, 15, 13, { fill: GOLD, cr: 12 }, { j: 1, hold: { type: "bob", amp: 2.5, period: 800 } }),
    L("rect", 2, -3, 48, 28, { fill: tone(c.color, -0.22), cr: 12 }, { j: 2, hold: roll }),
    L("rect", 2, -5, 48, 28, { fill: c.color, cr: 12 }, { j: 2, hold: roll }),
    L("rect", -6, -5, 3.4, 19, { fill: PURE, op: 0.35, cr: 49 }, { j: 3, hold: roll }),
    L("rect", 10, -5, 3.4, 19, { fill: PURE, op: 0.35, cr: 49 }, { j: 3, hold: roll }),
    L("ellipse", -10, 19, 11, 11, { fill: NAVY }, { j: 4 }),
    L("ellipse", -10, 19, 4.5, 4.5, { fill: PURE, op: 0.85 }, { j: 4 }),
    L("ellipse", 14, 19, 11, 11, { fill: NAVY }, { j: 5 }),
    L("ellipse", 14, 19, 4.5, 4.5, { fill: PURE, op: 0.85 }, { j: 5 }),
  ];
};
const specTag = (c) => [
  LG("Tag dangle", [
    L("diamond", 1.5, 4, 50, 50, { fill: tone(c.color, -0.24) }, { j: 0 }),
    L("diamond", 0, 1, 50, 50, { fill: c.color }, { j: 0 }),
    L("ellipse", -9, -9, 8.5, 8.5, { fill: PURE }, { j: 1 }),
    L("rect", -18, -18, 12, 3, { fill: tone(c.color, -0.4), cr: 49, rot: -45 }, { j: 2 }),
    LT("%", 3, 5, 19, { fill: PURE, fw: 800 }, { j: 3 }),
  ], { hold: { type: "rock", amp: 6, period: 1100 } }),
];
const specPin = (c) => {
  const bounce = { type: "bounce", amp: 9, period: 1100 };
  return [
    L("ellipse", 0, 38, 30, 7, { fill: NAVY, op: 0.18 }, { j: 0, hold: { type: "pulse", amp: 1.15, period: 1100 } }),
    L("triangle", 0, 15, 27, 30, { fill: tone(c.color, -0.22), rot: 180 }, { j: 1, hold: bounce }),
    L("ellipse", 0, -8, 40, 40, { fill: tone(c.color, -0.22) }, { j: 1, hold: bounce }),
    L("triangle", 0, 13, 27, 30, { fill: c.color, rot: 180 }, { j: 1, hold: bounce }),
    L("ellipse", 0, -10, 40, 40, { fill: c.color }, { j: 1, hold: bounce }),
    L("ellipse", 0, -10, 14, 14, { fill: PURE }, { j: 2, hold: bounce }),
  ];
};
const specCalendar = (c) => [
  L("rect", -14, -27, 5, 11, { fill: tone(c.color, -0.4), cr: 49 }, { j: 0 }),
  L("rect", 14, -27, 5, 11, { fill: tone(c.color, -0.4), cr: 49 }, { j: 0 }),
  L("rect", 0, 2, 52, 46, { fill: tone(c.color, -0.18), cr: 10 }, { j: 1 }),
  L("rect", 0, 0, 52, 46, { fill: c.color, cr: 10 }, { j: 1 }),
  L("rect", 0, -16, 52, 13, { fill: RED, cr: 10 }, { j: 2 }),
  ...[-13, 0, 13].flatMap((dx) => [0, 12].map((dy, i) =>
    L("rect", dx, dy, 7.5, 7.5, { fill: tone(c.color, -0.25), cr: 20 }, { j: 3 + i }))),
  L("rect", 0, 0, 7.5, 7.5, { fill: CORAL, cr: 20 }, { j: 4, hold: { type: "pulse", amp: 1.25, period: 900 } }),
];
const specLock = (c) => {
  const tm = Math.round(c.D * 0.5);
  return [
    L("ellipse", 0, -15, 24, 28, { fill: "none", fm: "stroke", sC: tone(c.color, -0.4), sW: 6.5 }, { j: 0, tr: hopTr(c, by(-15, c.u), -4, tm) }),
    L("rect", 0, 10, 44, 34, { fill: tone(c.color, -0.25), cr: 16 }, { j: 1 }),
    L("rect", 0, 8, 44, 34, { fill: c.color, cr: 16 }, { j: 1 }),
    L("ellipse", 0, 4, 9.5, 9.5, { fill: NAVY }, { j: 2 }),
    L("rect", 0, 13, 4.6, 11, { fill: NAVY, cr: 49 }, { j: 2 }),
    L("ellipse", -10, -1, 12, 6, { fill: PURE, op: 0.22, rot: -20 }, { j: 3 }),
  ];
};
const specArrowUpRight = (c) => [
  L("arrow", 1.5, 2.5, 58, 42, { fill: tone(c.color, -0.25), rot: -45 }, { j: 0, hold: { type: "sway", amp: 5, period: 800 } }),
  L("arrow", 0, 0, 58, 42, { fill: c.color, rot: -45 }, { j: 0, hold: { type: "bob", amp: -5, period: 800 } }),
  L("ellipse", 8, -8, 9, 15, { fill: PURE, op: 0.32, rot: -45 }, { j: 1, hold: { type: "bob", amp: -5, period: 800 } }),
];

/* ============================================================
   BUILDER — interpret a spec list into a kit clip (either variant)
   ============================================================ */
function buildFlat(name, natural, specFn, opts) {
  const o = iconOpts(opts);
  const color = o.color || natural;
  const D = o.dur, u = o.size / 100, animated = o.animated;
  const c = { color, shade: tone(color, -0.26), light: tone(color, 0.3), dark: tone(color, -0.45), D, u, g: spec(u) };
  const specs = specFn(c);

  const animOpts = (a) => {
    const oo = {};
    if (a.in !== undefined) oo.enter = a.in;
    if (a.stag != null) oo.stag = a.stag;
    if (a.hold) oo.hold = a.hold;
    if (a.tr) oo.tracks = a.tr;
    if (a.out !== undefined) oo.exit = a.out;
    if (a.es != null) oo.exitStart = a.es;
    if (a.inT != null) oo.inT = a.inT;
    if (a.outT != null) oo.outT = a.outT;
    return oo;
  };
  const shapeProps = (x) => {
    const p = { fill: x.fill === "none" ? (x.sC || color) : x.fill || color };
    if (x.cr != null) p.cornerR = x.cr;
    if (x.rot) p.rotation = x.rot;
    if (x.op != null) p.opacity = x.op;
    if (x.fm) { p.fillMode = x.fm; p.sC = x.sC || color; p.sW = x.sW || 3; }
    if (x.blur) p.blur = x.blur;
    return p;
  };
  const toShape = (s, i, j) => {
    const p = c.g(s.shape, s.dx, s.dy, s.w, s.h, shapeProps(s.x));
    if (animated) return part("shape", `Part ${i + 1}`, p, j, D, animOpts(s.a));
    return layer("shape", `Part ${i + 1}`, { ...p, inT: 0, outT: null }, {});
  };
  const toText = (s, i, j) => {
    const p = {
      text: s.text, fontSize: Math.max(8, Math.round(s.fs * u)), fontWeight: s.x.fw || 800,
      fontFamily: s.x.ff || "Inter", fill: s.x.fill || color, ls: s.x.ls || 0,
      x: bx(s.dx, u), y: by(s.dy, u),
    };
    if (animated) return part("text", `Text ${i + 1}`, p, j, D, animOpts(s.a));
    return layer("text", `Text ${i + 1}`, { ...p, inT: 0, outT: null }, {});
  };
  const toLayer = (s, i) => {
    const j = s.a && s.a.j != null ? s.a.j : i;
    if (s.k === "t") return toText(s, i, j);
    if (s.k === "g") {
      const kids = s.kids.map((ks, ki) => {
        const kj = ks.a && ks.a.j != null ? ks.a.j : ki;
        if (ks.k === "t") return toText(ks, ki, kj);
        return toShape(ks, ki, kj);
      });
      if (!animated) return kids; /* static: groups flatten (no spin/hold) */
      return [groupClip(s.n || `Group ${i + 1}`, kids, D, { spin: s.a.spin, hold: s.a.hold, tr: s.a.tr })];
    }
    return toShape(s, i, j);
  };
  const children = specs.flatMap((s, i) => {
    const r = toLayer(s, i);
    return Array.isArray(r) ? r : [r];
  });
  return kitClip(name, children, D);
}

/* one registry row per icon */
const ICON = (id, name, category, tags, recipe, natural, specFn) =>
  ({ id, name, category, tags, recipe, build: (opts) => buildFlat(name, natural, specFn, opts) });

export const ICONS = [
  /* ---------- EMOJI ---------- */
  ICON("smile", "Smile", "Emoji", ["smile", "happy", "face", "emoji", "cheerful"], "pop + blink", FACE_Y, specSmile),
  ICON("laugh", "Laugh", "Emoji", ["laugh", "grin", "lol", "emoji", "teeth"], "rock + grin", FACE_Y, specLaugh),
  ICON("laugh-tears", "Laugh Tears", "Emoji", ["joy", "tears", "laugh", "cry-laugh", "emoji"], "flying tears", FACE_Y, specLaughTears),
  ICON("love-eyes", "Heart Eyes", "Emoji", ["love", "hearts", "crush", "emoji", "adore"], "heartbeat eyes", FACE_Y, specLoveEyes),
  ICON("star-struck", "Star Struck", "Emoji", ["star", "wow", "fame", "emoji", "excited"], "spinning star eyes", FACE_Y, specStarStruck),
  ICON("wink", "Wink", "Emoji", ["wink", "flirt", "joke", "emoji", "smirk"], "blink + smirk", FACE_Y, specWink),
  ICON("party", "Party Face", "Emoji", ["party", "celebrate", "hat", "confetti", "emoji", "birthday"], "confetti drift + hat bob", FACE_Y, specParty),
  ICON("cry", "Cry", "Emoji", ["cry", "tears", "sad", "emoji", "sob"], "falling tears", FACE_Y, specCry),
  ICON("sad", "Sad", "Emoji", ["sad", "frown", "down", "emoji", "unhappy"], "slow droop", FACE_Y, specSad),
  ICON("angry", "Angry", "Emoji", ["angry", "mad", "rage", "emoji", "grr"], "flush + anger mark", FACE_Y, specAngry),
  ICON("surprised", "Surprised", "Emoji", ["surprised", "wow", "gasp", "emoji", "shock"], "gasp pulse", FACE_Y, specSurprised),
  ICON("neutral", "Neutral", "Emoji", ["neutral", "meh", "flat", "emoji", "straight"], "blink", FACE_Y, specNeutral),
  ICON("sleepy", "Sleepy", "Emoji", ["sleep", "tired", "zzz", "emoji", "drowsy"], "bubble + floating Zs", FACE_Y, specSleepy),
  ICON("cool", "Cool", "Emoji", ["cool", "sunglasses", "chill", "emoji", "shade"], "lens glint sweep", FACE_Y, specCool),
  ICON("angel", "Angel", "Emoji", ["angel", "halo", "innocent", "emoji", "blessed"], "floating halo", FACE_Y, specAngel),
  ICON("devil", "Devil", "Emoji", ["devil", "horns", "mischief", "emoji", "evil"], "horns + smirk", "#B07FE8", specDevil),
  ICON("tongue-out", "Tongue Out", "Emoji", ["tongue", "silly", "playful", "emoji", "tease"], "wagging tongue", FACE_Y, specTongueOut),
  ICON("sick", "Sick", "Emoji", ["sick", "ill", "queasy", "emoji", "nausea"], "sweat drop", "#A6D96E", specSick),
  ICON("worried", "Worried", "Emoji", ["worried", "anxious", "nervous", "emoji", "sweat"], "darting eyes + sweat", FACE_Y, specWorried),
  ICON("mind-blown", "Mind Blown", "Emoji", ["mind", "blown", "explosion", "emoji", "wow"], "crown blast pulse", FACE_Y, specMindBlown),
  /* ---------- REACTIONS ---------- */
  ICON("heart", "Heart", "Reactions", ["heart", "like", "love", "favorite", "react"], "heartbeat + sparkle", RED, specHeart),
  ICON("thumbs-up", "Thumbs Up", "Reactions", ["thumbs", "like", "approve", "yes", "good"], "thumb bounce + ticks", GOLD, specThumbsUp),
  ICON("clap", "Clap", "Reactions", ["clap", "applause", "bravo", "hands", "congrats"], "mirrored clap beat", GOLD, specClap),
  ICON("fire", "Fire", "Reactions", ["fire", "hot", "lit", "flame", "trending"], "seeded flame flicker", ORANGE, specFire),
  ICON("star", "Star", "Reactions", ["star", "rate", "favorite", "bookmark", "gold"], "pulse + sparkles", GOLD, specStarBadge),
  ICON("hundred", "Hundred", "Reactions", ["100", "hundred", "perfect", "score", "keep-it"], "bounce", RED, specHundred),
  ICON("muscles", "Muscles", "Reactions", ["muscle", "strong", "flex", "bicep", "power"], "flex pulse", "#F2B25C", specMuscles),
  ICON("broken-heart", "Broken Heart", "Reactions", ["broken", "heart", "heartbreak", "sad", "crack"], "droop + drifting shards", "#E5566B", specBrokenHeart),
  ICON("party-popper", "Party Popper", "Reactions", ["party", "popper", "confetti", "celebrate", "tada"], "continuous burst", CORAL, specPartyPopper),
  /* ---------- OBJECTS ---------- */
  ICON("bell", "Bell", "Objects", ["bell", "notification", "ring", "alert", "ding"], "swing + clapper + ticks", GOLD, specBell),
  ICON("gift", "Gift", "Objects", ["gift", "present", "reward", "box", "surprise"], "lid pop + bow pulse", CORAL, specGift),
  ICON("trophy", "Trophy", "Objects", ["trophy", "win", "award", "champion", "cup"], "shine sweep + bob", GOLD, specTrophy),
  ICON("rocket", "Rocket", "Objects", ["rocket", "launch", "space", "startup", "ship"], "hover + flame flicker", "#F4F6FA", specRocket),
  ICON("lightning", "Lightning", "Objects", ["bolt", "lightning", "flash", "energy", "zap"], "seeded flicker", GOLD, specLightning),
  ICON("coffee", "Coffee", "Objects", ["coffee", "cup", "espresso", "break", "cafe"], "rising steam", "#F4F6FA", specCoffee),
  ICON("gem", "Gem", "Objects", ["gem", "diamond", "jewel", "premium", "crystal"], "slow rock + sparkles", BLUE, specGem),
  ICON("balloon", "Balloon", "Objects", ["balloon", "party", "float", "birthday", "air"], "float + string wag", RED, specBalloon),
  /* ---------- WEATHER / NATURE ---------- */
  ICON("sun", "Sun", "Weather", ["sun", "sunny", "day", "bright", "weather"], "rays spin slow", GOLD, specSun),
  ICON("cloud", "Cloud", "Weather", ["cloud", "sky", "weather", "drift"], "drift sway", "#F4F7FB", specCloud),
  ICON("rain", "Rain Cloud", "Weather", ["rain", "drops", "weather", "storm", "drizzle"], "staggered falling drops", "#C9D6E8", specRain),
  ICON("rainbow", "Rainbow", "Weather", ["rainbow", "arc", "pride", "weather", "colors"], "rise + cloud bob", RED, specRainbow),
  ICON("moon", "Moon", "Weather", ["moon", "night", "lunar", "weather", "sleep"], "bob + blinking stars", "#FFE9A8", specMoon),
  ICON("storm", "Storm Cloud", "Weather", ["storm", "thunder", "bolt", "weather", "rain"], "bolt flicker + rain", "#9FB2CC", specStorm),
  /* ---------- COMMUNICATION / MEDIA ---------- */
  ICON("chat", "Chat Bubble", "Media", ["chat", "message", "talk", "comment", "typing"], "typing dots bob", BLUE, specChat),
  ICON("mail", "Mail", "Media", ["mail", "email", "envelope", "send", "inbox"], "notification dot pulse", "#F4F6FA", specMail),
  ICON("phone", "Phone", "Media", ["phone", "call", "ring", "contact", "handset"], "ring shake + ticks", GREEN, specPhone),
  ICON("camera", "Camera", "Media", ["camera", "photo", "lens", "shoot", "picture"], "lens pulse + flash", CORAL, specCamera),
  ICON("music-note", "Music Note", "Media", ["music", "note", "song", "melody", "tune"], "groove rock", BLUE, specMusic),
  ICON("play", "Play Button", "Media", ["play", "video", "start", "media", "watch"], "ripple ping + pulse", CORAL, specPlay),
  ICON("mic", "Microphone", "Media", ["mic", "microphone", "record", "voice", "podcast"], "bob", VIOLET, specMic),
  ICON("volume", "Volume", "Media", ["volume", "sound", "audio", "speaker", "loud"], "EQ pulse", CORAL, specVolume),
  /* ---------- COMMERCE / MISC ---------- */
  ICON("cart", "Cart", "Commerce", ["cart", "shop", "buy", "ecommerce", "basket"], "rolling sway + item bob", BLUE, specCart),
  ICON("tag", "Price Tag", "Commerce", ["tag", "price", "label", "sale", "discount"], "dangle rock", CORAL, specTag),
  ICON("pin", "Location Pin", "Commerce", ["pin", "location", "map", "place", "marker"], "drop bounce + shadow", RED, specPin),
  ICON("calendar", "Calendar", "Commerce", ["calendar", "date", "schedule", "event", "plan"], "today pulse", "#F4F6FA", specCalendar),
  ICON("lock", "Lock", "Commerce", ["lock", "secure", "private", "password", "safe"], "shackle hop", GOLD, specLock),
  ICON("arrow-up-right", "Arrow Up Right", "Commerce", ["arrow", "diagonal", "external", "link", "open"], "diagonal nudge", CORAL, specArrowUpRight),
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
