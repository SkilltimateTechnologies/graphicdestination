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
import { SHAPE_DEFS, alignPts } from "./shapes.js";

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
   ICONS (v3) — hand-authored flat vector art, Jitter/Flaticon grade.

   DESIGN SYSTEM — one visual language for the whole family:

   · GRID — every icon is drawn in the shared 100×100 design box.
     Optical keylines: round icons (emoji heads, badges) fill Ø76;
     square-ish objects (gift, calendar, lock, camera) fill ~64×64,
     tall objects (rocket, mic, pin) reach ~72 high. The primary mass
     is optically centered at (0,0) — never mathematically centered
     when the silhouette is top- or bottom-heavy (bells/pins sit 1–2
     units high, arrows ride the diagonal).

   · PALETTE — 12 curated swatches (below). Each icon has ONE natural
     primary; shade/highlight/sheen tones are always DERIVED from it
     via tone() so build({color}) re-harmonizes the whole icon.
     Feature ink (INK) is a warm violet-black, never pure black.

   · DEPTH — ONE recipe, applied everywhere: a SHADE TWIN of the
     primary silhouette (tone −0.22, offset +3.2 box units down)
     + a small top-left SHEEN sliver (tone +0.45, op ~0.5, or PURE
     at low opacity on colored masses). No gradients, no strokes on
     the primary art, no per-icon improvisations.

   · FACE — all 20 emoji share one construction: Ø76 head at
     (0,−1.5) over its shade twin at (0,+1.7); eyes on the y=−11
     line at dx ±14.5; mouth baseline y=+13; cheeks at (±22.5,+6);
     brows at y=−21. Eyes/mouths/brows are the shared authored
     glyphs below (ka-eye, ka-smile, …) — every face reads as the
     same character with a different expression.

   · ART PIPELINE — glyphs are true bezier art: authored below as
     path commands (M/L/C/Q/Z), sampled to dense closed outlines
     (~1-unit steps) and registered as engine shapes (ka-* ids) at
     module init — the same 64+-point polygon pipeline the engine's
     own heart shape uses, so preview, SSR checks and the export
     rasterizer all render identical curves. The three icons embedded
     in templates.js (heart, arrow-up-right, volume) intentionally
     stay on the 11 classic shape ids (frozen template schema).

   · MOTION GRAMMAR — unchanged (see header): easeOutBack pop
     entrances, 50–150 ms staggers, one icon-specific hold recipe,
     whip exits, structurally seamless ~3.2 s loop; "static" variant
     = identical art, zero tracks.
   ============================================================ */

/* flat-icon palette (12 swatches + derivations via tone()) */
const FACE_Y = "#FFD54A";  /* emoji face warm yellow */
const FEAT = "#463A56";     /* feature ink — warm violet-black */
const CHEEK = "#FF9EB2";
const TONGUE_C = "#FF6E8A";
const TEAR_C = "#59C9F5";
const GOLD = "#FFC53D";
const RED = "#FF5D5D";
const PINK = "#FF7BA9";
const ORANGE = "#FF9F43";
const GREEN = "#3ED598";
const VIOLET = "#C084FC";
const NAVY = "#332E3D";
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

/* ============================================================
   VECTOR ART TOOLKIT — bezier path commands → dense closed
   outline points → registered engine shapes (ka-* ids).

   regArt(id, cmds)      one glyph, normalized: bbox fit → 0..100
                         (uniform scale, centered; aspect preserved)
   regSet(frame, parts)  glyphs sharing ONE frame (mouth+tongue+
                         teeth, nested flames…): the union bbox is
                         normalized once, so parts placed at the same
                         (dx,dy,size) align exactly.
   KIT_ART records which ids carry real curve commands (the checks
   assert the family is bezier path art, not stretched primitives).
   ============================================================ */
const _V = (x) => Math.round(x * 100) / 100;
const _cb = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
const _qb = (p0, p1, p2, t) => { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; };

/* sample ["M",x,y]["L",x,y]["C",x1,y1,x2,y2,x,y]["Q",x1,y1,x,y]["Z"] → dense pts */
function artPath(cmds, step = 0.85) {
  const pts = [];
  let cur = null, start = null;
  const seg = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = 1; i <= n; i++) pts.push([a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)]);
  };
  for (const c of cmds) {
    const k = c[0];
    if (k === "M") { cur = [c[1], c[2]]; start = cur; if (!pts.length) pts.push(cur); }
    else if (k === "L") { const b = [c[1], c[2]]; seg(cur, b); cur = b; }
    else if (k === "C") {
      const p0 = cur, p1 = [c[1], c[2]], p2 = [c[3], c[4]], p3 = [c[5], c[6]];
      const est = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      const n = Math.max(3, Math.ceil(est / step));
      for (let i = 1; i <= n; i++) pts.push(_cb(p0, p1, p2, p3, i / n));
      cur = p3;
    } else if (k === "Q") {
      const p0 = cur, p1 = [c[1], c[2]], p2 = [c[3], c[4]];
      const est = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(3, Math.ceil(est / step));
      for (let i = 1; i <= n; i++) pts.push(_qb(p0, p1, p2, i / n));
      cur = p2;
    } else if (k === "Z" && cur && start) { seg(cur, start); cur = start; }
  }
  return pts;
}

/* circle arc as C commands (a0→a1 degrees, y-down stage coords) */
function arcSegs(cx, cy, r, a0, a1) {
  const cmds = [];
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 40));
  for (let i = 0; i < n; i++) {
    const t0 = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180, t1 = ((a0 + ((a1 - a0) * (i + 1)) / n) * Math.PI) / 180;
    const f = (4 / 3) * Math.tan((t1 - t0) / 4);
    const x0 = cx + r * Math.cos(t0), y0 = cy + r * Math.sin(t0), x1 = cx + r * Math.cos(t1), y1 = cy + r * Math.sin(t1);
    cmds.push(["C", x0 - f * r * Math.sin(t0), y0 + f * r * Math.cos(t0), x1 + f * r * Math.sin(t1), y1 - f * r * Math.cos(t1), x1, y1]);
  }
  return cmds;
}
const arcPt = (cx, cy, r, a) => { const t = (a * Math.PI) / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; };
/* ellipse outline (κ-approximated, rot degrees) */
function ellCmd(cx, cy, rx, ry, rot = 0) {
  const k = 0.5522847498, a = (rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  const P = (x, y) => [cx + x * co - y * si, cy + x * si + y * co];
  return [
    ["M", ...P(rx, 0)],
    ["C", ...P(rx, k * ry), ...P(k * rx, ry), ...P(0, ry)],
    ["C", ...P(-k * rx, ry), ...P(-rx, k * ry), ...P(-rx, 0)],
    ["C", ...P(-rx, -k * ry), ...P(-k * rx, -ry), ...P(0, -ry)],
    ["C", ...P(k * rx, -ry), ...P(rx, -k * ry), ...P(rx, 0)],
    ["Z"],
  ];
}
/* rounded rect (x0,y0 top-left, w×h, corner r) */
function rrCmd(x0, y0, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const x1 = x0 + w, y1 = y0 + h, k = 0.5522847498;
  return [
    ["M", x0 + r, y0], ["L", x1 - r, y0], ["C", x1 - r + k * r, y0, x1, y0 + r - k * r, x1, y0 + r],
    ["L", x1, y1 - r], ["C", x1, y1 - r + k * r, x1 - r + k * r, y1, x1 - r, y1],
    ["L", x0 + r, y1], ["C", x0 + r - k * r, y1, x0, y1 - r + k * r, x0, y1 - r],
    ["L", x0, y0 + r], ["C", x0, y0 + r - k * r, x0 + r - k * r, y0, x0 + r, y0], ["Z"],
  ];
}
/* capsule (stadium) centered at cx,cy, w×h before rot */
const capCmd = (cx, cy, w, h, rot = 0) => rotCmds(rrCmd(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) / 2), cx, cy, rot);
/* arc band with ROUNDED caps (donut sector, a0→a1 deg) — smiles, halos,
   shackles, sound waves, phone handset, rainbows */
function arcBandCmd(cx, cy, r, w, a0, a1) {
  const ro = r + w / 2, ri = r - w / 2;
  const cap = (a) => arcPt(cx, cy, r, a);
  const c1 = cap(a1), c0 = cap(a0);
  return [
    ["M", ...arcPt(cx, cy, ro, a0)],
    ...arcSegs(cx, cy, ro, a0, a1),
    ...arcSegs(c1[0], c1[1], w / 2, a1, a1 + 180),
    ...arcSegs(cx, cy, ri, a1, a0),
    ...arcSegs(c0[0], c0[1], w / 2, a0 + 180, a0 + 360),
    ["Z"],
  ];
}
/* full ring band (donut) */
const ringCmd = (cx, cy, r, w) => [
  ["M", ...arcPt(cx, cy, r + w / 2, 0)], ...arcSegs(cx, cy, r + w / 2, 0, 360),
  ["M", ...arcPt(cx, cy, r - w / 2, 0)], ...arcSegs(cx, cy, r - w / 2, 0, -360),
];
/* transform helpers on command lists */
const xformCmds = (cmds, f) => cmds.map((c) => {
  const out = [c[0]];
  for (let i = 1; i < c.length; i += 2) { const [x, y] = f(c[i], c[i + 1]); out.push(x, y); }
  return out;
});
function rotCmds(cmds, cx, cy, deg) {
  const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  return xformCmds(cmds, (x, y) => [cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co]);
}
const flipXCmds = (cmds, cx = 0) => xformCmds(cmds, (x, y) => [2 * cx - x, y]);
const scaleCmds = (cmds, cx, cy, s) => xformCmds(cmds, (x, y) => [cx + (x - cx) * s, cy + (y - cy) * s]);
/* polygon with rounded corners (soft bolts, gem, arrows…): each vertex
   is beveled by d units along its edges and bridged with a Q */
function polyRoundCmd(verts, d = 2) {
  const n = verts.length, cmds = [];
  const at = (i) => verts[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p = at(i - 1), v = at(i), q = at(i + 1);
    const dIn = Math.hypot(v[0] - p[0], v[1] - p[1]), dOut = Math.hypot(q[0] - v[0], q[1] - v[1]);
    const dd = Math.min(d, dIn / 2.2, dOut / 2.2);
    const a = [v[0] + ((p[0] - v[0]) / dIn) * dd, v[1] + ((p[1] - v[1]) / dIn) * dd];
    const b = [v[0] + ((q[0] - v[0]) / dOut) * dd, v[1] + ((q[1] - v[1]) / dOut) * dd];
    if (i === 0) cmds.push(["M", ...a]); else cmds.push(["L", ...a]);
    cmds.push(["Q", ...v, ...b]);
  }
  cmds.push(["Z"]);
  return cmds;
}
/* star with rounded tips/joins */
function starSoftCmd(cx, cy, R, r, n = 5, round = 2.5, rot = -90) {
  const v = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180, rad = i % 2 === 0 ? R : r;
    v.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return polyRoundCmd(v, round);
}

/* ---------- glyph registry ---------- */
export const KIT_ART = {}; /* ka-* id → { curves } — authored bezier art */
function _normFit(parts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pts of parts) for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const s = 100 / Math.max(x1 - x0, y1 - y0, 1e-6);
  return { s, ox: (100 - (x1 - x0) * s) / 2 - x0 * s, oy: (100 - (y1 - y0) * s) / 2 - y0 * s };
}
function _register(id, pts, cmds, t) {
  KIT_ART[id] = { curves: cmds.some((c) => c[0] === "C" || c[0] === "Q") };
  if (!SHAPE_DEFS[id]) SHAPE_DEFS[id] = { name: id, pts: alignPts(pts.map(([x, y]) => [_V(x * t.s + t.ox), _V(y * t.s + t.oy)])) };
}
/* single glyph (own bbox → 0..100) */
function regArt(id, cmds, step) {
  const pts = artPath(cmds, step);
  _register(id, pts, cmds, _normFit([pts]));
  return id;
}
/* glyph family sharing ONE frame: regSet([id, cmds, id, cmds, …]) */
function regSet(...pairs) {
  const all = pairs.map(([, cmds]) => artPath(cmds, 0.85));
  const t = _normFit(all);
  pairs.forEach(([id, cmds], i) => _register(id, all[i], cmds, t));
}

/* ============================================================
   SHARED ART — one glyph library used across the whole family.
   Authored once here (consistency) and placed everywhere via L().
   ============================================================ */
/* top-left sheen sliver (the ONE highlight recipe) */
regArt("ka-sheen", [
  ["M", -18, 6], ["C", -20, -6, -12, -16, 0, -18], ["C", 2, -14, 2, -12, 0, -10],
  ["C", -8, -8, -13, -2, -12, 6], ["C", -12, 10, -16, 10, -18, 6], ["Z"],
]);
/* 4-point sparkle (soft concave sides) */
regArt("ka-spark", [
  ["M", 0, -14], ["C", 1.6, -5, 5, -1.6, 14, 0], ["C", 5, 1.6, 1.6, 5, 0, 14],
  ["C", -1.6, 5, -5, 1.6, -14, 0], ["C", -5, -1.6, -1.6, -5, 0, -14], ["Z"],
]);
/* teardrop (tears / sweat), pointing up */
regArt("ka-drop", [
  ["M", 0, -15], ["C", 4.5, -8.5, 9, -2.5, 9, 4], ["C", 9, 10.5, 4.9, 15, 0, 15],
  ["C", -4.9, 15, -9, 10.5, -9, 4], ["C", -9, -2.5, -4.5, -8.5, 0, -15], ["Z"],
]);
/* soft star (rounded tips — badges, trophy inlay, moon company) */
regArt("ka-star", starSoftCmd(0, 0, 16, 8.4, 5, 2.6));
/* soft bolt (rounded corners, slight forward lean) */
regArt("ka-bolt", polyRoundCmd([[3, -18], [11.5, -18], [3.5, -2], [11, -2], [-5, 18], [-1.5, 2.5], [-10, 2.5]], 2.4));
/* anger mark 💢 (puffy cross, tilted) */
regArt("ka-anger", rotCmds(polyRoundCmd([[-4, -14], [4, -14], [4, -4], [14, -4], [14, 4], [4, 4], [4, 14], [-4, 14], [-4, 4], [-14, 4], [-14, -4], [-4, -4]], 4.2), 0, 0, 18));
/* devil horn (curved, pointing up-out) + mirrored twin */
const hornCmd = [
  ["M", -7, 8], ["C", -10, -3, -7, -13, 3, -19], ["C", 0, -11, 2, -4, 9, -1],
  ["C", 5, 6, -2, 11, -7, 8], ["Z"],
];
regArt("ka-horn", hornCmd);
regArt("ka-horn-r", flipXCmds(hornCmd));
/* confetti triangle */
regArt("ka-conf", [["M", 0, -8], ["C", 2, -2, 4, 3, 6, 8], ["L", -6, 8], ["C", -4, 3, -2, -2, 0, -8], ["Z"]]);
/* ribbon curl (party confetti) */
regArt("ka-curl", [
  ["M", -6, -10], ["C", 2, -8, 6, -2, 2, 2], ["C", -2, 6, -6, 8, -4, 12], ["L", -7, 11],
  ["C", -9, 6, -4, 4, 0, 1], ["C", 4, -2, 0, -6, -7, -8], ["Z"],
]);

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
   FACE ART — the shared emoji feature library (one construction
   grid: eyes y −11 / dx ±14.5 · mouth y +13 · cheeks ±22.5,+6)
   ============================================================ */
/* dot eye — soft vertical capsule with a gentle taper */
regArt("ka-eye", capCmd(0, 0, 7.6, 10.6));
/* happy closed eye ∩ (round-capped arc band) */
regArt("ka-eye-arc", arcBandCmd(0, 1.5, 6.6, 4.4, 180, 360));
/* calm shut eye ∪ */
regArt("ka-eye-shut", arcBandCmd(0, -1.5, 6.6, 4.4, 0, 180));
/* brow bar */
regArt("ka-brow", capCmd(0, 0, 12.5, 4.2));
/* smile ∪ */
regArt("ka-smile", arcBandCmd(0, -1, 12.6, 4.8, 25, 155));
/* frown ∩ */
regArt("ka-frown", arcBandCmd(0, 5.5, 11.5, 4.6, 205, 335));
/* flat mouth */
regArt("ka-flat", capCmd(0, 0, 19, 4.4));
/* smirk — off-center swoosh, thicker on the right */
regArt("ka-smirk", [
  ["M", -13, 1.5], ["C", -7, -3.5, 6, -4.5, 13, 0.5], ["C", 8, 4.5, -3, 5.5, -11, 4],
  ["C", -13.2, 3.6, -14, 2.6, -13, 1.5], ["Z"],
]);
/* open mouth + teeth + tongue — ONE shared frame (regSet aligns them) */
regSet(
  ["ka-mouth", [
    ["M", -17, -4], ["C", -17, 8.5, -9, 15.5, 0, 15.5], ["C", 9, 15.5, 17, 8.5, 17, -4],
    ["C", 17, -7.5, 9, -8.5, 0, -8.5], ["C", -9, -8.5, -17, -7.5, -17, -4], ["Z"],
  ]],
  ["ka-teeth", [
    ["M", -15.8, -5.2], ["C", -9, -7.2, 9, -7.2, 15.8, -5.2], ["C", 15.8, -1.5, 14, 0.5, 11.5, 0.5],
    ["L", -11.5, 0.5], ["C", -14, 0.5, -15.8, -1.5, -15.8, -5.2], ["Z"],
  ]],
  ["ka-tongue-in", [
    ["M", -9.5, 10.5], ["C", -6, 7, 6, 7, 9.5, 10.5], ["C", 9.5, 14, 5.5, 15.5, 0, 15.5],
    ["C", -5.5, 15.5, -9.5, 14, -9.5, 10.5], ["Z"],
  ]]
);
/* sticking-out tongue (w/ center groove layer) */
regArt("ka-tongue", [
  ["M", -7, -4], ["C", -7, -7, 7, -7, 7, -4], ["L", 7, 7], ["C", 7, 13, 4, 16.5, 0, 16.5],
  ["C", -4, 16.5, -7, 13, -7, 7], ["Z"],
]);
/* sunglasses — one connected wayfarer silhouette */
regArt("ka-shades", [
  ["M", -18, -2], ["C", -18, -7, -15, -9, -11, -9], ["L", -4, -9], ["C", -2, -9, -0.6, -8, 0, -6.4],
  ["C", 0.6, -8, 2, -9, 4, -9], ["L", 11, -9], ["C", 15, -9, 18, -7, 18, -2],
  ["C", 18, 4, 15, 8, 10, 8], ["L", 6, 8], ["C", 2, 8, 0.6, 5, 0, 2.6], ["C", -0.6, 5, -2, 8, -6, 8],
  ["L", -10, 8], ["C", -15, 8, -18, 4, -18, -2], ["Z"],
]);
/* halo — squashed ring band */
regArt("ka-halo", xformCmds(ringCmd(0, 0, 13, 4.6), (x, y) => [x, y * 0.36]));
/* party hat cone */
regArt("ka-hat", [
  ["M", 0, -20], ["C", 1.5, -13, 6, -3, 11, 6], ["C", 5, 10.5, -5, 10.5, -11, 6],
  ["C", -6, -3, -1.5, -13, 0, -20], ["Z"],
]);
/* mind-blown burst — puffy 8-point explosion + inner blast */
regSet(
  ["ka-burst", starSoftCmd(0, 0, 17.5, 9.5, 8, 3.2)],
  ["ka-burst-in", starSoftCmd(0, 1, 10, 5.4, 8, 2)]
);

/* ============================================================
   EMOJI COMPOSERS — spec arrays in the 100-box off one head.
   ============================================================ */
/* head: shade twin + base + sheen (the depth recipe) */
const faceBase = (c, j, a = {}) => [
  L("ellipse", 0, 1.7, 76, 76, { fill: tone(c.color, -0.2) }, { j, ...a }),
  L("ellipse", 0, -1.5, 76, 76, { fill: c.color }, { j, ...a }),
  L("ka-sheen", -15, -17, 32, 32, { fill: tone(c.color, 0.55), op: 0.5 }, { j: j + 1, ...a }),
];
const cheeks = (c, j, dy = 6) => [
  L("ellipse", -22.5, dy, 10, 6.5, { fill: CHEEK, op: 0.55 }, { j }),
  L("ellipse", 22.5, dy, 10, 6.5, { fill: CHEEK, op: 0.55 }, { j }),
];
/* dot eyes; o.blink adds shut lids + a mid-hold blink crossfade */
const dotEyes = (c, j, dy = -11, o = {}) => {
  const s = o.s || 11, dx = o.dx || 14.5;
  const tb = o.tb || Math.round(c.D * 0.52);
  const pair = o.blink ? blinkTr(c.D, tb) : null;
  const parts = [];
  [-dx, dx].forEach((x, i) => {
    parts.push(L("ka-eye", x, dy, s, s, { fill: FEAT }, { j: j + i, hold: o.hold, tr: pair ? { opacity: pair.open } : undefined }));
    if (pair) parts.push(L("ka-eye-shut", x, dy + 2.5, s + 1, s + 1, { fill: FEAT }, { j: j + i, in: "none", out: false, tr: { opacity: pair.closed } }));
  });
  return parts;
};
/* happy closed eyes ∩∩ */
const arcEyes = (c, j, dy = -11, o = {}) => [-14.5, 14.5].map((x, i) =>
  L("ka-eye-arc", x, dy, o.s || 12.5, o.s || 12.5, { fill: FEAT }, { j: j + i, hold: o.hold }));
/* calm shut eyes ∪∪ */
const shutEyes = (c, j, dy = -10, o = {}) => [-14.5, 14.5].map((x, i) =>
  L("ka-eye-shut", x, dy, o.s || 12.5, o.s || 12.5, { fill: FEAT }, { j: j + i, hold: o.hold }));
const smileM = (c, j, dy = 16, o = {}) => [L("ka-smile", 0, dy, o.s || 30, o.s || 30, { fill: FEAT }, { j, hold: o.hold })];
/* grin: open mouth + teeth band */
const grinM = (c, j, dy = 20, o = {}) => [
  L("ka-mouth", 0, dy, o.s || 27, o.s || 27, { fill: FEAT }, { j, hold: o.hold }),
  L("ka-teeth", 0, dy, o.s || 27, o.s || 27, { fill: PURE }, { j, hold: o.hold }),
];
/* laugh: open mouth + tongue */
const laughM = (c, j, dy = 20, o = {}) => [
  L("ka-mouth", 0, dy, o.s || 28, o.s || 28, { fill: FEAT }, { j, hold: o.hold }),
  L("ka-tongue-in", 0, dy, o.s || 28, o.s || 28, { fill: TONGUE_C }, { j, hold: o.hold }),
];
const frownM = (c, j, dy = 17, o = {}) => [L("ka-frown", 0, dy, o.s || 26, o.s || 26, { fill: FEAT }, { j, hold: o.hold })];
const smirkM = (c, j, dy = 16, o = {}) => [L("ka-smirk", o.dx || 2, dy, o.s || 24, o.s || 24, { fill: FEAT }, { j, hold: o.hold })];
const flatM = (c, j, dy = 15) => [L("ka-flat", 0, dy, 22, 22, { fill: FEAT }, { j })];
const oMouth = (c, j, dy = 16, w = 12, h = 14, o = {}) => [L("ellipse", 0, dy, w, h, { fill: FEAT }, { j, hold: o.hold })];
/* brows */
const brow = (j, dx, dy, rot, o = {}) => L("ka-brow", dx, dy, o.s || 14, o.s || 14, { fill: FEAT, rot }, { j, hold: o.hold });
const angryBrows = (j, dy = -20) => [brow(j, -13, dy, 26), brow(j + 1, 13, dy, -26)];
const sadBrows = (j, dy = -21) => [brow(j, -13, dy, -24), brow(j + 1, 13, dy, 24)];
/* drifting tear/sweat drop (looped) */
const dropFly = (j, dx, dy, s, ddx, ddy, per, o = {}) => [
  L("ka-drop", dx, dy, s, s, { fill: o.fill || TEAR_C, rot: o.rot }, { j, in: "none", out: false, tr: driftTr(o.c, dx, dy, ddx, ddy, per, o) }),
];

/* ============================================================
   ICON ART SPECS — one function per icon: (c) => spec[].
   c = { color, shade, light, dark, D, u, g } (resolved per build).
   ============================================================ */

/* ---------- EMOJI (20) ---------- */
const specSmile = (c) => [
  LG("Smile idle", [
    ...faceBase(c, 0),
    ...dotEyes(c, 2, -11, { blink: true }),
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
  ...dropFly(6, -26, -12, 11, -11, -7, 900, { c, rot: 32 }),
  ...dropFly(7, 26, -12, 11, 11, -7, 900, { c, rot: -32, phase: 450 }),
];
const specLoveEyes = (c) => [
  ...faceBase(c, 0),
  L("heart", -14.5, -11, 15, 14, { fill: PINK }, { j: 2, hold: { type: "heartbeat", period: 940 } }),
  L("heart", 14.5, -11, 15, 14, { fill: PINK }, { j: 3, hold: { type: "heartbeat", period: 940 } }),
  ...smileM(c, 4),
  ...cheeks(c, 5),
];
const specStarStruck = (c) => [
  ...faceBase(c, 0),
  L("ka-star", -14.5, -11, 16, 16, { fill: GOLD }, { j: 2, hold: { type: "spin", turns: 1 } }),
  L("ka-star", 14.5, -11, 16, 16, { fill: GOLD }, { j: 3, hold: { type: "spin", turns: 1 } }),
  ...laughM(c, 4),
  ...cheeks(c, 5),
];
const specWink = (c) => {
  const tb = Math.round(c.D * 0.52);
  const pair = blinkTr(c.D, tb);
  return [
    ...faceBase(c, 0),
    /* left dot eye blinks, right eye is a static happy arc */
    L("ka-eye", -14.5, -11, 11, 11, { fill: FEAT }, { j: 2, tr: { opacity: pair.open } }),
    L("ka-eye-shut", -14.5, -8.5, 12, 12, { fill: FEAT }, { j: 2, in: "none", out: false, tr: { opacity: pair.closed } }),
    L("ka-eye-arc", 14.5, -11, 12.5, 12.5, { fill: FEAT }, { j: 3 }),
    brow(4, 13, -21, -12),
    ...smirkM(c, 5),
    ...cheeks(c, 6, 7),
  ];
};
const specParty = (c) => [
  ...faceBase(c, 0),
  ...arcEyes(c, 2),
  ...laughM(c, 4),
  /* tilted party hat: cone + stripes + pompom */
  L("ka-hat", 8, -39, 30, 30, { fill: BLUE, rot: 14 }, { j: 6, hold: { type: "bob", amp: 2.5, period: 900 } }),
  L("rect", 8.6, -36.5, 13, 3.4, { fill: PURE, cr: 49, rot: 14 }, { j: 7 }),
  L("rect", 7.6, -43, 8.5, 3, { fill: GOLD, cr: 49, rot: 14 }, { j: 7 }),
  L("ellipse", 12.5, -53.5, 8.5, 8.5, { fill: PINK }, { j: 8, hold: { type: "bob", amp: 3, period: 900 } }),
  /* confetti drifts up around the head */
  L("ka-conf", -30, -24, 8, 8, { fill: GOLD, rot: 24 }, { j: 9, in: "none", out: false, tr: driftTr(c, -30, -24, -4, -14, 1100) }),
  L("ka-curl", 32, -16, 8, 8, { fill: GREEN, rot: -12 }, { j: 10, in: "none", out: false, tr: driftTr(c, 32, -16, 4, -16, 1250, { phase: 380 }) }),
  L("ka-conf", -36, 2, 7, 7, { fill: PINK, rot: -18 }, { j: 11, in: "none", out: false, tr: driftTr(c, -36, 2, -5, -15, 1000, { phase: 700 }) }),
  L("ka-spark", 30, 8, 6, 6, { fill: GOLD }, { j: 12, in: "none", out: false, tr: driftTr(c, 30, 8, 5, -14, 1150, { phase: 900 }) }),
];
const specCry = (c) => [
  ...faceBase(c, 0),
  ...sadBrows(2),
  ...dotEyes(c, 3, -10),
  ...frownM(c, 4),
  /* big tears welling + falling from each eye */
  ...dropFly(5, -14.5, 3, 13, 0, 24, 1150, { c }),
  ...dropFly(6, 14.5, 3, 13, 0, 24, 1150, { c, phase: 560 }),
];
const specSad = (c) => [
  LG("Sad droop", [
    ...faceBase(c, 0),
    ...sadBrows(2),
    ...dotEyes(c, 3, -10),
    ...frownM(c, 4),
  ], { hold: { type: "bob", amp: 2.5, period: 1500 } }),
];
const specAngry = (c) => {
  const tm = Math.round(c.D * 0.5);
  return [
    ...faceBase(c, 0, { tr: { fill: [kf(tm, c.color, "easeInOutSine"), kf(tm + 320, lerpColor(c.color, "#FF4D3D", 0.28), "easeInOutSine"), kf(tm + 760, c.color, "linear")] } }),
    ...angryBrows(2),
    ...dotEyes(c, 3, -9, { s: 10 }),
    ...frownM(c, 4),
    L("ka-anger", 27, -25, 13, 13, { fill: RED }, { j: 5, hold: { type: "pulse", amp: 1.18, period: 620 } }),
  ];
};
const specSurprised = (c) => [
  ...faceBase(c, 0),
  brow(2, -14, -22, -8), brow(3, 14, -22, 8),
  ...dotEyes(c, 4, -11, { s: 13, hold: { type: "pulse", amp: 1.08, period: 900 } }),
  L("ellipse", -16.5, -13.5, 3, 3, { fill: PURE, op: 0.85 }, { j: 5, hold: { type: "pulse", amp: 1.08, period: 900 } }),
  L("ellipse", 12.5, -13.5, 3, 3, { fill: PURE, op: 0.85 }, { j: 5, hold: { type: "pulse", amp: 1.08, period: 900 } }),
  ...oMouth(c, 6, 17, 13.5, 16, { hold: { type: "pulse", amp: 1.14, period: 900 } }),
];
const specNeutral = (c) => [
  LG("Neutral idle", [
    ...faceBase(c, 0),
    ...dotEyes(c, 2, -11, { blink: true }),
    ...flatM(c, 4),
  ], { hold: { type: "bob", amp: 1.8, period: 1500 } }),
];
const specSleepy = (c) => [
  ...faceBase(c, 0),
  ...shutEyes(c, 2),
  ...oMouth(c, 4, 17, 7.5, 8.5),
  /* snot bubble */
  L("ellipse", 20, 6, 13, 13, { fill: "#BFE8FF", op: 0.9 }, { j: 5, hold: { type: "pulse", amp: 1.22, period: 1150 } }),
  L("ellipse", 14.5, 11.5, 5, 5, { fill: "#BFE8FF", op: 0.9 }, { j: 5, hold: { type: "pulse", amp: 1.22, period: 1150 } }),
  /* floating Z's */
  LT("Z", 29, -16, 10, { fill: "#7FC4FF", fw: 800 }, { j: 6, in: "none", out: false, tr: driftTr(c, 29, -16, 8, -12, 1400, { ro: 0.95 }) }),
  LT("Z", 37, -26, 13, { fill: "#7FC4FF", fw: 800 }, { j: 7, in: "none", out: false, tr: driftTr(c, 37, -26, 8, -13, 1400, { phase: 460, ro: 0.95 }) }),
  LT("Z", 46, -37, 16, { fill: "#7FC4FF", fw: 800 }, { j: 8, in: "none", out: false, tr: driftTr(c, 46, -37, 8, -13, 1400, { phase: 920, ro: 0.95 }) }),
];
const specCool = (c) => [
  ...faceBase(c, 0),
  L("ka-shades", 0, -10, 46, 46, { fill: NAVY }, { j: 2 }),
  /* temple arms */
  L("rect", -23.5, -12, 6, 3, { fill: NAVY, cr: 49, rot: 18 }, { j: 3 }),
  L("rect", 23.5, -12, 6, 3, { fill: NAVY, cr: 49, rot: -18 }, { j: 3 }),
  /* glint sweeping the left lens */
  L("rect", -12, -10, 2.8, 10, { fill: PURE, op: 0.8, rot: 22 }, { j: 4, in: "none", out: false, tr: driftTr(c, -12, -10, 8, 0, 1500, { ro: 0.85 }) }),
  ...smirkM(c, 5),
  ...cheeks(c, 6, 8),
];
const specAngel = (c) => [
  ...faceBase(c, 0),
  ...arcEyes(c, 2),
  ...smileM(c, 4),
  ...cheeks(c, 5),
  L("ka-halo", 0, -44, 34, 34, { fill: GOLD }, { j: 6, hold: { type: "bob", amp: 3, period: 1300 } }),
];
const specDevil = (c) => [
  LG("Devil sway", [
    ...faceBase(c, 0),
    L("ka-horn", -20, -33, 21, 21, { fill: "#E85454", rot: -16 }, { j: 1, hold: { type: "pulse", amp: 1.08, period: 1100 } }),
    L("ka-horn-r", 20, -33, 21, 21, { fill: "#E85454", rot: 16 }, { j: 2, hold: { type: "pulse", amp: 1.08, period: 1100 } }),
    brow(3, -12.5, -19, 18), brow(4, 12.5, -19, -18),
    ...dotEyes(c, 5, -9, { s: 10 }),
    ...smirkM(c, 6),
  ], { hold: { type: "rock", amp: 2.5, period: 1100 } }),
];
const specTongueOut = (c) => [
  ...faceBase(c, 0),
  ...dotEyes(c, 2, -11, { blink: true }),
  /* tongue sticks out below the smile */
  L("ka-tongue", 4, 22, 15, 15, { fill: TONGUE_C }, { j: 3, hold: { type: "rock", amp: 7, period: 700 } }),
  L("rect", 4, 24, 1.8, 10, { fill: FEAT, op: 0.18, cr: 49 }, { j: 3, hold: { type: "rock", amp: 7, period: 700 } }),
  ...smileM(c, 4, 13, { s: 26 }),
];
const specSick = (c) => [
  ...faceBase(c, 0),
  ...shutEyes(c, 2, -10),
  /* queasy mouth: two small humps side by side */
  L("ka-frown", -6, 19, 11, 11, { fill: FEAT }, { j: 4 }),
  L("ka-frown", 7, 19.5, 11, 11, { fill: FEAT }, { j: 4 }),
  /* cold sweat drop sliding down the temple */
  ...dropFly(5, 27, -17, 10, 0, 13, 1500, { c, ro: 0.9 }),
];
const specWorried = (c) => [
  ...faceBase(c, 0),
  brow(2, -13.5, -21, 4), brow(3, 13.5, -22, -16),
  ...dotEyes(c, 4, -11, { hold: { type: "sway", amp: 2, period: 850 } }),
  ...frownM(c, 5, 18, { s: 23 }),
  ...dropFly(6, 27, -16, 10, 0, 13, 1350, { c, ro: 0.9 }),
];
const specMindBlown = (c) => [
  ...faceBase(c, 0),
  ...dotEyes(c, 2, -9, { s: 9 }),
  ...oMouth(c, 4, 17, 9, 11),
  /* the blast where the crown was */
  L("ka-burst", 0, -44, 36, 36, { fill: ORANGE }, { j: 5, hold: { type: "pulse", amp: 1.14, period: 640 } }),
  L("ka-burst-in", 0, -44, 36, 36, { fill: GOLD }, { j: 6, hold: { type: "pulse", amp: 1.22, period: 820 } }),
  L("ka-spark", -19, -52, 7, 7, { fill: ORANGE }, { j: 7, in: "none", out: false, tr: driftTr(c, -19, -52, -6, -12, 1050) }),
  L("ka-spark", 18, -56, 6, 6, { fill: GOLD }, { j: 8, in: "none", out: false, tr: driftTr(c, 18, -56, 6, -12, 900, { phase: 420 }) }),
  L("ka-spark", 0, -63, 5, 5, { fill: PURE }, { j: 9, in: "none", out: false, tr: driftTr(c, 0, -63, 0, -12, 1150, { phase: 700 }) }),
];

/* ============================================================
   REACTIONS ART — thumbs / palms / flames / arm / popper / crack
   ============================================================ */
/* thumbs-up: fist + long raised thumb, one silhouette (cuff separate) */
regArt("ka-hand", [
  ["M", -16, -8], ["C", -12, -8, -9, -10, -7, -15], ["C", -5, -20, -3, -26, 2, -27],
  ["C", 6, -28, 8, -25, 8, -21], ["C", 8, -17, 7, -13, 6, -10], ["L", 14, -10],
  ["C", 18, -10, 21, -8, 21, -5], ["C", 21, -3, 20, -1, 18, 0], ["C", 20, 1, 21, 3, 21, 6],
  ["C", 21, 9, 19, 10, 17, 11], ["C", 18, 12, 19, 13, 19, 15], ["C", 19, 17, 17, 19, 14, 19],
  ["L", -16, 19], ["Z"],
]);
/* open palm with four finger bumps + thumb (clap) */
const palmCmd = [
  ["M", -4, 17], ["L", 9, 17], ["C", 12, 17, 13, 15, 13, 12], ["L", 13, -6],
  ["C", 13, -8, 12, -9, 10.5, -9], ["C", 9, -9, 8, -8, 8, -6], ["L", 8, -12],
  ["C", 8, -14, 7, -15.5, 5.5, -15.5], ["C", 4, -15.5, 3, -14, 3, -12], ["L", 3, -14],
  ["C", 3, -16, 1.5, -17.5, 0, -17.5], ["C", -1.5, -17.5, -3, -16, -3, -14], ["L", -3, -11],
  ["C", -3, -13, -4.5, -14.5, -6, -14.5], ["C", -7.5, -14.5, -9, -13, -9, -11], ["L", -9, -2],
  ["L", -11, -6], ["C", -12, -8, -14, -8.5, -15, -7.5], ["C", -16, -6.5, -15.5, -4.5, -14, -3],
  ["L", -9, 6], ["C", -7, 10, -5, 13, -4, 17], ["Z"],
];
regArt("ka-palm", palmCmd);
regArt("ka-palm-r", flipXCmds(palmCmd));
/* flames — one frame, nested (outer/mid/inner share the base point) */
const flameOuter = [
  ["M", 0, -22], ["C", 2, -16, 6, -12, 8, -7], ["C", 10, -3, 11, 0, 11, 4],
  ["C", 11, 12, 6, 17, 0, 17], ["C", -6, 17, -11, 12, -11, 4], ["C", -11, -1, -8, -5, -5, -9],
  ["C", -4, -5, -2, -3, 0, -2], ["C", -2, -8, -2, -15, 0, -22], ["Z"],
];
regSet(
  ["ka-flame", flameOuter],
  ["ka-flame-mid", scaleCmds(flameOuter, 0, 17, 0.64)],
  ["ka-flame-in", scaleCmds(flameOuter, 0, 17, 0.38)]
);
/* flexed arm 💪 — upper arm from the left, biceps dome, forearm
   rising to a fist on the right, one silhouette */
regArt("ka-arm", [
  ["M", -22, 7], ["C", -22, 1, -18, -3, -12, -4], ["L", -1, -5], ["C", -3, -9, -1, -14, 3, -16],
  ["C", 7, -18, 11, -15, 11, -11], ["C", 11.5, -14, 12, -16, 12, -19], ["C", 12, -23, 14, -26, 17, -26],
  ["C", 18, -28, 21, -28, 22, -26], ["C", 24, -27, 26, -25, 26, -22], ["L", 26, -8],
  ["C", 26, -2, 24, 3, 20, 6], ["C", 18, 9, 14, 10, 10, 11], ["L", -6, 14],
  ["C", -15, 16, -22, 13, -22, 7], ["Z"],
]);
/* party popper cone */
regArt("ka-popper", [
  ["M", -13, 12], ["L", 9, -15], ["C", 11, -17, 14, -16, 13, -14], ["L", -2, 18],
  ["C", -4, 20, -6, 20, -7, 18], ["Z"],
]);
/* heart crack zigzag band */
regArt("ka-crack", polyRoundCmd([[-0.5, -16], [6, -6], [1.5, -2], [7, 6], [2.5, 16], [-3.5, 16], [1, 6], [-5, -2], [0.5, -6], [-6.5, -16]], 1));

/* ---------- REACTIONS (9) ---------- */
const specHeart = (c) => [ /* classic shapes only — embedded in templates.js */
  L("heart", 0, 3.6, 66, 62, { fill: tone(c.color, -0.26) }, { j: 0, hold: { type: "heartbeat", period: 940 } }),
  L("heart", 0, -0.6, 66, 62, { fill: c.color }, { j: 0, hold: { type: "heartbeat", period: 940 } }),
  L("ellipse", -14, -14, 13, 20, { fill: tone(c.color, 0.5), op: 0.5, rot: -28 }, { j: 1, hold: { type: "heartbeat", period: 940 } }),
  L("star", 21, -19, 9, 9, { fill: PURE }, { j: 2, hold: { type: "blink", period: 1450 } }),
];
const specThumbsUp = (c) => [
  L("rect", -24.5, 3, 13, 32, { fill: BLUE, cr: 28 }, { j: 0 }),
  L("rect", -23.5, 5, 13, 32, { fill: tone(BLUE, -0.2), cr: 28, op: 0.55 }, { j: 0 }),
  L("ellipse", -24.5, -4, 3.5, 3.5, { fill: tone(BLUE, 0.45) }, { j: 1 }),
  L("ka-hand", 5, 2, 62, 62, { fill: tone(c.color, -0.24) }, { j: 1, hold: { type: "bob", amp: 2.5, period: 800 } }),
  L("ka-hand", 4, 0, 62, 62, { fill: c.color }, { j: 1, hold: { type: "bob", amp: 2.5, period: 800 } }),
  /* finger grooves */
  L("rect", 14, 0.5, 11, 3.4, { fill: tone(c.color, -0.3), cr: 49 }, { j: 2, hold: { type: "bob", amp: 2.5, period: 800 } }),
  L("rect", 14, 9, 11, 3.4, { fill: tone(c.color, -0.3), cr: 49 }, { j: 2, hold: { type: "bob", amp: 2.5, period: 800 } }),
  /* approval ticks */
  L("rect", -10, -30, 3.5, 9, { fill: GOLD, cr: 49, rot: -20 }, { j: 3, hold: { type: "blink", period: 900 } }),
  L("rect", 1, -36, 3.5, 10, { fill: GOLD, cr: 49 }, { j: 4, hold: { type: "blink", period: 1100 } }),
  L("rect", 12, -30, 3.5, 9, { fill: GOLD, cr: 49, rot: 20 }, { j: 5, hold: { type: "blink", period: 1300 } }),
];
const specClap = (c) => {
  const t0 = 720, t1 = c.D - EXIT0, per = 720;
  const clap = (side) => {
    const rot = [], xs = [];
    for (let t = t0; t + per <= t1 + 1; t += per) {
      rot.push(kf(t, 16 * side, "easeOutQuad"), kf(t + per * 0.35, 6 * side, "easeInOutSine"), kf(t + per * 0.7, 16 * side, "linear"));
      xs.push(kf(t, bx(17 * side, c.u), "easeOutQuad"), kf(t + per * 0.35, bx(9 * side, c.u), "easeInOutSine"), kf(t + per * 0.7, bx(17 * side, c.u), "linear"));
    }
    rot.push(kf(t1, 16 * side, "linear")); xs.push(kf(t1, bx(17 * side, c.u), "linear"));
    return { rotation: rot, x: xs };
  };
  return [
    L("ka-palm", -18, 2, 52, 52, { fill: tone(c.color, -0.22), rot: -18 }, { j: 0, tr: clap(-1) }),
    L("ka-palm-r", 18, 2, 52, 52, { fill: tone(c.color, -0.22), rot: 18 }, { j: 0, tr: clap(1) }),
    L("ka-palm", -17, 0, 52, 52, { fill: c.color, rot: -18 }, { j: 1, tr: clap(-1) }),
    L("ka-palm-r", 17, 0, 52, 52, { fill: c.color, rot: 18 }, { j: 2, tr: clap(1) }),
    L("rect", -7, -29, 3.5, 9, { fill: GOLD, cr: 49, rot: -24 }, { j: 3, hold: { type: "blink", period: 720 } }),
    L("rect", 0, -32, 3.5, 10, { fill: GOLD, cr: 49 }, { j: 4, hold: { type: "blink", period: 720 } }),
    L("rect", 7, -29, 3.5, 9, { fill: GOLD, cr: 49, rot: 24 }, { j: 5, hold: { type: "blink", period: 720 } }),
  ];
};
const specFire = () => [
  L("ka-flame", 0, 0, 62, 62, { fill: ORANGE }, { j: 0, hold: { type: "sway", amp: 2, period: 900 } }),
  L("ka-flame-mid", 0, 0, 62, 62, { fill: "#FFB64A" }, { j: 0, hold: { type: "flicker", seed: 5 } }),
  L("ka-flame-in", 0, 0, 62, 62, { fill: GOLD }, { j: 0, hold: { type: "flicker", seed: 9 } }),
  L("ellipse", -3, 24, 4, 4, { fill: "#FFB64A", op: 0.9 }, { j: 1, in: "none", out: false, tr: { opacity: [kf(900, 0.9, "linear"), kf(1400, 0.2, "linear"), kf(1500, 0.9, "linear")] } }),
];
const specStarBadge = (c) => [
  L("ka-star", 0, 2.6, 66, 66, { fill: tone(c.color, -0.25) }, { j: 0, hold: { type: "pulse", amp: 1.06, period: 820 } }),
  L("ka-star", 0, -0.6, 66, 66, { fill: c.color }, { j: 0, hold: { type: "pulse", amp: 1.06, period: 820 } }),
  L("ka-sheen", -10, -13, 22, 22, { fill: tone(c.color, 0.5), op: 0.55, rot: -18 }, { j: 1, hold: { type: "pulse", amp: 1.06, period: 820 } }),
  L("ka-spark", 25, -21, 9, 9, { fill: PURE }, { j: 2, hold: { type: "blink", period: 1100 } }),
  L("ka-spark", -26, 13, 7, 7, { fill: PURE, op: 0.85 }, { j: 3, hold: { type: "blink", period: 1400 } }),
];
const specHundred = (c) => [
  LT("100", 0, -8, 36, { fill: c.color, fw: 800, ff: "Archivo Black" }, { j: 0, hold: { type: "bob", amp: 3.5, period: 1000 } }),
  L("rect", 0, 17, 46, 5.5, { fill: c.color, cr: 49 }, { j: 1, hold: { type: "bob", amp: 3.5, period: 1000 } }),
  L("rect", 0, 25, 46, 5.5, { fill: tone(c.color, -0.25), cr: 49 }, { j: 2, hold: { type: "bob", amp: 3.5, period: 1000 } }),
  L("ka-spark", 29, -22, 9, 9, { fill: GOLD }, { j: 3, hold: { type: "blink", period: 1100 } }),
  L("ka-spark", -30, 8, 7, 7, { fill: GOLD, op: 0.85 }, { j: 4, hold: { type: "blink", period: 1400 } }),
];
const specMuscles = (c) => [
  L("ka-arm", 0, 3, 64, 64, { fill: tone(c.color, -0.22) }, { j: 0, hold: { type: "pulse", amp: 1.04, period: 900 } }),
  L("ka-arm", 0, 0, 64, 64, { fill: c.color }, { j: 0, hold: { type: "pulse", amp: 1.04, period: 900 } }),
  /* fist knuckle grooves + biceps shine */
  L("rect", 19, -18.5, 2.6, 6, { fill: tone(c.color, -0.28), cr: 49, rot: 10 }, { j: 1, hold: { type: "pulse", amp: 1.04, period: 900 } }),
  L("rect", 22.5, -16.5, 2.6, 5.5, { fill: tone(c.color, -0.28), cr: 49, rot: 10 }, { j: 1, hold: { type: "pulse", amp: 1.04, period: 900 } }),
  L("ellipse", 3.5, -9.5, 9, 4.5, { fill: PURE, op: 0.32, rot: -20 }, { j: 2, hold: { type: "pulse", amp: 1.04, period: 900 } }),
];
const specBrokenHeart = (c) => [
  L("heart", 0, 3.4, 64, 60, { fill: tone(c.color, -0.3) }, { j: 0, hold: { type: "rock", amp: 3, period: 1300 } }),
  L("heart", 0, -0.8, 64, 60, { fill: c.color }, { j: 0, hold: { type: "rock", amp: 3, period: 1300 } }),
  L("ka-sheen", -13, -15, 22, 22, { fill: tone(c.color, 0.45), op: 0.5, rot: -16 }, { j: 1, hold: { type: "rock", amp: 3, period: 1300 } }),
  L("ka-crack", 1, 0, 26, 26, { fill: tone(c.color, -0.5), rot: 4 }, { j: 1, hold: { type: "rock", amp: 3, period: 1300 } }),
  L("heart", -26, -19, 10, 9, { fill: c.color, rot: -18 }, { j: 2, in: "none", out: false, tr: driftTr(c, -26, -19, -7, -9, 1250, { ro: 0.85 }) }),
  L("heart", 26, -23, 8, 7.5, { fill: tone(c.color, -0.2), rot: 16 }, { j: 3, in: "none", out: false, tr: driftTr(c, 26, -23, 7, -9, 1100, { phase: 500, ro: 0.85 }) }),
];
const specPartyPopper = (c) => [
  L("ka-popper", -10, 12, 50, 50, { fill: tone(c.color, -0.24), rot: -30 }, { j: 0, hold: { type: "rock", amp: 4, period: 900 } }),
  L("ka-popper", -11, 10, 50, 50, { fill: c.color, rot: -30 }, { j: 0, hold: { type: "rock", amp: 4, period: 900 } }),
  L("rect", -14, 8, 14, 4.6, { fill: GOLD, cr: 49, rot: -30 }, { j: 1, hold: { type: "rock", amp: 4, period: 900 } }),
  L("rect", -8, 16, 10, 4.6, { fill: PURE, cr: 49, rot: -30 }, { j: 1, hold: { type: "rock", amp: 4, period: 900 } }),
  /* the burst */
  L("ka-spark", 13, -15, 12, 12, { fill: GOLD }, { j: 2, in: "none", out: false, tr: driftTr(c, 13, -15, 10, -10, 1150) }),
  L("ka-conf", 21, -3, 7, 7, { fill: BLUE, rot: 20 }, { j: 3, in: "none", out: false, tr: driftTr(c, 21, -3, 13, -7, 950, { phase: 300 }) }),
  L("ka-curl", 5, -23, 8, 8, { fill: PINK, rot: 12 }, { j: 4, in: "none", out: false, tr: driftTr(c, 5, -23, 4, -13, 1050, { phase: 620 }) }),
  L("ka-conf", 29, -17, 6, 6, { fill: GREEN, rot: -20 }, { j: 5, in: "none", out: false, tr: driftTr(c, 29, -17, 11, -9, 1250, { phase: 850 }) }),
  L("ellipse", 15, 1, 5, 5, { fill: GOLD }, { j: 6, in: "none", out: false, tr: driftTr(c, 15, 1, 15, -4, 880, { phase: 150 }) }),
];

/* ============================================================
   OBJECTS ART — bell / bow / trophy / rocket / cup / steam / gem /
   balloon + string
   ============================================================ */
/* bell: knob + dome + flared lip, ONE silhouette */
regArt("ka-bell", [
  ["M", 0, -19], ["C", 2.5, -19, 4, -17.5, 4, -15.5], ["L", 4, -14], ["C", 11, -12, 15, -6, 15, 1],
  ["L", 15, 8], ["L", 19, 12], ["C", 20.5, 13.5, 19.5, 16, 17, 16], ["L", -17, 16],
  ["C", -19.5, 16, -20.5, 13.5, -19, 12], ["L", -15, 8], ["L", -15, 1], ["C", -15, -6, -11, -12, -4, -14],
  ["L", -4, -15.5], ["C", -4, -17.5, -2.5, -19, 0, -19], ["Z"],
]);
/* gift bow loop + mirrored twin */
const bowLoopCmd = [
  ["M", 0, 0], ["C", -6, -9, -17, -8, -17, -1], ["C", -17, 5, -7, 6, 0, 1], ["Z"],
];
regArt("ka-bow", bowLoopCmd);
regArt("ka-bow-r", flipXCmds(bowLoopCmd));
/* trophy: cup + stem + base one silhouette; handles share the frame */
regSet(
  ["ka-trophy", [
    ["M", -15, -17], ["L", 15, -17], ["L", 15, -6], ["C", 15, 4, 9, 9, 4, 10], ["L", 4, 14],
    ["L", 9, 14], ["C", 10.5, 14, 11, 15, 11, 16.5], ["L", 11, 19], ["L", -11, 19], ["L", -11, 16.5],
    ["C", -11, 15, -10.5, 14, -9, 14], ["L", -4, 14], ["L", -4, 10], ["C", -9, 9, -15, 4, -15, -6], ["Z"],
  ]],
  ["ka-trophy-hl", arcBandCmd(-18, -8, 8.5, 4.8, 90, 270)],
  ["ka-trophy-hr", arcBandCmd(18, -8, 8.5, 4.8, -90, 90)]
);
/* rocket: hull one silhouette; swept fins share the frame */
const finCmdL = [
  ["M", -7, -1], ["C", -13, 2, -16, 8, -16, 16], ["C", -13, 13.5, -10, 12.5, -7, 12.5], ["Z"],
];
regSet(
  ["ka-rocket", [
    ["M", 0, -23], ["C", 5.5, -17, 8.5, -9, 8.5, 0], ["C", 8.5, 4, 8, 8, 6.5, 11],
    ["L", -6.5, 11], ["C", -8, 8, -8.5, 4, -8.5, 0], ["C", -8.5, -9, -5.5, -17, 0, -23], ["Z"],
  ]],
  ["ka-fin-l", finCmdL],
  ["ka-fin-r", flipXCmds(finCmdL)]
);
/* coffee cup + handle, one frame */
regSet(
  ["ka-cup", [
    ["M", -14, -9], ["L", 14, -9], ["C", 14, -6, 14, -4, 13.5, -2], ["C", 12, 7, 8, 13, 2, 13],
    ["L", -2, 13], ["C", -8, 13, -12, 7, -13.5, -2], ["C", -14, -4, -14, -6, -14, -9], ["Z"],
  ]],
  ["ka-cup-h", arcBandCmd(14.5, 1, 6, 3.8, -80, 80)]
);
/* steam wisp */
regArt("ka-steam", [
  ["M", 1, 12], ["C", -3, 8, 5, 4, 1, 0], ["C", -3, -4, 3, -7, 0, -13], ["L", 3, -14],
  ["C", 7, -8, 0, -5, 4, -1], ["C", 8, 3, 0, 7, 4, 11], ["Z"],
]);
/* gem: faceted silhouette + top table + side facets (one frame) */
regSet(
  ["ka-gem", polyRoundCmd([[-13, -9], [13, -9], [19, 0], [0, 18], [-19, 0]], 1.8)],
  ["ka-gem-t", polyRoundCmd([[-7.5, -9], [7.5, -9], [10.5, 0], [0, 9.5], [-10.5, 0]], 1.2)],
  ["ka-gem-fl", [["M", -13, -9], ["L", -10.5, 0], ["L", -8, 0], ["L", -10.5, -9], ["Z"]]],
  ["ka-gem-fr", [["M", 13, -9], ["L", 10.5, 0], ["L", 8, 0], ["L", 10.5, -9], ["Z"]]]
);
/* balloon: body + knot, one silhouette */
regArt("ka-balloon", [
  ["M", 0, -21], ["C", 9, -21, 15, -13, 15, -4], ["C", 15, 5, 8, 11, 2, 14], ["L", 3.5, 18.5],
  ["L", -3.5, 18.5], ["L", -2, 14], ["C", -8, 11, -15, 5, -15, -4], ["C", -15, -13, -9, -21, 0, -21], ["Z"],
]);
/* wavy string */
regArt("ka-string", [
  ["M", 0, 0], ["C", 2, 5, -3, 8, -1, 13], ["C", 1, 18, -2, 21, 0, 26], ["L", -1.8, 26],
  ["C", -3.5, 21, 0, 18, -2, 13], ["C", -4, 8, 1, 5, -1.5, 0], ["Z"],
]);

/* ---------- OBJECTS (8) ---------- */
const specBell = (c) => [
  LG("Bell swing", [
    L("ka-bell", 0, -0.5, 62, 62, { fill: tone(c.color, -0.22) }, { j: 0 }),
    L("ka-bell", 0, -3.5, 62, 62, { fill: c.color }, { j: 0 }),
    L("ka-sheen", -8, -12, 20, 20, { fill: tone(c.color, 0.5), op: 0.5, rot: -10 }, { j: 1 }),
    L("ellipse", 0, 17.5, 10, 10, { fill: tone(c.color, -0.38) }, { j: 2, hold: { type: "sway", amp: 3, period: 760 } }),
  ], { hold: { type: "rock", amp: 6, period: 760 } }),
  L("rect", -31, -10, 3.6, 10, { fill: GOLD, cr: 49, rot: -32 }, { j: 3, hold: { type: "blink", period: 780 } }),
  L("rect", -34, 3, 3.6, 10, { fill: GOLD, cr: 49, rot: -68 }, { j: 4, hold: { type: "blink", period: 920 } }),
  L("rect", 31, -10, 3.6, 10, { fill: GOLD, cr: 49, rot: 32 }, { j: 5, hold: { type: "blink", period: 780 } }),
  L("rect", 34, 3, 3.6, 10, { fill: GOLD, cr: 49, rot: 68 }, { j: 6, hold: { type: "blink", period: 920 } }),
];
const specGift = (c) => [
  L("rect", 0, 13, 46, 32, { fill: tone(c.color, -0.24), cr: 12 }, { j: 0 }),
  L("rect", 0, 11, 46, 32, { fill: c.color, cr: 12 }, { j: 0 }),
  L("rect", 0, 11, 10, 32, { fill: GOLD }, { j: 1 }),
  L("rect", 0, 24.5, 46, 4, { fill: tone(c.color, -0.32), cr: 2, op: 0.5 }, { j: 1 }),
  LG("Lid pop", [
    L("rect", 0, -9, 54, 15, { fill: tone(c.color, -0.24), cr: 16 }, { j: 2 }),
    L("rect", 0, -11, 54, 15, { fill: c.color, cr: 16 }, { j: 2 }),
    L("rect", 0, -11, 10, 15, { fill: GOLD }, { j: 3 }),
    L("ka-bow", -6.5, -22, 18, 18, { fill: GOLD, rot: -6 }, { j: 4, hold: { type: "pulse", amp: 1.1, period: 720 } }),
    L("ka-bow-r", 6.5, -22, 18, 18, { fill: GOLD, rot: 6 }, { j: 4, hold: { type: "pulse", amp: 1.1, period: 720 } }),
    L("ellipse", 0, -20.5, 6.5, 6, { fill: tone(GOLD, -0.22) }, { j: 5 }),
  ], { tr: hopTr(c, by(0, c.u), -7, Math.round(c.D * 0.55)) }),
];
const specTrophy = (c) => [
  L("ka-trophy-hl", 0, 1.5, 60, 60, { fill: tone(c.color, -0.32) }, { j: 0 }),
  L("ka-trophy-hr", 0, 1.5, 60, 60, { fill: tone(c.color, -0.32) }, { j: 0 }),
  L("ka-trophy", 0, 1.5, 60, 60, { fill: tone(c.color, -0.22) }, { j: 1 }),
  L("ka-trophy", 0, -1.5, 60, 60, { fill: c.color }, { j: 1 }),
  L("ka-star", 0, -6.5, 15, 15, { fill: PURE, op: 0.92 }, { j: 2 }),
  L("rect", -6, -6, 3.4, 20, { fill: PURE, op: 0.5, cr: 49, rot: 18 }, { j: 3, in: "none", out: false, tr: driftTr(c, -10, -6, 16, 0, 1600, { ro: 0.5 }) }),
];
const specRocket = (c) => {
  const hover = { type: "bob", amp: 4, period: 1100 };
  return [
    L("ka-flame", 0, 30, 26, 26, { fill: ORANGE, rot: 180 }, { j: 0, hold: { type: "flicker", seed: 6 } }),
    L("ka-flame-in", 0, 30, 26, 26, { fill: GOLD, rot: 180 }, { j: 0, hold: { type: "flicker", seed: 12 } }),
    L("ka-fin-l", 0, 2, 60, 60, { fill: RED }, { j: 1, hold: hover }),
    L("ka-fin-r", 0, 2, 60, 60, { fill: RED }, { j: 1, hold: hover }),
    L("ka-rocket", 1.2, 2, 60, 60, { fill: tone(c.color, -0.3) }, { j: 2, hold: hover }),
    L("ka-rocket", 0, 0, 60, 60, { fill: c.color }, { j: 2, hold: hover }),
    /* nose tip accent + porthole */
    L("ellipse", 0, -20, 7, 5.5, { fill: RED }, { j: 3, hold: hover }),
    L("ellipse", 0, -7, 13, 13, { fill: tone(c.color, -0.35) }, { j: 4, hold: hover }),
    L("ellipse", 0, -7, 8.5, 8.5, { fill: BLUE }, { j: 5, hold: hover }),
    L("ellipse", -1.8, -9, 2.6, 2.6, { fill: PURE, op: 0.85 }, { j: 6, hold: hover }),
  ];
};
const specLightning = (c) => [
  L("ka-bolt", 1.5, 2, 52, 52, { fill: tone(c.color, -0.3) }, { j: 0, hold: { type: "pulse", amp: 1.05, period: 700 } }),
  L("ka-bolt", 0, -1, 52, 52, { fill: c.color }, { j: 0, hold: { type: "flicker", seed: 11 } }),
  L("ka-sheen", -6, -14, 18, 18, { fill: tone(c.color, 0.55), op: 0.5, rot: 10 }, { j: 1 }),
];
const specCoffee = (c) => [
  L("rect", 0, 25, 50, 7, { fill: tone(c.color, -0.3), cr: 49 }, { j: 0 }),
  L("ka-cup-h", 0, 3, 58, 58, { fill: tone(c.color, -0.5) }, { j: 1 }),
  L("ka-cup", 0, 3, 58, 58, { fill: tone(c.color, -0.32) }, { j: 2 }),
  L("ka-cup", 0, 1, 58, 58, { fill: c.color }, { j: 2 }),
  L("ellipse", 0, -6.5, 24, 6.5, { fill: "#8A5A3B" }, { j: 3 }),
  L("ellipse", 0, -7.5, 24, 5.5, { fill: "#A06A42" }, { j: 3 }),
  L("ka-steam", -5, -20, 11, 11, { fill: PURE, op: 0.75 }, { j: 4, in: "none", out: false, tr: driftTr(c, -5, -20, -2, -11, 1500, { ro: 0.75 }) }),
  L("ka-steam", 6, -22, 11, 11, { fill: PURE, op: 0.75 }, { j: 5, in: "none", out: false, tr: driftTr(c, 6, -22, 2, -11, 1500, { phase: 700, ro: 0.75 }) }),
];
const specGem = (c) => {
  const rock = { type: "rock", amp: 3, period: 1400 };
  return [
    L("ka-gem", 0, 3, 64, 64, { fill: tone(c.color, -0.25) }, { j: 0, hold: rock }),
    L("ka-gem", 0, 0, 64, 64, { fill: c.color }, { j: 0, hold: rock }),
    L("ka-gem-fl", 0, 0, 64, 64, { fill: tone(c.color, 0.22), op: 0.9 }, { j: 1, hold: rock }),
    L("ka-gem-fr", 0, 0, 64, 64, { fill: tone(c.color, -0.14), op: 0.9 }, { j: 1, hold: rock }),
    L("ka-gem-t", 0, 0, 64, 64, { fill: tone(c.color, 0.38), op: 0.85 }, { j: 1, hold: rock }),
    L("ka-spark", 24, -17, 9, 9, { fill: PURE }, { j: 2, hold: { type: "blink", period: 1200 } }),
    L("ka-spark", -23, 15, 7, 7, { fill: PURE, op: 0.85 }, { j: 3, hold: { type: "blink", period: 1500 } }),
  ];
};
const specBalloon = (c) => {
  const bob = { type: "bob", amp: 6, period: 1400 };
  return [
    L("ka-string", 0, 27, 14, 14, { fill: tone(c.color, -0.45) }, { j: 0, hold: { type: "rock", amp: 6, period: 1300 } }),
    L("ka-balloon", 1.2, -5, 56, 56, { fill: tone(c.color, -0.26) }, { j: 1, hold: bob }),
    L("ka-balloon", 0, -7, 56, 56, { fill: c.color }, { j: 1, hold: bob }),
    L("ka-sheen", -7, -18, 18, 18, { fill: tone(c.color, 0.5), op: 0.5, rot: -16 }, { j: 2, hold: bob }),
  ];
};

/* ============================================================
   WEATHER ART — cloud / moon crescent
   ============================================================ */
/* puffy flat-bottom cloud, ONE silhouette */
regArt("ka-cloud", [
  ["M", -24, 11], ["L", 20, 11], ["C", 26, 11, 30, 7, 29, 2], ["C", 28, -2, 23, -4, 19, -3],
  ["C", 19, -10, 13, -16, 5, -16], ["C", -2, -16, -7, -13, -8, -8], ["C", -13, -11, -20, -9, -22, -3],
  ["C", -27, -2, -29, 3, -27, 7], ["C", -26, 10, -25, 11, -24, 11], ["Z"],
]);
/* crescent moon */
regArt("ka-moon", [
  ["M", 8, -15.5], ["C", -4, -12.5, -13, -5, -13, 2], ["C", -13, 10, -5, 15.5, 9, 16.5],
  ["C", 3, 11.5, 0, 6.5, 0, 0.5], ["C", 0, -7, 3, -12.5, 8, -15.5], ["Z"],
]);
/* rainbow arcs — concentric bands sharing one frame */
regSet(
  ["ka-band-1", arcBandCmd(0, 0, 31, 9, 180, 360)],
  ["ka-band-2", arcBandCmd(0, 0, 21, 9, 180, 360)],
  ["ka-band-3", arcBandCmd(0, 0, 11, 9, 180, 360)]
);

/* ---------- WEATHER / NATURE (6) ---------- */
const specSun = (c) => {
  const kids = [
    L("ellipse", 0, 1.8, 38, 38, { fill: tone(c.color, -0.2) }, { j: 0 }),
    L("ellipse", 0, 0, 38, 38, { fill: c.color }, { j: 0 }),
    L("ka-sheen", -7, -9, 14, 14, { fill: tone(c.color, 0.55), op: 0.5, rot: -20 }, { j: 1 }),
    L("ka-spark", 25, -22, 8, 8, { fill: PURE }, { j: 1, hold: { type: "blink", period: 1500 } }),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    kids.push(L("rect", Math.cos(a) * 30, Math.sin(a) * 30, 12, 6, { fill: c.color, cr: 49, rot: i * 45 }, { j: i + 2, stag: 60 }));
  }
  return [LG("Sun rays", kids, { spin: 0.5 })];
};
const cloudBase = (c, j, o = {}) => [
  L("ka-cloud", 0, 3.2, 64, 64, { fill: lerpColor(c.color, "#8FA3C8", 0.55) }, { j, hold: o.hold }),
  L("ka-cloud", 0, 0, 64, 64, { fill: c.color }, { j, hold: o.hold }),
  L("ka-sheen", -12, -8, 17, 17, { fill: PURE, op: 0.45, rot: -14 }, { j: j + 1, hold: o.hold }),
];
const specCloud = (c) => cloudBase(c, 0, { hold: { type: "sway", amp: 4, period: 1500 } });
const specRain = (c) => [
  ...cloudBase(c, 0),
  ...dropFly(1, -14, 25, 9, 0, 16, 850, { c, fill: BLUE }),
  ...dropFly(2, 1, 27, 9, 0, 16, 850, { c, fill: BLUE, phase: 280 }),
  ...dropFly(3, 15, 25, 9, 0, 16, 850, { c, fill: BLUE, phase: 560 }),
];
const specRainbow = () => {
  const bob = { type: "bob", amp: 2.5, period: 1300 };
  return [
    L("ka-band-1", 0, 32, 80, 80, { fill: RED }, { j: 0, in: "rise" }),
    L("ka-band-2", 0, 32, 80, 80, { fill: GOLD }, { j: 1, in: "rise" }),
    L("ka-band-3", 0, 32, 80, 80, { fill: BLUE }, { j: 2, in: "rise" }),
    /* cloud banks at the arc feet */
    L("ka-cloud", -27, 27, 26, 26, { fill: PURE }, { j: 3, hold: bob }),
    L("ka-cloud", 27, 27, 26, 26, { fill: PURE }, { j: 3, hold: bob }),
  ];
};
const specMoon = (c) => {
  const bob = { type: "bob", amp: 3, period: 1500 };
  return [
    L("ka-moon", 1.5, 1.5, 60, 60, { fill: tone(c.color, -0.16) }, { j: 0, hold: bob }),
    L("ka-moon", 0, 0, 60, 60, { fill: c.color }, { j: 0, hold: bob }),
    L("ellipse", -5, -6, 6, 6, { fill: tone(c.color, -0.14), op: 0.8 }, { j: 1, hold: bob }),
    L("ellipse", -6, 6, 4.5, 4.5, { fill: tone(c.color, -0.14), op: 0.8 }, { j: 1, hold: bob }),
    L("ellipse", 3, 12, 3.5, 3.5, { fill: tone(c.color, -0.14), op: 0.8 }, { j: 1, hold: bob }),
    L("ka-spark", 26, -20, 9, 9, { fill: GOLD }, { j: 2, hold: { type: "blink", period: 1200 } }),
    L("ka-spark", 32, 8, 7, 7, { fill: GOLD, op: 0.85 }, { j: 3, hold: { type: "blink", period: 1600 } }),
  ];
};
const specStorm = (c) => [
  ...cloudBase(c, 0),
  L("ka-bolt", 1, 22, 22, 22, { fill: tone(GOLD, -0.3) }, { j: 1, hold: { type: "flicker", seed: 8 } }),
  L("ka-bolt", 0, 21, 22, 22, { fill: GOLD }, { j: 1, hold: { type: "flicker", seed: 8 } }),
  ...dropFly(2, -15, 24, 8, 0, 14, 900, { c, fill: BLUE }),
  ...dropFly(3, 15, 24, 8, 0, 14, 900, { c, fill: BLUE, phase: 450 }),
];

/* ============================================================
   MEDIA ART — bubble / flap / handset / note / play / mic cradle
   ============================================================ */
/* chat bubble: rounded body + tail, one silhouette */
regArt("ka-bubble", [
  ["M", -20, -13], ["C", -26, -13, -29, -10, -29, -5], ["L", -29, 3], ["C", -29, 8, -26, 11, -20, 11],
  ["L", -9, 11], ["L", -14, 19], ["L", -3, 11], ["L", 20, 11], ["C", 26, 11, 29, 8, 29, 3],
  ["L", 29, -5], ["C", 29, -10, 26, -13, 20, -13], ["Z"],
]);
/* envelope flap (the V) */
regArt("ka-flap", [
  ["M", -19, -9], ["L", 19, -9], ["L", 19, -6], ["C", 12, 0.5, 6, 3.5, 0, 3.5],
  ["C", -6, 3.5, -12, 0.5, -19, -6], ["Z"],
]);
/* phone handset — crescent with round ear/mouth caps */
regArt("ka-handset", arcBandCmd(0, 4, 16.5, 8.5, 200, 340));
/* music note: stems + slanted beam + heads, ONE aligned frame */
regSet(
  ["ka-note", [
    ["M", -6, -14], ["C", -6, -15, -5, -15.6, -4, -15.4], ["L", 14, -18.4], ["C", 15.4, -18.7, 16, -18, 16, -16.8],
    ["L", 16, 5], ["C", 16, 6, 15, 7, 14, 7], ["L", 13, 7], ["C", 12, 7, 11, 6, 11, 5],
    ["L", 11, -9.6], ["L", -1, -6.8], ["L", -1, 8], ["C", -1, 9, -2, 10, -3, 10], ["L", -4, 10],
    ["C", -5, 10, -6, 9, -6, 8], ["Z"],
  ]],
  ["ka-note-h1", ellCmd(-3.5, 11.5, 6.6, 4.9, -18)],
  ["ka-note-h2", ellCmd(13.5, 8.5, 6.6, 4.9, -18)]
);
/* play triangle, generously rounded */
regArt("ka-play", polyRoundCmd([[-9, -13], [13, 0], [-9, 13]], 4.2));
/* mic cradle ∪ */
regArt("ka-cradle", arcBandCmd(0, -2, 14, 4.6, 25, 155));

/* ---------- COMMUNICATION / MEDIA (8) ---------- */
const specChat = (c) => [
  L("ka-bubble", 0, 1.6, 62, 62, { fill: tone(c.color, -0.2) }, { j: 0 }),
  L("ka-bubble", 0, -1, 62, 62, { fill: c.color }, { j: 0 }),
  L("ellipse", -13, -4, 7.5, 7.5, { fill: PURE }, { j: 1, hold: { type: "bob", amp: -3.5, period: 620 } }),
  L("ellipse", 0, -4, 7.5, 7.5, { fill: PURE }, { j: 2, hold: { type: "bob", amp: -3.5, period: 620 } }),
  L("ellipse", 13, -4, 7.5, 7.5, { fill: PURE }, { j: 3, hold: { type: "bob", amp: -3.5, period: 620 } }),
];
const specMail = (c) => [
  L("rect", 0, 2, 60, 42, { fill: tone(c.color, -0.34), cr: 10 }, { j: 0 }),
  L("rect", 0, 0, 60, 42, { fill: c.color, cr: 10 }, { j: 0 }),
  L("ka-flap", 0, -8.5, 58, 58, { fill: tone(c.color, -0.44) }, { j: 1 }),
  L("ka-sheen", -16, -10, 16, 16, { fill: tone(c.color, 0.4), op: 0.4, rot: -16 }, { j: 1 }),
  L("ellipse", 27, -19, 15, 15, { fill: RED, fm: "both", sC: PURE, sW: 3 }, { j: 2, hold: { type: "pulse", amp: 1.16, period: 900 } }),
];
const specPhone = (c) => {
  const ring = { type: "rock", amp: 7, period: 520 };
  return [
    L("ka-handset", 1.5, 2.5, 58, 58, { fill: tone(c.color, -0.22), rot: -42 }, { j: 0, hold: ring }),
    L("ka-handset", 0, 0, 58, 58, { fill: c.color, rot: -42 }, { j: 0, hold: ring }),
    /* signal arcs top-right */
    L("ka-sig-1", 25, -25, 20, 20, { fill: tone(c.color, -0.25) }, { j: 1, hold: { type: "blink", period: 700 } }),
    L("ka-sig-2", 25, -25, 33, 33, { fill: tone(c.color, -0.25), op: 0.7 }, { j: 2, hold: { type: "blink", period: 950 } }),
  ];
};
const specCamera = (c) => {
  const lens = { type: "pulse", amp: 1.07, period: 1100 };
  return [
    L("rect", -12, -22, 17, 9, { fill: tone(c.color, -0.2), cr: 24 }, { j: 0 }),
    L("rect", 0, 3, 60, 42, { fill: tone(c.color, -0.22), cr: 14 }, { j: 0 }),
    L("rect", 0, 1, 60, 42, { fill: c.color, cr: 14 }, { j: 0 }),
    L("rect", 0, -18.5, 60, 5, { fill: tone(c.color, -0.32), cr: 2, op: 0.6 }, { j: 1 }),
    L("ellipse", 2, 1, 28, 28, { fill: PURE }, { j: 1, hold: lens }),
    L("ellipse", 2, 1, 18, 18, { fill: NAVY }, { j: 2, hold: lens }),
    L("ellipse", -2.5, -3.5, 5.5, 5.5, { fill: PURE, op: 0.85 }, { j: 3, hold: lens }),
    L("ellipse", 21, -12, 6, 6, { fill: tone(c.color, -0.35) }, { j: 4 }),
    L("ka-spark", 21, -12, 12, 12, { fill: PURE }, { j: 5, hold: { type: "blink", period: 1700 } }),
    L("ka-sheen", -16, -11, 15, 15, { fill: tone(c.color, 0.4), op: 0.4, rot: -16 }, { j: 5 }),
  ];
};
const specMusic = (c) => [
  LG("Note groove", [
    L("ka-note", 2, -0.5, 52, 52, { fill: tone(c.color, -0.22) }, { j: 0 }),
    L("ka-note-h1", 2, -0.5, 52, 52, { fill: tone(c.color, -0.22) }, { j: 0 }),
    L("ka-note-h2", 2, -0.5, 52, 52, { fill: tone(c.color, -0.22) }, { j: 0 }),
    L("ka-note", 2, -2.5, 52, 52, { fill: c.color }, { j: 1 }),
    L("ka-note-h1", 2, -2.5, 52, 52, { fill: c.color }, { j: 1 }),
    L("ka-note-h2", 2, -2.5, 52, 52, { fill: c.color }, { j: 1 }),
  ], { hold: { type: "rock", amp: 4, period: 900 } }),
  L("rect", -24, -13, 3.2, 8, { fill: tone(c.color, -0.3), cr: 49, rot: -28 }, { j: 3, hold: { type: "blink", period: 900 } }),
  L("rect", 28, 13, 3.2, 8, { fill: tone(c.color, -0.3), cr: 49, rot: 28 }, { j: 4, hold: { type: "blink", period: 1150 } }),
];
const specPlay = (c) => [
  L("ellipse", 0, 0, 64, 64, { fill: "none", fm: "stroke", sC: c.color, sW: 4 }, { j: 0, in: "none", out: false, tr: rippleTr(c, 0.9, 1.35, 1500, { ro: 0.6 }) }),
  L("ellipse", 0, 2.2, 64, 64, { fill: tone(c.color, -0.24) }, { j: 1 }),
  L("ellipse", 0, 0, 64, 64, { fill: c.color }, { j: 1 }),
  L("ka-sheen", -13, -16, 26, 26, { fill: tone(c.color, 0.5), op: 0.45, rot: -20 }, { j: 2 }),
  L("ka-play", 3, 0, 30, 30, { fill: PURE }, { j: 3, hold: { type: "pulse", amp: 1.09, period: 900 } }),
];
const specMic = (c) => {
  const bob = { type: "bob", amp: 3, period: 1200 };
  return [
    L("rect", 0, 24, 5, 13, { fill: tone(c.color, -0.35) }, { j: 0 }),
    L("rect", 0, 32, 26, 6, { fill: tone(c.color, -0.35), cr: 49 }, { j: 0 }),
    L("ka-cradle", 0, 5, 46, 46, { fill: tone(c.color, -0.35) }, { j: 1, hold: bob }),
    L("rect", 0, -8, 24, 38, { fill: tone(c.color, -0.25), cr: 49 }, { j: 2, hold: bob }),
    L("rect", 0, -10, 24, 38, { fill: c.color, cr: 49 }, { j: 2, hold: bob }),
    L("ka-sheen", -5, -21, 11, 11, { fill: tone(c.color, 0.45), op: 0.45, rot: -20 }, { j: 3, hold: bob }),
    L("rect", 0, -17, 13, 2.8, { fill: PURE, op: 0.45, cr: 49 }, { j: 3, hold: bob }),
    L("rect", 0, -10, 13, 2.8, { fill: PURE, op: 0.45, cr: 49 }, { j: 3, hold: bob }),
    L("rect", 0, -3, 13, 2.8, { fill: PURE, op: 0.45, cr: 49 }, { j: 3, hold: bob }),
  ];
};
const specVolume = (c) => [ /* classic shapes only — embedded in templates.js */
  L("rect", -24, 0, 15, 26, { fill: c.color, cr: 24 }, { j: 0 }),
  L("triangle", -3, 0, 27, 42, { fill: tone(c.color, -0.16), rot: 90 }, { j: 1 }),
  L("ellipse", -13, -8, 5, 8, { fill: PURE, op: 0.3 }, { j: 1 }),
  L("rect", 16, 0, 6, 22, { fill: tone(c.color, -0.32), cr: 49 }, { j: 2, hold: { type: "pulse", amp: 1.28, period: 520 } }),
  L("rect", 27, 0, 6, 34, { fill: tone(c.color, -0.32), cr: 49, op: 0.7 }, { j: 3, hold: { type: "pulse", amp: 1.16, period: 760 } }),
];

/* ============================================================
   COMMERCE ART — cart / tag / pin / shackle
   ============================================================ */
/* shopping cart: handle + basket, one silhouette */
regArt("ka-cart", [
  ["M", -26, -17], ["C", -26, -19, -24, -20, -22, -20], ["L", -17, -20], ["C", -15, -20, -13, -19, -12, -17],
  ["L", -10, -11], ["L", 20, -11], ["C", 23, -11, 24, -9, 23, -7], ["L", 20, 6], ["C", 19, 9, 17, 10, 14, 10],
  ["L", -4, 10], ["C", -7, 10, -9, 9, -9, 6], ["L", -13, -14], ["L", -22, -14], ["C", -24, -14, -26, -15, -26, -17], ["Z"],
]);
/* price tag with notched corner */
regArt("ka-tag", [
  ["M", -15, -15], ["L", 1, -15], ["C", 3, -15, 5, -14, 6, -13], ["L", 15, -4],
  ["C", 17, -2, 17, 1, 15, 3], ["L", 3, 15], ["C", 1, 17, -2, 17, -4, 15], ["L", -13, 6],
  ["C", -14, 5, -15, 3, -15, 1], ["Z"],
]);
/* map pin: round head + point, one silhouette */
regArt("ka-pin", [
  ["M", 0, 17], ["C", -1.5, 12, -13, 3, -13, -5], ["C", -13, -13, -7, -17, 0, -17],
  ["C", 7, -17, 13, -13, 13, -5], ["C", 13, 3, 1.5, 12, 0, 17], ["Z"],
]);
/* lock shackle ∩ */
regArt("ka-shackle", arcBandCmd(0, 5, 10.5, 5.5, 180, 360));
/* signal arcs (phone waves) — quarter bands */
regArt("ka-sig-1", arcBandCmd(-9, 9, 9, 5, -90, 0));
regArt("ka-sig-2", arcBandCmd(-9, 9, 17, 5, -90, 0));

/* ---------- COMMERCE / MISC (6) ---------- */
const specCart = (c) => {
  const roll = { type: "sway", amp: 4, period: 900 };
  return [
    L("rect", 5, -18, 14, 12, { fill: GOLD, cr: 14 }, { j: 0, hold: { type: "bob", amp: 2.5, period: 800 } }),
    L("ka-cart", 2, 1.5, 62, 62, { fill: tone(c.color, -0.22) }, { j: 1, hold: roll }),
    L("ka-cart", 2, -0.5, 62, 62, { fill: c.color }, { j: 1, hold: roll }),
    /* basket grooves */
    L("rect", 0, -2, 3, 14, { fill: tone(c.color, -0.18), op: 0.55, cr: 49 }, { j: 2, hold: roll }),
    L("rect", 10, -2, 3, 14, { fill: tone(c.color, -0.18), op: 0.55, cr: 49 }, { j: 2, hold: roll }),
    L("ellipse", -8, 18, 11, 11, { fill: NAVY }, { j: 3 }),
    L("ellipse", -8, 18, 4.5, 4.5, { fill: PURE, op: 0.85 }, { j: 3 }),
    L("ellipse", 15, 18, 11, 11, { fill: NAVY }, { j: 4 }),
    L("ellipse", 15, 18, 4.5, 4.5, { fill: PURE, op: 0.85 }, { j: 4 }),
  ];
};
const specTag = (c) => [
  LG("Tag dangle", [
    L("rect", -17.5, -16.5, 11, 3, { fill: tone(c.color, -0.4), cr: 49, rot: -45 }, { j: 0 }),
    L("ka-tag", 1.5, 4, 56, 56, { fill: tone(c.color, -0.24) }, { j: 0 }),
    L("ka-tag", 0, 1, 56, 56, { fill: c.color }, { j: 0 }),
    L("ellipse", -14, -13, 8, 8, { fill: PURE }, { j: 1 }),
    LT("%", 3.5, 5, 19, { fill: PURE, fw: 800 }, { j: 2 }),
  ], { hold: { type: "rock", amp: 6, period: 1100 } }),
];
const specPin = (c) => {
  const bounce = { type: "bounce", amp: 9, period: 1100 };
  return [
    L("ellipse", 0, 32, 30, 7, { fill: NAVY, op: 0.18 }, { j: 0, hold: { type: "pulse", amp: 1.15, period: 1100 } }),
    L("ka-pin", 1.2, -1, 58, 58, { fill: tone(c.color, -0.22) }, { j: 1, hold: bounce }),
    L("ka-pin", 0, -3, 58, 58, { fill: c.color }, { j: 1, hold: bounce }),
    L("ellipse", 0, -11, 13, 13, { fill: PURE }, { j: 2, hold: bounce }),
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
  L("ka-sheen", -15, -9, 14, 14, { fill: tone(c.color, 0.4), op: 0.4, rot: -16 }, { j: 5 }),
  L("ka-spark", 25, -25, 8, 8, { fill: GOLD }, { j: 5, hold: { type: "blink", period: 1300 } }),
];
const specLock = (c) => {
  const tm = Math.round(c.D * 0.5);
  return [
    L("ka-shackle", 0, -14, 36, 36, { fill: tone(c.color, -0.4) }, { j: 0, tr: hopTr(c, by(-14, c.u), -4, tm) }),
    L("rect", 0, 10, 44, 34, { fill: tone(c.color, -0.25), cr: 16 }, { j: 1 }),
    L("rect", 0, 8, 44, 34, { fill: c.color, cr: 16 }, { j: 1 }),
    L("ellipse", 0, 3, 10, 10, { fill: NAVY }, { j: 2 }),
    L("rect", 0, 12, 4.6, 12, { fill: NAVY, cr: 49 }, { j: 2 }),
    L("ka-sheen", -11, 0, 15, 15, { fill: tone(c.color, 0.4), op: 0.4, rot: -20 }, { j: 3 }),
  ];
};
const specArrowUpRight = (c) => [ /* classic shapes only — embedded in templates.js */
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

/* ---------- 14 · REACTION BAR — glass pill, reaction bubbles pop + wave ---------- */
function buildReactionBar(opts) {
  const { D, S } = uiCtx(opts);
  const cy = 358, cx = 640, gap = 66, x0 = cx - gap * 2;
  const glyphs = ["heart", "star", "heart", "diamond", "bolt"];
  const cols = [CORAL, AMBER, "#C084FC", BLUE, MINT];
  const kids = glassParts(cx, cy, 372, 94, 47, D, { inT: 160 });
  glyphs.forEach((g, i) => {
    const x = x0 + i * gap, t0 = 380 + i * 78;
    const bob = { type: "bob", amp: i % 2 ? 5 : -5, period: 940 + i * 30 };
    kids.push(S(`Bubble ${i + 1}`, { shape: "ellipse", x, y: cy, w: 52, h: 52, fill: "#FFFFFF", opacity: 0.94 }, 0, { enter: "pop", inT: t0, hold: bob }));
    kids.push(S(`Icon ${i + 1}`, { shape: g, x, y: cy, w: 25, h: 25, fill: cols[i] }, 0, { enter: "pop", inT: t0 + 46, hold: bob }));
  });
  return kitClip("Reaction Bar", kids, D);
}

/* ---------- 15 · LIKE BURST — heart pop + radial spark burst + heartbeat ---------- */
function buildLikeBurst(opts) {
  const { D, S } = uiCtx(opts);
  const cx = 640, cy = 356, bt = 940;
  const kids = [];
  kids.push(S("Ring", { shape: "ellipse", x: cx, y: cy, w: 64, h: 64, fillMode: "stroke", sC: CORAL, sW: 7, fill: CORAL }, 0, {
    enter: "none", exit: false, inT: bt - 30, outT: bt + 520,
    tracks: { scale: [kf(bt - 30, 0.5, "easeOutCubic"), kf(bt + 380, 3.6, "linear")], opacity: [kf(bt - 30, 0.75, "linear"), kf(bt + 380, 0, "linear")] },
  }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 128;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    kids.push(S(`Spark ${i + 1}`, { shape: i % 2 ? "star" : "diamond", x: cx, y: cy, w: 15, h: 15, fill: i % 2 ? AMBER : CORAL }, 0, {
      enter: "none", exit: false, inT: bt, outT: bt + 540,
      tracks: {
        x: [kf(bt, cx, "easeOutCubic"), kf(bt + 430, px, "linear")],
        y: [kf(bt, cy, "easeOutCubic"), kf(bt + 430, py, "linear")],
        scale: [kf(bt, 0.3, "easeOutBack"), kf(bt + 200, 1, "linear"), kf(bt + 540, 0.2, "linear")],
        opacity: [kf(bt, 0, "linear"), kf(bt + 70, 1, "linear"), kf(bt + 320, 1, "easeInQuad"), kf(bt + 540, 0, "linear")],
      },
    }));
  }
  kids.push(S("Heart", { shape: "heart", x: cx, y: cy, w: 118, h: 118, fill: CORAL }, 0, { enter: "pop", inT: 280, hold: { type: "heartbeat", period: 1150 } }));
  return kitClip("Like Burst", kids, D);
}

/* ---------- 16 · SEGMENTED TABS — pill slides between tabs, active label lifts ---------- */
function buildSegmentedTabs(opts) {
  const { accent, D, S, T } = uiCtx(opts);
  const cy = 360, cx = 640, seg = 118, w = seg * 3;
  const centers = [cx - seg, cx, cx + seg];
  const labels = ["Design", "Motion", "Export"];
  const t1 = 820, t2 = 1440, t3 = 2060, tb = D - 900;
  const mids = [(t1 + t2) / 2, (t2 + t3) / 2, (t3 + tb) / 2];
  const pillX = [kf(560, centers[0], "easeOutBack"), kf(t1, centers[0], "easeInOutCubic"), kf(t2, centers[1], "easeInOutCubic"), kf(t3, centers[2], "easeInOutCubic"), kf(tb, centers[0], "easeInOutCubic")];
  const pillS = [kf(t1, 1, "easeInOutSine"), kf(mids[0], 1.07, "easeInOutSine"), kf(t2, 1, "easeInOutSine"), kf(mids[1], 1.07, "easeInOutSine"), kf(t3, 1, "easeInOutSine"), kf(mids[2], 1.07, "easeInOutSine"), kf(tb, 1, "easeInOutSine")];
  /* fill: INK while the pill sits under this label, DIM otherwise */
  const lf = (on) => on === 0
    ? [kf(500, INK, "linear"), kf(t2, INK, "easeInOutSine"), kf(t2 + 200, DIM, "linear"), kf(tb, DIM, "easeInOutSine"), kf(tb + 220, INK, "linear")]
    : on === 1
      ? [kf(500, DIM, "linear"), kf(t2, DIM, "easeInOutSine"), kf(t2 + 200, INK, "linear"), kf(t3, INK, "easeInOutSine"), kf(t3 + 200, DIM, "linear")]
      : [kf(500, DIM, "linear"), kf(t3, DIM, "easeInOutSine"), kf(t3 + 200, INK, "linear"), kf(tb, INK, "easeInOutSine"), kf(tb + 200, DIM, "linear")];
  const kids = [
    S("Track", { shape: "rect", x: cx, y: cy, w: w + 16, h: 68, cornerR: 40, fill: "#171B24", fillMode: "both", sC: LINE, sW: 1.5 }, 0, { inT: 160, exit: "fade" }),
    S("Pill", { shape: "rect", x: centers[0], y: cy, w: seg - 6, h: 56, cornerR: 34, fill: accent }, 0, { enter: "pop", inT: 480, tracks: { x: pillX, scale: pillS } }),
  ];
  labels.forEach((lbl, i) => kids.push(T(`Tab ${i + 1}`, lbl, centers[i], cy, 18, 700, INK, 0, { enter: "fade", inT: 300 + i * 90, tracks: { fill: lf(i) } })));
  return kitClip("Segmented Tabs", kids, D);
}

/* ---------- 17 · RATING STARS — stars pop in sequence + gentle shimmer ---------- */
function buildRatingStars(opts) {
  const { accent, D, S } = uiCtx(opts);
  const cy = 360, cx = 640, gap = 66, x0 = cx - gap * 2;
  const kids = [];
  for (let i = 0; i < 5; i++) {
    const x = x0 + i * gap, t0 = 520 + i * 150;
    kids.push(S(`Outline ${i + 1}`, { shape: "star", x, y: cy, w: 54, h: 54, fillMode: "stroke", sC: LINE, sW: 3, fill: LINE }, 0, { inT: 220, exit: "fade" }));
    kids.push(S(`Star ${i + 1}`, { shape: "star", x, y: cy, w: 54, h: 54, fill: accent }, 0, { enter: "pop", inT: t0, hold: { type: "pulse", amp: 1.07, period: 1500 } }));
  }
  return kitClip("Rating Stars", kids, D);
}

/* ---------- 18 · STEP PROGRESS — line fills through nodes, checks pop ---------- */
function buildStepProgress(opts) {
  const { accent, D, S } = uiCtx(opts);
  const cy = 360, gap = 150, x0 = 640 - gap, xs = [x0, x0 + gap, x0 + gap * 2];
  const fillW = gap * 2, tReach = [760, 1440, 2120];
  const kids = [
    S("Rail", { shape: "rect", x: 640, y: cy, w: fillW, h: 6, cornerR: 3, fill: LINE }, 0, { inT: 180, exit: "fade" }),
    S("Fill", { shape: "rect", x: xs[0], y: cy, w: fillW, h: 6, cornerR: 3, fill: accent }, 0, {
      enter: "none", exit: "fade", inT: 700,
      tracks: {
        scale: [kf(tReach[0], 0.004, "easeInOutCubic"), kf(tReach[1], 0.5, "easeInOutCubic"), kf(tReach[2], 1, "easeInOutCubic")],
        x: [kf(tReach[0], xs[0] + fillW * 0.004 / 2, "easeInOutCubic"), kf(tReach[1], xs[0] + fillW * 0.5 / 2, "easeInOutCubic"), kf(tReach[2], xs[0] + fillW / 2, "easeInOutCubic")],
      },
    }),
  ];
  xs.forEach((x, i) => {
    kids.push(S(`Node ${i + 1}`, { shape: "ellipse", x, y: cy, w: 46, h: 46, fill: CARD, fillMode: "both", sC: LINE, sW: 3 }, 0, { inT: 220 + i * 40, exit: "fade" }));
    kids.push(S(`Active ${i + 1}`, { shape: "ellipse", x, y: cy, w: 46, h: 46, fill: accent }, 0, { enter: "pop", exit: "fade", inT: tReach[i] }));
    kids.push(S(`Check ${i + 1}`, { shape: "cross", x, y: cy, w: 16, h: 16, fill: INK, rotation: 45 }, 0, { enter: "pop", exit: "fade", inT: tReach[i] + 90 }));
  });
  return kitClip("Step Progress", kids, D);
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
  { id: "reaction-bar", name: "Reaction Bar", category: "Feedback", tags: ["reactions", "emoji", "like", "social", "bar"], recipe: "bubbles pop + wave bob", build: buildReactionBar },
  { id: "like-burst", name: "Like Burst", category: "Feedback", tags: ["like", "heart", "burst", "love", "celebrate"], recipe: "heart pop + spark burst + heartbeat", build: buildLikeBurst },
  { id: "segmented-tabs", name: "Segmented Tabs", category: "Controls", tags: ["tabs", "segmented", "switch", "pill", "control"], recipe: "sliding pill + active label", build: buildSegmentedTabs },
  { id: "rating-stars", name: "Rating Stars", category: "Feedback", tags: ["rating", "stars", "review", "feedback", "score"], recipe: "sequential star pop + shimmer", build: buildRatingStars },
  { id: "step-progress", name: "Step Progress", category: "Feedback", tags: ["steps", "progress", "onboarding", "wizard", "stepper"], recipe: "line fill + step checks", build: buildStepProgress },
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

/* ============================================================
   LOCKED KIT OBJECTS (R7a) — pure accessors backing the editor's "kit"
   layer type. A kit object stores ONE plain layer (no editable children)
   with props { kit, variant, color, accent }; StageObject calls
   kitRenderSpec() to re-derive the SAME layer tree the builders produce
   and draws it read-only, scaled into the object's w/h box.

   · kitKind(id)      — "icon" | "ui" | null (unknown id)
   · kitById(id)      — the registry entry (or null)
   · kitRenderSpec(id, { variant, color, accent, size, dur })
       → { kind, tree, frame, dur } — tree is the kit clip (children in
         stage coords, end "loop"), frame its content bbox (frameOf),
         dur the loop length. Ids are RE-MINTED DETERMINISTICALLY
         (kt1, kt2, … in walk order) so the same (id, opts) always
         yields byte-identical markup from the shared render path —
         build() itself keeps minting fresh ob<n> ids for the editable
         clip-insert path (old projects, template embeds).
   ============================================================ */
export function kitKind(kitId) {
  if (ICONS.some((k) => k.id === kitId)) return "icon";
  if (UI_ELEMENTS.some((k) => k.id === kitId)) return "ui";
  return null;
}
export function kitById(kitId) {
  return ICONS.find((k) => k.id === kitId) || UI_ELEMENTS.find((k) => k.id === kitId) || null;
}
/* deterministic re-id — walk-order kt<n>, keeps the tree otherwise intact */
function reidTree(o) {
  const c = JSON.parse(JSON.stringify(o));
  let n = 0;
  const walk = (l) => { l.id = `kt${(n += 1)}`; (l.children || []).forEach(walk); };
  walk(c);
  return c;
}
export function kitRenderSpec(kitId, opts = {}) {
  const kind = kitKind(kitId);
  const kit = kitById(kitId);
  if (!kind || !kit) return null;
  const built = kind === "icon"
    ? kit.build({ variant: opts.variant, color: opts.color || undefined, size: opts.size, dur: opts.dur })
    : kit.build({ accent: opts.accent || undefined, color: opts.color || undefined, dur: opts.dur });
  const tree = reidTree(built);
  return { kind, tree, frame: frameOf(tree), dur: tree.props.dur };
}

export default { ICONS, UI_ELEMENTS, ICON_CATS, UI_CATS, KIT_COLORS, frameOf, kitKind, kitById, kitRenderSpec };
