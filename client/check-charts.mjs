/**
 * check-charts.mjs — node proof for the Jitter-grade chart rebuild
 * (engine/fx.js chartModel + the StageObject chart case):
 *
 *   1. REGISTRY/PARSER — 11 chart types (the 7 legacy ids kept working),
 *      chartTypeOf fallback, parseChart byte-identical to the legacy parser
 *      (LAST value wins, junk skipped, 10-row cap), parseChartRows multi-series.
 *
 *   2. GRAMMAR (every type) — chartModel is a pure f(props, time):
 *      · purity: same t → byte-identical model
 *      · in → hold → out: entrance frame ≠ hold frame ≠ exit frame, and the
 *        hold is STATIC (two hold frames byte-identical)
 *      · seamless loop: f(start) ≡ f(start+dur) exactly, zero state stable
 *      · stagger: equal-value elements rise at different times mid-entrance
 *        and settle equal during the hold
 *      · no NaN/undefined at 9 sample times
 *
 *   3. DESIGN — dashed hairline gridlines, rounded bar tops, small-caps axis
 *      labels, tabular numerals, value count-ups, overshoot springs
 *      (scale > 1 mid-entrance), accelerate exits (shrink(v=.5) = .875).
 *
 *   4. SSR — every type renders through the REAL StageObject (bundled with
 *      the project's own Vite — the same component export/frameRenderer.js
 *      uses): non-empty markup, data-chart marker, no NaN/undefined, exact
 *      loop f(start) ≡ f(end), static hold, panel-thumbnail size renders.
 *
 * Run:  node check-charts.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHART_TYPES, chartTypeOf, chartModel, chartWindows, chartProgress, parseChart, parseChartRows } from "./src/engine/fx.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".charts-check-tmp");

let passed = 0, failed = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

/* legacy parser, reimplemented verbatim — parseChart must match it exactly */
const legacyParse = (str) => (str || "").split(/\n+/).map((l) => {
  const m = l.split(/[,:]/);
  if (m.length < 2) return null;
  const v = parseFloat(m[m.length - 1]);
  if (isNaN(v)) return null;
  return { l: m.slice(0, -1).join(":").trim(), v: Math.max(0, v) };
}).filter(Boolean).slice(0, 10);

const chartObj = (chartType, dataStr, over = {}) => ({
  id: "ob950", type: "chart", name: "Chart", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 560, h: 340, inT: 0, outT: null, path: null, prog: 0, chartType, dataStr, start: 200, dur: 1400, showVals: true, bg: "#171B24", bgOp: 1, radius: 32, borderC: "#2B3140", borderW: 1, pad: 20, ...over },
});
const DATA = {
  multi: "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84",
  series: "Q1, 42, 30\nQ2, 65, 48\nQ3, 38, 55\nQ4, 84, 60",
  line: "Jan, 24\nFeb, 48\nMar, 36\nApr, 72\nMay, 58",
  single: "Goal, 72",
  eq: "A, 50\nB, 50\nC, 50\nD, 50",
  eqSeries: "A, 50, 50\nB, 50, 50\nC, 50, 50",
};
const dataFor = (t) => (t === "grouped" || t === "stacked" ? DATA.series : t === "line" || t === "area" ? DATA.line : t === "ring" || t === "gauge" ? DATA.single : DATA.multi);
const J = (P, t) => JSON.stringify(chartModel(P, t));
const nums = (d) => (d.match(/-?\d+\.?\d*/g) || []).map(Number);
const topBarH = (d) => { const a = nums(d); return a[1] - a[10]; }; /* topBarD: M x (y+h) … (x+r) y */
const rightBarW = (d) => { const a = nums(d); return a[9] - a[0]; }; /* rightBarD: M x y … (x+w) … */
const cntRole = (M, role) => M.items.filter((it) => it.role === role).length;
const TIMES = [-300, 200, 420, 700, 900, 1152, 1350, 1600, 2000];

async function main() {
  /* ---------- 1. registry + parser ---------- */
  console.log("registry + parser");
  check("11 chart types registered", CHART_TYPES.length === 11, CHART_TYPES.map((c) => c.id).join(","));
  check("the 7 legacy ids kept working", ["bar", "line", "donut", "pie", "area", "hbar", "gauge"].every((id) => CHART_TYPES.some((c) => c.id === id)));
  check("new ids present (grouped/stacked/ring/lollipop)", ["grouped", "stacked", "ring", "lollipop"].every((id) => CHART_TYPES.some((c) => c.id === id)));
  check("chartTypeOf: unknown/absent → bar (graceful fallback)", chartTypeOf({ chartType: "nope" }) === "bar" && chartTypeOf({}) === "bar" && chartTypeOf(null) === "bar");
  check("chartTypeOf: every registered id round-trips", CHART_TYPES.every((c) => chartTypeOf({ chartType: c.id }) === c.id));
  const sample = "Q1, 42\nQ2, 65\nbad row\nX: 7.5\n, 9\nlast, 42abc\nNorth, East: 33";
  check("parseChart ≡ legacy parser on single-series rows (old projects)", JSON.stringify(parseChart(sample)) === JSON.stringify(legacyParse(sample)), JSON.stringify(parseChart(sample)));
  check("parseChart reads the LAST value of multi-value rows", parseChart("Q3, 38, 12")[0].v === 12 && parseChart("Q3, 38, 12")[0].l === "Q3");
  const tenPlus = Array.from({ length: 14 }, (_, i) => `R${i}, ${i + 1}`).join("\n");
  check("parseChart caps at 10 rows", parseChart(tenPlus).length === 10 && parseChartRows(tenPlus).length === 10);
  check("parseChartRows: multi-series extraction", JSON.stringify(parseChartRows("Q1, 42, 30, 9")[0]) === JSON.stringify({ l: "Q1", vals: [42, 30, 9] }));
  check("parseChartRows: label joins non-numeric fields", parseChartRows("North, East: 42")[0].l === "North: East");
  check("parseChartRows: caps at 4 series", parseChartRows("Q, 1, 2, 3, 4, 5")[0].vals.length === 4);

  /* ---------- 2. timing grammar primitives ---------- */
  console.log("\nchartWindows / chartProgress — in → hold → out primitives");
  const W0 = chartWindows({ start: 200, dur: 1400 });
  check("window: start+dur = end, hold between in and out", W0.end === 1600 && W0.holdStart < W0.outStart && W0.outStart < W0.end);
  const prHold = chartProgress({ start: 200, dur: 1400 }, 1000, 3, 5);
  check("hold: scale/cnt/op saturate to exactly 1", prHold.scale === 1 && prHold.cnt === 1 && prHold.op === 1 && prHold.u === 1 && prHold.v === 0);
  const prStart = chartProgress({ start: 200, dur: 1400 }, 200, 0, 5);
  const prEnd = chartProgress({ start: 200, dur: 1400 }, 1600, 0, 5);
  check("zero states: scale/cnt/op exactly 0 at both ends", prStart.scale === 0 && prStart.cnt === 0 && prStart.op === 0 && prEnd.scale === 0 && prEnd.cnt === 0 && prEnd.op === 0);
  let maxGrow = 0;
  for (let k = 0; k <= 40; k++) maxGrow = Math.max(maxGrow, chartProgress({ start: 200, dur: 1400 }, 200 + (k / 40) * 630, 0, 1).grow);
  check("overshoot spring: grow exceeds 1.04 mid-entrance (back easing)", maxGrow > 1.04, `max=${maxGrow.toFixed(3)}`);
  const prExit = chartProgress({ start: 200, dur: 1400 }, 1152 + 196.5, 0, 1); /* v = 0.5 exactly */
  check("exit accelerates (ease-in cubic): shrink(v=.5) = .875", approx(prExit.v, 0.5, 1e-6) && approx(prExit.shrink, 0.875, 1e-6), `shrink=${prExit.shrink}`);
  const prA = chartProgress({ start: 200, dur: 1400 }, 350, 0, 4), prB = chartProgress({ start: 200, dur: 1400 }, 350, 3, 4);
  check("stagger: element 0 ahead of element 3 mid-entrance", prA.u > 0 && prB.u === 0, `u0=${prA.u.toFixed(2)} u3=${prB.u.toFixed(2)}`);

  /* ---------- 3. per-type model checks ---------- */
  console.log("\nchartModel — 11 types × grammar/structure");
  for (const { id: type } of CHART_TYPES) {
    const obj = chartObj(type, dataFor(type));
    const P = obj.props;
    const W = chartWindows(P);
    console.log(`  · ${type}`);
    check(`${type}: pure — same t → byte-identical model`, J(P, 420) === J(P, 420) && J(P, 900) === J(P, 900));
    let badT = "";
    for (const t of TIMES) { const s = J(P, t); if (s.includes("NaN") || s.includes("undefined")) badT = String(t); }
    check(`${type}: no NaN/undefined across ${TIMES.length} sample times`, !badT, badT);
    check(`${type}: seamless loop — f(start) ≡ f(end) exactly`, J(P, W.start) === J(P, W.end));
    check(`${type}: zero state stable far outside the window`, J(P, W.start - 400) === J(P, W.end + 400));
    check(`${type}: hold is static (two hold frames byte-identical)`, J(P, 900) === J(P, 1100));
    check(`${type}: entrance ≠ hold (in → hold)`, J(P, 420) !== J(P, 900));
    check(`${type}: exit ≠ hold (hold → out)`, J(P, 1350) !== J(P, 900));
  }

  /* ---------- 4. stagger + settle probes (equal values) ---------- */
  console.log("\nstagger presence — equal-value elements rise apart, settle equal");
  const eqObj = (type, data) => chartObj(type, data || (type === "grouped" || type === "stacked" ? DATA.eqSeries : DATA.eq));
  { /* bar / grouped / stacked — rounded-top path heights */
    for (const type of ["bar", "grouped", "stacked"]) {
      const P = eqObj(type).props;
      const eIn = chartModel(P, 420).items.filter((it) => it.role === (type === "stacked" ? "seg" : "bar"));
      const eHold = chartModel(P, 1000).items.filter((it) => it.role === (type === "stacked" ? "seg" : "bar"));
      check(`${type}: staggered rise (first ≠ last height mid-entrance)`, eIn.length > 1 && topBarH(eIn[0].d) !== topBarH(eIn[eIn.length - 1].d), `${topBarH(eIn[0].d)} vs ${topBarH(eIn[eIn.length - 1].d)}`);
      check(`${type}: equal values settle to equal heights in the hold`, eHold.length > 1 && approx(topBarH(eHold[0].d), topBarH(eHold[eHold.length - 1].d), 0.01));
    }
  }
  { /* hbar — rounded-right widths */
    const P = eqObj("hbar").props;
    const eIn = chartModel(P, 420).items.filter((it) => it.role === "bar");
    const eHold = chartModel(P, 1000).items.filter((it) => it.role === "bar");
    check("hbar: staggered rise (first ≠ last width mid-entrance)", eIn.length > 1 && rightBarW(eIn[0].d) !== rightBarW(eIn[eIn.length - 1].d));
    check("hbar: equal values settle to equal widths in the hold", eHold.length > 1 && approx(rightBarW(eHold[0].d), rightBarW(eHold[eHold.length - 1].d), 0.01));
  }
  { /* lollipop — stem tips */
    const P = eqObj("lollipop").props;
    const eIn = chartModel(P, 420).items.filter((it) => it.role === "stem");
    const eHold = chartModel(P, 1000).items.filter((it) => it.role === "stem");
    check("lollipop: staggered stems (first ≠ last tip mid-entrance)", eIn.length > 1 && eIn[0].y2 !== eIn[eIn.length - 1].y2);
    check("lollipop: equal values settle to equal tips in the hold", eHold.length > 1 && eHold[0].y2 === eHold[eHold.length - 1].y2);
    check("lollipop: heads pop after stems (head r = 0 early)", chartModel(P, 260).items.filter((it) => it.role === "head").every((it) => it.r === 0));
  }
  { /* line/area — point radii */
    for (const type of ["line", "area"]) {
      const P = eqObj(type, DATA.line).props;
      const pts = chartModel(P, 420).items.filter((it) => it.role === "pt");
      const ptsH = chartModel(P, 1000).items.filter((it) => it.role === "pt");
      check(`${type}: points pop staggered (first r > last r mid-draw)`, pts.length > 1 && pts[0].r > 0 && pts[pts.length - 1].r === 0, `r0=${pts[0].r} rN=${pts[pts.length - 1].r}`);
      check(`${type}: all points settled in the hold`, ptsH.length === 5 && ptsH.every((p) => approx(p.r, ptsH[0].r, 0.01) && p.r > 3));
      check(`${type}: draw-on reveal (dashoffset 100 → 0 → 100)`, chartModel(P, 200).items.find((it) => it.role === "line").off === 100 && chartModel(P, 1000).items.find((it) => it.role === "line").off === 0 && chartModel(P, 1600).items.find((it) => it.role === "line").off === 100);
    }
  }
  { /* donut/pie — sweep reveals segments progressively */
    for (const type of ["donut", "pie"]) {
      const P = eqObj(type, DATA.multi).props;
      const role = type === "donut" ? "seg" : "slice";
      const early = cntRole(chartModel(P, 350), role);
      const hold = cntRole(chartModel(P, 1000), role);
      check(`${type}: arc-sweep reveal staggers segments (${early} < ${hold} mid-sweep)`, early > 0 && early < hold && hold === 4);
      const rotIn = chartModel(P, 350).items.find((it) => it.role === role).tr;
      const rotHold = chartModel(P, 1000).items.find((it) => it.role === role).tr;
      check(`${type}: whole-dial rotation −180° → 0 on entrance`, rotIn !== rotHold && rotHold.startsWith("rotate(0 "), `${rotIn} → ${rotHold}`);
    }
    const M = chartModel(eqObj("donut", DATA.multi).props, 1000);
    check("donut: center total counts up to the series sum", M.items.some((it) => it.role === "cap" && it.s === "229"), M.items.filter((it) => it.role === "cap").map((it) => it.s).join(","));
    check("donut: center count is 0 at both zero states", chartModel(eqObj("donut", DATA.multi).props, 200).items.find((it) => it.role === "cap").s === "0" && chartModel(eqObj("donut", DATA.multi).props, 1600).items.find((it) => it.role === "cap").s === "0");
  }
  { /* ring/gauge — overshooting arc + trailing caption */
    for (const type of ["ring", "gauge"]) {
      const P = eqObj(type, DATA.single).props;
      const arcIn = chartModel(P, 609).items.find((it) => it.role === "arc");
      const arcHold = chartModel(P, 1000).items.find((it) => it.role === "arc");
      check(`${type}: arc overshoots its target mid-entrance (spring)`, arcIn && arcHold && arcIn.d !== arcHold.d, "");
      const caps = chartModel(P, 350).items.filter((it) => it.role === "cap");
      check(`${type}: caption trails the dial (staggered opacities)`, caps.length === 2 && caps[1].op < caps[0].op, caps.map((c) => c.op).join(" vs "));
      check(`${type}: center reads the % at the hold`, chartModel(P, 1000).items.some((it) => it.role === "cap" && it.s === "72%"));
    }
  }

  /* ---------- 5. design markers ---------- */
  console.log("\ndesign — gridlines, rounded tops, small caps, tabular numerals, count-ups");
  const barM = chartModel(chartObj("bar", DATA.multi).props, 1000);
  check("gridlines are dashed hairlines (dash 2 6, sw 1, faint)", barM.items.filter((it) => it.role === "grid").length === 4 && barM.items.filter((it) => it.role === "grid").every((g) => g.dash === "2 6" && g.sw === 1 && g.op <= 0.1));
  check("bar tops are rounded (arc segments in the silhouette)", barM.items.filter((it) => it.role === "bar").every((b) => b.d.includes("A8 8")));
  check("axis labels are small caps (uppercase + letter-spacing)", barM.items.filter((it) => it.role === "axis").every((t) => t.s === t.s.toUpperCase() && t.ls > 0));
  check("value labels use tabular numerals", barM.items.filter((it) => it.role === "val").every((t) => t.tnum === true && t.fam.includes("Mono")));
  const barEnt = chartModel(chartObj("bar", DATA.multi).props, 470);
  const v0 = barEnt.items.filter((it) => it.role === "val")[0];
  check("values count up during the entrance (0 → final)", barM.items.filter((it) => it.role === "val")[0].s === "42" && Number(v0.s) < 42, `mid=${v0.s}`);
  const scales = [];
  for (const t of [300, 380, 460, 540, 620]) { const m = /scale\(([\d.]+)\)/.exec((chartModel(chartObj("bar", DATA.multi).props, t).items.find((it) => it.role === "val") || {}).tr || ""); if (m) scales.push(Number(m[1])); }
  check("value labels pop with a spring (scale > 1 mid-entrance)", scales.some((s) => s > 1.01), scales.join(","));
  check("hold: value label transform settled at scale(1)", (barM.items.find((it) => it.role === "val") || {}).tr.includes("scale(1)"));
  check("line/area: soft gradient area fill present", chartModel(chartObj("area", DATA.line).props, 1000).grads.length === 1 && cntRole(chartModel(chartObj("area", DATA.line).props, 1000), "area") === 1);
  const noVals = chartModel(chartObj("bar", DATA.multi, { showVals: false }).props, 1000);
  check("showVals:false hides value labels, keeps axis labels", cntRole(noVals, "val") === 0 && cntRole(noVals, "axis") === 4);
  check("empty data renders chrome only, no NaN", !J(chartObj("bar", "").props, 900).includes("NaN") && cntRole(chartModel(chartObj("bar", "").props, 900), "bar") === 0 && cntRole(chartModel(chartObj("bar", "").props, 900), "grid") === 4);
  check("junk dims/rows are clamped (no NaN, positive plot)", !J(chartObj("bar", DATA.multi, { w: 0, h: -5 }).props, 900).includes("NaN") && chartModel(chartObj("bar", DATA.multi, { w: 0, h: -5 }).props, 900).w === 560);

  /* ---------- 6. SSR through the real StageObject ---------- */
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
  const stage = { w: 1280, h: 720 };
  const ssr = (obj, time) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));

  console.log("\nSSR — every type through the shared render point (export-safe)");
  for (const { id: type } of CHART_TYPES) {
    const obj = chartObj(type, dataFor(type));
    const W = chartWindows(obj.props);
    let err = null, hold = "", start = "", end = "";
    try { hold = ssr(obj, 1000); start = ssr(obj, W.start); end = ssr(obj, W.end); } catch (e) { err = e; }
    check(`${type}: SSR renders without throwing`, !err, err ? String((err && err.message) || err) : "");
    check(`${type}: non-empty <svg> + data-chart marker`, hold.includes("<svg") && hold.length > 100 && hold.includes(`data-chart="${type}"`), `len=${hold.length}`);
    check(`${type}: no NaN/undefined in markup (in/hold/out)`, ![420, 1000, 1350].some((t) => { const s = ssr(obj, t); return s.includes("NaN") || s.includes("undefined"); }));
    check(`${type}: SSR seamless loop — markup(start) ≡ markup(end)`, start === end && start.length > 100);
    check(`${type}: SSR hold is static`, ssr(obj, 900) === ssr(obj, 1100));
  }
  check("SSR: tabular-nums + small caps in markup", ssr(chartObj("bar", DATA.multi), 1000).includes("tabular-nums") && ssr(chartObj("bar", DATA.multi), 1000).includes("letter-spacing"));
  check("SSR: card backdrop (soft shadow + radius) when bg set", ssr(chartObj("bar", DATA.multi), 1000).includes("box-shadow") && ssr(chartObj("bar", DATA.multi), 1000).includes("border-radius:32px"));
  console.log("\nSSR — panel-thumbnail size (small chrome adapts)");
  for (const { id: type } of CHART_TYPES) {
    const obj = chartObj(type, dataFor(type), { w: 102, h: 70, showVals: false, pad: 5, radius: 10, dur: 3400, start: 120 });
    let err = null, html = "";
    try { html = ssr(obj, 1200); } catch (e) { err = e; }
    check(`${type}: thumbnail renders, no NaN`, !err && html.includes("<svg") && !html.includes("NaN") && !html.includes("undefined"), err ? String((err && err.message) || err) : "");
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All chart checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
