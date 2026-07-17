/* ============================================================
   ENGINE · easing curves + math helpers (pure)
   Extracted VERBATIM from components/GraphicDestinationMotion.jsx
   (zero-behavior-change refactor — pure engine code only).
   ============================================================ */

/* ---------- easing ---------- */
export const EASE = {
  linear: (t) => t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInQuad: (t) => t * t,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInCubic: (t) => t * t * t,
  easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  easeOutElastic: (t) => { if (t === 0 || t === 1) return t; const c4 = (2 * Math.PI) / 3; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
  easeOutBounce: (t) => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; },
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
export const EASE_LABEL = { linear: "Linear", easeOutQuad: "Out Quad", easeInQuad: "In Quad", easeInOutCubic: "In-Out Cubic", easeOutCubic: "Out Cubic", easeInCubic: "In Cubic", easeOutBack: "Overshoot", easeOutElastic: "Elastic", easeOutBounce: "Bounce", easeInOutSine: "In-Out Sine" };
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
