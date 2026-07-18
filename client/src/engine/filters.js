/* ============================================================
   ENGINE · per-layer FILTERS (pure) — blur + blend modes
   ------------------------------------------------------------
   Two OPTIONAL layer props, honored by EVERY object type at the
   single shared render point (components/StageObject.jsx):

     props.blur  — gaussian blur radius in px, 0 … BLUR_MAX (20).
                   Absent / 0 = inert (default) → no style key is
                   emitted, old projects render byte-identical.
     props.blend — CSS mix-blend-mode: "normal" (default) |
                   "screen" | "multiply" | "overlay". Absent /
                   "normal" = inert → no style key emitted.

   Both render through the DOM the preview AND the export share
   (export/frameRenderer.js rasterizes the same StageObject markup
   inside <foreignObject>; Chromium rasterizes CSS blur() and
   mix-blend-mode there — covered by src/export/test-filters-export.mjs).

   The helpers are pure and dependency-free so the editor
   (Inspector), the renderer and the node checks all agree on
   clamping/normalization.
   ============================================================ */

export const BLUR_MAX = 20;

/* blend modes offered in the Inspector — order is the chip order.
   "normal" is the inert default (key removed from the JSON). */
export const BLEND_MODES = ["normal", "screen", "multiply", "overlay"];

/* clamp a blur value to the supported range; junk → 0 (inert) */
export const clampBlur = (v) => Math.max(0, Math.min(BLUR_MAX, Number.isFinite(+v) ? +v : 0));

/* normalize a blend prop; junk/absent → "normal" (inert) */
export const normBlend = (v) => (BLEND_MODES.includes(v) ? v : "normal");

/* CSS `filter` value for a layer's blur — "" when inert so callers
   can skip emitting the style key entirely (byte-identical defaults) */
export const blurCss = (P) => {
  const b = clampBlur(P && P.blur);
  return b > 0 ? `blur(${+b.toFixed(2)}px)` : "";
};

/* CSS `mix-blend-mode` value for a layer's blend — "" when inert */
export const blendCss = (P) => {
  const m = normBlend(P && P.blend);
  return m === "normal" ? "" : m;
};

/* tiny depth quick-view hint shown next to the Inspector Depth slider —
   helps users discover what parallax depth does. Pure mapping:
   depth < −0.2 → far background · < 0.3 → mid · else foreground. */
export const depthHint = (d) => {
  const v = Number.isFinite(+d) ? +d : 0;
  if (v < -0.2) return "far background";
  if (v < 0.3) return "mid";
  return "foreground";
};
