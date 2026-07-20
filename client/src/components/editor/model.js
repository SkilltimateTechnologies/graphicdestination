/* ============================================================
   EDITOR MODEL — shared theme, constants + tiny pure helpers.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   R7a: also hosts the layer-GEOMETRY helpers (objSize / bboxOfLayers /
   translateLayer / reframeClipToContent) so the editor, StageObject and
   the node check scripts share ONE pure source (no React imports here).
   ============================================================ */
import { valueAt, posOf, clipLocalTime } from "../../engine/keyframes.js";
import { MAPS, WORLD_H, CONTINENTS, WORLD_EXT, mapBox } from "../../engine/maps.js";

export const STAGE_PAD = 120; /* workspace margin (screen px) around the canvas in manual zoom — bounds the scroll/pan area */

/* standard insert size (stage px): every new object lands at ~this size on its
   longest side instead of a per-type giant (was 190…780). makeObject consumes
   it for the base + shape/image/kit/chart branches (aspect preserved); the
   emoji insert uses it directly. */
export const DEFAULT_INSERT_SIZE = 100;

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

/* ---------- marquee hit-test ----------
   Ids of objects whose on-stage bounding box intersects `rect` (stage coords
   {x0,y0,x1,y1}, any corner order) at time t. Mirrors the align() box math
   (center = posOf, half-extent = objSize·scale/2). Locked/hidden objects are
   never selectable. Pure — used by the canvas marquee drag. */
export function objectsInRect(objects, rect, t) {
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
  const ids = [];
  for (const o of objects || []) {
    if (!o || o.locked || o.hidden) continue;
    const s = valueAt(o, "scale", t);
    const [px, py] = posOf(o, t);
    const { w, h } = objSize(o, t);
    const hw = (w * s) / 2, hh = (h * s) / 2;
    if (px + hw >= x0 && px - hw <= x1 && py + hh >= y0 && py - hh <= y1) ids.push(o.id);
  }
  return ids;
}

/* ---------- timeline row packing (visual only — schema untouched) ----------
   Greedy first-fit interval packing: sort spans by start (then end, then
   front-most first for identical spans so all-overlapping stacks keep the
   classic front-on-top order); each span joins the FIRST row whose latest end
   <= its start — touching at a boundary (a.end === b.start) is NOT an overlap,
   so it can share — otherwise it opens a new row below.
   `spans`: [{ id, start, end }] → array of rows, each an array of ids in
   placement order. Rows come out ordered by ascending start.

   `opts.stable` (timeline): pack in the GIVEN order (layer/z order) instead of
   sorting by start. This makes a bar's row a stable function of layer order,
   not of its current time — so dragging a clip in time no longer reshuffles
   rows (After-Effects/CapCut behaviour). Default (unset) is the classic
   start-sorted packing that every existing guard asserts. */
export function packRows(spans, opts) {
  const sorted = opts && opts.stable
    ? spans.map((s, i) => ({ ...s, i }))
    : spans.map((s, i) => ({ ...s, i })).sort((a, b) => (a.start - b.start) || (a.end - b.end) || (b.i - a.i));
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

export const TYPE_BAR = { chart: "#6E2E4A", clip: "#4A3B0C", kit: "#553A6E", text: "#3F2E66", number: "#283D63", shape: "#303F66", image: "#3A4356", map: "#274D40", world: "#274D40", confetti: "#584019", backdrop: "#472F5F" };

/* ============================================================
   LAYER GEOMETRY — moved verbatim from GraphicDestinationMotion.jsx
   (R7a) so StageObject (content-hugging clip frames), the insert path
   (group-style reframing) and the node checks share the same math.
   ============================================================ */
function objSize(o, time) {
  const P = o.props;
  if (o.type === "shape" || o.type === "image") return { w: P.w, h: P.h };
  if (o.type === "kit") return { w: P.w, h: P.h }; /* locked kit object — fixed box, art scales to fit */
  if (o.type === "map") { const b = mapBox(MAPS[P.country]); return { w: P.w, h: (P.w * b.h) / b.w }; }
  if (o.type === "continent") {
    const codes = CONTINENTS[P.continent] || [];
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    codes.forEach((cc) => { const e = WORLD_EXT[cc]; if (!e) return; mnx = Math.min(mnx, e[0]); mny = Math.min(mny, e[1]); mxx = Math.max(mxx, e[2]); mxy = Math.max(mxy, e[3]); });
    if (mnx > mxx) return { w: P.w, h: P.w };
    return { w: P.w, h: (P.w * (mxy - mny)) / (mxx - mnx) };
  }
  if (o.type === "world") return { w: P.w, h: (P.w * WORLD_H) / 200 };
  if (o.type === "chart") return { w: P.w, h: P.h };
  if (o.type === "backdrop") return { w: P.w, h: P.h };
  if (o.type === "text") return { w: Math.max(40, P.text.length * P.fontSize * 0.56), h: P.fontSize * 1.25 };
  if (o.type === "number") {
    const digits = String(Math.floor(Math.max(P.from, P.to))).length + P.decimals + (P.decimals ? 1 : 0) + P.prefix.length + P.suffix.length;
    return { w: Math.max(40, digits * P.fontSize * 0.62), h: P.fontSize * 1.2 };
  }
  if (o.type === "clip") { const b = bboxOfLayers(o.children, clipLocalTime(P, time) ?? 0); return { w: b.w, h: b.h }; }
  return { w: 44, h: 44 };
}
function bboxOfLayers(layers, localT) {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const o of layers) {
    if (o.type === "clip" && clipLocalTime(o.props, localT) === null) continue;
    const [x, y] = posOf(o, localT);
    const s = valueAt(o, "scale", localT);
    const { w, h } = objSize(o, localT);
    mnx = Math.min(mnx, x - (w * s) / 2); mxx = Math.max(mxx, x + (w * s) / 2);
    mny = Math.min(mny, y - (h * s) / 2); mxy = Math.max(mxy, y + (h * s) / 2);
  }
  if (mnx === Infinity) { mnx = 550; mxx = 730; mny = 300; mxy = 420; }
  return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny, cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 };
}
export { objSize, bboxOfLayers };

/* shift a layer (and its x/y keyframes + motion path) by (dx, dy) — the same
   math ungroupClip applies when releasing children onto the parent timeline.
   NOT recursive: a nested clip's children ride inside the clip's own shifted
   coordinate space, so shifting the clip's x/y already moves them. */
export function translateLayer(o, dx, dy) {
  const n = { ...o, props: { ...o.props, x: (o.props.x || 0) + dx, y: (o.props.y || 0) + dy }, tracks: { ...o.tracks } };
  if (n.props.path) n.props.path = { ...n.props.path, pts: (n.props.path.pts || []).map(([px, py]) => [px + dx, py + dy]) };
  if (Array.isArray(n.tracks.x)) n.tracks.x = n.tracks.x.map((k) => ({ ...k, v: typeof k.v === "number" ? k.v + dx : k.v }));
  if (Array.isArray(n.tracks.y)) n.tracks.y = n.tracks.y.map((k) => ({ ...k, v: typeof k.v === "number" ? k.v + dy : k.v }));
  return n;
}

/* ============================================================
   GROUP-STYLE INSERT REFRAMING (R7a) — turn a full-stage scene clip
   (template/kit build) into a content-sized, stage-centered GROUP:
   measure the children's occupied bbox at a representative (settled)
   frame, shift the children so the bbox center lands on the stage
   center, and park the clip's x/y at the stage center — the exact
   geometry a Ctrl+G group has, so rotation/scale pivot around the
   visible content and the drag clamp hugs the content.

   Genuinely full-bleed scenes (backdrop-driven templates whose content
   covers ≈ the whole stage) are left untouched: they ARE the canvas.
   ============================================================ */
export const REFRAME_T = 0.4; /* representative frame: intros settled, every layer alive (TemplateThumb convention) */
export const FULLBLEED_MIN = 0.94; /* bbox covering ≥94% of the stage on both axes = full-bleed scene */
export function reframeClipToContent(clip, stage, tFrac = REFRAME_T) {
  const P = clip.props || {};
  const tRep = Math.round((P.dur || 5000) * tFrac);
  const box = bboxOfLayers(clip.children || [], tRep);
  const fullBleed = box.w >= stage.w * FULLBLEED_MIN && box.h >= stage.h * FULLBLEED_MIN;
  if (fullBleed) {
    return { clip: { ...clip, props: { ...P, x: stage.w / 2, y: stage.h / 2 } }, box, fullBleed: true, shifted: false };
  }
  const dx = Math.round(stage.w / 2 - box.cx), dy = Math.round(stage.h / 2 - box.cy);
  const children = (dx || dy) ? (clip.children || []).map((c) => translateLayer(c, dx, dy)) : clip.children;
  return { clip: { ...clip, children, props: { ...P, x: stage.w / 2, y: stage.h / 2 } }, box, fullBleed: false, shifted: !!(dx || dy) };
}

/* ============================================================
   TRACKS (CapCut-style persistent lanes) — every sibling array (root
   objects, clip children) has its OWN track space: an integer `track`
   field per object, lanes = ascending track order.
   THE TWO RULES (NEXT-FOR-KIMI #6):
   (a) clips on one track are SEQUENTIAL — retime drags clamp and track
       drops snap against same-track neighbours (trackSnap below);
   (b) z-order is track-major: a HIGHER track renders on top of lower
       tracks (bottom lane = foreground, the app's long-standing visual
       semantics); array order within a track. zOrder() feeds the canvas
       AND the export renderer so they can never drift apart.
   Back-compat: old projects carry no `track` field — normalizeTracks
   assigns array indices, reproducing the one-layer-per-row layout (and
   the old paint order) EXACTLY.
   ============================================================ */
const trkOf = (o) => (Number.isInteger(o?.track) && o.track >= 0 ? o.track : null);

/* assign every trackless object the next free index (array order), recursing
   into clip children; already-tracked objects keep their lane */
export function normalizeTracks(layers) {
  let next = layers.reduce((m, o) => Math.max(m, (trkOf(o) ?? -1) + 1), 0);
  return layers.map((o) => {
    const n = { ...o, track: trkOf(o) ?? next++ };
    if (Array.isArray(o.children)) n.children = normalizeTracks(o.children);
    return n;
  });
}

/* collapse tracks to a contiguous 0..n-1 (numeric order) after reassignments */
export function renumberTracks(layers) {
  const ids = [...new Set(layers.map((o) => trkOf(o) ?? 0))].sort((a, b) => a - b);
  const map = new Map(ids.map((t, i) => [t, i]));
  return layers.map((o) => ({ ...o, track: map.get(trkOf(o) ?? 0) }));
}

/* lane rows for the Timeline: group siblings by ascending track, members in
   array order. Row index === track index whenever tracks are contiguous. */
export function trackRows(layers) {
  const byTrack = new Map();
  layers.forEach((o, i) => { const t = trkOf(o) ?? i; if (!byTrack.has(t)) byTrack.set(t, []); byTrack.get(t).push(o); });
  return [...byTrack.entries()].sort((a, b) => a[0] - b[0]).map(([, members]) => members);
}

/* paint order: ascending track (higher track paints later = on top), array
   order within a track. Stable; with migrated tracks (= array index) this is
   exactly the old array order, so old projects render byte-identically. */
export function zOrder(layers) {
  return layers.map((o, i) => [trkOf(o) ?? i, i, o]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , o]) => o);
}

/* the next free lane above the current ones (new inserts land at the bottom
   of the lane list = foreground, like the old append-to-array behavior) */
export function nextTrack(layers) {
  return layers.reduce((m, o) => Math.max(m, (trkOf(o) ?? -1) + 1), 0);
}

/* rule (a) enforcement: move the span [start, start+len) off any same-track
   neighbour it overlaps. Candidate slots = flush after every neighbour's end
   and flush before every neighbour's start; the feasible candidate CLOSEST
   to the requested start wins (ties keep the earliest). Best-effort inside
   [0, maxEnd]: when nothing fits (e.g. a full-width span) the span stays put
   — overlap allowed, z by array order — instead of being flung off-comp. */
export function trackSnap(spans, selfId, start, end, maxEnd = Infinity) {
  const len = end - start;
  const fits = (s) => s >= 0 && s + len <= maxEnd && spans.every((m) => m.id === selfId || s >= m.end || s + len <= m.start);
  if (fits(start)) return start;
  const cands = new Set([start]);
  for (const m of spans) { if (m.id === selfId) continue; cands.add(m.end); cands.add(m.start - len); }
  let best = null;
  for (const s of cands) if (fits(s) && (best === null || Math.abs(s - start) < Math.abs(best - start))) best = s;
  return best === null ? start : best;
}

export const inputStyle = { width: "100%", background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", padding: "6px 9px", fontSize: 12.5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
export const chipStyle = { background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#939BAD", padding: "4px 10px", fontSize: 11, fontWeight: 600 };
export const transportBtn = { width: 30, height: 28, background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" };
export const zoomCtlBtn = { height: 24, minWidth: 26, background: "transparent", border: "none", borderRadius: 4, color: "#939BAD", cursor: "pointer", fontSize: 14, padding: "0 6px", display: "flex", alignItems: "center", justifyContent: "center" };
export const navBtn = { width: 13, height: 17, background: "none", border: "none", color: "#939BAD", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, fontWeight: 700 };
export const sectionLabel = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5D667A" };
