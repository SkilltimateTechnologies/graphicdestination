/*
 * AI motion-spec validator — model output is UNTRUSTED input, treated like
 * any user upload: schema-checked, clamped, and NEVER eval'd or looped
 * unbounded. The client mirrors these exact rules in engine/aiRecipe.js
 * (keep them in sync — check-ai-recipe.mjs asserts both).
 *
 * Spec shape (v1, "image-base" fidelity — one image layer + motion grammar):
 *   { dur, size, intro:{type,dur}, hold:{type,amp,period}, outro:{type,dur} }
 */

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

/** the deterministic fallback spec (no API key / bad model output) */
export const AI_FALLBACK_SPEC = Object.freeze({ v: 1, ...AI_SPEC_DEFAULTS });

/**
 * Validate + clamp a raw spec from the model or the UI.
 * @returns {{ ok: boolean, spec?: object, error?: string, clamped: string[] }}
 */
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
