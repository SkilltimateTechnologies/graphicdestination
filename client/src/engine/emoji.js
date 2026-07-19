/* ============================================================
   EMOJI — Microsoft Fluent Emoji (3D), Smileys & Emotion group.
   Pure data + builders, NO React imports — unit-testable in node.

   Each emoji is a real 3D-rendered PNG (MIT licensed, fetched by
   scripts/fetch-fluent-emoji.mjs into client/public/emoji/fluent/3d/).
   We give it life with the SAME deterministic motion grammar the kits
   use — in → hold → out — applied to a single IMAGE layer wrapped in a
   seamlessly-looping clip. Because it builds on the existing "clip" +
   "image" render primitives, preview, SSR checks and the export
   rasterizer all share the one StageObject render path.

   THE MOTION GRAMMAR (whole-emoji, since the art is one raster):
     · in:   easeOutBack pop (scale 0→1) + quick fade.
     · hold: a signature loop chosen from the emoji's own keywords —
             heartbeat (hearts), spin (dizzy/star), rock (angry),
             bob (faces), pulse (default) — always returning to rest.
     · out:  anticipation grow then accelerate to nothing (whip).
   SEAMLESS LOOP: the child has inT > 0 and its exit lands before dur,
   so t=0 and t=dur are the same empty frame — the clip wraps with no
   jump. All motion is a pure function of timeline time (keyframes only,
   no Date.now / no random), so the export path re-renders identical
   frames.
   ============================================================ */
import { FLUENT_EMOJI } from "./emojiData.js";

const STAGE_W = 1280, STAGE_H = 720;
const CX = STAGE_W / 2, CY = STAGE_H / 2;

const EMOJI_DUR = 3000; /* loop length */
const SIZE = 300;       /* default art box (px on the 1280×720 stage) */
const IN0 = 140;        /* entrance start (0..IN0 is empty → loop point) */
const EXIT0 = 560;      /* exit window length */
const OUT_TAIL = 60;    /* empty beat after exit (loop point) */

/* ---------- keyframe helpers (mirror of the kit grammar) ---------- */
const kf = (t, v, ease) => ({ t: Math.round(t), v, ease });
const MT = (...maps) => {
  const out = {};
  for (const m of maps) for (const p in m) out[p] = [...(out[p] || []), ...m[p]];
  for (const p in out) out[p].sort((a, b) => a.t - b.t);
  return out;
};

/* pop: scale 0 → 1 with overshoot + quick fade */
const popInTr = (t0, d = 470) => ({
  scale: [kf(t0, 0, "easeOutBack"), kf(t0 + d, 1, "linear")],
  opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + 220, 1, "linear")],
});
/* whip out: anticipation grow, then accelerate to nothing, gone at t2 */
const exitTr = (t1, t2) => ({
  scale: [kf(t1, 1, "easeOutQuad"), kf(t1 + 120, 1.09, "easeInCubic"), kf(t2, 0, "linear")],
  opacity: [kf(t1 + 40, 1, "easeInQuad"), kf(t2 - 60, 0, "linear")],
});

/* hold recipes — always land back on the rest pose so the loop is seamless */
function holdTr(h, y, t0, t1) {
  if (t1 < t0 + 240) return {};
  if (h.type === "pulse") {
    const per = h.period || 900, amp = h.amp || 1.06;
    const tr = [kf(t0, 1, "easeInOutSine")];
    let t = t0, up = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, up ? amp : 1, "easeInOutSine")); up = !up; }
    if (!up || tr[tr.length - 1].v !== 1) tr.push(kf(t1, 1, "easeInOutSine"));
    return { scale: tr };
  }
  if (h.type === "heartbeat") {
    const per = h.period || 1100;
    const tr = [];
    for (let t = t0; t + per <= t1 + 1; t += per) {
      tr.push(kf(t, 1, "easeOutQuad"), kf(t + 130, 1.13, "easeInOutSine"), kf(t + 260, 1, "easeOutQuad"), kf(t + 400, 1.19, "easeInOutSine"), kf(t + 560, 1, "linear"));
    }
    tr.push(kf(t1, 1, "linear"));
    return { scale: tr };
  }
  if (h.type === "spin") return { rotation: [kf(t0, 0, "linear"), kf(t1, 360 * (h.turns || 1), "linear")] };
  if (h.type === "bob") {
    const per = h.period || 900, amp = h.amp || 8;
    const tr = [kf(t0, y, "easeInOutSine")];
    let t = t0, dn = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, dn ? y + amp : y, "easeInOutSine")); dn = !dn; }
    if (!dn || tr[tr.length - 1].v !== y) tr.push(kf(t1, y, "easeInOutSine"));
    return { y: tr };
  }
  if (h.type === "rock") {
    const per = h.period || 440, amp = h.amp || 7;
    const tr = [kf(t0, 0, "easeInOutSine")];
    let t = t0, dir = 1;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, dir * amp, "easeInOutSine")); dir = -dir; }
    if (tr[tr.length - 1].v !== 0) tr.push(kf(t1, 0, "easeInOutSine"));
    return { rotation: tr };
  }
  return {};
}

/* signature hold chosen from the emoji's own keywords */
export function holdFor(keywords = []) {
  const k = keywords.join(" ");
  if (/heart/.test(k)) return { type: "heartbeat" };
  if (/dizzy|star-struck|star struck|cyclone|rotat|hundred/.test(k)) return { type: "spin", turns: 1 };
  if (/ang|rage|\bmad\b|steam|pout|triumph|symbol/.test(k)) return { type: "rock", period: 420, amp: 7 };
  if (/sad|cry|tear|sleep|tired|weary|pensiv|disappoint|worried|frown|yawn/.test(k)) return { type: "bob", period: 1500, amp: 8 };
  if (/laugh|joy|grin|smil|happy|hug|excit|\bstar\b|party|celebr|kiss|love/.test(k)) return { type: "bob", period: 760, amp: 7 };
  return { type: "pulse", period: 900, amp: 1.06 };
}

/* ---------- object builders (output shape === kit clip) ---------- */
let _id = 0;
const uid = () => `em${(_id += 1)}`;

function imageLayer(name, props, tracks) {
  return {
    id: uid(), type: "image", name, tracks: tracks || {}, locked: false, hidden: false,
    props: { x: CX, y: CY, scale: 1, rotation: 0, opacity: 1, w: SIZE, h: SIZE, inT: 0, outT: null, path: null, prog: 0, ...props },
  };
}

function emojiClip(name, children, dur) {
  return {
    id: uid(), type: "clip", name, tracks: {}, locked: false, hidden: false, children,
    props: { x: CX, y: CY, scale: 1, rotation: 0, opacity: 1, w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, start: 0, dur, speed: 1, end: "loop", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 400 },
  };
}

/**
 * Build a seamlessly-looping clip for one emoji.
 * @param {{id,name,glyph,file,keywords}} emoji
 * @param {{variant?: "animated"|"static", size?: number}} opts
 */
export function buildEmojiClip(emoji, opts = {}) {
  const animated = opts.variant !== "static";
  const size = Number.isFinite(+opts.size) ? Math.max(80, Math.min(720, +opts.size)) : SIZE;
  const D = EMOJI_DUR;
  const base = { src: emoji.file, w: size, h: size, x: CX, y: CY };

  if (!animated) {
    return emojiClip(emoji.name, [imageLayer(emoji.name, { ...base, inT: 0, outT: null }, {})], D);
  }
  const inT = IN0, outT = D - OUT_TAIL, ex0 = D - EXIT0;
  const tracks = MT(popInTr(inT), exitTr(ex0, outT), holdTr(holdFor(emoji.keywords), CY, inT + 480, ex0));
  return emojiClip(emoji.name, [imageLayer(emoji.name, { ...base, inT, outT }, tracks)], D);
}

/* sub-categories so 169 emoji stay browsable */
const catOf = (e) => {
  const k = (e.keywords || []).join(" ") + " " + e.name;
  if (/heart/.test(k)) return "Hearts";
  if (/\bcat\b/.test(k)) return "Cats";
  if (/face|smil|grin|laugh/.test(k)) return "Faces";
  return "Symbols";
};
export const EMOJI_CATS = ["Faces", "Hearts", "Cats", "Symbols"];

/* registry row per emoji — same shape the panel expects from a kit:
   { id, name, category, tags, recipe, build } */
export const EMOJIS = FLUENT_EMOJI.map((e) => ({
  id: e.id,
  name: e.name,
  glyph: e.glyph,
  category: catOf(e),
  tags: e.keywords || [],
  recipe: `pop · ${holdFor(e.keywords).type} · whip`,
  build: (opts) => buildEmojiClip(e, opts),
}));

/* a small hand-picked set shown in the compact rail panel as a teaser;
   clicking opens the full searchable library. Falls back to the first rows
   if any id is missing from the manifest. */
const FEATURED_IDS = ["smiling-face-with-heart-eyes", "face-with-tears-of-joy", "red-heart", "grinning-face"];
export const FEATURED_EMOJI = (() => {
  const picked = FEATURED_IDS.map((id) => EMOJIS.find((e) => e.id === id)).filter(Boolean);
  for (const e of EMOJIS) { if (picked.length >= 4) break; if (!picked.includes(e)) picked.push(e); }
  return picked.slice(0, 4);
})();

export { FLUENT_EMOJI };
