/* ============================================================
   SVG ICON (client engine side) — pure helpers, NO React imports.
   A sanitized SVG icon (from /api/svg-icons) becomes a plain IMAGE layer
   whose src is an inline-SVG DATA-URI — never a blob URL (blob SVGs taint
   the export canvas, see AGENTS regression history). The layer then flows
   through the standard 8-way onResize exactly like emoji/images, with no
   new StageObject branch. All pure f(input) — no Date.now / no random.
   ============================================================ */

/* UTF-8-safe base64 (btoa is latin1-only) */
export const svgDataUri = (svg) =>
  `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

/* viewBox (or width/height fallback) of a sanitized icon → { w, h } px.
   The server guarantees a viewBox post-sanitize, but stay defensive. */
export function svgViewBox(svg) {
  const vb = /<svg[^>]*\bviewBox="([^"]*)"/i.exec(svg || "");
  if (vb) {
    const nums = vb[1].trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0) return { w: nums[2], h: nums[3] };
  }
  const num = (k) => { const m = new RegExp(`<svg[^>]*\\b${k}="([\\d.]+)`, "i").exec(svg || ""); return m ? parseFloat(m[1]) : 0; };
  const w = num("width") || 100, h = num("height") || 100;
  return { w, h };
}

/* insert box: longest side = size, aspect preserved (mirrors makeObject's cap) */
export function iconInsertSize(svg, size = 100) {
  const { w, h } = svgViewBox(svg);
  const k = size / Math.max(w, h, 1);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
