/**
 * check-r8w2.mjs — node proof for the R8 wave (confetti lifecycle + chart
 * lifecycle):
 *
 *   A. CONFETTI DURATION PROP (props.dur, ms — engine/fx.js confettiDurMs):
 *      absent ⇒ the per-style default life (confettiLife — old projects
 *      unchanged); explicit values are honored exactly and clamped to
 *      [CONFETTI_DUR_MIN, CONFETTI_DUR_MAX].
 *
 *   B. fitDurForConfetti(project, confettiObj) → newDur — the PURE timeline
 *      auto-extend contract for the shell wave: when the confetti's full span
 *      (burst + duration) runs past project.stage.dur, the timeline extends
 *      AT THE END to fit (result ≥ current dur, inputs never mutated, no
 *      other timeline item moves — the shell only assigns stage.dur).
 *
 *   C. CONFETTI CANVAS CLAMP (StageObject confettiMotion): zero particles
 *      render beyond the stage box across a full time sweep for EVERY style,
 *      from center AND edge placements — positions pin at the edge (velocity
 *      dies) and fade over the last 90px of would-be overshoot.
 *
 *   D. CONFETTI LIFETIME FLOOR (huge stage ⇒ no clamp interference): no
 *      particle drops below 0.45 opacity before 60% of its styled life;
 *      non-twinkle styles are still at FULL opacity at 50%; every style has
 *      faded to ≤ 0.25 by 97% (graceful settle, no popping out, no early
 *      vanish).
 *
 *   E. DURATION HONORED THROUGH THE REAL StageObject: the active window is
 *      exactly [burst, burst+dur] — the outT cutoff does not apply to
 *      confetti (it plays its full duration independent of how much timeline
 *      remains), and the fade grammar scales with the duration.
 *
 *   F. CHART WINDOW DERIVATION (engine/fx.js chartWindows): with outT set
 *      (every post-window-model layer) the in → hold → out window follows
 *      the layer's timeline placement — entrance once from inT over the
 *      first 45% (capped CHART_IN_CAP), static hold, animated exit over the
 *      last 32% (capped CHART_OUT_CAP) ending exactly at outT; legacy
 *      start/dur props are IGNORED while outT is set; outT absent ⇒ the
 *      legacy authored start+dur window, byte-identical. f(start) ≡ f(end)
 *      loop purity + static hold hold for every chart type, and resizing the
 *      layer (different outT) re-maps the grammar.
 *
 *   G. INSPECTOR ROWS (grep-level): the chart card has NO Start/Duration
 *      sliders anymore (data/values/box stay editable); the confetti card
 *      HAS a Duration slider; the number card keeps its own Start/Duration
 *      rows (surgical edit).
 *
 *   H. CHART LIFECYCLE SSR through the real StageObject: entrance plays
 *      once, hold is static, exit is animated, the layer vanishes after
 *      outT, and markup(start) ≡ markup(end).
 *
 * Run:  node check-r8w2.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CONFETTI_STYLES, confettiParticles, confettiLife, confettiStyleOf, confettiDurMs,
  CONFETTI_DUR_MIN, CONFETTI_DUR_MAX, fitDurForConfetti,
  CHART_TYPES, chartModel, chartWindows, chartProgress,
  CHART_IN_FRAC, CHART_OUT_FRAC, CHART_IN_CAP, CHART_OUT_CAP, CHART_MIN_SPAN,
} from "./src/engine/fx.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".r8w2-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const confettiObj = (style, seed, count = 40, over = {}) => ({
  id: "ob970", type: "confetti", name: "Confetti", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, burst: 200, count, power: 1, seed, ...(style ? { style } : {}), ...over },
});
const chartObj = (chartType, dataStr, over = {}) => ({
  id: "ob971", type: "chart", name: "Chart", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 560, h: 340, inT: 1000, outT: 4000, path: null, prog: 0, chartType, dataStr, start: 200, dur: 1400, showVals: true, bg: "#171B24", bgOp: 1, radius: 32, borderC: "#2B3140", borderW: 1, pad: 20, ...over },
});
const DATA = {
  multi: "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84",
  series: "Q1, 42, 30\nQ2, 65, 48\nQ3, 38, 55\nQ4, 84, 60",
  line: "Jan, 24\nFeb, 48\nMar, 36\nApr, 72\nMay, 58",
  single: "Goal, 72",
};
const dataFor = (t) => (t === "grouped" || t === "stacked" ? DATA.series : t === "line" || t === "area" ? DATA.line : t === "ring" || t === "gauge" ? DATA.single : DATA.multi);
const J = (P, t) => JSON.stringify(chartModel(P, t));

/* particle-div parser for the confetti SSR markup: each particle is a div
   carrying border-radius; the glyph badge is never rendered non-interactive */
const NUM_RE = "-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?";
const particlesOf = (html) => html.split("<div").slice(1).filter((s) => s.includes("border-radius:")).map((s) => {
  const num = (re) => { const m = re.exec(s); return m ? Number(m[1]) : NaN; };
  return {
    left: num(new RegExp(`left:(${NUM_RE})px`)),
    top: num(new RegExp(`top:(${NUM_RE})px`)),
    w: num(new RegExp(`width:(${NUM_RE})px`)),
    h: num(new RegExp(`height:(${NUM_RE})px`)),
    op: num(new RegExp(`opacity:(${NUM_RE})`)),
  };
});

async function main() {
  /* ================= A. confetti duration prop (engine) ================= */
  console.log("A · confettiDurMs — duration prop, per-style defaults, clamping");
  check("confettiDurMs is exported", typeof confettiDurMs === "function");
  for (const s of CONFETTI_STYLES) {
    check(`${s.id}: absent dur ⇒ style default ${confettiLife(s.id)} ms`, confettiDurMs({ style: s.id }) === confettiLife(s.id));
  }
  check("missing style ⇒ legacy 2400 ms default", confettiDurMs({}) === 2400 && confettiDurMs(null) === 2400);
  check("explicit dur honored exactly", confettiDurMs({ style: "burst", dur: 1200 }) === 1200 && confettiDurMs({ style: "snow", dur: 9000 }) === 9000);
  check("dur clamped to CONFETTI_DUR_MIN below", confettiDurMs({ dur: 50 }) === CONFETTI_DUR_MIN);
  check("dur clamped to CONFETTI_DUR_MAX above", confettiDurMs({ dur: 99999 }) === CONFETTI_DUR_MAX);
  check("junk dur (0 / negative / NaN / string) ⇒ style default", confettiDurMs({ dur: 0 }) === 2400 && confettiDurMs({ dur: -500 }) === 2400 && confettiDurMs({ dur: NaN }) === 2400 && confettiDurMs({ dur: "x" }) === 2400);
  check("bounds sane: MIN ≥ 100 ms, MAX ≥ snow/drift default 6500 ms", CONFETTI_DUR_MIN >= 100 && CONFETTI_DUR_MAX >= 6500);
  check("family styles keep the family default (streamers=rain 3400, drift=snow 6500)", confettiDurMs({ style: "streamers" }) === 3400 && confettiDurMs({ style: "drift" }) === 6500 && confettiDurMs({ style: "popring" }) === 700);

  /* ================= B. fitDurForConfetti contract ================= */
  console.log("\nB · fitDurForConfetti — pure end-only timeline extension");
  check("fitDurForConfetti is exported", typeof fitDurForConfetti === "function");
  const fits = fitDurForConfetti({ stage: { dur: 5000 } }, confettiObj("burst", 7, 40, { burst: 500, dur: 1200 }));
  check("no-op when the confetti fits (500+1200 ≤ 5000)", fits === 5000, `got ${fits}`);
  const grows = fitDurForConfetti({ stage: { dur: 2000 } }, confettiObj("burst", 7, 40, { burst: 1500, dur: 1200 }));
  check("extends AT THE END to burst+dur (1500+1200 = 2700)", grows === 2700, `got ${grows}`);
  check("default style life used when dur absent (burst 4000 + snow 6500 = 10500)", fitDurForConfetti({ stage: { dur: 5000 } }, confettiObj("snow", 7, 40, { burst: 4000 })) === 10500);
  check("explicit dur wins over the style default (burst 4000 + dur 900 = 4900, fits 5000)", fitDurForConfetti({ stage: { dur: 5000 } }, confettiObj("snow", 7, 40, { burst: 4000, dur: 900 })) === 5000);
  check("clamped dur feeds the span (dur 99999 → +15000)", fitDurForConfetti({ stage: { dur: 1000 } }, confettiObj("burst", 7, 40, { burst: 0, dur: 99999 })) === 15000);
  check("monotonic — result never below current dur", [0, 1200, 5000, 99999].every((d) => fitDurForConfetti({ stage: { dur: d } }, confettiObj("burst", 7, 40, { burst: 300, dur: 800 })) >= d));
  check("result is an exact ceil of the span (burst 100.5 + 1200 → 1301)", fitDurForConfetti({ stage: { dur: 0 } }, confettiObj("burst", 7, 40, { burst: 100.5, dur: 1200 })) === 1301);
  const frozenProj = { stage: { dur: 3000, w: 1280, h: 720 }, objects: [] };
  const frozenObj = confettiObj("burst", 7, 40, { burst: 2500, dur: 2000 });
  const before = JSON.stringify([frozenProj, frozenObj]);
  const r2 = fitDurForConfetti(frozenProj, frozenObj);
  check("pure — inputs never mutated", JSON.stringify([frozenProj, frozenObj]) === before && r2 === 4500);
  check("junk-safe: no confetti ⇒ no extension (cur), empty props ⇒ default 2400 span, garbage dur ⇒ finite ≥ 0",
    fitDurForConfetti(null, null) === 0 && fitDurForConfetti({ stage: { dur: 700 } }, null) === 700 && fitDurForConfetti({}, {}) === 2400 && Number.isFinite(fitDurForConfetti({ stage: { dur: "x" } }, confettiObj("burst", 7))) && fitDurForConfetti({ stage: { dur: "x" } }, confettiObj("burst", 7)) >= 0);

  /* ================= C. chart window derivation (engine) ================= */
  console.log("\nC · chartWindows — placement-driven lifecycle + legacy fallback");
  const WL = chartWindows({ start: 200, dur: 1400 });
  check("legacy (no outT): authored start+dur window byte-identical", WL.start === 200 && WL.end === 1600 && approx(WL.inDur, 630) && approx(WL.outDur, 448) && WL.holdStart === 830 && WL.outStart === 1152);
  const WP = chartWindows({ inT: 1000, outT: 4000 });
  check("placement: window = [inT, outT] (1000 → 4000)", WP.start === 1000 && WP.end === 4000 && WP.dur === 3000);
  check("placement: entrance = first 45% (1350), exit = last 32% (960)", approx(WP.inDur, 3000 * CHART_IN_FRAC) && approx(WP.outDur, 3000 * CHART_OUT_FRAC) && WP.holdStart === 2350 && WP.outStart === 3040);
  const WC = chartWindows({ inT: 0, outT: 20000 });
  check("placement: caps — inDur ≤ CHART_IN_CAP, outDur ≤ CHART_OUT_CAP on huge spans", WC.inDur === CHART_IN_CAP && WC.outDur === CHART_OUT_CAP && WC.holdStart === CHART_IN_CAP && WC.outStart === 20000 - CHART_OUT_CAP);
  const WM = chartWindows({ inT: 500, outT: 600 });
  check("placement: degenerate span floors at CHART_MIN_SPAN", WM.end === 500 + CHART_MIN_SPAN && WM.start === 500);
  const WI = chartWindows({ inT: 100, outT: 2000, start: 900, dur: 50 });
  check("placement: legacy start/dur props IGNORED while outT is set", WI.start === 100 && WI.end === 2000 && WI.dur === 1900);
  {
    const P1 = chartObj("bar", DATA.multi, { start: 200, dur: 1400 }).props;
    const P2 = chartObj("bar", DATA.multi, { start: 4444, dur: 77 }).props;
    check("chartModel ignores start/dur with outT set (identical models)", J(P1, 2500) === J(P2, 2500) && J(P1, 1200) === J(P2, 1200));
  }
  check("grammar fractions pinned at 45% / 32%", CHART_IN_FRAC === 0.45 && CHART_OUT_FRAC === 0.32);
  const prZ0 = chartProgress({ inT: 1000, outT: 4000 }, 1000, 0, 5);
  const prZ1 = chartProgress({ inT: 1000, outT: 4000 }, 4000, 0, 5);
  check("placement: zero states exact at both window ends", prZ0.scale === 0 && prZ0.cnt === 0 && prZ0.op === 0 && prZ1.scale === 0 && prZ1.cnt === 0 && prZ1.op === 0);
  const prHold = chartProgress({ inT: 1000, outT: 4000 }, 2700, 3, 5);
  check("placement: hold saturates (scale/cnt/op = 1 mid-hold)", prHold.scale === 1 && prHold.cnt === 1 && prHold.op === 1);

  console.log("\nC · per-type grammar over the placement window (11 types)");
  for (const { id: type } of CHART_TYPES) {
    const P = chartObj(type, dataFor(type)).props; /* inT 1000, outT 4000 */
    const W = chartWindows(P);
    check(`${type}: f(inT) ≡ f(outT) loop purity`, J(P, W.start) === J(P, W.end));
    check(`${type}: zero state stable outside the window`, J(P, W.start - 500) === J(P, W.end + 500));
    check(`${type}: hold static (two mid-hold frames identical)`, J(P, 2500) === J(P, 2900));
    check(`${type}: entrance ≠ hold ≠ animated exit`, J(P, 1300) !== J(P, 2500) && J(P, 3800) !== J(P, 2500) && J(P, 1300) !== J(P, 3800));
  }
  {
    const P = chartObj("bar", DATA.multi).props;
    const small = chartModel({ ...P, outT: 3000 }, 2500), wide = chartModel({ ...P, outT: 5000 }, 2500);
    check("resize re-maps: same inT, different outT ⇒ different windows", chartWindows({ ...P, outT: 3000 }).end === 3000 && chartWindows({ ...P, outT: 5000 }).end === 5000);
    check("resize re-maps: same absolute time, different span ⇒ different frame (exit vs hold)", JSON.stringify(small) !== JSON.stringify(wide));
    const inOnce = J(P, 900) === J(P, 900 - 400); /* before inT: stable zero */
    check("entrance plays once (stable zero state before inT, no ping-pong)", inOnce && J(P, 2350) === J(P, 3039));
  }

  /* ---------- bundle the real StageObject for the SSR sections ---------- */
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
  check("StageObject export present", typeof StageObject === "function" || (typeof StageObject === "object" && StageObject !== null));
  const ssrOn = (stage) => (obj, time) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));

  /* ================= D. confetti canvas clamp (SSR bounds sweep) ================= */
  console.log("\nD · canvas clamp — zero particles beyond the stage box (all 17 styles)");
  const stage = { w: 1280, h: 720 };
  const ssr = ssrOn(stage);
  const boundsSweep = (obj, label) => {
    const life = confettiDurMs(obj.props);
    let worst = null, pinnedVisible = 0, samples = 0, maxNodes = 0;
    for (let t = obj.props.burst; t <= obj.props.burst + life + 1; t += 80) {
      samples++;
      const parts = particlesOf(ssr(obj, t));
      maxNodes = Math.max(maxNodes, parts.length);
      for (const p of parts) {
        const sx = obj.props.x - 22 + p.left, sy = obj.props.y - 22 + p.top;
        if (sx < -1e-9 || sy < -1e-9 || sx + p.w > stage.w + 1e-9 || sy + p.h > stage.h + 1e-9) {
          worst = `t=${t} box=(${sx.toFixed(1)},${sy.toFixed(1)},${p.w},${p.h})`;
        }
        /* pinned at the edge but still visible ⇒ kill-velocity + in-margin fade working */
        if (p.op > 0.03 && (sx <= 0 || sy <= 0 || sx + p.w >= stage.w || sy + p.h >= stage.h)) pinnedVisible++;
      }
    }
    check(`${label}: no particle beyond ${stage.w}×${stage.h} across ${samples} samples`, !worst, worst || "");
    return { pinnedVisible, maxNodes };
  };
  for (const s of CONFETTI_STYLES) {
    boundsSweep(confettiObj(s.id, 7, 40, { power: 1.8 }), s.id);
  }
  console.log("\nD · canvas clamp — edge placements + explicit durations");
  for (const [style, x, y] of [["burst", 30, 30], ["cannons", 1250, 700], ["firework", 640, 700], ["spiral", 1240, 60], ["snow", 60, 360], ["pop", 30, 700]]) {
    boundsSweep(confettiObj(style, 11, 40, { x, y, power: 1.8 }), `${style} @(${x},${y})`);
  }
  boundsSweep(confettiObj("burst", 7, 40, { power: 1.8, dur: 900 }), "burst dur=900ms");
  boundsSweep(confettiObj("rain", 7, 40, { power: 1.8, dur: 9000 }), "rain dur=9000ms");
  {
    const r = boundsSweep(confettiObj("burst", 7, 40, { power: 2 }), "burst power=2 (clamp engagement)");
    check("clamp engages: particles pin at the edge AND fade visible (kill velocity + margin fade)", r.pinnedVisible > 0, `pinned=${r.pinnedVisible}`);
    check("all 40 particles render mid-burst", r.maxNodes === 40, `max=${r.maxNodes}`);
  }

  /* ================= E. lifetime floor (huge stage ⇒ no clamp) ================= */
  console.log("\nE · lifetime floor — no early vanish, graceful settle (6000×5000 stage)");
  const BIG = { w: 6000, h: 5000 };
  const ssrBig = ssrOn(BIG);
  /* particlesOf with stage-space boxes; the LIFETIME floor is asserted on
     free-flight particles only (boundary-pinned ones are edge-fading by
     design — cannons land at the stage floor, that's the clamp working) */
  const partsAt = (style, frac, over = {}) => {
    const obj = confettiObj(style, 7, 40, { x: 3000, y: 2500, power: 1, ...over });
    const life = confettiDurMs(obj.props);
    return particlesOf(ssrBig(obj, obj.props.burst + life * frac)).map((p) => ({ ...p, sx: obj.props.x - 22 + p.left, sy: obj.props.y - 22 + p.top }));
  };
  const freeOps = (list) => list.filter((p) => p.sx > 0 && p.sy > 0 && p.sx + p.w < BIG.w && p.sy + p.h < BIG.h).map((p) => p.op);
  for (const s of CONFETTI_STYLES) {
    const mid = partsAt(s.id, 0.55), late = partsAt(s.id, 0.6);
    const midFree = freeOps(mid), lateFree = freeOps(late);
    check(`${s.id}: floor — free-flight particles ≥ 0.45 opacity at 55% AND 60% of life (edge-faded excluded)`,
      mid.length === 40 && late.length === 40 && midFree.length >= 4 && lateFree.length >= 4 && midFree.every((o) => o >= 0.45) && lateFree.every((o) => o >= 0.45),
      `free=${midFree.length}/${lateFree.length} min55=${Math.min(...midFree)} min60=${Math.min(...lateFree)}`);
    if (s.id !== "firework") {
      const halfFree = freeOps(partsAt(s.id, 0.5));
      check(`${s.id}: still FULL opacity at 50% of life (no early lifetime fade)`, halfFree.length >= 4 && halfFree.every((o) => o >= 0.995), `free=${halfFree.length} min=${Math.min(...halfFree)}`);
    }
    const end = partsAt(s.id, 0.97).map((p) => p.op);
    check(`${s.id}: settled to ≤ 0.25 by 97% of life (graceful, no pop-out)`, end.length === 40 && end.every((o) => o <= 0.25), `max=${Math.max(...end)}`);
  }
  check("firework: twinkle softened — free-flight opacity never below 0.45 mid-flight", freeOps(partsAt("firework", 0.4)).every((o) => o >= 0.45), `min=${Math.min(...freeOps(partsAt("firework", 0.4)))}`);

  /* ================= F. duration honored through StageObject ================= */
  console.log("\nF · duration prop honored — exact active window + scaled fades");
  const nodesAt = (obj, t) => particlesOf(ssr(obj, t)).length;
  {
    const obj = confettiObj("burst", 7, 40, { dur: 1200 });
    check("dur=1200: 40 particles at burst+600 (mid-life)", nodesAt(obj, 800) === 40);
    check("dur=1200: zero particles at burst+1300 (past the exact duration)", nodesAt(obj, 1500) === 0);
    check("dur=1200: zero particles well after (no zombie frames)", nodesAt(obj, 4000) === 0);
    const bigObj = confettiObj("burst", 7, 40, { dur: 1200, x: 3000, y: 2500 }); /* clamp-free stage */
    const fading = particlesOf(ssrBig(bigObj, 200 + 1080));
    check("dur=1200: fade grammar SCALED — every piece fading at 90% of the custom duration", fading.length === 40 && fading.every((p) => p.op < 1 && p.op > 0.1), `max=${Math.max(...fading.map((p) => p.op))}`);
  }
  {
    const obj = confettiObj("burst", 7, 40, {}); /* default 2400 */
    check("default: 40 particles at burst+life−200", nodesAt(obj, 200 + 2400 - 200) === 40);
    check("default: zero particles at burst+life+200", nodesAt(obj, 200 + 2400 + 200) === 0);
    const bigObj = confettiObj("burst", 7, 40, { x: 3000, y: 2500 }); /* clamp-free stage */
    const full = particlesOf(ssrBig(bigObj, 200 + 1080));
    check("default: same absolute time as the dur=1200 probe ⇒ all at full opacity (45% of life)", full.length === 40 && full.every((p) => p.op === 1), `min=${Math.min(...full.map((p) => p.op))}`);
  }
  {
    const obj = confettiObj("snow", 7, 40, { dur: CONFETTI_DUR_MIN });
    check("dur clamps through the renderer (300 ms): active mid, gone after", nodesAt(obj, 200 + 150) === 40 && nodesAt(obj, 200 + 450) === 0);
  }
  {
    const obj = confettiObj("burst", 7, 40, { outT: 500 }); /* timeline bar ends at 500… */
    check("outT does NOT cut confetti — still active at burst+1000 (plays exactly its duration)", nodesAt(obj, 1200) === 40);
    check("outT bypass: still active at burst+2300 (default life 2400)", nodesAt(obj, 2500) === 40);
    const chart = chartObj("bar", DATA.multi, { inT: 0, outT: 500 });
    check("other types keep the outT gate — chart gone after outT", ssr(chart, 600) === "");
  }

  /* ================= G. Inspector rows (grep-level) ================= */
  console.log("\nG · Inspector — chart timing rows removed, confetti duration added");
  const src = fs.readFileSync(path.join(here, "src", "components", "editor", "Inspector.jsx"), "utf8");
  const i1 = src.indexOf('{sel.type === "chart" && (');
  const i2 = src.indexOf('{sel.type === "chart" && (', i1 + 1);
  const i3 = src.indexOf('{sel.type === "confetti" && (');
  const chartCard = src.slice(i1, i2);
  const chartBoxCard = src.slice(i2, i3);
  const confettiCard = src.slice(i3, src.indexOf('{(sel.type === "shape"', i3));
  check("chart card found", i1 > 0 && i2 > i1);
  check("chart card: NO Start slider (timing control removed)", !/label="Start"/.test(chartCard));
  check("chart card: NO Duration slider (timing control removed)", !/label="Duration"/.test(chartCard));
  check("chart card: data textarea kept (chart data editable)", chartCard.includes("sel.props.dataStr"));
  check("chart card: values toggle kept", /label="Values"/.test(chartCard));
  check("chart box card: padding/radius/border kept (chart card styling editable)", /label="Padding"/.test(chartBoxCard) && /label="Radius"/.test(chartBoxCard) && /label="Border W"/.test(chartBoxCard));
  check("confetti card: HAS a Duration slider", /label="Duration"/.test(confettiCard) && confettiCard.includes("confettiDurMs"));
  check("confetti card: duration slider wired to the engine clamp bounds", confettiCard.includes("CONFETTI_DUR_MIN") && confettiCard.includes("CONFETTI_DUR_MAX"));
  const numCard = src.slice(src.indexOf('{sel.type === "number" && ('), src.indexOf('{(sel.type === "text" || sel.type === "number")'));
  check("number card: Start/Duration rows UNTOUCHED (surgical edit)", /label="Start"/.test(numCard) && /label="Duration"/.test(numCard));
  const fxSrc = fs.readFileSync(path.join(here, "src", "engine", "fx.js"), "utf8");
  check("fx.js exports the shell contract (fitDurForConfetti + confettiDurMs)", /export function fitDurForConfetti/.test(fxSrc) && /export function confettiDurMs/.test(fxSrc));

  /* ================= H. chart lifecycle SSR ================= */
  console.log("\nH · chart lifecycle through the real StageObject (placement window)");
  for (const type of ["bar", "donut", "line"]) {
    const obj = chartObj(type, dataFor(type)); /* inT 1000, outT 4000 */
    const hold = ssr(obj, 2600), enter = ssr(obj, 1300), exit = ssr(obj, 3800);
    check(`${type}: hold renders the chart (non-empty svg + marker)`, hold.includes(`data-chart="${type}"`) && hold.length > 400);
    check(`${type}: entrance ≠ hold (plays in once)`, enter !== hold && enter.length > 100);
    check(`${type}: animated exit present (exit ≠ hold, exit ≠ entrance)`, exit !== hold && exit !== enter);
    check(`${type}: hold static (2400 ≡ 2900)`, ssr(obj, 2400) === ssr(obj, 2900));
    check(`${type}: loop purity markup(inT) ≡ markup(outT)`, ssr(obj, 1000) === ssr(obj, 4000));
    check(`${type}: layer gone after outT (t=4001 ⇒ empty)`, ssr(obj, 4001) === "");
  }
  {
    const a = chartObj("bar", DATA.multi, { outT: 3000 }), b = chartObj("bar", DATA.multi, { outT: 5000 });
    check("timeline resize re-maps the SSR frame (outT 3000 exit vs 5000 hold at t=2500)", ssr(a, 2500) !== ssr(b, 2500));
    const legacy = chartObj("bar", DATA.multi, { inT: 0, outT: null });
    check("legacy project (outT null): authored window intact (mid-frame ≠ hold-end)", ssr(legacy, 900) === ssr(legacy, 1100) && ssr(legacy, 900) !== ssr(legacy, 400));
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All R8-wave checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
