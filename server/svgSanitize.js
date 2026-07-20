/*
 * HARD SVG sanitizer (allowlist) — admin-uploaded SVG is UNTRUSTED input
 * (XSS / SSRF vector). Approach: allow-list elements + attributes, never
 * block-list. Everything below is enforced on the server BEFORE store:
 *
 *   · <script>, <foreignObject>, <style>, <iframe>, <object>, <embed>,
 *     <link>, <meta>, <audio>, <video> are dropped WITH their whole subtree.
 *   · unknown elements are dropped but their (allowed) children survive.
 *   · every on* event-handler attribute is dropped.
 *   · href / xlink:href kept only for internal fragments ("#id").
 *   · any attribute value carrying javascript: or a non-fragment url(...) is
 *     dropped (fill/clip-path/mask/filter url(#id) stays).
 *   · style attributes carrying @import / expression() / javascript / binding
 *     are dropped.
 *   · DOCTYPE / ENTITY declarations, comments and processing instructions
 *     are stripped up front.
 *   · the root must be <svg>; a missing viewBox is synthesized from
     width/height so the client can scale the icon deterministically.
 *
 * No dependencies — a small hand-rolled XML tokenizer (the server's deps are
 * vendored; adding a parser library is not an option).
 */

const ALLOWED_EL = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "defs", "linearGradient", "radialGradient", "stop", "title", "desc",
  "clipPath", "mask", "symbol", "use",
]);

/* dropped together with their ENTIRE subtree */
const DROP_SUBTREE = new Set([
  "script", "foreignobject", "style", "iframe", "object", "embed",
  "link", "meta", "audio", "video", "canvas", "iframe", "noscript",
]);

const ALLOWED_ATTR = new Set([
  "id", "class", "d", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
  "stroke-dashoffset", "stroke-opacity", "opacity", "transform", "x", "y", "x1", "y1",
  "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "points", "viewbox",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform",
  "clip-rule", "vector-effect", "xmlns", "xmlns:xlink", "preserveaspectratio",
  "clip-path", "mask", "filter", "href", "xlink:href", "style",
]);

const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/* attribute value veto: javascript: anywhere, or a url() that does not point
   at an internal #fragment */
const badValue = (v) => /javascript\s*:/i.test(v) || /url\(\s*['"]?\s*(?!#)[^)]*\)/i.test(v);
const badStyle = (v) => /@import|expression\s*\(|javascript|behavior\s*:|-moz-binding|binding\s*:/i.test(v) || badValue(v);

function sanitizeAttrs(raw) {
  const out = [];
  const re = /([^\s=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1];
    const value = m[3] != null ? m[3] : m[4] != null ? m[4] : "";
    const lname = name.toLowerCase();
    if (lname.startsWith("on")) continue; /* event handlers */
    if (!ALLOWED_ATTR.has(lname)) continue;
    if ((lname === "href" || lname === "xlink:href") && !value.trim().startsWith("#")) continue; /* fragment-only refs */
    if (lname === "style") { if (badStyle(value)) continue; }
    else if (badValue(value)) continue;
    out.push(`${name}="${escAttr(value)}"`);
  }
  return out.length ? " " + out.join(" ") : "";
}

/**
 * Sanitize an SVG document string.
 * @returns {{ ok: boolean, svg: string, dropped: string[] }} ok=false when the
 * input has no <svg> root or nothing renderable survives.
 */
export function sanitizeSvg(input) {
  const dropped = [];
  if (typeof input !== "string" || !input.trim()) return { ok: false, svg: "", dropped: ["empty"] };
  let src = input
    .replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, () => { dropped.push("doctype"); return ""; })
    .replace(/<!ENTITY[\s\S]*?>/gi, () => { dropped.push("entity"); return ""; })
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
  if (!/<svg[\s>]/i.test(src)) return { ok: false, svg: "", dropped: ["no-svg-root"] };

  let out = "";
  const stack = []; /* subtree-drop depth markers */
  const tagRe = /<(\/?)([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^"'>])*)(\/?)>/g;
  let last = 0, m;
  const pushText = (end) => { if (end > last && !stack.length) out += escText(src.slice(last, end)); };
  while ((m = tagRe.exec(src))) {
    const [whole, closing, name, attrRaw, selfClose] = m;
    const lname = name.toLowerCase();
    pushText(m.index);
    last = m.index + whole.length;
    if (stack.length) { /* inside a dropped subtree: only track nesting */
      if (!closing) { if (DROP_SUBTREE.has(lname) && !selfClose) stack.push(lname); }
      else if (lname === stack[stack.length - 1]) stack.pop();
      continue;
    }
    if (DROP_SUBTREE.has(lname)) {
      dropped.push(lname);
      if (!closing && !selfClose) stack.push(lname);
      continue;
    }
    if (closing) { if (ALLOWED_EL.has(lname) || lname === "svg") out += `</${name}>`; continue; }
    if (!ALLOWED_EL.has(lname)) { dropped.push(lname); continue; /* unwrap: children keep flowing */ }
    out += `<${name}${sanitizeAttrs(attrRaw || "")}${selfClose ? " />" : ">"}`;
  }
  pushText(src.length);

  /* normalize the ROOT <svg>: force xmlns + a viewBox (synthesized from
     width/height when absent) so client scaling is deterministic */
  out = out.replace(/<svg\b([^>]*)>/i, (whole, attrs) => {
    const has = (k) => new RegExp(`${k}=`, "i").test(attrs);
    const get = (k) => { const mm = attrs.match(new RegExp(`${k}="([^"]*)"`, "i")); return mm ? mm[1] : null; };
    let extra = "";
    if (!has("xmlns")) extra += ' xmlns="http://www.w3.org/2000/svg"';
    if (!has("viewBox")) {
      const w = parseFloat(get("width")) || 100, h = parseFloat(get("height")) || 100;
      extra += ` viewBox="0 0 ${w} ${h}"`;
      dropped.push("viewBox-synthesized");
    }
    return `<svg${attrs}${extra}>`;
  });
  const ok = /<svg[\s>]/.test(out) && /<(path|rect|circle|ellipse|line|polyline|polygon|g|use|symbol)[\s/>]/.test(out);
  return { ok, svg: out.trim(), dropped };
}
