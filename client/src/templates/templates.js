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
   ============================================================ */

const STAGE_W = 1280;
const STAGE_H = 720;
const DUR = 5000;
const STAGE_BG = "#101218"; // engine default stage background

/* engine constants (client/src/components/GraphicDestinationMotion.jsx) */
const SWATCHES = ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#C084FC", "#F9F9F9", "#0F1116"];
const [AMBER, CORAL, BLUE, MINT, VIOLET, WHITE, INK] = SWATCHES;
const BRAND = { id: "b1", name: "Graphic Destination", colors: [AMBER, CORAL, BLUE, MINT, WHITE], headFont: "Space Grotesk", bodyFont: "Inter" };
const BOX_DEFAULTS = { bg: "", pad: 16, borderC: AMBER, borderW: 0, radius: 14, boxFx: "none" };

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
  if (type === "clip") { base.children = children || []; Object.assign(base.props, { start: 0, dur: 3000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500 }); }
  Object.assign(base.props, props);
  return base;
}

function project(objects, bg = STAGE_BG, dims = null) {
  return {
    app: "graphic-destination-motion",
    v: 5,
    stage: { w: dims?.w || STAGE_W, h: dims?.h || STAGE_H, dur: DUR, bg },
    brands: [{ ...BRAND, colors: [...BRAND.colors] }],
    brandId: "b1",
    objects,
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
   (f) PROMO FLASH — bold text, confetti FX, morphing shapes
   ============================================================ */
function promoFlashObjects() {
  const morphA = layer("shape", "Morpher A", {
    shape: "ellipse", x: 1050, y: 205, w: 220, h: 220, opacity: 0.9,
  }, {
    shape: [{ t: 0, v: "ellipse", ease: "easeInOutCubic" }, { t: 1200, v: "star", ease: "easeInOutCubic" }, { t: 2400, v: "heart", ease: "easeInOutCubic" }, { t: 3600, v: "diamond", ease: "easeInOutCubic" }, { t: 4800, v: "ellipse", ease: "linear" }],
    fill: [{ t: 0, v: AMBER, ease: "linear" }, { t: 1200, v: CORAL, ease: "linear" }, { t: 2400, v: VIOLET, ease: "linear" }, { t: 3600, v: BLUE, ease: "linear" }, { t: 4800, v: AMBER, ease: "linear" }],
    rotation: [{ t: 0, v: 0, ease: "linear" }, { t: 4800, v: 360, ease: "linear" }],
  });
  const morphB = layer("shape", "Morpher B", {
    shape: "star", x: 215, y: 510, w: 135, h: 135, opacity: 0.75,
  }, {
    shape: [{ t: 0, v: "star", ease: "easeInOutCubic" }, { t: 1600, v: "hexagon", ease: "easeInOutCubic" }, { t: 3200, v: "ellipse", ease: "easeInOutCubic" }, { t: 4800, v: "star", ease: "linear" }],
    fill: [{ t: 0, v: MINT, ease: "linear" }, { t: 1600, v: BLUE, ease: "linear" }, { t: 3200, v: CORAL, ease: "linear" }, { t: 4800, v: MINT, ease: "linear" }],
    rotation: [{ t: 0, v: 0, ease: "linear" }, { t: 4800, v: -360, ease: "linear" }],
  });
  const headline = layer("text", "Headline", {
    text: "FLASH SALE", fontSize: 108, fontWeight: 700, fontFamily: "Archivo Black", upper: true, ls: 2, fill: WHITE, x: 640, y: 320,
    textFx: { type: "scramble", start: 250, seed: 9 },
  });
  const chip = layer("text", "Offer chip", {
    text: "-50% · TODAY ONLY", fontSize: 25, fontWeight: 600, ls: 1.5, fill: AMBER, x: 640, y: 448,
    bg: "#20263480", borderC: AMBER, borderW: 1.5, radius: 999, pad: 16, boxFx: "glow",
    inT: 900, textFx: { type: "pop", start: 900, seed: 4 },
  });
  const confA = layer("confetti", "Confetti A", { x: 640, y: 235, burst: 650, count: 90, power: 1.15, seed: 12 });
  const confB = layer("confetti", "Confetti B", { x: 420, y: 300, burst: 1500, count: 60, power: 0.9, seed: 21 });
  return [morphA, morphB, headline, chip, confA, confB];
}
function buildPromoFlash() {
  return project(promoFlashObjects());
}

/* ============================================================
   GALLERY
   ============================================================ */
export const TEMPLATES = [
  { id: "logo-reveal", name: "Logo Reveal", description: "Mark pops in with an overshoot ease while the brand name rises letter by letter.", accent: AMBER, category: "Intros", buildProject: buildLogoReveal, buildClip: () => templateClip("Logo Reveal", logoRevealObjects()) },
  { id: "quote-card", name: "Quote Card", description: "Serif pull-quote with per-character rise and a subtle amber rule.", accent: VIOLET, category: "Quotes", buildProject: buildQuoteCard, buildClip: () => templateClip("Quote Card", quoteCardObjects()) },
  { id: "lower-third", name: "Lower Third", description: "Broadcast-style name bar that slides in and locks into place.", accent: AMBER, category: "Business", buildProject: buildLowerThird, buildClip: () => templateClip("Lower Third", lowerThirdObjects()) },
  { id: "countdown", name: "Countdown 5-4-3-2-1", description: "JetBrains Mono counter with a depleting progress ring.", accent: BLUE, category: "Countdown", buildProject: buildCountdown, buildClip: () => templateClip("Countdown 5-4-3-2-1", countdownObjects()) },
  { id: "subscribe-cta", name: "Subscribe CTA", description: "Pulsing button, ringing bell and a follow-up line — end-card ready.", accent: CORAL, category: "CTA", buildProject: buildSubscribe, buildClip: () => templateClip("Subscribe CTA", subscribeObjects()) },
  { id: "promo-flash", name: "Promo Flash", description: "Scrambled headline, morphing accents and two confetti bursts.", accent: MINT, category: "Promo", buildProject: buildPromoFlash, buildClip: () => templateClip("Promo Flash", promoFlashObjects()) },
];

export default TEMPLATES;
