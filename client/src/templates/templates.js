/* ============================================================
   TEMPLATES — starter compositions for the editor.
   Every buildProject() returns a project JSON that matches the
   GraphicDestinationMotion schema (app "graphic-destination-motion", v 5)
   EXACTLY: layer shape mirrors makeObject() (base props + per-type merge),
   keyframes are { t, v, ease } with easing ids from EASE, colors come from
   the engine SWATCHES and fonts from its FONTS list.
   Every buildClip() returns the SAME composition packed as one clip layer
   (children = the template's objects, fresh ids on every call; 0-relative
   timing, dur = template length, fade in/out) — the editor inserts it at
   the playhead through the normal clip path and re-issues editor ids.
   All templates: 1280×720 stage, 5000 ms duration.

   MOTION GRAMMAR (Jitter): in → hold → out, never ping-pong.
     · in:    easeOutBack overshoot pops / eased rises, 50–150 ms staggers
     · hold:  gentle recipe motion that always returns to the rest pose
     · out:   accelerating (ease-in) exits, staggered, everything gone by
              ~4900 ms so the 5000 → 0 loop point is a clean empty frame
   Camera templates additionally carry a project-level `camera` whose
   tracks are loop-aware (first value === last value on every track) and
   whose layers mix ≥ 3 parallax depths (props.depth, engine/camera.js).
   ============================================================ */

import { mulberry32 } from "../engine/random.js";
import { backdropDefaults } from "../engine/backdrops.js";
import { ICONS } from "../engine/kits.js";

const STAGE_W = 1280;
const STAGE_H = 720;
const DUR = 5000;
const STAGE_BG = "#101218"; // engine default stage background

/* engine constants (client/src/components/GraphicDestinationMotion.jsx) */
const SWATCHES = ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#C084FC", "#F9F9F9", "#0F1116"];
const [AMBER, CORAL, BLUE, MINT, VIOLET, WHITE, INK] = SWATCHES;
const BRAND = { id: "b1", name: "Zwoosh", colors: [AMBER, CORAL, BLUE, MINT, WHITE], headFont: "Space Grotesk", bodyFont: "Inter" };
const BOX_DEFAULTS = { bg: "", pad: 16, borderC: AMBER, borderW: 0, radius: 14, boxFx: "none" };
const DIM = "#939BAD";   /* muted ink — secondary text on dark */
const CARD = "#171B24";  /* panel/card fill on dark stages */
const LINE = "#2E3546";  /* hairline borders on dark stages */

let _id = 0;
const uid = () => `ob${(_id += 1)}`;

/* makeObject() twin — same base props, same per-type merges, same precedence */
function layer(type, name, props = {}, tracks = {}, children = null) {
  const base = {
    id: uid(), type, name, tracks, locked: false, hidden: false,
    props: { x: STAGE_W / 2, y: STAGE_H / 2, scale: 1, rotation: 0, opacity: 1, fill: WHITE, w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0 },
  };
  if (type === "shape") Object.assign(base.props, { shape: "rect", w: 190, h: 190, fillMode: "fill", sC: AMBER, sW: 3, cornerR: 0 });
  if (type === "text") Object.assign(base.props, { text: "Headline", fontSize: 72, fontWeight: 700, w: 0, h: 0, textFx: null, fontFamily: "Space Grotesk", ls: 0.5, upper: false, pathMode: "flow", ...BOX_DEFAULTS });
  if (type === "number") Object.assign(base.props, { from: 0, to: 100, start: 200, dur: 1600, style: "odometer", decimals: 0, prefix: "", suffix: "", fontSize: 96, fill: WHITE, numEase: "easeOutCubic", fontFamily: "JetBrains Mono", ring: "none", ringC: AMBER, ringW: 8, ...BOX_DEFAULTS });
  if (type === "confetti") Object.assign(base.props, { burst: 500, count: 70, power: 1, seed: 7, style: "burst" });
  if (type === "chart") Object.assign(base.props, { chartType: "bar", dataStr: "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84", start: 200, dur: 1400, showVals: true, bg: CARD, bgOp: 1, radius: 18, borderC: "#2B3140", borderW: 1, pad: 20 });
  if (type === "backdrop") Object.assign(base.props, backdropDefaults());
  if (type === "clip") { base.children = children || []; Object.assign(base.props, { start: 0, dur: 3000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500 }); }
  Object.assign(base.props, props);
  return base;
}

function project(objects, bg = STAGE_BG, dims = null, camera = null) {
  return {
    app: "graphic-destination-motion",
    v: 5,
    stage: { w: dims?.w || STAGE_W, h: dims?.h || STAGE_H, dur: DUR, bg },
    brands: [{ ...BRAND, colors: [...BRAND.colors] }],
    brandId: "b1",
    objects,
    /* 2.5D scene camera (engine/camera.js) — optional, loop-aware tracks */
    ...(camera ? { camera } : {}),
  };
}

/* A template packed as one clip layer (insert-as-editable-clip path).
   start stays 0-relative — the editor re-times it to the playhead on insert;
   "hide" + fade out makes the clip behave like a scene that leaves cleanly. */
function templateClip(name, children) {
  return layer("clip", name, {
    start: 0, dur: DUR, speed: 1, end: "hide",
    tIn: "fade", tOut: "fade", tDur: 500,
    x: STAGE_W / 2, y: STAGE_H / 2,
  }, {}, children);
}

/* deep clone with freshly minted ids — used to embed kit builds (engine/kits.js
   has its own id counter, so raw embeds would collide with template ids) */
function reid(o) {
  const c = JSON.parse(JSON.stringify(o));
  const walk = (l) => { l.id = uid(); (l.children || []).forEach(walk); };
  walk(c);
  return c;
}

/* embed an animated kit icon (engine/kits.js) as a one-shot clip: the kit's
   full in→hold→out grammar plays once inside [start, start+kitDur], then the
   clip hides — the template's loop point stays a clean frame. x/y shifts the
   whole kit (children are stage-coord absolute, offset by x−640, y−360). */
function embedIcon(id, opts, place = {}) {
  const kit = ICONS.find((k) => k.id === id);
  const clip = reid(kit.build(opts));
  clip.name = place.name || kit.name;
  clip.props.x = place.x ?? STAGE_W / 2;
  clip.props.y = place.y ?? STAGE_H / 2;
  clip.props.start = place.start ?? 0;
  clip.props.end = "hide";
  return clip;
}

/* ============================================================
   KEYFRAME HELPERS — the Jitter grammar, shared by every template
   ============================================================ */
const K = (t, v, ease = "linear") => ({ t: Math.round(t), v, ease });
/* merge track maps, keeping every track sorted by t */
const MT = (...maps) => {
  const out = {};
  for (const m of maps) for (const p in m) out[p] = [...(out[p] || []), ...m[p]];
  for (const p in out) out[p].sort((a, b) => a.t - b.t);
  return out;
};

/* entrances — `ro` = the part's rest opacity (dim parts stay dim through) */
const popIn = (t0, d = 520, ro = 1) => ({
  scale: [K(t0, 0, "easeOutBack"), K(t0 + d, 1, "linear")],
  opacity: [K(t0, 0, "easeOutQuad"), K(t0 + Math.min(260, d * 0.5), ro, "linear")],
});
const riseIn = (t0, y, rise = 34, d = 620, ro = 1) => ({
  y: [K(t0, y + rise, "easeOutCubic"), K(t0 + d, y, "linear")],
  opacity: [K(t0, 0, "easeOutQuad"), K(t0 + d * 0.45, ro, "linear")],
});
const dropIn = (t0, y, drop = 40, d = 560, ro = 1) => ({
  y: [K(t0, y - drop, "easeOutCubic"), K(t0 + d, y, "linear")],
  opacity: [K(t0, 0, "easeOutQuad"), K(t0 + d * 0.45, ro, "linear")],
});
const fadeIn = (t0, d = 340, ro = 1) => ({ opacity: [K(t0, 0, "easeOutQuad"), K(t0 + d, ro, "linear")] });

/* exits — always accelerating (ease-in), opacity gone before `t2` */
const whipOut = (t1, t2, ro = 1) => ({
  scale: [K(t1, 1, "easeOutQuad"), K(t1 + 120, 1.06, "easeInCubic"), K(t2, 0, "linear")],
  opacity: [K(t1 + 40, ro, "easeInQuad"), K(t2 - 60, 0, "linear")],
});
const fadeOut = (t1, t2, ro = 1) => ({ opacity: [K(t1, ro, "easeInQuad"), K(t2, 0, "linear")] });
const slideYOut = (t1, t2, y, dy, ro = 1) => ({
  y: [K(t1, y, "easeInCubic"), K(t2, y + dy, "linear")],
  opacity: [K(t1 + 30, ro, "easeInQuad"), K(t2 - 50, 0, "linear")],
});

/* holds — recipe motion inside [t0, t1], ALWAYS landing back on the rest
   pose at t1 so the exit starts from a clean state (no mid-pose cuts) */
function holdTr(h, x, y, t0, t1, ro = 1) {
  if (t1 < t0 + 240) return {};
  if (h.type === "pulse") {
    const per = h.period || 680, amp = h.amp || 1.06;
    const tr = [K(t0, 1, "easeInOutSine")];
    let t = t0, up = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(K(t, up ? amp : 1, "easeInOutSine")); up = !up; }
    if (!up || tr[tr.length - 1].v !== 1) tr.push(K(t1, 1, "easeInOutSine"));
    return { scale: tr };
  }
  if (h.type === "bob") {
    const per = h.period || 940, amp = h.amp || 7;
    const tr = [K(t0, y, "easeInOutSine")];
    let t = t0, dn = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(K(t, dn ? y + amp : y, "easeInOutSine")); dn = !dn; }
    if (!dn || tr[tr.length - 1].v !== y) tr.push(K(t1, y, "easeInOutSine"));
    return { y: tr };
  }
  if (h.type === "sway") {
    const per = h.period || 980, amp = h.amp || 7;
    const tr = [K(t0, x, "easeInOutSine")];
    let t = t0, rt = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(K(t, rt ? x + amp : x, "easeInOutSine")); rt = !rt; }
    if (!rt || tr[tr.length - 1].v !== x) tr.push(K(t1, x, "easeInOutSine"));
    return { x: tr };
  }
  if (h.type === "spin") return { rotation: [K(t0, h.from || 0, "linear"), K(t1, (h.from || 0) + 360 * (h.turns || 1), "linear")] };
  if (h.type === "blink") {
    const per = h.period || 1060;
    const tr = [];
    for (let t = t0; t + per <= t1 + 1; t += per) tr.push(K(t, ro, "linear"), K(t + per / 2, 0, "linear"), K(t + per / 2 + 60, ro, "linear"));
    tr.push(K(t1, ro, "linear"));
    return { opacity: tr };
  }
  return {};
}

/* PART FACTORY — one layer with the full in → hold → out grammar.
   p: base props (stage coords). o: { at, enter: "pop"|"rise"|"drop"|"fade"|"none",
   inDur, rise, hold, exit: "whip"|"fade"|"slideU"|"slideD"|false, exitStart,
   out (outT), outDy, tracks } */
function part(type, name, p, o = {}) {
  const at = o.at ?? 150;
  const ro = p.opacity ?? 1;
  const iD = o.inDur ?? 520;
  let tracks = {};
  const enter = o.enter ?? "pop";
  if (enter === "pop") tracks = MT(tracks, popIn(at, iD, ro));
  else if (enter === "rise") tracks = MT(tracks, riseIn(at, p.y, o.rise ?? 34, o.inDur ?? 620, ro));
  else if (enter === "drop") tracks = MT(tracks, dropIn(at, p.y, o.rise ?? 40, o.inDur ?? 560, ro));
  else if (enter === "fade") tracks = MT(tracks, fadeIn(at, o.inDur ?? 340, ro));
  const ex0 = o.exitStart ?? 4000;
  const t2 = o.out ?? 4600;
  if (o.exit === "whip") tracks = MT(tracks, whipOut(ex0, t2, ro));
  else if (o.exit === "fade") tracks = MT(tracks, fadeOut(ex0, t2, ro));
  else if (o.exit === "slideU") tracks = MT(tracks, slideYOut(ex0, t2, p.y, -(o.outDy ?? 42), ro));
  else if (o.exit === "slideD") tracks = MT(tracks, slideYOut(ex0, t2, p.y, o.outDy ?? 42, ro));
  if (o.hold) tracks = MT(tracks, holdTr(o.hold, p.x, p.y, at + iD + 40, ex0, ro));
  if (o.tracks) tracks = MT(tracks, o.tracks);
  return layer(type, name, { ...p, inT: at, outT: o.out ?? null }, tracks);
}

/* full-stage animated backdrop, loop-locked to the comp (loopMs = 5000 ⇒ the
   5000 → 0 wrap shows the identical frame) */
function bg(variant, theme, over = {}) {
  return layer("backdrop", "Backdrop", {
    x: STAGE_W / 2, y: STAGE_H / 2, w: STAGE_W, h: STAGE_H,
    ...backdropDefaults(variant, theme), loopMs: DUR, ...over,
  });
}

/* small pill chip (kicker labels) */
function chip(text, x, y, fill, o = {}) {
  return part("text", o.name || "Chip", {
    text, fontSize: o.fontSize || 19, fontWeight: 700, ls: o.ls ?? 2.4, upper: true,
    fill, x, y, fontFamily: o.fontFamily || "Inter",
    bg: o.bg || "#20263499", borderC: fill, borderW: 1.5, radius: 999, pad: o.pad || 14, boxFx: o.boxFx || "none",
  }, { enter: "pop", ...o });
}

/* CTA button pair (shape + label) with the Jitter press grammar:
   back-pop entrance, squash-press at each of `presses`, whip exit. */
function ctaButton(label, x, y, w, h, fill, ink, presses = [], o = {}) {
  const at = o.at ?? 900;
  const press = [K(at, 0, "easeOutBack"), K(at + 470, 1, "linear")];
  presses.forEach((t) => press.push(K(t, 1, "easeOutQuad"), K(t + 90, 0.92, "easeInOutSine"), K(t + 220, 1.05, "easeInOutSine"), K(t + 340, 1, "linear")));
  const ex0 = o.exitStart ?? 4000, t2 = o.out ?? 4560;
  press.push(K(ex0, 1, "easeOutQuad"), K(ex0 + 120, 1.07, "easeInCubic"), K(t2, 0, "linear"));
  const op = [K(at, 0, "easeOutQuad"), K(at + 230, 1, "linear"), K(ex0 + 40, 1, "easeInQuad"), K(t2 - 60, 0, "linear")];
  const btn = layer("shape", o.name || "CTA button", {
    shape: "rect", x, y, w, h, cornerR: Math.round(h / 2), fill, inT: at, outT: t2,
  }, { scale: press, opacity: op });
  const txt = layer("text", "CTA label", {
    text: label, fontSize: o.fontSize || 26, fontWeight: 800, ls: 2.5, upper: true, fill: ink, x, y, inT: at + 90, outT: t2,
  }, { scale: press, opacity: op });
  return [btn, txt];
}

/* press ripple — an expanding stroke ring fired at t (button feedback) */
function ripple(x, y, w, h, fill, t) {
  return layer("shape", "Ripple", {
    shape: "ellipse", x, y, w, h, fillMode: "stroke", sC: fill, sW: 4, fill, inT: t, outT: t + 780,
  }, {
    scale: [K(t, 0.6, "easeOutCubic"), K(t + 700, 1.9, "linear")],
    opacity: [K(t, 0.75, "easeOutQuad"), K(t + 700, 0, "linear")],
  });
}

/* loop-aware camera: every track's first and last keyframe share a value so
   the 5000 → 0 wrap is seamless. cam([[t,v,ease]…], [[t,v,ease]…], [[t,v,ease]…]) */
function cam(xKeys, yKeys, zKeys) {
  const tr = (keys) => keys.map(([t, v, ease]) => K(t, v, ease || "easeInOutSine"));
  const tracks = {};
  if (xKeys) tracks.x = tr(xKeys);
  if (yKeys) tracks.y = tr(yKeys);
  if (zKeys) tracks.zoom = tr(zKeys);
  return { tracks };
}

/* glassmorphism triple: soft shadow + translucent pane + hairline rim */
function glassParts(x, y, w, h, r, o = {}) {
  const at = o.at ?? 200, ex0 = o.exitStart ?? 4050, t2 = o.out ?? 4550;
  const mk = (n, p) => part("shape", n, p, { at, enter: "fade", inDur: 420, exit: "fade", exitStart: ex0, out: t2, tracks: o.tracks });
  return [
    mk("Glass shadow", { shape: "rect", x, y: y + Math.round(h * 0.09), w: Math.round(w * 0.96), h: Math.round(h * 0.9), cornerR: r, fill: "#000000", opacity: 0.32 }),
    mk("Glass pane", { shape: "rect", x, y, w, h, cornerR: r, fill: "#FFFFFF", opacity: 0.13 }),
    mk("Glass rim", { shape: "rect", x, y, w, h, cornerR: r, fillMode: "stroke", sC: "#FFFFFF", sW: 1.5, fill: "#FFFFFF", opacity: 0.35 }),
  ];
}

/* Empty composition used by "New project" on the dashboard.
   Optional dims ({ w, h }) override the default 1280×720 stage — callers that
   create a project for a non-16:9 target can start on the right canvas. */
export function blankProject(dims) {
  return project([], STAGE_BG, dims);
}

/* ============================================================
   (a) LOGO REVEAL — shape scale-in (easeOutBack) + brand text fade
   ============================================================ */
function logoRevealObjects() {
  const ring = layer("shape", "Pulse ring", {
    shape: "ellipse", x: 640, y: 300, w: 330, h: 330, fillMode: "stroke", sC: AMBER, sW: 2, fill: AMBER,
  }, {
    scale: [{ t: 0, v: 0.55, ease: "easeOutCubic" }, { t: 1050, v: 1.2, ease: "linear" }],
    opacity: [{ t: 0, v: 0.85, ease: "easeInQuad" }, { t: 1050, v: 0, ease: "linear" }],
  });
  const mark = layer("shape", "Logo mark", {
    shape: "bolt", x: 640, y: 300, w: 150, h: 150, fill: AMBER,
  }, {
    scale: [{ t: 250, v: 0, ease: "easeOutBack" }, { t: 950, v: 1, ease: "linear" }],
    rotation: [{ t: 250, v: -120, ease: "easeOutCubic" }, { t: 950, v: 0, ease: "linear" }],
    opacity: [{ t: 250, v: 0, ease: "easeOutQuad" }, { t: 500, v: 1, ease: "linear" }],
  });
  const brand = layer("text", "Brand name", {
    text: "ACME STUDIO", fontSize: 62, fontWeight: 700, ls: 6, upper: true, fill: WHITE, x: 640, y: 468,
    textFx: { type: "rise", start: 800, seed: 3 },
  });
  const tag = layer("text", "Tagline", {
    text: "M O T I O N   D E S I G N", fontSize: 19, fontWeight: 500, ls: 2, fill: AMBER, x: 640, y: 528, opacity: 0.9,
  }, {
    opacity: [{ t: 1500, v: 0, ease: "easeOutQuad" }, { t: 2000, v: 0.9, ease: "linear" }],
  });
  return [ring, mark, brand, tag];
}
function buildLogoReveal() {
  return project(logoRevealObjects());
}

/* ============================================================
   (b) QUOTE CARD — large serif text, per-char FX, subtle accent bar
   ============================================================ */
function quoteCardObjects() {
  const mark = layer("text", "Quote mark", {
    text: "“", fontSize: 230, fontWeight: 800, fontFamily: "Playfair Display", fill: VIOLET, opacity: 0.16, x: 350, y: 215,
  });
  const bar = layer("shape", "Accent bar", {
    shape: "rect", x: 640, y: 205, w: 96, h: 8, cornerR: 4, fill: AMBER,
  }, {
    scale: [{ t: 150, v: 0, ease: "easeOutCubic" }, { t: 800, v: 1, ease: "linear" }],
    opacity: [{ t: 150, v: 0, ease: "easeOutQuad" }, { t: 400, v: 1, ease: "linear" }],
  });
  const quote = layer("text", "Quote", {
    text: "Design is intelligence\nmade visible.", fontSize: 54, fontWeight: 600, fontFamily: "Playfair Display", fill: WHITE, x: 640, y: 330, ls: 0.5,
    textFx: { type: "rise", start: 420, seed: 5 },
  });
  const author = layer("text", "Author", {
    text: "— ALINA WHEELER", fontSize: 20, fontWeight: 600, ls: 3, fill: VIOLET, x: 640, y: 488,
  }, {
    opacity: [{ t: 1400, v: 0, ease: "easeOutQuad" }, { t: 2000, v: 1, ease: "linear" }],
  });
  return [mark, bar, quote, author];
}
function buildQuoteCard() {
  return project(quoteCardObjects());
}

/* ============================================================
   (c) LOWER THIRD — sliding rect + name/title text
   ============================================================ */
function lowerThirdObjects() {
  /* bar + accent strip + texts share one slide-in window so they travel locked together */
  const slide = (from, to) => [{ t: 150, v: from, ease: "easeOutCubic" }, { t: 850, v: to, ease: "linear" }];
  const bgBar = layer("shape", "Bar", {
    shape: "rect", x: 400, y: 596, w: 580, h: 112, cornerR: 12, fill: INK, opacity: 0.92,
  }, {
    x: slide(-320, 400),
    opacity: [{ t: 150, v: 0, ease: "easeOutQuad" }, { t: 450, v: 0.92, ease: "linear" }],
  });
  const strip = layer("shape", "Accent strip", {
    shape: "rect", x: 117, y: 596, w: 12, h: 112, fill: AMBER,
  }, {
    x: slide(-603, 117),
    opacity: [{ t: 150, v: 0, ease: "easeOutQuad" }, { t: 450, v: 1, ease: "linear" }],
  });
  const name = layer("text", "Name", {
    text: "JORDAN LEE", fontSize: 40, fontWeight: 700, ls: 2, upper: true, fill: WHITE, x: 360, y: 578,
  }, {
    x: [{ t: 350, v: -160, ease: "easeOutCubic" }, { t: 1050, v: 360, ease: "linear" }],
    opacity: [{ t: 350, v: 0, ease: "easeOutQuad" }, { t: 700, v: 1, ease: "linear" }],
  });
  const title = layer("text", "Title", {
    text: "Motion Designer", fontSize: 23, fontWeight: 500, ls: 1, fill: AMBER, x: 316, y: 626,
  }, {
    x: [{ t: 450, v: -204, ease: "easeOutCubic" }, { t: 1150, v: 316, ease: "linear" }],
    opacity: [{ t: 450, v: 0, ease: "easeOutQuad" }, { t: 800, v: 1, ease: "linear" }],
  });
  return [bgBar, strip, name, title];
}
function buildLowerThird() {
  return project(lowerThirdObjects());
}

/* ============================================================
   (d) COUNTDOWN 5-4-3-2-1 — number roller layer + progress ring
   ============================================================ */
function countdownObjects() {
  const counter = layer("number", "Countdown", {
    from: 5, to: 1, start: 250, dur: 4000, style: "count", numEase: "linear",
    fontSize: 220, fontFamily: "JetBrains Mono", fill: WHITE, x: 640, y: 350,
    ring: "ring", ringC: BLUE, ringW: 10, bg: "",
  });
  const label = layer("text", "Label", {
    text: "GET READY", fontSize: 30, fontWeight: 700, ls: 8, upper: true, fill: BLUE, x: 640, y: 566,
    textFx: { type: "tracking", start: 250, seed: 2 },
  });
  return [counter, label];
}
function buildCountdown() {
  return project(countdownObjects());
}

/* ============================================================
   (e) SUBSCRIBE CTA — pulsing button shape + bell + text
   ============================================================ */
function subscribeObjects() {
  const pulse = [
    { t: 0, v: 0, ease: "easeOutBack" }, { t: 550, v: 1, ease: "easeInOutSine" },
    { t: 900, v: 1.07, ease: "easeInOutSine" }, { t: 1250, v: 1, ease: "easeInOutSine" },
    { t: 2300, v: 1.07, ease: "easeInOutSine" }, { t: 2650, v: 1, ease: "easeInOutSine" },
    { t: 3700, v: 1.07, ease: "easeInOutSine" }, { t: 4050, v: 1, ease: "linear" },
  ];
  const button = layer("shape", "Button", {
    shape: "rect", x: 640, y: 410, w: 330, h: 98, cornerR: 49, fill: CORAL,
  }, { scale: pulse });
  const cta = layer("text", "CTA label", {
    text: "SUBSCRIBE", fontSize: 34, fontWeight: 800, ls: 3, upper: true, fill: WHITE, x: 640, y: 410,
  }, { scale: pulse });
  const bell = layer("text", "Bell", {
    text: "🔔", fontSize: 58, fontWeight: 400, fill: WHITE, x: 640, y: 262,
  }, {
    opacity: [{ t: 500, v: 0, ease: "easeOutQuad" }, { t: 750, v: 1, ease: "linear" }],
    rotation: [
      { t: 750, v: 0, ease: "easeInOutSine" }, { t: 900, v: 18, ease: "easeInOutSine" },
      { t: 1050, v: -14, ease: "easeInOutSine" }, { t: 1200, v: 9, ease: "easeInOutSine" },
      { t: 1350, v: 0, ease: "linear" },
    ],
  });
  const sub = layer("text", "Subtext", {
    text: "New videos every week", fontSize: 21, fontWeight: 500, fill: WHITE, x: 640, y: 512,
  }, {
    opacity: [{ t: 1000, v: 0, ease: "easeOutQuad" }, { t: 1600, v: 0.72, ease: "linear" }],
  });
  return [button, cta, bell, sub];
}
function buildSubscribe() {
  return project(subscribeObjects());
}

/* ============================================================
   (f) PROMO FLASH — REBUILT (R5): procedural-column backdrop, punchy
   staggered type (per-char pops), a real CTA with the press grammar,
   bolt accents and three confetti hits. in → hold → out, no ping-pong.
   ============================================================ */
function promoFlashObjects() {
  const back = bg("procedural", "roseEmber", { columns: 6, intensity: 1.08, speed: 1 });
  const kick = chip("Limited time", 640, 176, AMBER, { at: 220, exit: "fade", exitStart: 3850, out: 4250 });
  const head = part("text", "Headline", {
    text: "FLASH SALE", fontSize: 118, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 2,
    fill: WHITE, x: 640, y: 330, textFx: { type: "pop", start: 480, seed: 9 },
  }, { at: 480, enter: "fade", inDur: 60, exit: "slideU", exitStart: 3900, out: 4420, outDy: 40 });
  const sub = part("text", "Offer line", {
    text: "UP TO 50% OFF — ENDS TONIGHT", fontSize: 26, fontWeight: 600, ls: 1.5, fill: AMBER, x: 640, y: 438,
    fontFamily: "Inter", textFx: { type: "rise", start: 1050, seed: 4 },
  }, { at: 1050, enter: "fade", inDur: 60, exit: "fade", exitStart: 3950, out: 4350 });
  const [btn, btnLabel] = ctaButton("Shop now", 640, 560, 268, 84, AMBER, INK, [2250, 3350], { at: 1350, exitStart: 4000, out: 4560 });
  const rip1 = ripple(640, 560, 268, 84, AMBER, 2250);
  const rip2 = ripple(640, 560, 268, 84, AMBER, 3350);
  const boltA = part("shape", "Bolt accent", {
    shape: "bolt", x: 328, y: 262, w: 92, h: 92, fill: AMBER, rotation: -14,
  }, { at: 800, hold: { type: "bob", amp: 8, period: 1180 }, exit: "whip", exitStart: 3820, out: 4300 });
  const boltB = part("shape", "Bolt accent 2", {
    shape: "bolt", x: 968, y: 188, w: 64, h: 64, fill: CORAL, rotation: 16, opacity: 0.9,
  }, { at: 940, hold: { type: "bob", amp: -7, period: 1020 }, exit: "whip", exitStart: 3860, out: 4340 });
  const starA = part("shape", "Star accent", {
    shape: "star", x: 1010, y: 470, w: 58, h: 58, fill: VIOLET, opacity: 0.85,
  }, { at: 1080, hold: { type: "spin", turns: 1 }, exit: "whip", exitStart: 3900, out: 4380 });
  const confA = layer("confetti", "Confetti burst", { x: 640, y: 260, burst: 700, count: 80, power: 1.1, seed: 12, style: "burst" });
  const confB = layer("confetti", "Confetti cannon L", { x: 120, y: 640, burst: 2500, count: 55, power: 1.05, seed: 21, style: "cannonL" });
  const confC = layer("confetti", "Confetti cannon R", { x: 1160, y: 640, burst: 2600, count: 55, power: 1.05, seed: 33, style: "cannonR" });
  return [back, kick, head, sub, btn, btnLabel, rip1, rip2, boltA, boltB, starA, confA, confB, confC];
}
function buildPromoFlash() {
  return project(promoFlashObjects(), "#16080F");
}

/* ============================================================
   CAMERA-DEPTH SHOWCASES — project.camera.tracks + mixed layer depths
   (props.depth; f = 1 + depth, screenOffset = −cam × f, scale = 1 + (zoom−1) × f).
   Every camera track is loop-aware: first keyframe value === last.
   ============================================================ */

/* ---------- CAM 1 · PARALLAX HERO — fg/mid/bg split, slow drift + push ---------- */
function camParallaxHeroObjects() {
  const back = bg("procedural", "midnightBlue", { columns: 6, intensity: 1.05, depth: -0.7 });
  const ringFar = part("shape", "Far ring", {
    shape: "ellipse", x: 640, y: 360, w: 540, h: 540, fillMode: "stroke", sC: BLUE, sW: 2, fill: BLUE, opacity: 0.3, depth: -0.4,
  }, { at: 250, enter: "fade", inDur: 700, exit: "fade", exitStart: 4150, out: 4650, tracks: { rotation: [K(0, 0, "linear"), K(5000, 360, "linear")] } });
  const ringFar2 = part("shape", "Far ring 2", {
    shape: "ellipse", x: 640, y: 360, w: 780, h: 780, fillMode: "stroke", sC: MINT, sW: 1.5, fill: MINT, opacity: 0.18, depth: -0.4,
  }, { at: 400, enter: "fade", inDur: 700, exit: "fade", exitStart: 4150, out: 4650, tracks: { rotation: [K(0, 0, "linear"), K(5000, -360, "linear")] } });
  const kick = chip("Zwoosh presents", 640, 190, MINT, { at: 350, exit: "fade", exitStart: 3900, out: 4300, name: "Kicker" });
  kick.props.depth = 0;
  const title = part("text", "Hero title", {
    text: "PARALLAX", fontSize: 148, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 3,
    fill: WHITE, x: 640, y: 360, depth: 0.35, textFx: { type: "rise", start: 700, seed: 3 },
  }, { at: 700, enter: "fade", inDur: 60, exit: "slideU", exitStart: 3950, out: 4480, outDy: 46 });
  const sub = part("text", "Hero sub", {
    text: "Depth-aware motion, one timeline", fontSize: 25, fontWeight: 500, fontFamily: "Inter",
    fill: DIM, x: 640, y: 470, depth: 0.15,
  }, { at: 1250, enter: "rise", rise: 22, exit: "fade", exitStart: 3900, out: 4350 });
  const fgBolt = part("shape", "FG bolt", {
    shape: "bolt", x: 246, y: 196, w: 86, h: 86, fill: AMBER, depth: 1.2, rotation: -12,
  }, { at: 950, hold: { type: "bob", amp: 10, period: 1160 }, exit: "whip", exitStart: 3880, out: 4360 });
  const fgStar = part("shape", "FG star", {
    shape: "star", x: 1058, y: 545, w: 66, h: 66, fill: MINT, depth: 1.2,
  }, { at: 1100, hold: { type: "sway", amp: 9, period: 1240 }, exit: "whip", exitStart: 3920, out: 4400 });
  const fgDiamond = part("shape", "FG diamond", {
    shape: "diamond", x: 1032, y: 176, w: 54, h: 54, fill: VIOLET, depth: 1.2, opacity: 0.9,
  }, { at: 1250, hold: { type: "bob", amp: -8, period: 1080 }, exit: "whip", exitStart: 3960, out: 4440 });
  return [back, ringFar, ringFar2, kick, title, sub, fgBolt, fgStar, fgDiamond];
}
function buildCamParallaxHero() {
  return project(camParallaxHeroObjects(), "#060A18", null, cam(
    [[0, -46], [2500, 46], [5000, -46]],
    [[0, 0], [2500, -20], [5000, 0]],
    [[0, 1], [2500, 1.16], [5000, 1]],
  ));
}

/* ---------- CAM 2 · DEPTH PRODUCT — dolly push onto a floating product card ---------- */
function camDepthProductObjects() {
  const back = bg("mesh", "tealDeep", { intensity: 1, depth: -0.8 });
  const shadow = part("shape", "Card shadow", {
    shape: "ellipse", x: 640, y: 588, w: 320, h: 42, fill: "#000000", opacity: 0.3, depth: 0.35,
  }, { at: 450, enter: "fade", inDur: 500, exit: "fade", exitStart: 3950, out: 4450 });
  const card = part("shape", "Product card", {
    shape: "rect", x: 640, y: 350, w: 340, h: 430, cornerR: 28, fill: "#FFFFFF", opacity: 0.1, depth: 0.5,
  }, { at: 350, enter: "pop", inDur: 620, exit: "fade", exitStart: 3950, out: 4450 });
  const rim = part("shape", "Card rim", {
    shape: "rect", x: 640, y: 350, w: 340, h: 430, cornerR: 28, fillMode: "stroke", sC: "#FFFFFF", sW: 1.5, fill: "#FFFFFF", opacity: 0.3, depth: 0.5,
  }, { at: 450, enter: "fade", inDur: 500, exit: "fade", exitStart: 3950, out: 4450 });
  const body = part("shape", "Product body", {
    shape: "rect", x: 640, y: 340, w: 186, h: 320, cornerR: 28, fill: MINT, depth: 0.5,
  }, { at: 550, hold: { type: "bob", amp: 8, period: 1120 }, exit: "whip", exitStart: 3920, out: 4420 });
  const screen = part("shape", "Product screen", {
    shape: "rect", x: 640, y: 330, w: 146, h: 252, cornerR: 18, fill: INK, depth: 0.5,
  }, { at: 700, exit: "whip", exitStart: 3920, out: 4420 });
  const dot = part("shape", "Product dot", {
    shape: "ellipse", x: 640, y: 448, w: 14, h: 14, fill: "#FFFFFF", opacity: 0.85, depth: 0.5,
  }, { at: 820, exit: "whip", exitStart: 3920, out: 4420 });
  const kick = chip("New drop", 640, 96, MINT, { at: 250, exit: "fade", exitStart: 3850, out: 4250, name: "Kicker" });
  kick.props.depth = 0.15;
  const name = part("text", "Product name", {
    text: "AERO BUDS", fontSize: 56, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 3,
    fill: WHITE, x: 640, y: 626, depth: 0.15,
  }, { at: 950, enter: "rise", rise: 26, exit: "fade", exitStart: 3900, out: 4380 });
  const price = chip("$149", 640, 678, AMBER, { at: 1150, exit: "fade", exitStart: 3900, out: 4380, name: "Price chip", fontSize: 17 });
  price.props.depth = 0.15;
  const fgRing = part("shape", "FG ring", {
    shape: "ellipse", x: 300, y: 180, w: 92, h: 92, fillMode: "stroke", sC: MINT, sW: 3, fill: MINT, opacity: 0.8, depth: 1.3,
  }, { at: 1050, hold: { type: "bob", amp: 12, period: 1240 }, exit: "whip", exitStart: 3880, out: 4360 });
  const fgDot = part("shape", "FG dot", {
    shape: "ellipse", x: 1012, y: 220, w: 26, h: 26, fill: AMBER, depth: 1.3,
  }, { at: 1200, hold: { type: "bob", amp: -10, period: 1080 }, exit: "whip", exitStart: 3920, out: 4400 });
  const fgDot2 = part("shape", "FG dot 2", {
    shape: "ellipse", x: 282, y: 545, w: 18, h: 18, fill: CORAL, depth: 1.3,
  }, { at: 1330, hold: { type: "sway", amp: 9, period: 1180 }, exit: "whip", exitStart: 3960, out: 4440 });
  return [back, shadow, card, rim, body, screen, dot, kick, name, price, fgRing, fgDot, fgDot2];
}
function buildCamDepthProduct() {
  return project(camDepthProductObjects(), "#03171A", null, cam(
    [[0, 0], [2300, 34], [5000, 0]],
    [[0, 0], [2300, -16], [5000, 0]],
    [[0, 1], [2300, 1.3], [5000, 1]],
  ));
}

/* ---------- CAM 3 · DOLLY REVEAL — 1.45 → 1 dolly-out onto the mark ---------- */
function camDollyRevealObjects() {
  const back = bg("glowfield", "amberDusk", { intensity: 1.05, depth: -0.85 });
  const dots = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    dots.push(layer("shape", `Orbit dot ${i + 1}`, {
      shape: "ellipse", x: 640 + Math.cos(a) * 300, y: 360 + Math.sin(a) * 300, w: 13, h: 13,
      fill: i % 2 ? MINT : AMBER, opacity: 0.75,
    }));
  }
  const orbit = layer("clip", "Orbit ring", {
    start: 0, dur: 5000, speed: 1, end: "hold", tIn: "none", tOut: "none", tDur: 300, x: 640, y: 360, depth: -0.5,
  }, {
    rotation: [K(0, 0, "linear"), K(5000, 360, "linear")],
    opacity: [K(300, 0, "easeOutQuad"), K(800, 1, "linear"), K(4250, 1, "easeInQuad"), K(4700, 0, "linear")],
  }, dots);
  const ring = part("shape", "Mark ring", {
    shape: "ellipse", x: 640, y: 330, w: 236, h: 236, fillMode: "stroke", sC: AMBER, sW: 2.5, fill: AMBER, opacity: 0.7, depth: -0.3,
  }, { at: 600, enter: "fade", inDur: 600, hold: { type: "pulse", amp: 1.05, period: 900 }, exit: "fade", exitStart: 3900, out: 4400 });
  const mark = part("shape", "Logo mark", {
    shape: "bolt", x: 640, y: 330, w: 148, h: 148, fill: AMBER, depth: 0,
  }, { at: 800, inDur: 620, hold: { type: "pulse", amp: 1.05, period: 900 }, exit: "whip", exitStart: 3950, out: 4450 });
  const brand = part("text", "Brand", {
    text: "ZWOOSH", fontSize: 80, fontWeight: 700, fontFamily: "Space Grotesk", ls: 10, upper: true,
    fill: WHITE, x: 640, y: 528, depth: 0, textFx: { type: "tracking", start: 1450, seed: 2 },
  }, { at: 1450, enter: "fade", inDur: 80, exit: "fade", exitStart: 3900, out: 4380 });
  const spark = (x, y, i) => part("shape", `Spark ${i}`, {
    shape: "diamond", x, y, w: 26, h: 26, fill: i % 2 ? CORAL : MINT, depth: 1.4,
  }, { at: 2650 + i * 110, hold: { type: "bob", amp: 7, period: 900 + i * 90 }, exit: "whip", exitStart: 3900 + i * 40, out: 4360 + i * 40 });
  return [back, orbit, ring, mark, brand, spark(204, 148, 1), spark(1076, 172, 2), spark(222, 578, 3), spark(1058, 566, 4)];
}
function buildCamDollyReveal() {
  return project(camDollyRevealObjects(), "#160B06", null, cam(
    [[0, 30, "easeInOutCubic"], [2600, 0, "easeInOutCubic"], [5000, 30]],
    [[0, 20, "easeInOutCubic"], [2600, 0, "easeInOutCubic"], [5000, 20]],
    [[0, 1.45, "easeInOutCubic"], [2600, 1, "easeInOutCubic"], [3600, 1, "easeInOutCubic"], [5000, 1.45]],
  ));
}

/* ---------- CAM 4 · PARALLAX QUOTE — giant fg quote mark drifting over the text ---------- */
function camParallaxQuoteObjects() {
  const back = bg("silk", "roseEmber", { intensity: 1, depth: -0.6 });
  const qmark = part("text", "Quote mark", {
    text: "“", fontSize: 330, fontWeight: 800, fontFamily: "Playfair Display", fill: VIOLET, opacity: 0.22,
    x: 330, y: 195, depth: 1.1,
  }, { at: 350, enter: "fade", inDur: 800, exit: "fade", exitStart: 4000, out: 4500 });
  const rule = part("shape", "Rule", {
    shape: "rect", x: 640, y: 232, w: 120, h: 6, cornerR: 3, fill: AMBER, depth: 0.15,
  }, { at: 500, enter: "pop", inDur: 560, exit: "fade", exitStart: 3950, out: 4400 });
  const quote1 = part("text", "Quote 1", {
    text: "Simplicity is the", fontSize: 54, fontWeight: 600, fontFamily: "Playfair Display",
    fill: WHITE, x: 640, y: 318, ls: 0.5, depth: 0, textFx: { type: "rise", start: 750, seed: 5 },
  }, { at: 750, enter: "fade", inDur: 60, exit: "fade", exitStart: 3900, out: 4400 });
  const quote2 = part("text", "Quote 2", {
    text: "soul of efficiency.", fontSize: 54, fontWeight: 600, fontFamily: "Playfair Display",
    fill: WHITE, x: 640, y: 388, ls: 0.5, depth: 0, textFx: { type: "rise", start: 900, seed: 6 },
  }, { at: 900, enter: "fade", inDur: 60, exit: "fade", exitStart: 3900, out: 4400 });
  const author = part("text", "Author", {
    text: "— DESIGN MAXIM", fontSize: 20, fontWeight: 600, ls: 3, fontFamily: "Inter", fill: CORAL, x: 640, y: 480, depth: 0.15,
  }, { at: 1500, enter: "rise", rise: 18, exit: "fade", exitStart: 3950, out: 4400 });
  const dot = (x, y, w, fill, i) => part("shape", `Float dot ${i}`, {
    shape: "ellipse", x, y, w, h: w, fill, opacity: 0.8, depth: 0.8,
  }, { at: 900 + i * 160, hold: { type: "bob", amp: i % 2 ? -9 : 9, period: 1000 + i * 130 }, exit: "whip", exitStart: 3900 + i * 50, out: 4380 + i * 50 });
  return [back, qmark, rule, quote1, quote2, author, dot(1052, 200, 16, MINT, 1), dot(1104, 470, 12, AMBER, 2), dot(988, 566, 20, VIOLET, 3)];
}
function buildCamParallaxQuote() {
  return project(camParallaxQuoteObjects(), "#1B0810", null, cam(
    [[0, -22], [2500, 22], [5000, -22]],
    [[0, 18], [2500, -18], [5000, 18]],
    [[0, 1.06], [2500, 1.18], [5000, 1.06]],
  ));
}

/* ---------- CAM 5 · ORBIT COUNTDOWN — dotted-ring counter between two orbit rings ---------- */
function camOrbitCountdownObjects() {
  const back = bg("beams", "midnightBlue", { intensity: 1, depth: -0.7 });
  const ringIn = layer("shape", "Orbit inner", {
    shape: "ellipse", x: 640, y: 360, w: 420, h: 420, fillMode: "stroke", sC: BLUE, sW: 2, fill: BLUE, opacity: 0.5,
  });
  const ringOut = layer("shape", "Orbit outer", {
    shape: "ellipse", x: 640, y: 360, w: 570, h: 570, fillMode: "stroke", sC: MINT, sW: 1.5, fill: MINT, opacity: 0.32,
  });
  const orbit = layer("clip", "Orbit rings", {
    start: 0, dur: 5000, speed: 1, end: "hold", tIn: "none", tOut: "none", tDur: 300, x: 640, y: 360, depth: -0.4,
  }, {
    rotation: [K(0, 0, "linear"), K(5000, 360, "linear")],
    opacity: [K(250, 0, "easeOutQuad"), K(700, 1, "linear"), K(4200, 1, "easeInQuad"), K(4650, 0, "linear")],
  }, [ringIn, ringOut]);
  const counter = part("number", "Countdown", {
    from: 0, to: 5, start: 500, dur: 3500, style: "dotted", mode: "countdown", numEase: "linear",
    fontSize: 130, fontFamily: "JetBrains Mono", fill: WHITE, x: 640, y: 350, ringC: BLUE, ringW: 7, depth: 0,
  }, { at: 400, enter: "fade", inDur: 300, exit: "fade", exitStart: 4000, out: 4480 });
  const label = part("text", "Label", {
    text: "LIFT-OFF IN", fontSize: 28, fontWeight: 700, ls: 8, upper: true, fill: BLUE, x: 640, y: 596, depth: 0.2,
    textFx: { type: "tracking", start: 600, seed: 2 },
  }, { at: 600, enter: "fade", inDur: 80, exit: "fade", exitStart: 3950, out: 4400 });
  const tick = (x, y, rot, i) => part("shape", `Tick ${i}`, {
    shape: "rect", x, y, w: 30, h: 7, cornerR: 3.5, fill: AMBER, rotation: rot, depth: 1.2,
  }, { at: 750 + i * 120, hold: { type: "pulse", amp: 1.14, period: 860 + i * 110 }, exit: "whip", exitStart: 3880 + i * 40, out: 4360 + i * 40 });
  return [back, orbit, counter, label, tick(920, 360, 90, 1), tick(360, 360, 90, 2), tick(640, 92, 0, 3), tick(640, 628, 0, 4)];
}
function buildCamOrbitCountdown() {
  return project(camOrbitCountdownObjects(), "#060A18", null, cam(
    [[0, -12], [2500, 12], [5000, -12]],
    [[0, 14], [2500, -14], [5000, 14]],
    [[0, 1], [2500, 1.12], [5000, 1]],
  ));
}

/* ============================================================
   TEXT-FX PRESETS — template-level text choreography (no new textFx ids)
   ============================================================ */

/* ---------- ZERO-GRAVITY WORDS — every letter floats independently.
   Per-letter seeded drift: gentle bob (y), drift (x) and slight rotation,
   all OUT OF PHASE (mulberry32), all returning to the rest pose at 4300 ms
   so the whip exit lands cleanly and the 5000 → 0 loop is seamless. */
function zeroGravityObjects() {
  const back = bg("glowfield", "midnightBlue", { intensity: 0.85 });
  const kick = chip("Text FX · Zero G", 640, 148, BLUE, { at: 200, exit: "fade", exitStart: 3900, out: 4300, fontFamily: "JetBrains Mono", fontSize: 17, ls: 3 });
  const phrase = [["GRAVITY", WHITE], ["IS", AMBER], ["OPTIONAL", WHITE]];
  const adv = 53, gap = 34, fs = 88, y0 = 352;
  const totalW = phrase.reduce((w, [word]) => w + word.length * adv, 0) + (phrase.length - 1) * gap;
  let cx = 640 - totalW / 2 + adv / 2;
  const objs = [back, kick];
  let i = 0;
  for (const [word, fill] of phrase) {
    for (const ch of word) {
      const x0 = Math.round(cx);
      const rng = mulberry32(31 + i * 101);
      const dir = rng() > 0.5 ? 1 : -1;
      const ampY = Math.round((8 + rng() * 10) * 10) / 10;
      const ampX = Math.round((4 + rng() * 8) * 10) / 10;
      const rot = Math.round((2.5 + rng() * 5) * 10) / 10;
      const o1 = Math.round(rng() * 140), o2 = Math.round(rng() * 140);
      const at = 180 + i * 75;
      objs.push(layer("text", `Letter ${ch} · ${i + 1}`, {
        text: ch, fontSize: fs, fontWeight: 700, fontFamily: "Space Grotesk", fill, x: x0, y: y0,
        inT: at, outT: 4940,
      }, MT(
        popIn(at, 520),
        {
          y: [K(1500, y0, "easeInOutSine"), K(2200 + o1, y0 - dir * ampY, "easeInOutSine"), K(2900, y0, "easeInOutSine"), K(3600 + o2, y0 + dir * ampY * 0.8, "easeInOutSine"), K(4300, y0, "easeInOutSine")],
          x: [K(1500, x0, "easeInOutSine"), K(2250 + o2, x0 - dir * ampX, "easeInOutSine"), K(2950, x0, "easeInOutSine"), K(3650 + o1, x0 + dir * ampX * 0.8, "easeInOutSine"), K(4300, x0, "easeInOutSine")],
          rotation: [K(1500, 0, "easeInOutSine"), K(2300 + o1, dir * rot, "easeInOutSine"), K(3000, 0, "easeInOutSine"), K(3700 + o2, -dir * rot * 0.7, "easeInOutSine"), K(4300, 0, "easeInOutSine")],
        },
        whipOut(4300 + i * 16, 4660 + i * 16),
      )));
      cx += adv;
      i += 1;
    }
    cx += gap;
  }
  /* drifting dust — three tiny accents on their own seeded orbits */
  [["diamond", 12, MINT, 250, 560], ["ellipse", 10, VIOLET, 1040, 170], ["diamond", 14, AMBER, 1064, 586]].forEach(([shape, w, fill, x, y], j) => {
    const rng = mulberry32(900 + j * 37);
    const dir = rng() > 0.5 ? 1 : -1;
    const a = 10 + rng() * 8, r = 4 + rng() * 6;
    objs.push(layer("shape", `Dust ${j + 1}`, {
      shape, x, y, w, h: w, fill, opacity: 0.85, inT: 500 + j * 170, outT: 4800,
    }, MT(
      popIn(500 + j * 170, 480),
      {
        y: [K(1400, y, "easeInOutSine"), K(2300, y - dir * a, "easeInOutSine"), K(3200, y, "easeInOutSine"), K(4100, y + dir * a * 0.7, "easeInOutSine"), K(4400, y, "easeInOutSine")],
        rotation: [K(1400, 0, "easeInOutSine"), K(2400, dir * r * 8, "easeInOutSine"), K(3300, 0, "easeInOutSine"), K(4200, -dir * r * 6, "easeInOutSine"), K(4400, 0, "easeInOutSine")],
      },
      whipOut(4400 + j * 60, 4780 + j * 60),
    )));
  });
  return objs;
}
function buildZeroGravity() {
  return project(zeroGravityObjects(), "#060A18");
}

/* ---------- BOLD COLOR LIST — Swiss poster: the active row rolls in, the
   whole background switches to the item's color, hex-code corner labels. */
function boldColorListObjects() {
  const ITEMS = [
    ["01", "ENERGY", AMBER],
    ["02", "PULSE", CORAL],
    ["03", "FOCUS", BLUE],
    ["04", "GROWTH", MINT],
  ];
  const W = [700, 1600, 2500, 3400], END = 4300;
  /* full-stage color plane — steps through the four item colors, returns to ink */
  const planeFill = [K(0, INK), K(620, INK, "easeOutQuad")];
  W.forEach((w, i) => { planeFill.push(K(w, ITEMS[i][2])); planeFill.push(K(W[i + 1] ? W[i + 1] - 80 : END - 80, ITEMS[i][2], "easeOutQuad")); });
  planeFill.push(K(END, INK), K(5000, INK));
  const plane = layer("shape", "Color plane", { shape: "rect", x: 640, y: 360, w: 1280, h: 720, fill: INK, inT: 0, outT: null }, { fill: planeFill });
  const kick = part("text", "Kicker", {
    text: "SPECTRUM /04", fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 4, fill: WHITE, opacity: 0.55, x: 150, y: 62,
  }, { at: 180, enter: "fade", inDur: 400, exit: "fade", exitStart: 4320, out: 4680 });
  const objs = [plane, kick];
  ITEMS.forEach(([idx, word, color], i) => {
    const w0 = W[i], w1 = W[i + 1] != null ? W[i + 1] : END;
    const y = 200 + i * 120;
    const wordW = word.length * 57;
    const wx = 250 + wordW / 2;
    const rowTracks = {
      opacity: [
        K(150 + i * 90, 0, "easeOutQuad"), K(450 + i * 90, 0.28, "linear"),
        K(w0 - 60, 0.28, "easeOutQuad"), K(w0, 1, "linear"),
        K(w1 - 60, 1, "easeOutQuad"), K(w1, 0.28, "linear"),
        K(4320, 0.28, "easeInQuad"), K(4680, 0, "linear"),
      ],
      fill: [K(w0 - 40, WHITE, "easeOutQuad"), K(w0, INK, "linear"), K(w1 - 40, INK, "easeOutQuad"), K(w1, WHITE, "linear")],
      y: [K(w0, y + 26, "easeOutBack"), K(w0 + 380, y, "linear")],
      scale: [K(w0, 0.97, "easeOutBack"), K(w0 + 380, 1, "linear")],
    };
    objs.push(layer("text", `Index ${idx}`, {
      text: idx, fontSize: 20, fontWeight: 700, fontFamily: "JetBrains Mono", fill: WHITE, x: 168, y: y + 8,
      inT: 150 + i * 90, outT: 4740,
    }, MT(rowTracks)));
    objs.push(layer("text", `Row ${word}`, {
      text: word, fontSize: 84, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 1, fill: WHITE,
      x: wx, y, inT: 150 + i * 90, outT: 4740,
    }, MT(rowTracks)));
    /* hex-code corner label + swatch, visible only in the item's window */
    const vis = {
      opacity: [K(w0, 0, "easeOutQuad"), K(w0 + 120, 0.95, "linear"), K(w1 - 120, 0.95, "easeInQuad"), K(w1, 0, "linear")],
    };
    objs.push(layer("text", `Hex ${idx}`, {
      text: color, fontSize: 18, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 1, fill: INK, x: 1116, y: 62,
      inT: w0, outT: w1,
    }, vis));
    objs.push(layer("shape", `Swatch ${idx}`, {
      shape: "rect", x: 1180, y: 62, w: 20, h: 20, cornerR: 4, fill: INK, inT: w0, outT: w1,
    }, vis));
  });
  return objs;
}
function buildBoldColorList() {
  return project(boldColorListObjects(), INK);
}

/* ============================================================
   DATA — charts + counters on ambient backdrops
   ============================================================ */

/* ---------- STAT RING — progressring counter + side stats ---------- */
function dataStatRingObjects() {
  const back = bg("glowfield", "forestNight", { intensity: 0.95 });
  const kick = chip("System status", 640, 118, MINT, { at: 220, exit: "fade", exitStart: 3850, out: 4250 });
  const ring = part("number", "Uptime ring", {
    from: 0, to: 87, start: 500, dur: 3000, style: "progressring", format: "percent", numEase: "easeOutCubic",
    fontSize: 130, fontFamily: "JetBrains Mono", fill: WHITE, x: 640, y: 330, ringC: MINT, ringW: 12,
  }, { at: 420, enter: "fade", inDur: 300, exit: "fade", exitStart: 3560, out: 4060 });
  const cap = part("text", "Caption", {
    text: "UPTIME · LAST 30 DAYS", fontSize: 18, fontWeight: 600, fontFamily: "Inter", ls: 3, fill: DIM, x: 640, y: 538,
  }, { at: 1000, enter: "rise", rise: 18, exit: "fade", exitStart: 3900, out: 4350 });
  const statL = part("number", "Requests", {
    from: 0, to: 4200, start: 900, dur: 2200, style: "count", format: "compact", numEase: "easeOutCubic",
    fontSize: 44, fontFamily: "JetBrains Mono", fill: WHITE, x: 296, y: 330,
  }, { at: 800, enter: "rise", rise: 24, exit: "fade", exitStart: 3900, out: 4380 });
  const statLL = part("text", "Requests label", {
    text: "REQUESTS", fontSize: 15, fontWeight: 700, fontFamily: "Inter", ls: 3, fill: MINT, x: 296, y: 386,
  }, { at: 950, enter: "fade", exit: "fade", exitStart: 3900, out: 4380 });
  const statR = part("number", "Deploys", {
    from: 0, to: 312, start: 1050, dur: 2200, style: "count", numEase: "easeOutCubic",
    fontSize: 44, fontFamily: "JetBrains Mono", fill: WHITE, x: 984, y: 330,
  }, { at: 950, enter: "rise", rise: 24, exit: "fade", exitStart: 3900, out: 4380 });
  const statRL = part("text", "Deploys label", {
    text: "DEPLOYS", fontSize: 15, fontWeight: 700, fontFamily: "Inter", ls: 3, fill: MINT, x: 984, y: 386,
  }, { at: 1100, enter: "fade", exit: "fade", exitStart: 3900, out: 4380 });
  return [back, kick, ring, cap, statL, statLL, statR, statRL];
}
function buildDataStatRing() {
  return project(dataStatRingObjects(), "#06130C");
}

/* ---------- BARS REPORT — bold counter + animated bar chart card ---------- */
function dataBarsObjects() {
  const back = bg("beams", "amberDusk", { intensity: 1 });
  const kick = chip("Q3 report", 330, 128, AMBER, { at: 200, exit: "fade", exitStart: 3850, out: 4250, name: "Kicker" });
  const head1 = part("text", "Headline 1", {
    text: "Quarterly,", fontSize: 58, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 330, y: 236, ls: 0.5,
    textFx: { type: "rise", start: 420, seed: 3 },
  }, { at: 420, enter: "fade", inDur: 60, exit: "fade", exitStart: 3850, out: 4320 });
  const head2 = part("text", "Headline 2", {
    text: "quantified.", fontSize: 58, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 330, y: 306, ls: 0.5,
    textFx: { type: "rise", start: 560, seed: 4 },
  }, { at: 560, enter: "fade", inDur: 60, exit: "fade", exitStart: 3850, out: 4320 });
  const big = part("number", "Growth counter", {
    from: 0, to: 84, start: 900, dur: 2400, style: "bold", suffix: "%", numEase: "easeOutCubic",
    fontSize: 98, fontFamily: "JetBrains Mono", fill: WHITE, x: 330, y: 448, ringC: AMBER,
  }, { at: 800, enter: "fade", inDur: 250, exit: "fade", exitStart: 3900, out: 4360 });
  const bigL = part("text", "Growth label", {
    text: "AVG. GROWTH", fontSize: 15, fontWeight: 700, fontFamily: "Inter", ls: 3, fill: AMBER, x: 262, y: 522,
  }, { at: 1050, enter: "fade", exit: "fade", exitStart: 3900, out: 4360 });
  const chart = layer("chart", "Revenue bars", {
    chartType: "bar", dataStr: "Q1, 42\nQ2, 65\nQ3, 58\nQ4, 84", start: 450, dur: 3300, showVals: true,
    x: 905, y: 350, w: 560, h: 380, bg: CARD, bgOp: 1, radius: 24, borderC: "#2B3140", borderW: 1, pad: 20,
    inT: 350, outT: 4520,
  }, {
    opacity: [K(350, 0, "easeOutQuad"), K(750, 1, "linear"), K(4050, 1, "easeInQuad"), K(4480, 0, "linear")],
  });
  return [back, kick, head1, head2, big, bigL, chart];
}
function buildDataBars() {
  return project(dataBarsObjects(), "#160B06");
}

/* ---------- DONUT BREAKDOWN — arc-sweep donut + legend ---------- */
function dataDonutObjects() {
  const back = bg("aurora", "midnightBlue", { intensity: 1 });
  const head = part("text", "Headline", {
    text: "Time, by craft.", fontSize: 52, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 640, y: 118, ls: 0.5,
    textFx: { type: "rise", start: 400, seed: 4 },
  }, { at: 400, enter: "fade", inDur: 60, exit: "fade", exitStart: 3900, out: 4360 });
  const chart = layer("chart", "Hours donut", {
    chartType: "donut", dataStr: "Design, 38\nBuild, 27\nTest, 21\nShip, 14", start: 500, dur: 3200, showVals: false,
    x: 640, y: 392, w: 640, h: 400, bg: CARD, bgOp: 1, radius: 24, borderC: "#2B3140", borderW: 1, pad: 20,
    inT: 300, outT: 4520,
  }, {
    opacity: [K(300, 0, "easeOutQuad"), K(700, 1, "linear"), K(4050, 1, "easeInQuad"), K(4480, 0, "linear")],
  });
  const cap = part("text", "Caption", {
    text: "FY25 · PROJECT HOURS", fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 3, fill: DIM, x: 640, y: 664,
  }, { at: 1100, enter: "fade", exit: "fade", exitStart: 3900, out: 4360 });
  return [back, head, chart, cap];
}
function buildDataDonut() {
  return project(dataDonutObjects(), "#060A18");
}

/* ---------- TREND LINE — draw-on line chart + bold delta counter ---------- */
function dataTrendObjects() {
  const back = bg("mesh", "tealDeep", { intensity: 1 });
  const kick = chip("Traffic · 6 weeks", 640, 100, MINT, { at: 200, exit: "fade", exitStart: 3850, out: 4250 });
  const chart = layer("chart", "Sessions line", {
    chartType: "line", dataStr: "W1, 24\nW2, 41\nW3, 36\nW4, 58\nW5, 74\nW6, 92", start: 500, dur: 3200, showVals: false,
    x: 640, y: 372, w: 700, h: 380, bg: CARD, bgOp: 1, radius: 24, borderC: "#2B3140", borderW: 1, pad: 20,
    inT: 320, outT: 4520,
  }, {
    opacity: [K(320, 0, "easeOutQuad"), K(720, 1, "linear"), K(4050, 1, "easeInQuad"), K(4480, 0, "linear")],
  });
  const delta = part("number", "Delta counter", {
    from: 0, to: 92, start: 1000, dur: 2200, style: "bold", prefix: "+", suffix: "%", numEase: "easeOutCubic",
    fontSize: 66, fontFamily: "JetBrains Mono", fill: MINT, x: 1076, y: 150, ringC: MINT,
  }, { at: 900, enter: "fade", inDur: 250, exit: "fade", exitStart: 3900, out: 4360 });
  const cap = part("text", "Caption", {
    text: "ORGANIC SESSIONS", fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 3, fill: DIM, x: 640, y: 648,
  }, { at: 1200, enter: "fade", exit: "fade", exitStart: 3900, out: 4360 });
  return [back, kick, chart, delta, cap];
}
function buildDataTrend() {
  return project(dataTrendObjects(), "#03171A");
}

/* ============================================================
   SOCIAL
   ============================================================ */

/* ---------- LIKE BURST — kit heart (heartbeat hold) + odometer + pop confetti ---------- */
function socialLikeObjects() {
  const back = bg("bokeh", "roseEmber", { intensity: 1 });
  const kick = chip("New post", 640, 108, CORAL, { at: 200, exit: "fade", exitStart: 3850, out: 4250 });
  const heart = embedIcon("heart", { color: CORAL, size: 210, dur: 3200 }, { x: 460, y: 330, start: 300, name: "Heart" });
  const count = part("number", "Like counter", {
    from: 12400, to: 12586, start: 1000, dur: 2400, style: "odometer", numEase: "easeOutCubic",
    fontSize: 62, fontFamily: "JetBrains Mono", fill: WHITE, x: 806, y: 316,
  }, { at: 800, enter: "rise", rise: 26, exit: "fade", exitStart: 3900, out: 4380 });
  const label = part("text", "Likes label", {
    text: "LIKES", fontSize: 17, fontWeight: 700, fontFamily: "Inter", ls: 5, fill: CORAL, x: 806, y: 386,
  }, { at: 1000, enter: "fade", exit: "fade", exitStart: 3900, out: 4380 });
  const handle = part("text", "Handle", {
    text: "@zwoosh.studio", fontSize: 20, fontWeight: 500, fontFamily: "Inter", fill: DIM, x: 640, y: 646,
  }, { at: 1300, enter: "fade", exit: "fade", exitStart: 3900, out: 4360 });
  const pops = [1400, 2300, 3200].map((t, i) =>
    layer("confetti", `Pop ${i + 1}`, { x: 460, y: 330, burst: t, count: 24, power: 0.9, seed: 40 + i, style: "pop" }));
  return [back, kick, heart, count, label, handle, ...pops];
}
function buildSocialLike() {
  return project(socialLikeObjects(), "#1B0810");
}

/* ---------- FOLLOW CARD — glass profile card + button that flips to FOLLOWING ---------- */
function socialFollowObjects() {
  const back = bg("mesh", "midnightBlue", { intensity: 1 });
  const [shadow, pane, rim] = glassParts(640, 340, 480, 260, 24, { at: 200, exitStart: 4050, out: 4550 });
  const avatar = part("shape", "Avatar", {
    shape: "ellipse", x: 472, y: 340, w: 88, h: 88, fill: AMBER,
  }, { at: 500, hold: { type: "pulse", amp: 1.04, period: 1100 }, exit: "whip", exitStart: 3980, out: 4460 });
  const initial = part("text", "Avatar initial", {
    text: "Z", fontSize: 36, fontWeight: 800, fontFamily: "Archivo Black", fill: INK, x: 472, y: 340,
  }, { at: 600, exit: "whip", exitStart: 3980, out: 4460 });
  const name = part("text", "Name", {
    text: "Zwoosh Studio", fontSize: 32, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 628, y: 300,
  }, { at: 700, enter: "rise", rise: 22, exit: "fade", exitStart: 3950, out: 4400 });
  const handle = part("text", "Handle", {
    text: "@zwoosh", fontSize: 18, fontWeight: 500, fontFamily: "Inter", fill: DIM, x: 564, y: 346,
  }, { at: 820, enter: "rise", rise: 18, exit: "fade", exitStart: 3950, out: 4400 });
  const followers = part("text", "Followers", {
    text: "12.4K FOLLOWERS", fontSize: 15, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 2, fill: DIM, x: 594, y: 432,
  }, { at: 950, enter: "fade", exit: "fade", exitStart: 3950, out: 4400 });
  const btnTracks = {
    scale: [K(1050, 0, "easeOutBack"), K(1520, 1, "linear"), K(2500, 1, "easeOutQuad"), K(2590, 0.92, "easeInOutSine"), K(2720, 1.05, "easeInOutSine"), K(2840, 1, "linear"), K(4050, 1, "easeOutQuad"), K(4170, 1.07, "easeInCubic"), K(4560, 0, "linear")],
    opacity: [K(1050, 0, "easeOutQuad"), K(1280, 1, "linear"), K(4090, 1, "easeInQuad"), K(4500, 0, "linear")],
  };
  const btn = layer("shape", "Follow button", {
    shape: "rect", x: 764, y: 424, w: 152, h: 52, cornerR: 26, fill: BLUE, inT: 1050, outT: 4560,
  }, MT(btnTracks, { fill: [K(2500, BLUE, "easeInOutSine"), K(2640, MINT, "linear")] }));
  const labelA = layer("text", "Follow label", {
    text: "FOLLOW", fontSize: 17, fontWeight: 800, fontFamily: "Inter", ls: 1.5, fill: WHITE, x: 764, y: 424, inT: 1140, outT: 2530,
  }, btnTracks);
  const labelB = layer("text", "Following label", {
    text: "FOLLOWING", fontSize: 17, fontWeight: 800, fontFamily: "Inter", ls: 1.5, fill: INK, x: 764, y: 424, inT: 2580, outT: 4560,
  }, MT(popIn(2580, 420), fadeOut(4090, 4500)));
  return [back, shadow, pane, rim, avatar, initial, name, handle, followers, btn, labelA, labelB];
}
function buildSocialFollow() {
  return project(socialFollowObjects(), "#060A18");
}

/* ---------- STORY SWIPE — big poster type + swipe-up arrow (kit) ---------- */
function socialStoryObjects() {
  const back = bg("procedural", "amberDusk", { columns: 5, intensity: 1.06 });
  const kick = chip("Limited · 48h", 640, 118, CORAL, { at: 220, exit: "fade", exitStart: 3850, out: 4250 });
  const head1 = part("text", "Headline 1", {
    text: "SUMMER", fontSize: 108, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 2,
    fill: WHITE, x: 640, y: 258, textFx: { type: "pop", start: 520, seed: 6 },
  }, { at: 520, enter: "fade", inDur: 60, exit: "slideU", exitStart: 3900, out: 4420, outDy: 44 });
  const head2 = part("text", "Headline 2", {
    text: "DROP", fontSize: 108, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 2,
    fill: CORAL, x: 640, y: 380, textFx: { type: "pop", start: 700, seed: 7 },
  }, { at: 700, enter: "fade", inDur: 60, exit: "slideU", exitStart: 3920, out: 4440, outDy: 44 });
  const price = chip("$29", 640, 482, AMBER, { at: 1050, exit: "fade", exitStart: 3900, out: 4350, name: "Price chip", fontSize: 22 });
  const arrow = embedIcon("arrow-up-right", { color: WHITE, size: 120, dur: 3200 }, { x: 640, y: 600, start: 1250, name: "Swipe arrow" });
  const swipe = part("text", "Swipe label", {
    text: "SWIPE UP", fontSize: 20, fontWeight: 700, fontFamily: "Inter", ls: 4, fill: WHITE, x: 640, y: 684,
  }, { at: 1350, enter: "rise", rise: 18, exit: "fade", exitStart: 4050, out: 4450 });
  return [back, kick, head1, head2, price, arrow, swipe];
}
function buildSocialStory() {
  return project(socialStoryObjects(), "#160B06");
}

/* ============================================================
   PROMO
   ============================================================ */

/* ---------- PODCAST — kit volume icon + waveform bars + episode meta ---------- */
function promoPodcastObjects() {
  const back = bg("aurora", "midnightBlue", { intensity: 1.02 });
  const vol = embedIcon("volume", { color: WHITE, size: 170, dur: 3200 }, { x: 420, y: 350, start: 350, name: "Volume" });
  const kick = chip("New episode", 734, 172, CORAL, { at: 480, exit: "fade", exitStart: 3850, out: 4250 });
  const title1 = part("text", "Title 1", {
    text: "The Daily", fontSize: 66, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 734, y: 288, ls: 0.5,
    textFx: { type: "rise", start: 800, seed: 5 },
  }, { at: 800, enter: "fade", inDur: 60, exit: "fade", exitStart: 3900, out: 4360 });
  const title2 = part("text", "Title 2", {
    text: "Build", fontSize: 66, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 734, y: 362, ls: 0.5,
    textFx: { type: "rise", start: 940, seed: 6 },
  }, { at: 940, enter: "fade", inDur: 60, exit: "fade", exitStart: 3900, out: 4360 });
  const meta = part("text", "Meta", {
    text: "EP. 142 · 38 MIN", fontSize: 18, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 2, fill: DIM, x: 700, y: 478,
  }, { at: 1400, enter: "fade", exit: "fade", exitStart: 3900, out: 4360 });
  const bars = [28, 46, 66, 40, 54].map((h, i) => part("shape", `Wave ${i + 1}`, {
    shape: "rect", x: 626 + i * 46, y: 566, w: 12, h, cornerR: 6, fill: i % 2 ? BLUE : MINT,
  }, { at: 1600 + i * 90, enter: "rise", rise: 16, hold: { type: "pulse", amp: 1.12, period: 560 + i * 130 }, exit: "whip", exitStart: 3850 + i * 60, out: 4330 + i * 60 }));
  return [back, vol, kick, title1, title2, meta, ...bars];
}
function buildPromoPodcast() {
  return project(promoPodcastObjects(), "#060A18");
}

/* ---------- PRODUCT DROP — poster type + outlined device + cannons ---------- */
function promoDropObjects() {
  const back = bg("nebula", "midnightBlue", { intensity: 1 });
  const kick = chip("Drops 05.24", 430, 148, VIOLET, { at: 240, exit: "fade", exitStart: 3850, out: 4250 });
  const name = part("text", "Product name", {
    text: "AERO X1", fontSize: 128, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 2,
    fill: WHITE, x: 430, y: 330, textFx: { type: "pop", start: 600, seed: 8 },
  }, { at: 600, enter: "fade", inDur: 60, exit: "slideU", exitStart: 3900, out: 4420, outDy: 44 });
  const edition = chip("Limited edition", 430, 486, AMBER, { at: 1150, exit: "fade", exitStart: 3900, out: 4350, name: "Edition chip" });
  const device = part("shape", "Device", {
    shape: "rect", x: 946, y: 340, w: 196, h: 310, cornerR: 30, fillMode: "stroke", sC: WHITE, sW: 3, fill: WHITE,
  }, {
    at: 420, inDur: 640, hold: { type: "bob", amp: 9, period: 1160 }, exit: "whip", exitStart: 3920, out: 4420,
    tracks: { rotation: [K(420, -8, "easeOutCubic"), K(1060, 0, "linear")] },
  });
  const screen = part("shape", "Device screen", {
    shape: "rect", x: 946, y: 330, w: 152, h: 250, cornerR: 20, fill: "#FFFFFF", opacity: 0.14,
  }, { at: 560, inDur: 640, hold: { type: "bob", amp: 9, period: 1160 }, exit: "whip", exitStart: 3920, out: 4420 });
  const lens = part("shape", "Device lens", {
    shape: "ellipse", x: 946, y: 216, w: 18, h: 18, fill: MINT,
  }, { at: 720, hold: { type: "pulse", amp: 1.18, period: 900 }, exit: "whip", exitStart: 3920, out: 4420 });
  const confL = layer("confetti", "Cannon L", { x: 110, y: 660, burst: 2550, count: 50, power: 1.05, seed: 18, style: "cannonL" });
  const confR = layer("confetti", "Cannon R", { x: 1170, y: 660, burst: 2650, count: 50, power: 1.05, seed: 27, style: "cannonR" });
  return [back, kick, name, edition, device, screen, lens, confL, confR];
}
function buildPromoDrop() {
  return project(promoDropObjects(), "#060A18");
}

/* ============================================================
   BUSINESS
   ============================================================ */

/* ---------- KPI TILES — three stat cards, staggered rise + counting numbers ---------- */
function businessKpiObjects() {
  const back = bg("pulse", "midnightBlue", { intensity: 0.9 });
  const kick = chip("Weekly pulse", 640, 106, BLUE, { at: 200, exit: "fade", exitStart: 3800, out: 4200 });
  const date = part("text", "Date range", {
    text: "MAY 18 — MAY 24", fontSize: 15, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 3, fill: DIM, x: 640, y: 162,
  }, { at: 350, enter: "fade", exit: "fade", exitStart: 3800, out: 4200 });
  const TILES = [
    { x: 340, label: "REVENUE", from: 0, to: 12400, format: "compact", suffix: "", delta: "+12%", color: AMBER },
    { x: 640, label: "NPS SCORE", from: 0, to: 98.2, decimals: 1, suffix: "", delta: "+4.8%", color: MINT },
    { x: 940, label: "ACTIVE USERS", from: 0, to: 3200000, format: "compact", suffix: "", delta: "+31%", color: VIOLET },
  ];
  const objs = [back, kick, date];
  TILES.forEach((t, i) => {
    const at = 350 + i * 170, ex0 = 3850 + i * 80, t2 = 4380 + i * 80;
    objs.push(part("shape", `Tile ${i + 1}`, {
      shape: "rect", x: t.x, y: 400, w: 300, h: 196, cornerR: 22, fill: CARD,
    }, { at, enter: "rise", rise: 30, exit: "slideU", exitStart: ex0, out: t2, outDy: 36 }));
    objs.push(part("shape", `Tile rim ${i + 1}`, {
      shape: "rect", x: t.x, y: 400, w: 300, h: 196, cornerR: 22, fillMode: "stroke", sC: LINE, sW: 1.5, fill: LINE,
    }, { at: at + 60, enter: "fade", exit: "fade", exitStart: ex0, out: t2 }));
    objs.push(part("text", `Tile label ${i + 1}`, {
      text: t.label, fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 2.4, fill: DIM, x: t.x, y: 348,
    }, { at: at + 120, enter: "fade", exit: "fade", exitStart: ex0, out: t2 }));
    objs.push(part("number", `Tile value ${i + 1}`, {
      from: t.from, to: t.to, start: 950 + i * 150, dur: 2100, style: "count", decimals: t.decimals || 0,
      format: t.format || "plain", suffix: t.suffix, numEase: "easeOutCubic",
      fontSize: 46, fontFamily: "JetBrains Mono", fill: WHITE, x: t.x, y: 412,
    }, { at: at + 180, enter: "fade", exit: "fade", exitStart: ex0, out: t2 }));
    objs.push(part("shape", `Delta arrow ${i + 1}`, {
      shape: "triangle", x: t.x - 34, y: 462, w: 13, h: 12, fill: t.color,
    }, { at: at + 260, enter: "pop", inDur: 420, exit: "fade", exitStart: ex0, out: t2 }));
    objs.push(part("text", `Delta ${i + 1}`, {
      text: t.delta, fontSize: 17, fontWeight: 700, fontFamily: "JetBrains Mono", fill: t.color, x: t.x + 8, y: 462,
    }, { at: at + 300, enter: "fade", exit: "fade", exitStart: ex0, out: t2 }));
  });
  return objs;
}
function buildBusinessKpi() {
  return project(businessKpiObjects(), "#060A18");
}

/* ---------- LOWER THIRD GLASS — glassmorphism broadcast bar, slide in/out ---------- */
function businessLowerGlassObjects() {
  const back = bg("glowfield", "tealDeep", { intensity: 0.7 });
  const slideIn = (from, to) => [K(250, from, "easeOutCubic"), K(950, to, "linear")];
  const slideOutX = (from, to) => [K(4050, from, "easeInCubic"), K(4650, to, "linear")];
  const travel = (rest, ro) => MT(
    { x: [...slideIn(rest - 1080, rest), ...slideOutX(rest, rest + 1080)] },
    { opacity: [K(250, 0, "easeOutQuad"), K(600, ro, "linear"), K(4080, ro, "easeInQuad"), K(4620, 0, "linear")] },
  );
  const shadow = layer("shape", "Bar shadow", {
    shape: "rect", x: 640, y: 572, w: 614, h: 108, cornerR: 22, fill: "#000000", opacity: 0.32, inT: 250, outT: 4680,
  }, travel(640, 0.32));
  const pane = layer("shape", "Bar pane", {
    shape: "rect", x: 640, y: 560, w: 640, h: 120, cornerR: 22, fill: "#FFFFFF", opacity: 0.13, inT: 250, outT: 4680,
  }, travel(640, 0.13));
  const rim = layer("shape", "Bar rim", {
    shape: "rect", x: 640, y: 560, w: 640, h: 120, cornerR: 22, fillMode: "stroke", sC: "#FFFFFF", sW: 1.5, fill: "#FFFFFF", opacity: 0.35, inT: 250, outT: 4680,
  }, travel(640, 0.35));
  const strip = layer("shape", "Accent strip", {
    shape: "rect", x: 334, y: 560, w: 12, h: 120, fill: AMBER, inT: 250, outT: 4680,
  }, travel(334, 1));
  const avatar = part("shape", "Avatar", {
    shape: "ellipse", x: 420, y: 560, w: 68, h: 68, fill: CORAL,
  }, { at: 800, exit: "whip", exitStart: 4000, out: 4480 });
  const initials = part("text", "Initials", {
    text: "JL", fontSize: 26, fontWeight: 800, fontFamily: "Archivo Black", fill: WHITE, x: 420, y: 560,
  }, { at: 900, exit: "whip", exitStart: 4000, out: 4480 });
  const name = part("text", "Name", {
    text: "JORDAN LEE", fontSize: 34, fontWeight: 700, fontFamily: "Space Grotesk", ls: 2, upper: true, fill: WHITE, x: 630, y: 544,
  }, { at: 900, enter: "rise", rise: 20, exit: "fade", exitStart: 3950, out: 4400 });
  const title = part("text", "Title", {
    text: "HEAD OF MOTION", fontSize: 17, fontWeight: 700, fontFamily: "Inter", ls: 3, fill: AMBER, x: 596, y: 590,
  }, { at: 1020, enter: "rise", rise: 16, exit: "fade", exitStart: 3950, out: 4400 });
  return [back, shadow, pane, rim, strip, avatar, initials, name, title];
}
function buildBusinessLowerGlass() {
  return project(businessLowerGlassObjects(), "#03171A");
}

/* ============================================================
   TITLE CARDS
   ============================================================ */

/* ---------- CINEMATIC — tracking title between two draw-on rules ---------- */
function titleCinematicObjects() {
  const back = bg("glowfield", "midnightBlue", { intensity: 0.9 });
  const rule = (y, at) => part("shape", "Rule", {
    shape: "rect", x: 640, y, w: 460, h: 2, fill: WHITE, opacity: 0.85,
  }, {
    at, enter: "none", exit: false, inDur: 0, out: 4500,
    tracks: {
      scale: [K(at, 0, "easeOutCubic"), K(at + 800, 1, "linear"), K(3950, 1, "easeInCubic"), K(4450, 0, "linear")],
      opacity: [K(at, 0, "easeOutQuad"), K(at + 240, 0.85, "linear"), K(3980, 0.85, "easeInQuad"), K(4420, 0, "linear")],
    },
  });
  const title = part("text", "Title", {
    text: "THE FINAL CUT", fontSize: 92, fontWeight: 700, fontFamily: "Archivo Black", ls: 4, upper: true,
    fill: WHITE, x: 640, y: 344, textFx: { type: "tracking", start: 700, seed: 2 },
  }, { at: 700, enter: "fade", inDur: 80, exit: "fade", exitStart: 3850, out: 4350 });
  const sub = part("text", "Subtitle", {
    text: "A FILM BY A. VOSS", fontSize: 19, fontWeight: 500, fontFamily: "Inter", ls: 6, fill: DIM, x: 640, y: 440,
  }, { at: 1750, enter: "fade", inDur: 500, exit: "fade", exitStart: 3850, out: 4350 });
  return [back, rule(238, 500), title, sub, rule(452, 700)];
}
function buildTitleCinematic() {
  return project(titleCinematicObjects(), "#060A18");
}

/* ---------- MINIMAL WORDMARK — wide-tracked word + one amber dot ---------- */
function titleMinimalObjects() {
  const back = bg("pulse", "midnightBlue", { intensity: 0.75 });
  const word = part("text", "Wordmark", {
    text: "MINIMAL", fontSize: 54, fontWeight: 500, fontFamily: "Space Grotesk", ls: 18, upper: true,
    fill: WHITE, x: 640, y: 344, textFx: { type: "tracking", start: 450, seed: 3 },
  }, { at: 450, enter: "fade", inDur: 80, exit: "fade", exitStart: 3900, out: 4400 });
  const line = part("shape", "Hairline", {
    shape: "rect", x: 640, y: 418, w: 150, h: 2, fill: WHITE, opacity: 0.6,
  }, {
    at: 1050, enter: "none", exit: false, inDur: 0, out: 4450,
    tracks: {
      scale: [K(1050, 0, "easeOutCubic"), K(1750, 1, "linear"), K(3950, 1, "easeInCubic"), K(4400, 0, "linear")],
      opacity: [K(1050, 0, "easeOutQuad"), K(1290, 0.6, "linear"), K(3980, 0.6, "easeInQuad"), K(4380, 0, "linear")],
    },
  });
  const dot = part("shape", "Amber dot", {
    shape: "ellipse", x: 640, y: 466, w: 10, h: 10, fill: AMBER,
  }, { at: 1550, hold: { type: "pulse", amp: 1.3, period: 900 }, exit: "whip", exitStart: 3900, out: 4350 });
  return [back, word, line, dot];
}
function buildTitleMinimal() {
  return project(titleMinimalObjects(), "#060A18");
}

/* ============================================================
   COUNTDOWN
   ============================================================ */

/* ---------- PREMIERE — dotted-ring counter 10 → 0 ---------- */
function countdownPremiereObjects() {
  const back = bg("beams", "midnightBlue", { intensity: 1 });
  const kick = part("text", "Kicker", {
    text: "PREMIERE IN", fontSize: 26, fontWeight: 700, fontFamily: "Inter", ls: 8, upper: true, fill: BLUE, x: 640, y: 128,
    textFx: { type: "tracking", start: 400, seed: 2 },
  }, { at: 400, enter: "fade", inDur: 80, exit: "fade", exitStart: 3900, out: 4360 });
  const counter = part("number", "Countdown", {
    from: 0, to: 10, start: 500, dur: 3500, style: "dotted", mode: "countdown", numEase: "linear",
    fontSize: 140, fontFamily: "JetBrains Mono", fill: WHITE, x: 640, y: 356, ringC: BLUE, ringW: 7,
  }, { at: 420, enter: "fade", inDur: 300, exit: "fade", exitStart: 4020, out: 4480 });
  const sub = part("text", "Sub", {
    text: "zwoosh originals", fontSize: 20, fontWeight: 500, fontFamily: "Inter", fill: DIM, x: 640, y: 600,
  }, { at: 900, enter: "fade", exit: "fade", exitStart: 3900, out: 4360 });
  return [back, kick, counter, sub];
}
function buildCountdownPremiere() {
  return project(countdownPremiereObjects(), "#060A18");
}

/* ---------- EVENT — Swiss poster counter 30 → 0 days ---------- */
function countdownEventObjects() {
  const back = bg("silk", "roseEmber", { intensity: 1 });
  const kick = chip("Save the date", 640, 116, CORAL, { at: 220, exit: "fade", exitStart: 3850, out: 4250 });
  const counter = part("number", "Days counter", {
    from: 0, to: 30, start: 500, dur: 3300, style: "poster", mode: "countdown", suffix: "days", numEase: "linear",
    fontSize: 120, fontFamily: "JetBrains Mono", fill: WHITE, x: 640, y: 350, ringC: CORAL,
  }, { at: 420, enter: "fade", inDur: 260, exit: "fade", exitStart: 3950, out: 4420 });
  const title = part("text", "Title", {
    text: "GRAND OPENING", fontSize: 38, fontWeight: 700, fontFamily: "Space Grotesk", ls: 5, upper: true, fill: WHITE, x: 640, y: 572,
  }, { at: 900, enter: "rise", rise: 22, exit: "fade", exitStart: 3900, out: 4360 });
  const date = part("text", "Date", {
    text: "06.14 — DOORS 19:00", fontSize: 17, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 2, fill: CORAL, x: 640, y: 630,
  }, { at: 1100, enter: "fade", exit: "fade", exitStart: 3900, out: 4360 });
  return [back, kick, counter, title, date];
}
function buildCountdownEvent() {
  return project(countdownEventObjects(), "#1B0810");
}

/* ============================================================
   PRODUCT
   ============================================================ */

/* ---------- FEATURE LIST — check bullets staggering in beside the product ---------- */
function productFeaturesObjects() {
  const back = bg("silk", "tealDeep", { intensity: 1 });
  const head = part("text", "Product name", {
    text: "Aero Buds", fontSize: 48, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 330, y: 148,
    textFx: { type: "rise", start: 400, seed: 3 },
  }, { at: 400, enter: "fade", inDur: 60, exit: "fade", exitStart: 3850, out: 4320 });
  const price = chip("$149", 330, 222, AMBER, { at: 700, exit: "fade", exitStart: 3850, out: 4300, name: "Price chip" });
  const FEATURES = ["All-day battery — 36h", "Active noise cancel", "Wireless charging"];
  const objs = [back, head, price];
  FEATURES.forEach((f, i) => {
    const y = 336 + i * 100, at = 620 + i * 170, ex0 = 3850 + i * 70, t2 = 4320 + i * 70;
    const wx = 340 + Math.round(f.length * 14.6) / 2;
    objs.push(part("shape", `Bullet ${i + 1}`, {
      shape: "ellipse", x: 300, y, w: 46, h: 46, fill: MINT,
    }, { at, exit: "whip", exitStart: ex0, out: t2 }));
    objs.push(part("shape", `Check a ${i + 1}`, {
      shape: "rect", x: 293, y: y + 2, w: 13, h: 4.5, cornerR: 2, fill: INK, rotation: 48,
    }, { at: at + 90, enter: "rise", rise: 8, inDur: 380, exit: "whip", exitStart: ex0, out: t2 }));
    objs.push(part("shape", `Check b ${i + 1}`, {
      shape: "rect", x: 305, y: y - 1, w: 22, h: 4.5, cornerR: 2, fill: INK, rotation: -52,
    }, { at: at + 130, enter: "rise", rise: 8, inDur: 380, exit: "whip", exitStart: ex0, out: t2 }));
    objs.push(part("text", `Feature ${i + 1}`, {
      text: f, fontSize: 26, fontWeight: 600, fontFamily: "Inter", fill: WHITE, x: wx, y,
    }, { at: at + 60, enter: "rise", rise: 22, exit: "fade", exitStart: ex0, out: t2 }));
  });
  const caseBody = part("shape", "Case", {
    shape: "rect", x: 906, y: 360, w: 250, h: 310, cornerR: 44, fillMode: "stroke", sC: MINT, sW: 3, fill: MINT,
  }, { at: 380, inDur: 640, hold: { type: "bob", amp: 9, period: 1160 }, exit: "whip", exitStart: 3900, out: 4400 });
  const caseInner = part("shape", "Case inner", {
    shape: "rect", x: 906, y: 360, w: 206, h: 262, cornerR: 34, fill: "#FFFFFF", opacity: 0.12,
  }, { at: 500, inDur: 640, hold: { type: "bob", amp: 9, period: 1160 }, exit: "whip", exitStart: 3900, out: 4400 });
  const budL = part("shape", "Bud L", {
    shape: "ellipse", x: 862, y: 340, w: 34, h: 46, fill: WHITE,
  }, { at: 660, hold: { type: "bob", amp: 7, period: 980 }, exit: "whip", exitStart: 3900, out: 4400 });
  const budR = part("shape", "Bud R", {
    shape: "ellipse", x: 950, y: 340, w: 34, h: 46, fill: WHITE,
  }, { at: 760, hold: { type: "bob", amp: -7, period: 1060 }, exit: "whip", exitStart: 3900, out: 4400 });
  return [...objs, caseBody, caseInner, budL, budR];
}
function buildProductFeatures() {
  return project(productFeaturesObjects(), "#03171A");
}

/* ============================================================
   INTROS + CTA
   ============================================================ */

/* ---------- LOGO STING — snappy mark pop + confetti accent ---------- */
function introLogoStingObjects() {
  const back = bg("pulse", "midnightBlue", { intensity: 0.9 });
  const ring = layer("shape", "Pulse ring", {
    shape: "ellipse", x: 640, y: 296, w: 320, h: 320, fillMode: "stroke", sC: AMBER, sW: 2, fill: AMBER, inT: 250, outT: 1500,
  }, {
    scale: [K(250, 0.55, "easeOutCubic"), K(1250, 1.25, "linear")],
    opacity: [K(250, 0.85, "easeInQuad"), K(1250, 0, "linear")],
  });
  const mark = part("shape", "Logo mark", {
    shape: "bolt", x: 640, y: 296, w: 148, h: 148, fill: AMBER,
  }, {
    at: 400, inDur: 600, hold: { type: "pulse", amp: 1.05, period: 900 }, exit: "whip", exitStart: 3700, out: 4180,
    tracks: { rotation: [K(400, -120, "easeOutCubic"), K(1000, 0, "linear")] },
  });
  const brand = part("text", "Brand", {
    text: "ZWOOSH", fontSize: 74, fontWeight: 700, fontFamily: "Space Grotesk", ls: 8, upper: true,
    fill: WHITE, x: 640, y: 476, textFx: { type: "tracking", start: 900, seed: 2 },
  }, { at: 900, enter: "fade", inDur: 80, exit: "fade", exitStart: 3750, out: 4200 });
  const tag = part("text", "Tagline", {
    text: "MOTION · MADE LIGHT", fontSize: 17, fontWeight: 700, fontFamily: "JetBrains Mono", ls: 3, fill: DIM, x: 640, y: 538,
  }, { at: 1500, enter: "fade", exit: "fade", exitStart: 3800, out: 4200 });
  const conf = layer("confetti", "Pop", { x: 640, y: 296, burst: 1000, count: 26, power: 0.85, seed: 9, style: "pop" });
  return [back, ring, mark, brand, tag, conf];
}
function buildIntroLogoSting() {
  return project(introLogoStingObjects(), "#060A18");
}

/* ---------- END CARD — avatar, channel line and a real pressing button ---------- */
function ctaEndcardObjects() {
  const back = bg("glowfield", "midnightBlue", { intensity: 1 });
  const avatar = part("shape", "Avatar", {
    shape: "ellipse", x: 640, y: 206, w: 96, h: 96, fill: AMBER,
  }, { at: 300, hold: { type: "pulse", amp: 1.05, period: 1000 }, exit: "whip", exitStart: 3900, out: 4400 });
  const initial = part("text", "Avatar initial", {
    text: "Z", fontSize: 40, fontWeight: 800, fontFamily: "Archivo Black", fill: INK, x: 640, y: 206,
  }, { at: 400, exit: "whip", exitStart: 3900, out: 4400 });
  const name = part("text", "Channel name", {
    text: "Zwoosh Studio", fontSize: 34, fontWeight: 700, fontFamily: "Space Grotesk", fill: WHITE, x: 640, y: 336,
  }, { at: 600, enter: "rise", rise: 24, exit: "fade", exitStart: 3850, out: 4320 });
  const sub = part("text", "Schedule", {
    text: "New videos every Thursday", fontSize: 20, fontWeight: 500, fontFamily: "Inter", fill: DIM, x: 640, y: 392,
  }, { at: 800, enter: "fade", exit: "fade", exitStart: 3850, out: 4320 });
  const [btn, btnLabel] = ctaButton("Subscribe", 640, 516, 320, 92, CORAL, WHITE, [2300, 3450], { at: 1050, fontSize: 30, exitStart: 4000, out: 4560 });
  const rip1 = ripple(640, 516, 320, 92, CORAL, 2300);
  const rip2 = ripple(640, 516, 320, 92, CORAL, 3450);
  return [back, avatar, initial, name, sub, btn, btnLabel, rip1, rip2];
}
function buildCtaEndcard() {
  return project(ctaEndcardObjects(), "#060A18");
}

/* ============================================================
   GALLERY
   ============================================================ */
export const TEMPLATES = [
  { id: "logo-reveal", name: "Logo Reveal", description: "Mark pops in with an overshoot ease while the brand name rises letter by letter.", accent: AMBER, category: "Intros", buildProject: buildLogoReveal, buildClip: () => templateClip("Logo Reveal", logoRevealObjects()) },
  { id: "cam-dolly-reveal", name: "Dolly Zoom Reveal", description: "Camera dollies out of a 1.45× push onto the mark — orbiting dots, four depth planes.", accent: AMBER, category: "Intros", buildProject: buildCamDollyReveal, buildClip: () => templateClip("Dolly Zoom Reveal", camDollyRevealObjects()) },
  { id: "intro-logo-sting", name: "Logo Sting", description: "Snappy bolt pop, tracking wordmark and a confetti accent for quick opens.", accent: AMBER, category: "Intros", buildProject: buildIntroLogoSting, buildClip: () => templateClip("Logo Sting", introLogoStingObjects()) },
  { id: "cam-parallax-hero", name: "Parallax Hero", description: "Five depth planes drift apart under a slow camera x-drift and zoom push.", accent: BLUE, category: "Title Cards", buildProject: buildCamParallaxHero, buildClip: () => templateClip("Parallax Hero", camParallaxHeroObjects()) },
  { id: "title-cinematic", name: "Cinematic Title", description: "Wide-tracked title between two draw-on hairline rules.", accent: VIOLET, category: "Title Cards", buildProject: buildTitleCinematic, buildClip: () => templateClip("Cinematic Title", titleCinematicObjects()) },
  { id: "title-minimal", name: "Minimal Wordmark", description: "One wide-tracked word, a hairline and a single amber dot. Nothing else.", accent: WHITE, category: "Title Cards", buildProject: buildTitleMinimal, buildClip: () => templateClip("Minimal Wordmark", titleMinimalObjects()) },
  { id: "quote-card", name: "Quote Card", description: "Serif pull-quote with per-character rise and a subtle amber rule.", accent: VIOLET, category: "Quotes", buildProject: buildQuoteCard, buildClip: () => templateClip("Quote Card", quoteCardObjects()) },
  { id: "cam-parallax-quote", name: "Parallax Quote", description: "A giant foreground quote mark floats over the serif line as the camera sways.", accent: VIOLET, category: "Quotes", buildProject: buildCamParallaxQuote, buildClip: () => templateClip("Parallax Quote", camParallaxQuoteObjects()) },
  { id: "promo-flash", name: "Promo Flash", description: "Procedural-gradient backdrop, punchy per-char type, pressing CTA and triple confetti.", accent: CORAL, category: "Promo", buildProject: buildPromoFlash, buildClip: () => templateClip("Promo Flash", promoFlashObjects()) },
  { id: "promo-podcast", name: "Podcast Promo", description: "Animated volume icon, waveform bars and episode meta over aurora bands.", accent: VIOLET, category: "Promo", buildProject: buildPromoPodcast, buildClip: () => templateClip("Podcast Promo", promoPodcastObjects()) },
  { id: "promo-drop", name: "Product Drop", description: "Poster-sized product type, outlined device bob and twin confetti cannons.", accent: VIOLET, category: "Promo", buildProject: buildPromoDrop, buildClip: () => templateClip("Product Drop", promoDropObjects()) },
  { id: "social-like-burst", name: "Like Burst", description: "Heartbeat kit heart, odometer like-counter and pop-confetti accents.", accent: CORAL, category: "Social", buildProject: buildSocialLike, buildClip: () => templateClip("Like Burst", socialLikeObjects()) },
  { id: "social-follow-card", name: "Follow Card", description: "Glass profile card whose button presses and flips to FOLLOWING.", accent: BLUE, category: "Social", buildProject: buildSocialFollow, buildClip: () => templateClip("Follow Card", socialFollowObjects()) },
  { id: "social-story-swipe", name: "Story Swipe-Up", description: "Poster type, price chip and a bobbing swipe-up arrow for vertical promos.", accent: AMBER, category: "Social", buildProject: buildSocialStory, buildClip: () => templateClip("Story Swipe-Up", socialStoryObjects()) },
  { id: "lower-third", name: "Lower Third", description: "Broadcast-style name bar that slides in and locks into place.", accent: AMBER, category: "Business", buildProject: buildLowerThird, buildClip: () => templateClip("Lower Third", lowerThirdObjects()) },
  { id: "business-lower-glass", name: "Glass Lower Third", description: "Glassmorphism name bar with avatar — slides in, mirrors out.", accent: MINT, category: "Business", buildProject: buildBusinessLowerGlass, buildClip: () => templateClip("Glass Lower Third", businessLowerGlassObjects()) },
  { id: "business-kpi", name: "KPI Tiles", description: "Three stat tiles rise in stagger while their numbers count up.", accent: BLUE, category: "Business", buildProject: buildBusinessKpi, buildClip: () => templateClip("KPI Tiles", businessKpiObjects()) },
  { id: "data-stat-ring", name: "Uptime Ring", description: "Progress-ring counter sweeping to 87% with side stats on a glow field.", accent: MINT, category: "Data", buildProject: buildDataStatRing, buildClip: () => templateClip("Uptime Ring", dataStatRingObjects()) },
  { id: "data-bars", name: "Quarterly Bars", description: "Bold poster counter beside a spring-staggered bar chart card.", accent: AMBER, category: "Data", buildProject: buildDataBars, buildClip: () => templateClip("Quarterly Bars", dataBarsObjects()) },
  { id: "data-donut", name: "Hours Donut", description: "Arc-sweep donut with count-up center total and staggered legend.", accent: BLUE, category: "Data", buildProject: buildDataDonut, buildClip: () => templateClip("Hours Donut", dataDonutObjects()) },
  { id: "data-trend", name: "Trend Line", description: "Draw-on line chart with popping points and a bold +92% counter.", accent: MINT, category: "Data", buildProject: buildDataTrend, buildClip: () => templateClip("Trend Line", dataTrendObjects()) },
  { id: "countdown", name: "Countdown 5-4-3-2-1", description: "JetBrains Mono counter with a depleting progress ring.", accent: BLUE, category: "Countdown", buildProject: buildCountdown, buildClip: () => templateClip("Countdown 5-4-3-2-1", countdownObjects()) },
  { id: "cam-orbit-countdown", name: "Orbit Countdown", description: "Dotted-ring 5→0 counter between parallax orbit rings and camera drift.", accent: BLUE, category: "Countdown", buildProject: buildCamOrbitCountdown, buildClip: () => templateClip("Orbit Countdown", camOrbitCountdownObjects()) },
  { id: "countdown-premiere", name: "Premiere Countdown", description: "Dotted conic-ring counter from 10 with vertical slide-swap digits.", accent: VIOLET, category: "Countdown", buildProject: buildCountdownPremiere, buildClip: () => templateClip("Premiere Countdown", countdownPremiereObjects()) },
  { id: "countdown-event", name: "Event Countdown", description: "Swiss poster counter rolling 30 → 0 days under a save-the-date chip.", accent: CORAL, category: "Countdown", buildProject: buildCountdownEvent, buildClip: () => templateClip("Event Countdown", countdownEventObjects()) },
  { id: "cam-depth-product", name: "Depth Product", description: "Dolly push onto a floating glass product card, fg accents whipping past.", accent: MINT, category: "Product", buildProject: buildCamDepthProduct, buildClip: () => templateClip("Depth Product", camDepthProductObjects()) },
  { id: "product-features", name: "Feature List", description: "Check bullets stagger in beside a bobbing product case.", accent: MINT, category: "Product", buildProject: buildProductFeatures, buildClip: () => templateClip("Feature List", productFeaturesObjects()) },
  { id: "subscribe-cta", name: "Subscribe CTA", description: "Pulsing button, ringing bell and a follow-up line — end-card ready.", accent: CORAL, category: "CTA", buildProject: buildSubscribe, buildClip: () => templateClip("Subscribe CTA", subscribeObjects()) },
  { id: "cta-endcard", name: "End Card", description: "Avatar, schedule line and a subscribe button that really presses.", accent: CORAL, category: "CTA", buildProject: buildCtaEndcard, buildClip: () => templateClip("End Card", ctaEndcardObjects()) },
  { id: "zero-gravity-words", name: "Zero-Gravity Words", description: "Every letter floats on its own seeded drift — bob, sway and tilt, out of phase.", accent: BLUE, category: "Text FX", buildProject: buildZeroGravity, buildClip: () => templateClip("Zero-Gravity Words", zeroGravityObjects()) },
  { id: "bold-color-list", name: "Bold Color List", description: "Swiss poster list: the active row rolls in, the whole stage turns its color.", accent: AMBER, category: "Text FX", buildProject: buildBoldColorList, buildClip: () => templateClip("Bold Color List", boldColorListObjects()) },
];

/* ============================================================
   EDITABLE TEMPLATES (store-backed) — templates.js stays the built-in
   baseline; the server store overlays scope "global" (admin, visible to
   all; a row whose slug matches a built-in id OVERRIDES it) and "user"
   (personal). Both helpers stay pure for the node check suites.
   ============================================================ */

/* pack a STORED template's project JSON as the same insert clip the
   built-ins use (the editor re-times it to the playhead; "hide" + fade out
   = a scene that leaves cleanly; fresh ids via reid so store data can carry
   any ids at all) */
export function clipFromProject(data, name = "Template") {
  const objects = Array.isArray(data?.objects) ? data.objects : [];
  return layer("clip", name, {
    start: 0, dur: Number.isFinite(data?.stage?.dur) ? data.stage.dur : DUR, speed: 1, end: "hide",
    tIn: "fade", tOut: "fade", tDur: 500,
    x: STAGE_W / 2, y: STAGE_H / 2,
  }, {}, objects.map(reid));
}

/* merge the built-in gallery with the store rows: a global row whose slug
   matches a built-in id REPLACES it (code is never mutated); global customs
   and personal rows append after, scope-tagged. Every entry keeps the
   { id, name, description, accent, category, buildClip } shape the panel
   consumes, plus scope + optional overridden/storeId markers. */
export function mergeTemplates(storeRows = []) {
  const asEntry = (r) => ({
    id: r.slug, storeId: r.id, name: r.name, description: r.description || "",
    accent: r.accent || BLUE, category: r.category || "Custom",
    scope: r.scope, buildClip: () => clipFromProject(r.data, r.name),
  });
  const globals = (storeRows || []).filter((r) => r && r.scope === "global");
  const personal = (storeRows || []).filter((r) => r && r.scope === "user");
  const bySlug = new Map(globals.map((r) => [r.slug, r]));
  const builtinIds = new Set(TEMPLATES.map((t) => t.id));
  const builtins = TEMPLATES.map((t) => (bySlug.has(t.id) ? { ...asEntry(bySlug.get(t.id)), overridden: true } : { ...t, scope: "builtin" }));
  const customs = globals.filter((r) => !builtinIds.has(r.slug)).map(asEntry);
  const mine = personal.map(asEntry);
  return [...builtins, ...customs, ...mine];
}

export default TEMPLATES;
