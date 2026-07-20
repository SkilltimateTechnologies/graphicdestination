/*
 * test-svg-sanitize.mjs — payload matrix for the allowlist SVG sanitizer
 * (server/svgSanitize.js). Pure: no server boot, no deps.
 * Run from the server directory: `node test-svg-sanitize.mjs`.
 * Prints one PASS/FAIL line per check and exits non-zero on any failure.
 */
import { sanitizeSvg } from "./svgSanitize.js";

let failures = 0;
function check(name, cond, detail = "") {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

const GOOD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="#F5A524" stroke-width="2"><path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0"/><circle cx="12" cy="12" r="3" fill="#F5A524"/></g></svg>`;

/* ---------- 1. legit markup survives intact ---------- */
console.log("legit svg");
{
  const r = sanitizeSvg(GOOD);
  check("a clean icon passes (ok)", r.ok, r.dropped.join(","));
  check("paths/circles/groups survive", r.svg.includes("<path") && r.svg.includes("<circle") && r.svg.includes("<g"));
  check("presentation attrs survive", r.svg.includes('stroke="#F5A524"') && r.svg.includes('stroke-width="2"'));
  check("viewBox survives", r.svg.includes('viewBox="0 0 24 24"'));
}

/* ---------- 2. script + handlers ---------- */
console.log("xss vectors");
{
  const r = sanitizeSvg(`<svg viewBox="0 0 24 24"><script>alert(document.cookie)</script><rect x="1" y="1" width="4" height="4" onclick="steal()" onload="boot()"/></svg>`);
  check("<script> element dropped WITH its content", !/script/i.test(r.svg) && !r.svg.includes("alert"), r.svg);
  check("on* handler attributes dropped", !/onclick|onload/i.test(r.svg), r.svg);
  check("the rect itself survives", r.svg.includes("<rect"), r.svg);
}
{
  const r = sanitizeSvg(`<svg viewBox="0 0 24 24"><a href="https://evil.example/x"><rect width="4" height="4"/></a><use href="https://evil.example/s.svg#p"/><use xlink:href="#local"/></svg>`);
  check("external href refs dropped (a + remote use)", !r.svg.includes("evil.example"), r.svg);
  check("internal #fragment use refs kept", r.svg.includes('xlink:href="#local"'), r.svg);
  check("the <a> wrapper is unwrapped (rect survives)", r.svg.includes("<rect"), r.svg);
}
{
  const r = sanitizeSvg(`<svg viewBox="0 0 24 24"><rect width="4" height="4" fill="url(https://evil.example/g.svg#g)"/><circle r="2" fill="url(#grad)"/><line x2="3" y2="3" stroke="javascript:alert(1)"/></svg>`);
  check("non-fragment url() fill dropped", !r.svg.includes("evil.example"), r.svg);
  check("internal url(#grad) fill kept", r.svg.includes("url(#grad)"), r.svg);
  check("javascript: attribute dropped", !/javascript/i.test(r.svg), r.svg);
}
{
  const r = sanitizeSvg(`<svg viewBox="0 0 24 24"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://evil.example"></iframe></body></foreignObject><rect width="4" height="4"/><style>@import url(https://evil.example/x.css);</style><ellipse rx="2" ry="2" style="fill:#fff;behavior:url(x.htc)"/></svg>`);
  check("<foreignObject> dropped WITH its subtree", !/foreignobject|iframe/i.test(r.svg), r.svg);
  check("<style> element dropped", !/<style|@import/i.test(r.svg), r.svg);
  check("style attr with behavior dropped", !/behavior/i.test(r.svg), r.svg);
  check("siblings after the dropped subtrees survive", r.svg.includes("<rect") && r.svg.includes("<ellipse"), r.svg);
}
{
  const r = sanitizeSvg(`<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><svg viewBox="0 0 24 24"><rect width="4" height="4" fill="&xxe;"/></svg>`);
  check("DOCTYPE/ENTITY stripped", !/DOCTYPE|ENTITY/i.test(r.svg), r.svg);
  check("…and the entity reference is gone", !r.svg.includes("&xxe;"), r.svg);
}
{
  const r = sanitizeSvg(`<svg viewBox="0 0 24 24"><foo-bar><rect width="4" height="4"/></foo-bar></svg>`);
  check("unknown elements unwrap (children survive)", r.svg.includes("<rect") && !r.svg.includes("foo-bar"), r.svg);
}

/* ---------- 3. root normalization ---------- */
console.log("root normalization");
{
  const r = sanitizeSvg(`<svg width="48" height="48"><rect width="48" height="48" fill="#F5A524"/></svg>`);
  check("missing viewBox synthesized from width/height", r.svg.includes('viewBox="0 0 48 48"'), r.svg);
  check("missing xmlns added", r.svg.includes('xmlns="http://www.w3.org/2000/svg"'), r.svg);
}
{
  check("non-svg input rejected (ok=false)", !sanitizeSvg("<div>hello</div>").ok);
  check("empty input rejected", !sanitizeSvg("").ok);
  check("script-only svg rejected (nothing renderable survives)", !sanitizeSvg(`<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>`).ok);
}

console.log(`\n${failures ? failures + " FAILURE(S)" : "all sanitize checks passed"}`);
process.exit(failures ? 1 : 0);
