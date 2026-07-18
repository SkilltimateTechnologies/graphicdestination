/**
 * check-threed.mjs — node proof for the "3D" (2.5D) widgets + layer filters:
 *
 *   1. FILTER HELPERS (engine/filters.js, pure) — clampBlur 0…20, normBlend
 *      whitelist, blurCss/blendCss emit NOTHING at inert defaults (0/normal),
 *      depthHint thresholds (−0.2 / 0.3).
 *
 *   2. WIDGET STRUCTURE (engine/threed.js, pure) — each of the 4 widgets
 *      builds a clip-shaped insert spec with the expected children, depths,
 *      props and FULL per-child schema (base props + type defaults); ids are
 *      fresh across calls; JSON round-trip stable.
 *
 *   3. SSR through the REAL StageObject (bundled with the project's own
 *      Vite) — every widget clip renders its expected parts; blur(Npx) and
 *      mix-blend-mode appear on shape/text/image/clip/confetti renders when
 *      set; INERT DEFAULTS ADD NO MARKUP (blur 0 / blend normal SSR === no
 *      props at all ⇒ old projects byte-identical); blend hoists to the
 *      camera wrapper; camInside clips thread the scene camera to their
 *      children while legacy clips do not.
 *
 * Run:  node check-threed.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BLUR_MAX, BLEND_MODES, clampBlur, normBlend, blurCss, blendCss, depthHint } from "./src/engine/filters.js";
import { THREED_WIDGETS, buildThreedWidget, THREED_PLACEHOLDER_SRC } from "./src/engine/threed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".threed-check-tmp");
const STAGE = { w: 1280, h: 720 };

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

let _n = 1;
const uid = () => "obT" + _n++;
const buildWidget = (id) => buildThreedWidget(id, { uid, stage: STAGE, accent: "#F5A524", dur: 4000 });

/* full clip layer from a widget spec — mirrors makeObject("clip", over) */
const clipLayer = (spec, overProps = {}) => ({
  id: "ob990", type: "clip", name: spec.name, tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, start: 0, dur: 4000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500, ...spec.props, ...overProps },
  children: spec.children,
});
const BASE_PROPS = ["x", "y", "scale", "rotation", "opacity", "fill", "w", "h", "inT", "outT", "path", "prog"];

async function main() {
  /* ---------- 1. filter helpers ---------- */
  console.log("filters engine — clamp/normalize/css helpers (pure)");
  check("clampBlur clamps to 0…" + BLUR_MAX, clampBlur(-4) === 0 && clampBlur(99) === BLUR_MAX && clampBlur(7.25) === 7.25 && clampBlur("x") === 0);
  check("normBlend whitelist + junk → normal", normBlend("screen") === "screen" && normBlend("overlay") === "overlay" && normBlend("bogus") === "normal" && normBlend(undefined) === "normal");
  check("4 blend modes, normal first", BLEND_MODES.join(",") === "normal,screen,multiply,overlay");
  check("blurCss: 8 → blur(8px) · 8.5 → blur(8.5px)", blurCss({ blur: 8 }) === "blur(8px)" && blurCss({ blur: 8.5 }) === "blur(8.5px)");
  check("blurCss inert: 0 / absent / junk → empty", blurCss({ blur: 0 }) === "" && blurCss({}) === "" && blurCss({ blur: NaN }) === "");
  check("blendCss: screen/multiply/overlay pass through", blendCss({ blend: "screen" }) === "screen" && blendCss({ blend: "multiply" }) === "multiply" && blendCss({ blend: "overlay" }) === "overlay");
  check("blendCss inert: normal / absent / junk → empty", blendCss({ blend: "normal" }) === "" && blendCss({}) === "" && blendCss({ blend: "weird" }) === "");
  check("depthHint: −0.9 far background", depthHint(-0.9) === "far background" && depthHint(-0.21) === "far background");
  check("depthHint: −0.2 / 0 / 0.29 mid", depthHint(-0.2) === "mid" && depthHint(0) === "mid" && depthHint(0.29) === "mid");
  check("depthHint: 0.3 / 1.5 foreground · junk → mid", depthHint(0.3) === "foreground" && depthHint(1.5) === "foreground" && depthHint("x") === "mid");

  /* ---------- 2. widget structure ---------- */
  console.log("\n3D widgets — catalogue + insert specs (pure builders)");
  check("4 widgets registered in panel order", THREED_WIDGETS.map((w) => w.id).join(",") === "photoStack,tiltCard,isoCube,extrudeText", THREED_WIDGETS.map((w) => w.id).join(","));
  check("every widget has name + one-line blurb", THREED_WIDGETS.every((w) => w.name && typeof w.blurb === "string" && w.blurb.length > 10 && !w.blurb.includes("\n")));
  check("placeholder is an svg data-uri", THREED_PLACEHOLDER_SRC.startsWith("data:image/svg+xml"));

  const specs = Object.fromEntries(THREED_WIDGETS.map((w) => [w.id, buildWidget(w.id)]));
  for (const w of THREED_WIDGETS) {
    const s = specs[w.id];
    check(`${w.id}: clip-shaped spec (name/children/props)`, typeof s.name === "string" && Array.isArray(s.children) && s.children.length >= 3 && typeof s.props.start === "number" && s.props.dur === 4000 && s.props.x === 640 && s.props.y === 360);
    check(`${w.id}: children have full base schema + unique ids`, s.children.every((c) => BASE_PROPS.every((p) => p in c.props) && c.tracks && typeof c.id === "string") && new Set(s.children.map((c) => c.id)).size === s.children.length);
    check(`${w.id}: JSON round-trip stable`, JSON.stringify(JSON.parse(JSON.stringify(s))) === JSON.stringify(s));
  }
  const again = buildWidget("photoStack");
  check("two builds mint fresh ids", !again.children.some((c) => specs.photoStack.children.some((o) => o.id === c.id)));

  const ps = specs.photoStack;
  check("photoStack: 5 children, types image/shape/text/image/shape", ps.children.map((c) => c.type).join(",") === "image,shape,text,image,shape");
  check("photoStack: clip opts into camInside", ps.props.camInside === true);
  check("photoStack: BG image 112% at depth −0.6", ps.children[0].props.scale === 1.12 && ps.children[0].props.depth === -0.6 && ps.children[0].props.src === THREED_PLACEHOLDER_SRC);
  check("photoStack: dark overlay 35% at depth −0.6", ps.children[1].props.opacity === 0.35 && ps.children[1].props.depth === -0.6 && ps.children[1].props.shape === "rect");
  check("photoStack: big type BETWEEN at depth 0.6", ps.children[2].type === "text" && ps.children[2].props.depth === 0.6 && ps.children[2].props.fontSize >= 120);
  check("photoStack: SUBJECT note name, world-locked (no depth key), 100%", ps.children[3].name === "SUBJECT (replace + mask)" && !("depth" in ps.children[3].props) && ps.children[3].props.scale === 1);
  check("photoStack: FG accent at depth 1.2", ps.children[4].props.depth === 1.2 && ps.children[4].props.fill === "#F5A524");

  const tc = specs.tiltCard;
  check("tiltCard: 4 children (shadow/card/title/badge)", tc.children.map((c) => c.type).join(",") === "shape,shape,text,text");
  check("tiltCard: soft blurred shadow ellipse", tc.children[0].props.shape === "ellipse" && tc.children[0].props.blur === 14 && tc.children[0].props.opacity < 0.5);
  check("tiltCard: rounded card, tilted −5°, 0.92 squash baked (h = 216)", tc.children[1].props.shape === "rect" && tc.children[1].props.cornerR === 24 && tc.children[1].props.rotation === -5 && tc.children[1].props.w === 400 && tc.children[1].props.h === 216);
  check("tiltCard: floating badge pill", tc.children[3].props.bg === "#F5A524" && tc.children[3].props.radius === 999 && tc.children[3].props.rotation === -5);

  const ic = specs.isoCube;
  check("isoCube: 3 diamond faces", ic.children.length === 3 && ic.children.every((c) => c.props.shape === "diamond"));
  check("isoCube: face rotations 0 / +60 / −60", ic.children.map((c) => c.props.rotation).join(",") === "0,60,-60");
  check("isoCube: 3 distinct shade tones of the accent", new Set(ic.children.map((c) => c.props.fill)).size === 3 && ic.children.every((c) => /^#[0-9a-f]{6}$/i.test(c.props.fill)));

  const et = specs.extrudeText;
  check("extrudeText: face + 5 copies, all same word", et.children.length === 6 && et.children.every((c) => c.type === "text" && c.props.text === "DEPTH"));
  check("extrudeText: copies step 1 px (deepest first), face on top", et.children.slice(0, 5).every((c, k) => c.props.x - 640 === 5 - k && c.props.y - 360 === 5 - k) && et.children[5].props.x === 640 && et.children[5].props.fill === "#F5A524");

  /* ---------- 3. bundle the real StageObject for SSR ---------- */
  console.log("\nBundling the real StageObject (+ react-dom/server) with Vite…");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.js");
  fs.writeFileSync(entry, [
    `export { StageObject } from ${JSON.stringify(path.join(here, "src", "components", "StageObject.jsx"))};`,
    `export { createElement } from "react";`,
    `export { renderToStaticMarkup } from "react-dom/server";`,
    "",
  ].join("\n"));
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    build: { outDir: tmpDir, lib: { entry, formats: ["es"], fileName: () => "engine.mjs" } },
  });
  const M = await import(pathToFileURL(path.join(tmpDir, "engine.mjs")).href);
  const { StageObject, createElement: h, renderToStaticMarkup } = M;
  const ssr = (obj, time, camera) => renderToStaticMarkup(h(StageObject, { obj, time, stage: STAGE, camera: camera || null, selected: false, interactive: false }));

  /* ---------- 4. widgets SSR ---------- */
  console.log("\nwidgets — SSR through the real StageObject");
  const psHtml = ssr(clipLayer(specs.photoStack), 200);
  check("photoStack SSR: big type + 2 placeholder images render", psHtml.includes("YOUR LYRIC") && (psHtml.match(/data:image\/svg\+xml/g) || []).length === 2 && !psHtml.includes("NaN"));
  const cam15 = { tracks: { zoom: [{ t: 0, v: 1.5, ease: "linear" }] } };
  const psCam = ssr(clipLayer(specs.photoStack), 200, cam15);
  /* zoom 1.5 ⇒ s = 1 + 0.5·f with f = 1+depth: far −0.6 → 1.2 · world 0 → 1.5 · text 0.6 → 1.8 · fg 1.2 → 2.1 */
  check("photoStack + camera zoom 1.5: depths parallax (far 1.2 · world 1.5 · text 1.8 · fg 2.1)", psCam.includes("scale(1.2)") && psCam.includes("scale(1.5)") && psCam.includes("scale(1.8)") && psCam.includes("scale(2.1)"));
  const tcHtml = ssr(clipLayer(specs.tiltCard), 200);
  check("tiltCard SSR: title + badge + blurred shadow", tcHtml.includes("TILTED CARD") && tcHtml.includes("NEW") && tcHtml.includes("blur(14px)") && !tcHtml.includes("NaN"));
  const icHtml = ssr(clipLayer(specs.isoCube), 200);
  check("isoCube SSR: 3 polygon faces", (icHtml.match(/<polygon/g) || []).length === 3 && !icHtml.includes("NaN"));
  const etHtml = ssr(clipLayer(specs.extrudeText), 200);
  check("extrudeText SSR: 6 stacked copies of the word", (etHtml.match(/>DEPTH</g) || []).length === 6 && !etHtml.includes("NaN"));

  /* ---------- 5. filters SSR ---------- */
  console.log("\nfilters — blur + blend on every render path");
  const shapeObj = (over = {}) => ({ id: "ob991", type: "shape", name: "Shape", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#FFB224", w: 180, h: 180, inT: 0, outT: null, path: null, prog: 0, shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0, ...over } });
  const textObj = (over = {}) => ({ id: "ob992", type: "text", name: "Text", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 0, h: 0, inT: 0, outT: null, path: null, prog: 0, text: "FILTERS", fontSize: 72, fontWeight: 700, textFx: null, fontFamily: "Space Grotesk", ls: 0.5, upper: false, pathMode: "flow", bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none", ...over } });
  const imgObj = (over = {}) => ({ id: "ob993", type: "image", name: "Image", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 320, h: 220, inT: 0, outT: null, path: null, prog: 0, src: THREED_PLACEHOLDER_SRC, ...over } });
  const confObj = (over = {}) => ({ id: "ob994", type: "confetti", name: "Confetti", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, burst: 0, count: 30, power: 1, seed: 7, style: "burst", ...over } });

  check("shape blur 8 → blur(8px) on the wrapper", ssr(shapeObj({ blur: 8 }), 100).includes("blur(8px)"));
  check("shape blend screen → mix-blend-mode:screen", ssr(shapeObj({ blend: "screen" }), 100).includes("mix-blend-mode:screen"));
  check("text blur 3 + multiply → both present", (() => { const m = ssr(textObj({ blur: 3, blend: "multiply" }), 100); return m.includes("blur(3px)") && m.includes("mix-blend-mode:multiply"); })());
  check("image blur 5 → blur(5px)", ssr(imgObj({ blur: 5 }), 100).includes("blur(5px)"));
  check("confetti blur 4 + overlay → both present", (() => { const m = ssr(confObj({ blur: 4, blend: "overlay" }), 100); return m.includes("blur(4px)") && m.includes("mix-blend-mode:overlay"); })());
  check("clip blur 6 → blur(6px) on the clip frame", ssr(clipLayer(specs.isoCube, { blur: 6 }), 100).includes("blur(6px)"));
  check("blur clamps at 20 in the renderer", ssr(shapeObj({ blur: 42 }), 100).includes("blur(20px)"));

  /* ---------- 6. back-compat: inert defaults add NO markup ---------- */
  console.log("\nback-compat — old projects byte-identical");
  for (const [label, mk] of [["shape", shapeObj], ["text", textObj], ["image", imgObj], ["confetti", confObj]]) {
    check(`${label}: defaults (no blur/blend) → no filter/blend markup`, (() => { const m = ssr(mk(), 100); return !m.includes("mix-blend-mode") && !m.includes("filter:blur"); })());
    check(`${label}: explicit inert (blur 0 + normal) SSR === no-props SSR`, ssr(mk({ blur: 0, blend: "normal" }), 100) === ssr(mk(), 100));
  }
  const legacyClip = clipLayer(specs.isoCube);
  check("clip: defaults → no filter/blend markup", (() => { const m = ssr(legacyClip, 100); return !m.includes("mix-blend-mode") && !m.includes("filter:blur"); })());
  const kid = { ...shapeObj({ depth: 0.5 }), id: "obKid" };
  const noCamInside = clipLayer({ name: "Legacy clip", children: [kid], props: {} });
  check("legacy clip + camera: child renders WITHOUT parallax wrapper", !ssr(noCamInside, 100, cam15).includes("scale(1.75)"));
  const withCamInside = clipLayer({ name: "3D clip", children: [kid], props: { camInside: true } });
  check("camInside clip + camera zoom 1.5: child depth 0.5 → scale(1.75)", ssr(withCamInside, 100, cam15).includes("scale(1.75)"));
  check("camInside clip WITHOUT a scene camera renders identical to legacy clip", ssr(withCamInside, 100) === ssr(noCamInside, 100));

  /* ---------- 7. blend hoisting with the camera wrapper ---------- */
  console.log("\nblend hoisting — camera wrapper carries mix-blend-mode");
  const hoisted = ssr(shapeObj({ blend: "screen" }), 100, cam15);
  check("root object + camera + screen: blend on the OUTER wrapper", hoisted.slice(0, 700).includes("mix-blend-mode:screen"));
  check("root object + camera, no blend: no blend markup at all", !ssr(shapeObj(), 100, cam15).includes("mix-blend-mode"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All 3D/filter checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
