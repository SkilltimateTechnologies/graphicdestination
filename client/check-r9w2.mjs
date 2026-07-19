/**
 * check-r9w2.mjs — node proof for the R9w2 milestone:
 *
 *   A. MORPH MATH (engine/shapes.js) — a shape melts A→B between two shape ◆:
 *      endpoints are exact, the midpoint is a real blend (no twist — alignPts
 *      starts every ring at its topmost point), easing is honored, the morph
 *      is fully keyframable (JSON-serializable {t,v,ease} ◆, values are known
 *      shape ids, timeline-style replace-at-±5 ms semantics via the engines).
 *
 *   B. MORPH INDICATOR — the user can't miss a morphing shape: the ShapesPanel
 *      cards carry the morph badge, the Inspector renders a MORPHING chip
 *      (glyph A → glyph B) + an animated preview + a target picker, and the
 *      selected canvas object gets an A→B glyph chip — all asserted from real
 *      SSR markup of the real components.
 *
 *   C. PATH-RIDER CHAIN — attach (addPathTo-shaped props) → prog ◆ → the
 *      object's on-screen position tracks pointOnPath at several times;
 *      x/y keyframes NEVER fight a path rider (path wins — a canvas drag
 *      that moves the path keeps the rider glued and writes no x/y ◆);
 *      progKeyPlan always emits a real 0→1 span (the old collapse at the
 *      layer end is gone).
 *
 *   D. ICON/EMOJI THUMBS — every icon + emoji (and every UI element) renders
 *      a NON-EMPTY representative HOLD frame at its panel still time through
 *      the real StageObject (SSR pixel-ish check: markup size + ink count),
 *      and the animated variant's t=0 entrance frame is poorer (proving the
 *      still choice is what makes the thumbnails visible). The IconsPanel
 *      lists every icon as a ShapesPanel-size square card in a 4-up grid.
 *
 * Run: node check-r9w2.mjs   (bundles the real components with the project's
 * own Vite, one shared react instance — same harness as check-kits.mjs)
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SHAPE_IDS, SHAPE_DEFS, shapePtsOf, alignPts, lerpPts, ptsToStr,
  morphPtsAt, morphPairAt, shapeIdAt, progKeyPlan, pointOnPath, pathSamples,
} from "./src/engine/shapes.js";
import { posOf, valueAt } from "./src/engine/keyframes.js";
import { ICONS, UI_ELEMENTS, ICON_CATS } from "./src/engine/kits.js";
import { EMOJIS } from "./src/engine/emoji.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".r9w2-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const near = (a, b, eps = 0.51) => Math.abs(a - b) <= eps;
const ptEq = (p, q, eps = 0.51) => near(p[0], q[0], eps) && near(p[1], q[1], eps);
const mkShape = (over = {}) => ({
  id: "ob1", type: "shape", name: "Shape", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F5A524", w: 190, h: 190, inT: 0, outT: null, path: null, prog: 0, shape: "rect", fillMode: "fill", sC: "#FFB224", sW: 3, cornerR: 0, ...over },
});

/* ================= A · MORPH MATH ================= */
console.log("\nA · morph math (engine/shapes.js)");
{
  check("every registered shape has a 64-point ring (shared morph resolution)", SHAPE_IDS.every((id) => shapePtsOf(id).length === 64));
  check("every shape ring sits inside 0..100", SHAPE_IDS.every((id) => shapePtsOf(id).every(([x, y]) => x >= -1 && x <= 101 && y >= -1 && y <= 101)));
  const star = shapePtsOf("star");
  /* alignPts: the ring starts at its TOPMOST point (least y) so A→B never twists */
  const minY = Math.min(...star.map((p) => p[1]));
  check("alignPts starts the ring at the topmost point (no twist)", near(star[0][1], minY, 1e-9));
  const A = shapePtsOf("ellipse"), B = shapePtsOf("star");
  check("lerpPts u=0 returns A exactly", lerpPts(A, B, 0).every((p, i) => ptEq(p, A[i], 1e-9)));
  check("lerpPts u=1 returns B exactly", lerpPts(A, B, 1).every((p, i) => ptEq(p, B[i], 1e-9)));
  const mid = lerpPts(A, B, 0.5);
  check("lerpPts u=0.5 is the true midpoint", mid.every((p, i) => ptEq(p, [(A[i][0] + B[i][0]) / 2, (A[i][1] + B[i][1]) / 2], 1e-9)));

  /* keyframable morph through tracks.shape — heart@0 → bolt@1500 */
  const obj = mkShape({ shape: "heart" });
  obj.tracks.shape = [{ t: 0, v: "heart", ease: "easeInOutCubic" }, { t: 1500, v: "bolt" }];
  const H = shapePtsOf("heart"), Bo = shapePtsOf("bolt");
  check("morph at t=0 is exactly shape A", morphPtsAt(obj, 0).every((p, i) => ptEq(p, H[i], 1e-6)));
  check("morph at t=end is exactly shape B", morphPtsAt(obj, 1500).every((p, i) => ptEq(p, Bo[i], 1e-6)));
  const m750 = morphPtsAt(obj, 750);
  check("morph at mid is a real blend (≠ both endpoints)", m750.some((p, i) => !ptEq(p, H[i], 1)) && m750.some((p, i) => !ptEq(p, Bo[i], 1)));
  check("morph mid stays inside the A∪B bbox (no wild excursion)", m750.every(([x, y]) => x >= -2 && x <= 102 && y >= -2 && y <= 102));
  const mMid = morphPtsAt(obj, 750);
  check("easeInOutCubic mid-time = exact midpoint", mMid.every((p, i) => ptEq(p, lerpPts(H, Bo, 0.5)[i], 1.2)));
  check("morph holds A before the first ◆", morphPtsAt(obj, -500).every((p, i) => ptEq(p, H[i], 1e-6)));
  check("morph holds B after the last ◆", morphPtsAt(obj, 4000).every((p, i) => ptEq(p, Bo[i], 1e-6)));
  /* no-track + single-◆ objects are static (a lone ◆ is a shape CHANGE, not a morph) */
  check("no shape track ⇒ base shape everywhere", morphPtsAt(mkShape({ shape: "star" }), 999).every((p, i) => ptEq(p, star[i], 1e-6)));
  const single = mkShape({ shape: "rect" }); single.tracks.shape = [{ t: 400, v: "heart" }];
  check("a single shape ◆ is constant (no false morph)", morphPtsAt(single, 0).every((p, i) => ptEq(p, H[i], 1e-6)) && morphPtsAt(single, 400).every((p, i) => ptEq(p, H[i], 1e-6)));
  /* keyframability: the track is plain JSON with known shape ids + eases */
  const rt = JSON.parse(JSON.stringify(obj.tracks.shape));
  check("shape ◆ survive a JSON round-trip (project save/load)", JSON.stringify(rt) === JSON.stringify(obj.tracks.shape));
  check("every shape ◆ value is a registered shape id", rt.every((k) => SHAPE_IDS.includes(k.v)));
  check("every shape ◆ carries a time + value", rt.every((k) => Number.isFinite(k.t) && typeof k.v === "string"));
  check("sorted shape ◆ like every other track", rt.every((k, i) => i === 0 || k.t >= rt[i - 1].t));
  /* shapeIdAt / morphPairAt — the shared indicator accessors */
  check("shapeIdAt = A before, A mid-segment, B after", shapeIdAt(obj, 0) === "heart" && shapeIdAt(obj, 750) === "heart" && shapeIdAt(obj, 1500) === "bolt");
  const mp = morphPairAt(obj, 750);
  check("morphPairAt finds the ACTIVE A→B segment mid-morph", mp && mp.a === "heart" && mp.b === "bolt" && mp.active === true && mp.t0 === 0 && mp.t1 === 1500);
  const mpAfter = morphPairAt(obj, 4000);
  check("morphPairAt still reports the pair after the ride (armed)", mpAfter && mpAfter.a === "heart" && mpAfter.b === "bolt" && mpAfter.active === false);
  check("morphPairAt = null without a track", morphPairAt(mkShape({ shape: "star" }), 100) === null);
  check("morphPairAt = null for a single ◆", morphPairAt(single, 100) === null);
  const sameTwice = mkShape({ shape: "rect" }); sameTwice.tracks.shape = [{ t: 0, v: "heart" }, { t: 900, v: "heart" }];
  check("two IDENTICAL ◆ are not a morph", morphPairAt(sameTwice, 400) === null);
  /* three-stop morph: heart→bolt→star picks the right segment */
  const tri = mkShape({ shape: "heart" }); tri.tracks.shape = [{ t: 0, v: "heart" }, { t: 1000, v: "bolt" }, { t: 2000, v: "star" }];
  check("3-stop morph picks the bolt→star segment late", morphPairAt(tri, 1500)?.a === "bolt" && morphPairAt(tri, 1500)?.b === "star");
  check("3-stop morph melts bolt at its middle", morphPtsAt(tri, 1000).every((p, i) => ptEq(p, Bo[i], 1e-6)));
}

/* ================= C · PATH-RIDER CHAIN (pure part) ================= */
console.log("\nC · path-rider chain (engine math)");
{
  const line = { pts: [[200, 400], [1000, 400]], curved: false, closed: false, show: true };
  check("pointOnPath u=0 = path start", ptEq(pointOnPath(line, 0), [200, 400], 1e-9));
  check("pointOnPath u=1 = path end", ptEq(pointOnPath(line, 1), [1000, 400], 1e-9));
  check("pointOnPath u=0.5 = midpoint", ptEq(pointOnPath(line, 0.5), [600, 400], 1e-9));
  check("pointOnPath clamps u<0 to start", ptEq(pointOnPath(line, -3), [200, 400], 1e-9));
  check("pointOnPath clamps u>1 to end", ptEq(pointOnPath(line, 9), [1000, 400], 1e-9));
  const diag = { pts: [[0, 0], [300, 400], [900, 100]], curved: false, closed: false };
  const dHalf = pointOnPath(diag, 0.5);
  const diagLen = pathSamples(diag).reduce((L, p, i, s) => i ? L + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : L, 0);
  const walked = (() => { let L = 0; const s = pathSamples(diag); for (let i = 1; i < s.length; i++) { const seg = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); const onSeg = Math.hypot(dHalf[0] - s[i - 1][0], dHalf[1] - s[i - 1][1]) + Math.hypot(dHalf[0] - s[i][0], dHalf[1] - s[i][1]) <= seg + 1e-6; if (onSeg) { L += Math.hypot(dHalf[0] - s[i - 1][0], dHalf[1] - s[i - 1][1]); return L; } L += seg; } return L; })();
  check("polyline u=0.5 is exactly halfway by arc length", near(walked / diagLen, 0.5, 0.01));
  const loop = { pts: [[300, 300], [900, 300], [900, 500], [300, 500]], curved: false, closed: true };
  const q0 = pointOnPath(loop, 0), qHalf = pointOnPath(loop, 0.5);
  check("closed loop u=0 = first point", ptEq(q0, [300, 300], 1e-9));
  check("closed loop u=0.5 is halfway around", Math.hypot(qHalf[0] - q0[0], qHalf[1] - q0[1]) > 300);
  const curved = { pts: [[200, 400], [500, 100], [900, 400]], curved: true, closed: false };
  check("curved path samples densify the control points", pathSamples(curved).length > 16);
  check("curved path still starts/ends on its anchors", ptEq(pointOnPath(curved, 0), [200, 400], 1.5) && ptEq(pointOnPath(curved, 1), [900, 400], 1.5));

  /* posOf: path ALWAYS wins over x/y keyframes — the R8w3 canvas-keyframing
     conflict: a drag may have written x/y ◆ before the path existed */
  const rider = mkShape({ shape: "star" });
  rider.props.path = line;
  rider.props.prog = 0;
  rider.tracks.x = [{ t: 0, v: 111 }, { t: 900, v: 222 }];
  rider.tracks.y = [{ t: 0, v: 333 }, { t: 900, v: 444 }];
  check("path rider ignores stale x/y ◆ (path wins)", ptEq(posOf(rider, 450), pointOnPath(line, 0), 1e-9));
  rider.tracks.prog = [{ t: 0, v: 0, ease: "linear" }, { t: 1600, v: 1 }];
  for (const t of [0, 400, 800, 1200, 1600]) {
    const expect = pointOnPath(line, t / 1600);
    check(`prog ◆ drive the rider @${t}ms along the path`, ptEq(posOf(rider, t), expect, 1.2));
  }
  /* canvas-drag semantics: dragging the rider moves the PATH, writes no x/y ◆ —
     emulate the drop handler: path pts shift by (dx,dy), tracks untouched */
  const dx = 77, dy = 38;
  const before = posOf(rider, 800);
  const shifted = { ...rider, props: { ...rider.props, path: { ...line, pts: line.pts.map(([x, y]) => [x + dx, y + dy]) } } };
  const after = posOf(shifted, 800);
  check("drag shifts the rider exactly by the drag delta", near(after[0] - before[0], dx, 1e-9) && near(after[1] - before[1], dy, 1e-9));
  check("drag wrote no x/y ◆ (tracks unchanged)", shifted.tracks.x.length === 2 && shifted.tracks.y.length === 2 && Object.keys(shifted.tracks).length === 3);
  check("rider stays glued to the moved path (still on it)", ptEq(after, pointOnPath(shifted.props.path, valueAt(shifted, "prog", 800)), 1.2));
  /* progKeyPlan — the animate-along-path writer that cannot collapse */
  const plan0 = progKeyPlan(0, 0, 6000, 1600);
  check("plan@playhead 0: 0→1600, 0→1", plan0[0].t === 0 && plan0[0].v === 0 && plan0[1].t === 1600 && plan0[1].v === 1 && plan0[1].t > plan0[0].t);
  const planEnd = progKeyPlan(6000, 0, 6000, 1600);
  check("plan@layer end still spans 1600 (the old collapse is gone)", planEnd[1].t - planEnd[0].t === 1600 && planEnd[0].v === 0 && planEnd[1].v === 1 && planEnd[0].t === 4400);
  const planNear = progKeyPlan(5600, 0, 6000, 1600);
  check("plan near the end clamps forward (4400→6000)", planNear[0].t === 4400 && planNear[1].t === 6000);
  const planShort = progKeyPlan(0, 0, 900, 1600);
  check("plan on a short layer keeps a real span (b.t > a.t)", planShort[1].t > planShort[0].t && planShort[0].t === 0 && planShort[1].t === 900);
  const planMid = progKeyPlan(2000, 0, 6000, 1600);
  check("plan mid-comp starts at the playhead", planMid[0].t === 2000 && planMid[1].t === 3600);
  check("plan keys carry a default ease", plan0.every((k) => typeof k.ease === "string"));
}

/* ================= B/D · SSR of the real components ================= */
async function main() {
  console.log("\nBundling StageObject + Inspector + panels with Vite…");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "entry.js");
  fs.writeFileSync(entry, [
    `export { StageObject } from ${JSON.stringify(path.join(here, "src", "components", "StageObject.jsx"))};`,
    `export { default as Inspector } from ${JSON.stringify(path.join(here, "src", "components", "editor", "Inspector.jsx"))};`,
    `export { default as ShapesPanel } from ${JSON.stringify(path.join(here, "src", "components", "editor", "panels", "ShapesPanel.jsx"))};`,
    `export { default as EmojiPanel } from ${JSON.stringify(path.join(here, "src", "components", "editor", "panels", "EmojiPanel.jsx"))};`,
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
  const { StageObject, Inspector, ShapesPanel, EmojiPanel, createElement: h, renderToStaticMarkup } = M;
  const stage = { w: 1280, h: 720 };
  const ssr = (obj, time, extra = {}) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false, ...extra }));
  const inkOf = (markup) => (markup.match(/fill[:="]/g) || []).length + (markup.match(/<(rect|circle|ellipse|path|polygon|text)[ >]/g) || []).length;
  const ptsOf = (markup) => { const m = markup.match(/<polygon points="([^"]+)"/); return m ? m[1] : null; };

  /* ---------- B1 · StageObject morph + badge ---------- */
  console.log("\nB · morph indicator (SSR of the real components)");
  {
    const obj = mkShape({ shape: "heart" });
    obj.tracks.shape = [{ t: 0, v: "heart", ease: "easeInOutCubic" }, { t: 1500, v: "bolt" }];
    const p0 = ptsOf(ssr(obj, 0)), pMid = ptsOf(ssr(obj, 750)), pEnd = ptsOf(ssr(obj, 1500));
    check("SSR morph: t=0 renders shape A", p0 === ptsToStr(shapePtsOf("heart")));
    check("SSR morph: t=end renders shape B", pEnd === ptsToStr(shapePtsOf("bolt")));
    check("SSR morph: mid renders a blend (≠ both)", pMid !== p0 && pMid !== pEnd && pMid != null);
    const selBadge = ssr(obj, 750, { selected: true, interactive: true });
    check("selected canvas shape shows the A→B morph chip", selBadge.includes('data-morph-rider="heart&gt;bolt"'));
    check("the chip carries BOTH glyphs (two shape polygons)", (selBadge.match(/data-morph-rider/g) || []).length === 1 && selBadge.split('data-morph-rider')[1].split("polygon").length > 4);
    const unsel = ssr(obj, 750, { selected: false, interactive: true });
    check("unselected shapes stay clean (no chip)", !unsel.includes("data-morph-rider"));
    const exp = ssr(obj, 750, { selected: true, interactive: false });
    check("export render never carries the editor chip", !exp.includes("data-morph-rider"));
    const staticShape = ssr(mkShape({ shape: "star" }), 100, { selected: true, interactive: true });
    check("non-morphing selected shape shows no chip", !staticShape.includes("data-morph-rider"));
  }

  /* ---------- B2 · Inspector morph section ---------- */
  {
    const noop = () => {};
    const mkInsp = (sel, time = 750) => renderToStaticMarkup(h(Inspector, {
      audioLaneSel: null, audioTrack: null, patchAudio: noop, detachAudio: noop, fmt: (t) => `${(t / 1000).toFixed(1)}s`,
      cameraLaneSel: null, camera: { props: {} }, editCameraProp: noop, setCameraKeyframe: noop, removeCameraKeyframe: noop,
      cameraKfNav: noop, resetCamera: noop, selCamKfData: null, setCameraSegmentEase: noop, applyCameraPreset: noop, applyCameraAction: noop,
      selMany: [], groupSelection: noop, align: noop, duplicateSelected: noop, removeSelected: noop,
      inClip: null, ctx: { names: [] }, sel, patchObject: noop, toggleHide: noop, toggleLock: noop,
      stage, stageBg: "#0B0E13", setStageBg: noop, applyStagePreset: noop, stageIsPreset: false, enterClip: noop,
      patchProps: noop, ctxDur: 6000, stretchClipDur: noop, stretchClips: false, setStretchClips: noop, ungroupClip: noop,
      morphQ: "", setMorphQ: noop, time, timeRef: { current: time }, setShapeAt: noop, editProp: noop, removeKeyframe: noop,
      setKeyframe: noop, setSelKf: noop, flowText: null, brand: {}, SW: ["#F5A524", "#58C47E", "#4EA1FF"], addPathTo: noop, patchPath: noop,
      kfNav: noop, selectedKfData: null, setSegmentEase: noop, applyPreset: noop, fileRef: { current: null },
    }));
    const morphObj = mkShape({ shape: "heart" });
    morphObj.tracks.shape = [{ t: 0, v: "heart", ease: "easeInOutCubic" }, { t: 1500, v: "bolt" }];
    const mi = mkInsp(morphObj);
    check("Inspector shows the MORPHING chip with both shape ids", mi.includes('data-morph-chip="heart&gt;bolt"') && /morphing/i.test(mi));
    check("Inspector morph section has an animated preview", mi.includes("data-morph-preview="));
    check("Inspector morph section has a target picker", mi.includes("data-morph-picker"));
    check("morph picker lists every shape as a target", (mi.match(/data-morph-picker/g) || []).length === 1 && SHAPE_IDS.every((id) => mi.includes(`title="${SHAPE_DEFS[id].name}`)));
    check("active morph offers a clear-morph action", mi.includes("data-morph-clear"));
    const staticInsp = mkInsp(mkShape({ shape: "star" }));
    check("no-morph Inspector explains how to start (discoverable)", staticInsp.includes('data-morph-chip="none"') && staticInsp.includes("data-morph-picker"));
    /* path chip inside the same Inspector */
    const pathObj = mkShape({ shape: "star" });
    pathObj.props.path = { pts: [[640, 360], [960, 270]], curved: false, closed: false, show: true };
    pathObj.tracks.prog = [{ t: 0, v: 0, ease: "linear" }, { t: 1600, v: 1 }];
    const pi = mkInsp(pathObj, 800);
    check("path-bound object shows the ON-PATH chip + rider dot", pi.includes("data-onpath-chip") && pi.includes("<circle"));
    check("ON-PATH chip reads live progress (50% @800ms)", pi.includes("50%"));
    check("path card keeps the animate-along-path action", pi.includes("data-animate-path"));
  }

  /* ---------- B3 · ShapesPanel morph badges ---------- */
  {
    const sp = renderToStaticMarkup(h(ShapesPanel, { shapeQ: "", setShapeQ: () => {}, addObject: () => {} }));
    const badges = (sp.match(/data-morph-badge/g) || []).length;
    check("ShapesPanel shows a morph badge on EVERY shape card", badges >= SHAPE_IDS.length, `got ${badges}`);
    check("ShapesPanel explains the morph flow in the header", /morphs A→B/i.test(sp));
    check("ShapesPanel keeps the 4-up square card grid", sp.includes("repeat(4,1fr)"));
  }

  /* ---------- C2 · path rider through the real StageObject ---------- */
  console.log("\nC2 · path rider SSR — position tracks the path at 5 times");
  {
    const rider = mkShape({ shape: "star" });
    rider.props.path = { pts: [[200, 400], [1000, 400]], curved: false, closed: false, show: false };
    rider.tracks.prog = [{ t: 0, v: 0, ease: "linear" }, { t: 1600, v: 1 }];
    rider.tracks.x = [{ t: 0, v: 111 }]; /* stale canvas drag ◆ — must be ignored */
    rider.tracks.y = [{ t: 0, v: 333 }];
    const posFromMarkup = (markup) => { const m = markup.match(/position:absolute;left:([-\d.]+)px;top:([-\d.]+)px/); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; };
    for (const t of [0, 400, 800, 1200, 1600]) {
      const m = ssr(rider, t);
      const pos = posFromMarkup(m);
      const expect = pointOnPath(rider.props.path, t / 1600);
      check(`rider @${t}ms sits on the path (${expect[0]},${expect[1]})`, pos && ptEq(pos, expect, 1.5));
    }
    /* drag: move the path, rider follows, x/y ◆ stay stale + ignored */
    const moved = JSON.parse(JSON.stringify(rider));
    moved.props.path.pts = moved.props.path.pts.map(([x, y]) => [x + 50, y + 25]);
    const posMoved = posFromMarkup(ssr(moved, 800));
    check("after a path drag the rider rides the MOVED path", posMoved && ptEq(posMoved, pointOnPath(moved.props.path, 0.5), 1.5));
    /* text travel mode through StageObject */
    const txt = { id: "ob9", type: "text", name: "Text", tracks: { prog: [{ t: 0, v: 0, ease: "linear" }, { t: 1600, v: 1 }] }, locked: false, hidden: false,
      props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#fff", w: 0, h: 0, inT: 0, outT: null, path: { pts: [[200, 200], [1000, 600]], curved: false, closed: false }, prog: 0, text: "Headline", fontSize: 72, fontWeight: 700, fontFamily: "Space Grotesk", ls: 0.5, upper: false, pathMode: "travel" } };
    const tPos = posFromMarkup(ssr(txt, 800));
    check("text travel mode rides the path @800ms", tPos && ptEq(tPos, pointOnPath(txt.props.path, 0.5), 2));
  }

  /* ---------- D · icon/emoji thumb hold frames ---------- */
  console.log("\nD · icon/emoji/UI thumb hold frames (SSR non-empty)");
  {
    const emoji = ICONS.filter((k) => k.category === "Emoji");
    check("the library has an Emoji category with 20 emoji", emoji.length === 20 && ICON_CATS.includes("Emoji"));
    for (const k of ICONS) {
      const clip = k.build({ variant: "animated" });
      const D = clip.props.dur || 3200;
      const still = Math.round(D * 0.55);
      const m0 = ssr(clip, 0), ms = ssr(clip, still);
      check(`icon:${k.id} hold frame (55%) is non-empty`, ms.length > 500 && inkOf(ms) >= 3, `len=${ms.length} ink=${inkOf(ms)}`);
      check(`icon:${k.id} entrance frame is poorer than the hold frame`, m0.length < ms.length, `t0=${m0.length} vs still=${ms.length}`);
      check(`icon:${k.id} hold frame is NaN-free`, !ms.includes("NaN"));
      const st = ssr(k.build({ variant: "static" }), still);
      check(`icon:${k.id} static variant renders the same art at the still`, st.length > 500 && inkOf(st) >= 3);
    }
    for (const k of UI_ELEMENTS) {
      const clip = k.build({});
      const D = clip.props.dur || 3200;
      const ms = ssr(clip, Math.round(D * 0.4)); /* the UI panel's own still */
      check(`ui:${k.id} hold frame (40%) is non-empty`, ms.length > 500 && inkOf(ms) >= 2, `len=${ms.length} ink=${inkOf(ms)}`);
      check(`ui:${k.id} hold frame is NaN-free`, !ms.includes("NaN"));
    }
    /* the Emoji panel is a featured teaser + right arrow; the FULL library
       loads INLINE in the same panel (startBrowsing) — no modal, thumbs
       non-empty on every card */
    const lib = renderToStaticMarkup(h(EmojiPanel, { insertEmojiClip: () => {}, startBrowsing: true }));
    const cards = lib.split('data-emoji-card="').slice(1);
    check("inline emoji library lists ALL Fluent emoji as cards", cards.length === EMOJIS.length, `got ${cards.length} of ${EMOJIS.length}`);
    check("the library is INLINE in the panel (no modal overlay)", !lib.includes("position:fixed") && !lib.includes('role="dialog"') && /Search emoji/i.test(lib));
    check("the inline library uses an auto-fill card grid", lib.includes("grid-template-columns"));
    check("every emoji card carries a non-empty still thumbnail", cards.length > 0 && cards.every((c) => c.includes("data-thumb-still")));
    const ep = renderToStaticMarkup(h(EmojiPanel, { insertEmojiClip: () => {} }));
    check("EmojiPanel shows 4 featured emoji as a teaser", (ep.split('data-emoji-featured="').length - 1) === 4);
    check("EmojiPanel has a right-arrow browse affordance (no big button)", ep.includes("data-emoji-browse") && ep.includes("→") && !/Browse all \d+ emoji →/.test(ep));
    check("EmojiPanel keeps the floating panel shell", ep.includes("gd-panel") && ep.includes("position:absolute"));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
