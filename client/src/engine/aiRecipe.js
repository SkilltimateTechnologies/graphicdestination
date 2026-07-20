/* ============================================================
   AI RECIPE (Route A) — turn a validated AI motion spec into a normal
   looping clip of EXISTING engine primitives (one image layer + the
   in→hold→out grammar, the same grammar kits/emoji/templates use).
   Determinism is load-bearing: the built clip is keyframes only — no
   Date.now, no unseeded random — so the export re-render is byte-identical.
   validateAiSpec mirrors server/aiValidate.js exactly (check-ai-recipe.mjs
   pins the two).
   ============================================================ */

const INTRO_TYPES = new Set(["pop", "fade", "rise", "none"]);
const HOLD_TYPES = new Set(["bob", "pulse", "spin", "rock", "heartbeat", "float", "none"]);
const OUTRO_TYPES = new Set(["whip", "fade", "none"]);

const num = (v, min, max, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export const AI_SPEC_DEFAULTS = Object.freeze({
  dur: 3000, size: 220,
  intro: { type: "pop", dur: 470 },
  hold: { type: "bob", amp: 8, period: 900 },
  outro: { type: "whip", dur: 560 },
});
export const AI_FALLBACK_SPEC = Object.freeze({ v: 1, ...AI_SPEC_DEFAULTS });

/** validate + clamp a raw spec — mirrors server/aiValidate.js */
export function validateAiSpec(raw) {
  const clamped = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "spec must be an object", clamped };
  const stage = (cond, msg) => { if (cond) clamped.push(msg); };
  const pick = (v, set, dflt, label) => {
    if (typeof v !== "string") { stage(true, `${label}:default`); return dflt; }
    const k = v.toLowerCase();
    if (!set.has(k)) { stage(true, `${label}:${k}→${dflt}`); return dflt; }
    return k;
  };
  const dur = num(raw.dur, 1500, 8000, AI_SPEC_DEFAULTS.dur);
  if (dur !== raw.dur) stage(true, "dur");
  const size = num(raw.size, 80, 400, AI_SPEC_DEFAULTS.size);
  if (size !== raw.size) stage(true, "size");
  const ri = raw.intro && typeof raw.intro === "object" ? raw.intro : (stage(true, "intro:default"), {});
  const rh = raw.hold && typeof raw.hold === "object" ? raw.hold : (stage(true, "hold:default"), {});
  const ro = raw.outro && typeof raw.outro === "object" ? raw.outro : (stage(true, "outro:default"), {});
  const spec = {
    v: 1,
    dur, size,
    intro: { type: pick(ri.type, INTRO_TYPES, AI_SPEC_DEFAULTS.intro.type, "intro.type"), dur: num(ri.dur, 0, 1200, AI_SPEC_DEFAULTS.intro.dur) },
    hold: { type: pick(rh.type, HOLD_TYPES, AI_SPEC_DEFAULTS.hold.type, "hold.type"), amp: num(rh.amp, 1, 24, AI_SPEC_DEFAULTS.hold.amp), period: num(rh.period, 400, 4000, AI_SPEC_DEFAULTS.hold.period) },
    outro: { type: pick(ro.type, OUTRO_TYPES, AI_SPEC_DEFAULTS.outro.type, "outro"), dur: num(ro.dur, 0, 1200, AI_SPEC_DEFAULTS.outro.dur) },
  };
  return { ok: true, spec, clamped };
}

/* ---------- clip builder (pure) ---------- */
const STAGE_W = 1280, STAGE_H = 720;
const CX = STAGE_W / 2, CY = STAGE_H / 2;
const kf = (t, v, ease) => ({ t: Math.round(t), v, ease });
const MT = (...maps) => {
  const out = {};
  for (const m of maps) for (const p in m) out[p] = [...(out[p] || []), ...m[p]];
  for (const p in out) out[p].sort((a, b) => a.t - b.t);
  return out;
};

/* intro recipes — land at rest pose */
function introTr(spec, t0) {
  const d = spec.intro.dur, type = spec.intro.type;
  if (type === "none" || d <= 0) return { tracks: {}, hold0: t0 };
  if (type === "pop") return { tracks: { scale: [kf(t0, 0, "easeOutBack"), kf(t0 + d, 1, "linear")], opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + Math.min(d, 220), 1, "linear")] }, hold0: t0 + d };
  if (type === "fade") return { tracks: { opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + d, 1, "linear")] }, hold0: t0 + d };
  if (type === "rise") return { tracks: { y: [kf(t0, CY + 60, "easeOutCubic"), kf(t0 + d, CY, "linear")], opacity: [kf(t0, 0, "easeOutQuad"), kf(t0 + Math.min(d, 220), 1, "linear")] }, hold0: t0 + d };
  return { tracks: {}, hold0: t0 };
}

/* hold recipes — always land back on the rest pose so the loop is seamless */
function holdTr(spec, y, t0, t1) {
  const h = spec.hold, per = h.period, amp = h.amp;
  if (h.type === "none" || t1 < t0 + 240) return {};
  if (h.type === "bob" || h.type === "float") {
    const p = h.type === "float" ? per * 2 : per;
    const tr = [kf(t0, y, "easeInOutSine")];
    let t = t0, dn = true;
    while (t + p / 2 <= t1 - 40) { t += p / 2; tr.push(kf(t, dn ? y + amp : y, "easeInOutSine")); dn = !dn; }
    if (!dn || tr[tr.length - 1].v !== y) tr.push(kf(t1, y, "easeInOutSine"));
    return { y: tr };
  }
  if (h.type === "pulse" || h.type === "heartbeat") {
    const k = h.type === "pulse" ? 1 + amp / 100 : 1 + amp / 80;
    const tr = [kf(t0, 1, "easeInOutSine")];
    let t = t0, up = true;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, up ? k : 1, "easeInOutSine")); up = !up; }
    if (!up || tr[tr.length - 1].v !== 1) tr.push(kf(t1, 1, "easeInOutSine"));
    return { scale: tr };
  }
  if (h.type === "spin") return { rotation: [kf(t0, 0, "linear"), kf(t1, 360, "linear")] };
  if (h.type === "rock") {
    const tr = [kf(t0, 0, "easeInOutSine")];
    let t = t0, dir = 1;
    while (t + per / 2 <= t1 - 40) { t += per / 2; tr.push(kf(t, dir * amp, "easeInOutSine")); dir = -dir; }
    if (tr[tr.length - 1].v !== 0) tr.push(kf(t1, 0, "easeInOutSine"));
    return { rotation: tr };
  }
  return {};
}

/* outro recipes — gone by the loop end */
function outroTr(spec, t1, t2) {
  const d = spec.outro.dur, type = spec.outro.type;
  if (type === "none" || d <= 0) return {};
  const t0 = Math.max(0, t2 - d);
  if (type === "whip") return {
    scale: [kf(t0, 1, "easeOutQuad"), kf(t0 + Math.min(120, d / 3), 1.09, "easeInCubic"), kf(t2, 0, "linear")],
    opacity: [kf(t0 + 40, 1, "easeInQuad"), kf(t2 - 60, 0, "linear")],
  };
  if (type === "fade") return { opacity: [kf(t0, 1, "easeInQuad"), kf(t2, 0, "linear")] };
  return {};
}

let _id = 0;
const uid = () => `ai${(_id += 1)}`;

/**
 * Build a seamlessly-looping clip for a validated spec + an image src.
 * Loop contract: the child enters AFTER t=0 and exits BEFORE dur, so t=0 and
 * t=dur are the same empty frame — the clip wraps with no jump.
 */
export function buildAiClip(specRaw, { src, name = "AI asset", w, h } = {}) {
  const { ok, spec, error } = validateAiSpec(specRaw);
  if (!ok) throw new Error(`invalid AI spec: ${error}`);
  const D = spec.dur;
  const size = spec.size;
  const inT = 140; /* empty beat at the loop point */
  const outT = D - 60; /* empty beat before wrap */
  const intro = introTr(spec, inT);
  const tracks = MT(intro.tracks, holdTr(spec, CY, intro.hold0, spec.outro.type === "none" ? outT : outT - spec.outro.dur), outroTr(spec, outT - spec.outro.dur, outT));
  const child = {
    id: uid(), type: "image", name, tracks, locked: false, hidden: false,
    props: { x: CX, y: CY, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: w || size, h: h || size, inT, outT, path: null, prog: 0, src },
  };
  return {
    id: uid(), type: "clip", name, tracks: {}, locked: false, hidden: false, children: [child],
    props: { x: CX, y: CY, scale: 1, rotation: 0, opacity: 1, w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, start: 0, dur: D, speed: 1, end: "loop", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 400 },
  };
}
