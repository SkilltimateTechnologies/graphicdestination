/* ============================================================
   EDITOR MODEL — shared theme, constants + tiny pure helpers.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */

export const STAGE_PAD = 120; /* workspace margin (screen px) around the canvas in manual zoom — bounds the scroll/pan area */

export const C = {
  bg0: "#0A0C10", bg1: "#10131A", bg2: "#171B24", bg3: "#1E2330",
  line: "#232936", lineStrong: "#2E3546", txt: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  amber: "#F5A524", amberDim: "#B87A18", amberSoft: "rgba(245,165,36,0.12)", danger: "#E5636A", info: "#5B8DEF",
};

/* ---------- fonts ---------- */
export const FONTS = ["Space Grotesk", "Inter", "JetBrains Mono", "Bebas Neue", "Montserrat", "Oswald", "Playfair Display", "Archivo Black", "Pacifico", "Caveat"];

export const PROP_LABEL = { x: "Position X", y: "Position Y", scale: "Scale", rotation: "Rotation", opacity: "Opacity", shape: "Shape", fill: "Fill", prog: "Path progress", focus: "Zoom focus" };

export const kfAt = (track = [], t) => track.find((k) => Math.abs(k.t - t) <= 5);

/* ============================================================
   TEXT FX — per-character, deterministic
   ============================================================ */
export const TEXTFX_LIST = [
  { id: "none", name: "None" }, { id: "typewriter", name: "Typewriter" },
  { id: "rise", name: "Rise" }, { id: "pop", name: "Pop" },
  { id: "fall", name: "Fall Bounce" }, { id: "tracking", name: "Tracking In" },
  { id: "scramble", name: "Scramble" }, { id: "wave", name: "Wave · loop" },
];


/* ============================================================
   NUMBER ROLLERS (mechanical odometer cascade)
   ============================================================ */
export const NUM_STYLES = [{ id: "odometer", name: "Odometer" }, { id: "count", name: "Plain text" }, { id: "slot", name: "Slot Machine" }];

/* ============================================================
   NUMBER MODES + VISUAL STYLE PRESETS
   modes (props.mode) + formats (props.format) are keyframe-free base
   props — optional, defaults countup/plain, old projects untouched.
   Style presets are one-click PATCHES: clicking a swatch writes the
   concrete style props (fontWeight/fill/fontFamily/stroke/pillBg/
   glow/ls/tnum), so renderer + export share ONE render path and the
   free-form controls below keep working as overrides. numStyle only
   remembers the last-picked swatch (amber ring).
   ============================================================ */
export const NUM_MODES = [{ id: "countup", name: "Count Up" }, { id: "countdown", name: "Countdown" }, { id: "odometer", name: "Odometer" }];
/* preset-controlled props reset to inert values before each patch is
   applied (inert = falsy ⇒ the renderer skips them) */
export const NUM_STYLE_RESET = { stroke: "", strokeW: 0, pillBg: "", glow: "", ls: 0, tnum: false };
export const NUM_STYLE_PRESETS = [
  { id: "bold", name: "Bold", hint: "Heavy 800 · your color", patch: { fontWeight: 800 } },
  { id: "mono", name: "Mono", hint: "JetBrains Mono · tabular · amber", patch: { fontFamily: "JetBrains Mono", fontWeight: 600, fill: "#FFB224", tnum: true } },
  { id: "outline", name: "Outline", hint: "Hollow · 2px stroke", patch: { fontWeight: 800, fill: "transparent", stroke: "#FFB224", strokeW: 2 } },
  { id: "pill", name: "Pill", hint: "Dark digits on an amber pill", patch: { fontWeight: 700, pillBg: "#FFB224" } },
  { id: "neon", name: "Neon", hint: "Soft amber glow", patch: { fontWeight: 700, fill: "#FFD984", glow: "#FFB224" } },
  { id: "minimal", name: "Minimal", hint: "Light · dim · wide tracking", patch: { fontWeight: 400, fill: "#939BAD", ls: 4 } },
];

/* ============================================================
   MOTION PRESETS
   ============================================================ */
export const PRESETS = [
  { id: "fadeIn", name: "Fade In", icon: "◐", recipe: (c) => [{ prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 600, v: c.opacity }] },
  { id: "popIn", name: "Pop In", icon: "◎", recipe: (c) => [{ prop: "scale", dt: 0, v: 0, ease: "easeOutBack" }, { prop: "scale", dt: 650, v: c.scale }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 250, v: c.opacity }] },
  { id: "slideL", name: "Slide In ←", icon: "⇤", recipe: (c) => [{ prop: "x", dt: 0, v: c.x - 420, ease: "easeOutCubic" }, { prop: "x", dt: 700, v: c.x }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 350, v: c.opacity }] },
  { id: "riseUp", name: "Rise Up", icon: "↥", recipe: (c) => [{ prop: "y", dt: 0, v: c.y + 180, ease: "easeOutCubic" }, { prop: "y", dt: 700, v: c.y }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 350, v: c.opacity }] },
  { id: "spinIn", name: "Spin In", icon: "↻", recipe: (c) => [{ prop: "rotation", dt: 0, v: c.rotation - 180, ease: "easeOutCubic" }, { prop: "rotation", dt: 750, v: c.rotation }, { prop: "scale", dt: 0, v: 0, ease: "easeOutBack" }, { prop: "scale", dt: 750, v: c.scale }] },
  { id: "elastic", name: "Elastic Pop", icon: "〜", recipe: (c) => [{ prop: "scale", dt: 0, v: 0, ease: "easeOutElastic" }, { prop: "scale", dt: 950, v: c.scale }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 200, v: c.opacity }] },
  { id: "bounceIn", name: "Drop Bounce", icon: "⤓", recipe: (c) => [{ prop: "y", dt: 0, v: c.y - 320, ease: "easeOutBounce" }, { prop: "y", dt: 900, v: c.y }, { prop: "opacity", dt: 0, v: 0, ease: "easeOutQuad" }, { prop: "opacity", dt: 200, v: c.opacity }] },
  { id: "driftFade", name: "Drift + Fade", icon: "⇢", recipe: (c) => [{ prop: "x", dt: 0, v: c.x, ease: "linear" }, { prop: "x", dt: 1400, v: c.x + 260 }, { prop: "opacity", dt: 0, v: c.opacity, ease: "easeInQuad" }, { prop: "opacity", dt: 1400, v: 0 }] },
  { id: "softRise", name: "Soft Rise", icon: "⌃", recipe: (c) => [{ prop: "y", dt: 0, v: c.y + 26, ease: "easeInOutSine" }, { prop: "y", dt: 520, v: c.y }, { prop: "opacity", dt: 0, v: 0, ease: "easeInOutSine" }, { prop: "opacity", dt: 420, v: c.opacity }] },
  { id: "gentlePop", name: "Gentle Pop", icon: "○", recipe: (c) => [{ prop: "scale", dt: 0, v: c.scale * 0.94, ease: "softSpring" }, { prop: "scale", dt: 620, v: c.scale }, { prop: "opacity", dt: 0, v: 0, ease: "easeInOutSine" }, { prop: "opacity", dt: 340, v: c.opacity }] },
  { id: "fadeOut", name: "Fade Out", icon: "◑", recipe: (c) => [{ prop: "opacity", dt: 0, v: c.opacity, ease: "easeInQuad" }, { prop: "opacity", dt: 500, v: 0 }] },
  { id: "popOut", name: "Pop Out", icon: "⊙", recipe: (c) => [{ prop: "scale", dt: 0, v: c.scale, ease: "easeInCubic" }, { prop: "scale", dt: 450, v: 0 }, { prop: "opacity", dt: 100, v: c.opacity, ease: "easeInQuad" }, { prop: "opacity", dt: 450, v: 0 }] },
];

/* ============================================================
   CLIP TRANSITIONS (in/out at the clip's timeline window)
   ============================================================ */
export const TRANSITIONS = [
  { id: "none", name: "None" }, { id: "fade", name: "Fade" },
  { id: "slideU", name: "Slide ↑" }, { id: "slideD", name: "Slide ↓" },
  { id: "slideL", name: "Slide ←" }, { id: "slideR", name: "Slide →" },
  { id: "zoom", name: "Zoom In" }, { id: "zoomOut", name: "Zoom Out" },
];

export function layerOut(o, dur) { return o.props.outT == null ? dur : o.props.outT; }

/* an object's visible span on the timeline [start, end] (ms, clamped to the
   context duration) — the exact math the timeline lanes use for their bars:
   clips run [start, start + dur/speed), everything else runs [inT, outT). */
export function layerSpan(o, ctxDur) {
  if (o.type === "clip") {
    const start = o.props.start || 0;
    return [start, Math.min(ctxDur, start + o.props.dur / (o.props.speed || 1))];
  }
  return [o.props.inT || 0, Math.min(ctxDur, layerOut(o, ctxDur))];
}

/* ---------- timeline row packing (visual only — schema untouched) ----------
   Greedy first-fit interval packing: sort spans by start (then end, then
   front-most first for identical spans so all-overlapping stacks keep the
   classic front-on-top order); each span joins the FIRST row whose latest end
   <= its start — touching at a boundary (a.end === b.start) is NOT an overlap,
   so it can share — otherwise it opens a new row below.
   `spans`: [{ id, start, end }] → array of rows, each an array of ids in
   placement order. Rows come out ordered by ascending start. */
export function packRows(spans) {
  const sorted = spans.map((s, i) => ({ ...s, i })).sort((a, b) => (a.start - b.start) || (a.end - b.end) || (b.i - a.i));
  const rows = []; /* [{ end, ids }] — end = latest end among the row's spans */
  for (const s of sorted) {
    let row = null;
    for (const r of rows) {
      if (s.start >= r.end) { row = r; break; }
    }
    if (!row) { row = { end: -Infinity, ids: [] }; rows.push(row); }
    row.ids.push(s.id);
    if (s.end > row.end) row.end = s.end;
  }
  return rows.map((r) => r.ids);
}

/* Stage size presets — the default (16:9 1280×720) matches the STAGE_W/STAGE_H
   constants and every built-in template. Changing the preset only resizes the
   stage; existing layers keep their coordinates (off-canvas layers still render
   in the workspace and can be dragged back). Exported so node checks can verify
   the preset dims without a DOM. */
export const STAGE_PRESETS = [
  { id: "land", name: "Landscape · 16:9", w: 1280, h: 720 },
  { id: "vert", name: "Portrait · 9:16", w: 1080, h: 1920 },
  { id: "sq", name: "Square · 1:1", w: 1080, h: 1080 },
];

export const KF_PROPS = ["x", "y", "scale", "rotation", "opacity", "fill", "prog", "focus"];

export const TYPE_BAR = { chart: "#6E2E4A", clip: "#4A3B0C", text: "#3F2E66", number: "#283D63", shape: "#303F66", image: "#3A4356", map: "#274D40", world: "#274D40", confetti: "#584019", backdrop: "#472F5F" };

export const inputStyle = { width: "100%", background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", padding: "6px 9px", fontSize: 12.5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
export const chipStyle = { background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#939BAD", padding: "4px 10px", fontSize: 11, fontWeight: 600 };
export const transportBtn = { width: 30, height: 28, background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" };
export const zoomCtlBtn = { height: 24, minWidth: 26, background: "transparent", border: "none", borderRadius: 4, color: "#939BAD", cursor: "pointer", fontSize: 14, padding: "0 6px", display: "flex", alignItems: "center", justifyContent: "center" };
export const navBtn = { width: 13, height: 17, background: "none", border: "none", color: "#939BAD", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, fontWeight: 700 };
export const sectionLabel = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5D667A" };
