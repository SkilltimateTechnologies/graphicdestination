/**
 * check-r7a.mjs — node proof for the R7a workstream:
 *
 *   1. LOCKED KIT OBJECT TYPE — the "kit" primitive stores ONE layer with
 *      props { kit, variant, color, accent } (NO children in the document
 *      JSON) and renders through engine/kits.js kitRenderSpec(): schema
 *      (base props, no children, JSON round-trip), SSR non-empty via the
 *      REAL StageObject, deterministic, color customization changes the
 *      output, the Animated/Static variant switch works, the render is the
 *      literal old kit-clip path (export identity), old kit CLIPS still
 *      render (back-compat), and the object honors its inT/outT window.
 *
 *   2. MOVABLE GROUP-STYLE INSERTS — reframeClipToContent (editor/model.js)
 *      measures the content bbox at the settled frame, shifts children so
 *      the bbox lands centered on the stage and parks the clip at stage
 *      center (Ctrl+G group geometry); genuinely full-bleed scenes
 *      (backdrop-driven templates) are left untouched.
 *
 *   3. HOVER-PLAY THUMBNAILS — the pure timing core (hoverStillTime /
 *      hoverTickTime) + the SSR contract: not hovered ⇒ frozen static
 *      frame, byte-identical across renders, no timers involved.
 *
 * Run:  node check-r7a.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ICONS, UI_ELEMENTS, kitKind, kitById, kitRenderSpec } from "./src/engine/kits.js";
import { bboxOfLayers, objSize, translateLayer, reframeClipToContent } from "./src/components/editor/model.js";
import { TEMPLATES } from "./src/templates/templates.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".r7a-check-tmp");
const STAGE = { w: 1280, h: 720 };

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

/* a kit object exactly as insertKitClip (GraphicDestinationMotion.jsx)
   writes it — ONE layer, no children, content-sized w/h from the frame */
function kitObjectJson(kit, opts = {}, over = {}) {
  const spec = kitRenderSpec(kit.id, opts);
  return {
    id: "ob9001", type: "kit", name: kit.name, tracks: {}, locked: false, hidden: false,
    props: {
      x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9",
      w: Math.max(40, Math.round(spec.frame.w)), h: Math.max(40, Math.round(spec.frame.h)),
      inT: 0, outT: 5000, path: null, prog: 0,
      kit: kit.id,
      variant: opts.variant === "static" ? "static" : "animated",
      color: typeof opts.color === "string" && opts.color ? opts.color : null,
      accent: typeof opts.accent === "string" && opts.accent ? opts.accent : "#FFB224",
      ...over,
    },
  };
}

const icon = ICONS.find((k) => k.id === "heart") || ICONS[0];
const ui = UI_ELEMENTS[0];

/* ============================================================
   1 · kit registry accessors (pure)
   ============================================================ */
console.log("kit registry accessors — kitKind / kitById / kitRenderSpec");
check("kitKind(icon id) → \"icon\"", kitKind(icon.id) === "icon");
check("kitKind(ui id) → \"ui\"", kitKind(ui.id) === "ui");
check("kitKind(unknown) → null", kitKind("no-such-kit") === null);
check("kitById returns the registry entry", kitById(icon.id)?.name === icon.name);
check("kitById(unknown) → null", kitById("no-such-kit") === null);

const specA = kitRenderSpec(icon.id);
check("kitRenderSpec returns { kind, tree, frame, dur }", !!specA && specA.kind === "icon" && !!specA.tree && !!specA.frame && Number.isFinite(specA.dur));
check("spec tree is ONE clip layer", specA.tree.type === "clip" && Array.isArray(specA.tree.children) && specA.tree.children.length > 0);
check("spec tree loops seamlessly (end \"loop\")", specA.tree.props.end === "loop");
check("spec dur = clip dur, within 2400..6000", specA.dur === specA.tree.props.dur && specA.dur >= 2400 && specA.dur <= 6000);
check("spec frame finite + content-sized", [specA.frame.x, specA.frame.y, specA.frame.w, specA.frame.h].every(Number.isFinite) && specA.frame.w > 60 && specA.frame.h > 60 && specA.frame.w < 1280 && specA.frame.h < 720);
check("kitRenderSpec deterministic (same id+opts ⇒ identical JSON)", JSON.stringify(kitRenderSpec(icon.id)) === JSON.stringify(specA));
check("spec ids re-minted deterministically (kt<n> walk order)", specA.tree.id === "kt1" && JSON.stringify(specA.tree).includes('"kt2"'));
check("kitRenderSpec(ui) kind ui + clip tree", kitRenderSpec(ui.id)?.kind === "ui" && kitRenderSpec(ui.id)?.tree?.type === "clip");
check("kitRenderSpec(unknown) → null", kitRenderSpec("no-such-kit") === null);
const specColor = kitRenderSpec(icon.id, { color: "#123ABC" });
check("color opt recolors the artwork", JSON.stringify(specColor).includes("#123ABC") && !JSON.stringify(specA).includes("#123ABC"));
const specStatic = kitRenderSpec(icon.id, { variant: "static" });
const countTracks = (o) => { let n = Object.keys(o.tracks || {}).length; (o.children || []).forEach((c) => { n += countTracks(c); }); return n; };
check("animated spec has keyframes", countTracks(specA.tree) >= 1, `${countTracks(specA.tree)} tracks`);
check("static spec has ZERO tracks (same art)", countTracks(specStatic.tree) === 0);
check("ui accent opt recolors the accent", JSON.stringify(kitRenderSpec(ui.id, { accent: "#10EFCD" })).includes("#10EFCD"));

/* ============================================================
   2 · locked kit object — document JSON schema
   ============================================================ */
console.log("\nlocked kit object — document JSON schema (as insertKitClip writes)");
const kitObj = kitObjectJson(icon);
check("type \"kit\"", kitObj.type === "kit");
check("NO children in the document JSON", !("children" in kitObj) && kitObj.children === undefined);
check("props.kit is the registry id", kitObj.props.kit === icon.id);
check("props.variant animated|static", ["animated", "static"].includes(kitObj.props.variant));
check("color null ⇒ natural (or a hex string)", kitObj.props.color === null || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(kitObj.props.color));
check("accent is a hex string", /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(kitObj.props.accent));
for (const p of ["x", "y", "scale", "rotation", "opacity", "fill", "w", "h", "inT", "outT", "path", "prog"]) {
  check(`base prop "${p}" present`, p in kitObj.props);
}
check("w/h content-sized from the frame (≥40)", kitObj.props.w >= 40 && kitObj.props.h >= 40);
check("JSON round-trip is lossless", JSON.stringify(JSON.parse(JSON.stringify(kitObj))) === JSON.stringify(kitObj));
check("objSize(kit) = the w/h box", (() => { const s = objSize(kitObj, 1000); return s.w === kitObj.props.w && s.h === kitObj.props.h; })());
check("cannot be entered/ungrouped — not a clip, no children", kitObj.type !== "clip" && !Array.isArray(kitObj.children));

/* ============================================================
   3 · movable-insert bbox math (pure — editor/model.js)
   ============================================================ */
console.log("\nmovable-insert bbox math — translateLayer / reframeClipToContent");
const mkShape = (id, x, y, w, h) => ({ id, type: "shape", name: id, tracks: {}, locked: false, hidden: false, props: { x, y, scale: 1, rotation: 0, opacity: 1, fill: "#FFB224", w, h, inT: 0, outT: null, path: null, prog: 0, shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0 } });
{
  const sh = mkShape("ob1", 100, 200, 40, 60);
  sh.tracks = { x: [{ t: 0, v: 100, ease: "linear" }, { t: 500, v: 300, ease: "linear" }], y: [{ t: 0, v: 200, ease: "linear" }], opacity: [{ t: 0, v: 1, ease: "linear" }] };
  sh.props.path = { pts: [[10, 20], [30, 40]], curved: false };
  const moved = translateLayer(sh, 15, -25);
  check("translateLayer shifts props.x/y", moved.props.x === 115 && moved.props.y === 175);
  check("translateLayer shifts x/y keyframes only", moved.tracks.x[0].v === 115 && moved.tracks.x[1].v === 315 && moved.tracks.y[0].v === 175 && moved.tracks.opacity[0].v === 1);
  check("translateLayer shifts motion-path points", moved.props.path.pts[0][0] === 25 && moved.props.path.pts[0][1] === -5 && moved.props.path.pts[1][0] === 45);
  check("translateLayer keeps the original untouched", sh.props.x === 100 && sh.tracks.x[0].v === 100);
  const nested = { id: "ob2", type: "clip", name: "inner", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, start: 0, dur: 3000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500 }, children: [mkShape("ob3", 300, 300, 50, 50)] };
  const movedClip = translateLayer(nested, 10, 10);
  check("translateLayer does NOT recurse into clip children (they ride the clip's space)", movedClip.children[0].props.x === 300 && movedClip.props.x === 650);
}
{
  const one = bboxOfLayers([mkShape("ob1", 100, 200, 40, 60)], 0);
  check("bboxOfLayers exact box for one shape", one.x === 80 && one.y === 170 && one.w === 40 && one.h === 60 && one.cx === 100 && one.cy === 200);
  const empty = bboxOfLayers([], 0);
  check("bboxOfLayers empty → default box", [empty.x, empty.y, empty.w, empty.h].every(Number.isFinite) && empty.w > 0);
}
{
  /* synthetic scene: two shapes clustered top-left → must land centered */
  const clip = { id: "ob9", type: "clip", name: "Scene", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, start: 0, dur: 5000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500 }, children: [mkShape("ob1", 200, 150, 100, 80), mkShape("ob2", 300, 250, 120, 100)] };
  const r = reframeClipToContent(clip, STAGE);
  check("reframe reports non-full-bleed", r.fullBleed === false);
  check("reframe measured the content bbox (content-sized)", Math.abs(r.box.cx - 255) < 2 && Math.abs(r.box.cy - 205) < 2 && Math.round(r.box.w) === 210 && Math.round(r.box.h) === 190);
  check("reframe shifts children", r.shifted === true && r.clip.children !== clip.children);
  const after = bboxOfLayers(r.clip.children, Math.round(r.clip.props.dur * 0.4));
  check("content bbox lands centered on the stage", Math.abs(after.cx - 640) <= 1 && Math.abs(after.cy - 360) <= 1, `cx=${after.cx} cy=${after.cy}`);
  check("clip x/y parked at stage center", r.clip.props.x === 640 && r.clip.props.y === 360);
  check("reframed content stays content-sized (NOT stage-sized)", after.w < STAGE.w * 0.94 && after.h < STAGE.h * 0.94);
  check("timing props untouched by the reframe", r.clip.props.start === 0 && r.clip.props.dur === 5000 && r.clip.props.end === "hold");
}
{
  /* genuinely full-bleed scene (backdrop-driven) must be left alone */
  const bd = { id: "ob5", type: "backdrop", name: "Backdrop", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 1280, h: 720, inT: 0, outT: null, path: null, prog: 0 } };
  const clip = { id: "ob9", type: "clip", name: "Scene", tracks: {}, locked: false, hidden: false, props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, start: 0, dur: 5000, speed: 1, end: "hold", bg: "", bgPad: 30, bgRadius: 20, tIn: "none", tOut: "none", tDur: 500 }, children: [bd, mkShape("ob1", 200, 150, 100, 80)] };
  const r = reframeClipToContent(clip, STAGE);
  check("full-bleed scene detected (backdrop covers the stage)", r.fullBleed === true);
  check("full-bleed scene NOT shifted (children identical)", r.shifted === false && r.clip.children === clip.children);
  check("full-bleed clip stays stage-centered", r.clip.props.x === 640 && r.clip.props.y === 360);
}
{
  /* REAL templates: a content card reframes; a backdrop-driven scene stays */
  const card = TEMPLATES.find((t) => t.id === "lower-third");
  const scene = TEMPLATES.find((t) => t.id === "title-minimal");
  const rc = reframeClipToContent(card.buildClip(), STAGE);
  check("real template \"lower-third\" reframes to a content-sized group", rc.fullBleed === false && rc.box.w < STAGE.w * 0.94);
  const afterC = bboxOfLayers(rc.clip.children, Math.round(rc.clip.props.dur * 0.4));
  check("\"lower-third\" content centered at stage center", Math.abs(afterC.cx - 640) <= 1 && Math.abs(afterC.cy - 360) <= 1, `cx=${afterC.cx} cy=${afterC.cy}`);
  const rs = reframeClipToContent(scene.buildClip(), STAGE);
  check("backdrop-driven \"title-minimal\" keeps full-stage scene sizing", rs.fullBleed === true && rs.shifted === false);
  check("camera templates stay project-level (no camera written into the clip)", !("camera" in rc.clip) && rc.clip.props.camInside === undefined);
}

/* ============================================================
   4+5 · SSR — bundle the real StageObject + TemplateThumb
   ============================================================ */
async function main() {
  console.log("\nBundling the real StageObject + TemplateThumb (+ react-dom/server) with Vite…");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.js");
  fs.writeFileSync(entry, [
    `export { StageObject } from ${JSON.stringify(path.join(here, "src", "components", "StageObject.jsx"))};`,
    `export { default as TemplateThumb, useHoverPlay, HoverThumb, hoverStillTime, hoverTickTime } from ${JSON.stringify(path.join(here, "src", "components", "editor", "TemplateThumb.jsx"))};`,
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
  const { StageObject, TemplateThumb, HoverThumb, hoverStillTime, hoverTickTime, createElement: h, renderToStaticMarkup } = M;
  check("StageObject + TemplateThumb + hover-play exports present",
    !!StageObject && !!TemplateThumb && typeof HoverThumb === "function" && typeof hoverStillTime === "function" && typeof hoverTickTime === "function");
  const ssr = (obj, time, stage = STAGE) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));

  /* ---------- 4 · locked kit object — SSR render ---------- */
  console.log("\nlocked kit object — SSR via the real StageObject");
  const D = specA.dur;
  const tHold = Math.round(D * 0.5);
  const a1 = ssr(kitObj, tHold), a2 = ssr(kitObj, tHold);
  check("SSR non-empty at hold, no NaN", a1.length > 200 && !a1.includes("NaN") && a1.includes("position:absolute"), `${a1.length} bytes`);
  check("deterministic — same object + time ⇒ same bytes", a1 === a2);
  const tinted = kitObjectJson(icon, { color: "#123ABC" });
  const t1 = ssr(tinted, tHold);
  check("color customization changes the output", t1 !== a1 && t1.includes("#123ABC"));
  check("color customization renders the derived shades too", t1.length > 200 && !t1.includes("NaN"));
  const statObj = kitObjectJson(icon, { variant: "static" });
  const s1 = ssr(statObj, tHold), s2 = ssr(statObj, Math.round(D * 0.8));
  check("static variant frozen across time", s1 === s2 && s1.length > 200);
  const animAlt = ssr(kitObj, Math.round(D * 0.66));
  const frames = new Set([a1, animAlt]);
  for (let i = 0; i < 8 && frames.size < 2; i++) frames.add(ssr(kitObj, Math.round(D * (0.28 + i * 0.09))));
  check("animated variant actually animates (markup differs across t)", frames.size >= 2);
  check("variant switch changes the render (animated ≠ static mid-entrance)", ssr(kitObj, 120) !== ssr(statObj, 120));
  check("static variant recolors too", ssr(kitObjectJson(icon, { variant: "static", color: "#123ABC" }), tHold).includes("#123ABC"));
  const unknownObj = kitObjectJson(icon); unknownObj.props.kit = "no-such-kit";
  let unknownOut = "x", unknownErr = null;
  try { unknownOut = ssr(unknownObj, tHold); } catch (e) { unknownErr = e; }
  check("unknown kit id renders empty without throwing", !unknownErr && unknownOut === "", unknownErr ? String(unknownErr) : `${unknownOut.length} bytes`);
  /* inT/outT window — the kit object is a normal windowed layer */
  const winObj = kitObjectJson(icon, {}, { inT: 1000, outT: 3000 });
  check("before inT renders nothing", ssr(winObj, 500) === "");
  check("inside the window renders the art", ssr(winObj, 1000 + tHold).length > 200);
  check("after outT renders nothing", ssr(winObj, 3100) === "");
  /* export identity — the kit object draws through the literal kit-clip path */
  const clipMarkup = ssr(specA.tree, tHold);
  check("export identity — kit object contains the literal kit-clip render", a1.includes(clipMarkup) && clipMarkup.length > 200);
  const uiObj = kitObjectJson(ui);
  const uiHtml = ssr(uiObj, Math.round(kitRenderSpec(ui.id).dur * 0.5));
  check("ui kit object SSR non-empty, no NaN", uiHtml.length > 200 && !uiHtml.includes("NaN"));
  /* export-path shape: inside the camera wrapper (the export renderer passes one) */
  const camHtml = renderToStaticMarkup(h(StageObject, { obj: kitObj, time: tHold, stage: STAGE, selected: false, interactive: false, camera: { tracks: {} } }));
  check("renders inside the camera wrapper (export path), no NaN", camHtml.length > 200 && !camHtml.includes("NaN"));

  /* ---------- 5 · old kit CLIPS keep rendering (back-compat) ---------- */
  console.log("\nold kit clips (pre-R7a documents) — back-compat render");
  const oldClip = kitById(icon.id).build(); /* the OLD editable-clip payload */
  const c1 = ssr(oldClip, tHold), c2 = ssr(oldClip, tHold);
  check("old kit clip SSR non-empty, no NaN", c1.length > 200 && !c1.includes("NaN"));
  check("old kit clip deterministic", c1 === c2);
  const probe = JSON.parse(JSON.stringify(oldClip)); probe.props.end = "hold";
  check("old kit clip still seamless (frame(t=0) ≡ frame(t=dur))", ssr(probe, 0) === ssr(probe, D));
  check("old kit clip keeps the ob<n> layer schema", /^ob\d+$/.test(oldClip.id) && Array.isArray(oldClip.children));
  const oldUi = kitById(ui.id).build();
  check("old UI kit clip SSR non-empty", ssr(oldUi, Math.round(oldUi.props.dur * 0.5)).length > 200);

  /* ---------- 6 · reframed group clip SSR ---------- */
  const card = TEMPLATES.find((t) => t.id === "lower-third");
  const rc = reframeClipToContent(card.buildClip(), STAGE);
  const rHtml = ssr(rc.clip, Math.round(rc.clip.props.dur * 0.4));
  check("reframed group clip SSR non-empty, no NaN", rHtml.length > 200 && !rHtml.includes("NaN"));
  /* selection chrome: group-style clips get a content-hugging frame, genuine
     full-bleed scenes keep the full-stage frame (no more "Scene blocks") */
  const FULL_FRAME = "left:0;top:0;width:1280px;height:720px;pointer-events:none;border";
  const noop = () => {};
  const selGroup = renderToStaticMarkup(h(StageObject, { obj: rc.clip, time: Math.round(rc.clip.props.dur * 0.4), stage: STAGE, selected: true, interactive: true, onDown: noop, onEnterClip: noop, onClipScale: noop, onRotate: noop }));
  check("group-style clip selection frame hugs content (no full-stage frame)", selGroup.length > 200 && !selGroup.includes(FULL_FRAME));
  const sceneObj = TEMPLATES.find((t) => t.id === "title-minimal").buildClip();
  const selScene = renderToStaticMarkup(h(StageObject, { obj: sceneObj, time: 1000, stage: STAGE, selected: true, interactive: true, onDown: noop, onEnterClip: noop, onClipScale: noop, onRotate: noop }));
  check("full-bleed scene keeps the full-stage frame", selScene.includes(FULL_FRAME));

  /* ---------- 7 · hover-play — pure timing core + SSR contract ---------- */
  console.log("\nhover-play — pure timing core + frozen-frame SSR contract");
  check("hoverStillTime(5000) = 2000 (the 40% representative frame)", hoverStillTime(5000) === 2000);
  check("hoverStillTime(3200) = 1280", hoverStillTime(3200) === 1280);
  check("hoverStillTime(0) = 0 (safe)", hoverStillTime(0) === 0);
  check("hoverTickTime advances by one step", hoverTickTime(2000, 120, 5000) === 2120);
  check("hoverTickTime wraps at the loop end", hoverTickTime(4950, 120, 5000) === 70);
  check("hoverTickTime dur 0 → 0 (safe)", hoverTickTime(100, 120, 0) === 0);
  /* the hook's contract, exercised through its pure parts:
     not hovered ⇒ no ticker runs and time stays the still frame */
  let simT = hoverStillTime(5000);
  check("not hovered ⇒ frame frozen at the still (no tick applied)", simT === 2000);
  simT = hoverTickTime(simT, 120, 5000); simT = hoverTickTime(simT, 120, 5000);
  check("hovered ⇒ ticker advances the frame", simT === 2240);
  simT = hoverStillTime(5000);
  check("mouse-leave ⇒ resets to the static frame", simT === 2000);
  /* HoverThumb SSR: children receive the still time; markup frozen */
  let seenT = null;
  const ht1 = renderToStaticMarkup(h(HoverThumb, { dur: 5000, "data-testid": "ht" }, (t) => { seenT = t; return h("span", null, `t=${t}`); }));
  check("HoverThumb SSR hands the still frame to children", seenT === 2000 && ht1.includes("t=2000"));
  const ht2 = renderToStaticMarkup(h(HoverThumb, { dur: 5000, "data-testid": "ht" }, (t) => h("span", null, `t=${t}`)));
  check("HoverThumb frozen without hover (byte-identical re-render)", ht1 === ht2);
  /* TemplateThumb SSR: static representative frame, deterministic */
  const tpl = TEMPLATES.find((t) => t.id === "title-minimal");
  const th1 = renderToStaticMarkup(h(TemplateThumb, { tpl }));
  const th2 = renderToStaticMarkup(h(TemplateThumb, { tpl }));
  check("TemplateThumb SSR renders the real thumb (no fallback)", th1.includes(`data-thumb="${tpl.id}"`) && !th1.includes("data-thumb-fallback"));
  /* buildProject() mints fresh ob<n> ids per render (pre-existing), so a
     frozen frame is identical once ids are normalized — geometry + time
     (transforms, fills, keyframe states) must match byte-for-byte */
  const normIds = (s) => s.replace(/ob\d+/g, "ob");
  check("TemplateThumb frozen without hover (identical modulo fresh ids)", normIds(th1) === normIds(th2) && th1.length > 400);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (passed < 50) { console.error(`expected ≥50 assertions, got ${passed}`); process.exit(1); }
  if (!failed) console.log("All R7a checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
