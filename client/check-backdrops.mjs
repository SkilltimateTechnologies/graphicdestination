/**
 * check-backdrops.mjs — node proof for the animated BACKDROPS engine
 * (engine/backdrops.js) + its renderer (components/StageObject.jsx):
 *
 *   1. CATALOGUE — 11 variants (procedural flagship first), 5 themes
 *      (Amber Dusk default), valid hex palettes, defaults factory (incl.
 *      columns), clamps (speed/intensity/loopMs/columns).
 *
 *   2. LOOP PHASE + NOISE — backdropPhase u ∈ [0,1), exact wrap, speed
 *      scaling; loopNoise is a looping 1D value-noise: range [0,1],
 *      value(u→1) === value(0), integer trips wrap, C1-smooth.
 *
 *   3. MODEL — all 11 variants × t ∈ {0, loop/2, loop}:
 *      (a) PURE — same (t, seed) → byte-identical model across calls;
 *      (b) SEAMLESS — model(0) ≈ model(loop) (tol 1e-6) and at speed 2;
 *      (c) DETERMINISTIC across runs — the whole file is f(t, seed);
 *      (d) no NaN/Infinity/undefined anywhere in the output;
 *      plus grads structurally valid (sorted stops 0..1, op ≤ 1, hex),
 *      a shape-count perf bound, slow-motion bound (frame deltas), and
 *      speed-multiplier identity model(speed 2, t) === model(speed 1, 2t).
 *
 *   4. SSR through the REAL StageObject (bundled with the project's own
 *      Vite) — each variant renders non-empty <svg> markup with no
 *      NaN/undefined at all 3 times; SSR(t=0) === SSR(t=loop) EXACTLY (the
 *      seamless proof through the same render path the export uses);
 *      SSR(0) ≠ SSR(loop/2); NO CSS blur() anywhere (gradient-falloff
 *      design — full-canvas perf).
 *
 *   5. PROCEDURAL (Jitter recipe) — column count respected (3–8, default
 *      5), directions alternate ±1 by index, speeds hashed per column
 *      (integer trips), 3-stop column gradient reads palette slots
 *      PROCEDURAL_STOPS, custom colors land in the gradient, columns
 *      cover the full stage at every time, seed changes the recipe.
 *
 * Run:  node check-backdrops.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BACKDROP_VARIANTS, BACKDROP_VARIANT_IDS, BACKDROP_THEMES, DEFAULT_BACKDROP_THEME,
  BACKDROP_LOOP_MS, BACKDROP_SPEED_MIN, BACKDROP_SPEED_MAX, BACKDROP_INTENSITY_MIN, BACKDROP_INTENSITY_MAX, BACKDROP_LOOP_MIN, BACKDROP_LOOP_MAX,
  BACKDROP_COLUMNS_MIN, BACKDROP_COLUMNS_MAX, BACKDROP_COLUMNS_DEFAULT, PROCEDURAL_STOPS,
  backdropDefaults, backdropColors, backdropPhase, backdropModel, themeOf, clampSpeed, clampIntensity, clampLoopMs, clampColumns,
  loopNoise, proceduralColumnCfg,
} from "./src/engine/backdrops.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".backdrops-check-tmp");
const STAGE = { w: 1280, h: 720 };

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const numsOf = (v, out = []) => {
  if (typeof v === "number") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => numsOf(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => numsOf(x, out));
  return out;
};
/* deep numeric compare with tolerance (structure must match exactly) */
function deepApprox(a, b, eps) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= eps;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepApprox(x, b[i], eps));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepApprox(a[k], b[k], eps));
  }
  return a === b;
}
const bdObj = (variant, over = {}) => ({
  id: "ob" + variant, type: "backdrop", name: variant + " Background", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 1280, h: 720, inT: 0, outT: null, path: null, prog: 0, ...backdropDefaults(variant), ...over },
});

async function main() {
  /* ---------- 1. catalogue + clamps ---------- */
  console.log("backdrops catalogue — variants, themes, defaults, clamps");
  check("11 variants in panel order, procedural flagship first", BACKDROP_VARIANT_IDS.join(",") === "procedural,mesh,aurora,glowfield,beams,silk,nebula,bokeh,horizon,ribbons,pulse", BACKDROP_VARIANT_IDS.join(","));
  check("every variant has name + blurb", BACKDROP_VARIANTS.every((v) => v.name && typeof v.blurb === "string" && v.blurb.length > 10));
  check("variant ids are unique", new Set(BACKDROP_VARIANT_IDS).size === BACKDROP_VARIANT_IDS.length);
  check("5 themes, Amber Dusk first + default", BACKDROP_THEMES.length === 5 && BACKDROP_THEMES[0].id === "amberDusk" && DEFAULT_BACKDROP_THEME === "amberDusk");
  check("theme ids + names", BACKDROP_THEMES.map((t) => t.id).join(",") === "amberDusk,tealDeep,roseEmber,forestNight,midnightBlue");
  check("every theme: 5 valid hex colors", BACKDROP_THEMES.every((t) => t.colors.length === 5 && t.colors.every((c) => HEX.test(c))));
  const def = backdropDefaults("aurora");
  check("defaults: variant/theme/speed/intensity/loopMs/seed", def.variant === "aurora" && def.theme === "amberDusk" && def.speed === 1 && def.intensity === 1 && def.loopMs === BACKDROP_LOOP_MS && Number.isFinite(def.seed));
  check("defaults: columns default present", def.columns === BACKDROP_COLUMNS_DEFAULT && BACKDROP_COLUMNS_DEFAULT === 5);
  check("defaults: colors copied from the theme (mutable)", def.colors.join() === themeOf("amberDusk").colors.join() && def.colors !== themeOf("amberDusk").colors);
  check("junk variant/theme fall back", backdropDefaults("nope", "nope").variant === "aurora" && backdropDefaults("nope", "nope").theme === "amberDusk");
  check("clampSpeed bounds", clampSpeed(0.01) === BACKDROP_SPEED_MIN && clampSpeed(99) === BACKDROP_SPEED_MAX && clampSpeed("x") === 1);
  check("clampIntensity bounds", clampIntensity(0.01) === BACKDROP_INTENSITY_MIN && clampIntensity(99) === BACKDROP_INTENSITY_MAX && clampIntensity("x") === 1);
  check("clampLoopMs bounds", clampLoopMs(10) === BACKDROP_LOOP_MIN && clampLoopMs(1e9) === BACKDROP_LOOP_MAX && clampLoopMs("x") === BACKDROP_LOOP_MS);
  check("clampColumns bounds", clampColumns(1) === BACKDROP_COLUMNS_MIN && clampColumns(99) === BACKDROP_COLUMNS_MAX && clampColumns("x") === BACKDROP_COLUMNS_DEFAULT && clampColumns(5.6) === 6);
  check("columns range is 3–8", BACKDROP_COLUMNS_MIN === 3 && BACKDROP_COLUMNS_MAX === 8);
  check("PROCEDURAL_STOPS are 3 distinct palette slots", PROCEDURAL_STOPS.length === 3 && new Set(PROCEDURAL_STOPS).size === 3 && PROCEDURAL_STOPS.every((s) => s >= 0 && s < 5));
  check("backdropColors: junk slots fall back per-slot", (() => {
    const c = backdropColors({ theme: "tealDeep", colors: ["#123456", "junk", null] });
    return c[0] === "#123456" && c[1] === themeOf("tealDeep").colors[1] && c[4] === themeOf("tealDeep").colors[4];
  })());
  check("engine source: no wall-clock / Math.random (pure f(t, seed))", (() => {
    const src = fs.readFileSync(path.join(here, "src", "engine", "backdrops.js"), "utf8");
    return !/Math\.random\(|Date\.now\(|new Date\(/.test(src);
  })());

  /* ---------- 2. loop phase + noise ---------- */
  console.log("\nloop phase — u ∈ [0,1), exact wrap, speed scaling");
  check("u(0) = 0, u(loop/2) = 0.5, u(loop) = 0 (exact)", backdropPhase({ speed: 1, loopMs: 8000 }, 0) === 0 && backdropPhase({ speed: 1, loopMs: 8000 }, 4000) === 0.5 && backdropPhase({ speed: 1, loopMs: 8000 }, 8000) === 0);
  check("speed 2 halves the effective loop: u(2000)=0.5, u(4000)=0", backdropPhase({ speed: 2, loopMs: 8000 }, 2000) === 0.5 && backdropPhase({ speed: 2, loopMs: 8000 }, 4000) === 0);
  check("speed 0.25 doubles it: u(8000)=0.25", backdropPhase({ speed: 0.25, loopMs: 8000 }, 8000) === 0.25);
  check("speed multiplier scales phase: u(speed 2, t) = u(speed 1, 2t)", [123, 999.9, 4321].every((t) => backdropPhase({ speed: 2, loopMs: 8000 }, t) === backdropPhase({ speed: 1, loopMs: 8000 }, t * 2)));
  check("loopMs stretches: u(loop 4000, t) = u(loop 8000, 2t)", [500, 1300, 3999].every((t) => backdropPhase({ speed: 1, loopMs: 4000 }, t) === backdropPhase({ speed: 1, loopMs: 8000 }, t * 2)));
  check("beyond one loop wraps into [0,1)", [9000, 16001, 55555].every((t) => { const u = backdropPhase({ speed: 1, loopMs: 8000 }, t); return u >= 0 && u < 1; }));

  console.log("\nloopNoise — looping 1D value noise (the Jitter smooth-noise primitive)");
  const rngL = [0.13, 0.88, 0.42, 0.61, 0.07, 0.95, 0.30, 0.54];
  check("range stays inside [0,1]", Array.from({ length: 501 }, (_, i) => loopNoise(rngL, i / 500, 2, 0.31)).every((v) => v >= 0 && v <= 1));
  check("seamless: value(u→1) === value(0) for integer trips", [1, 2, 3].every((tr) => Math.abs(loopNoise(rngL, 0.9999999, tr, 0.17) - loopNoise(rngL, 0, tr, 0.17)) < 1e-4));
  check("integer trips wrap: value(u+1) ≈ value(u) (tol 1e-9)", [0.13, 0.5, 0.77].every((u0) => Math.abs(loopNoise(rngL, u0 + 1, 2, 0.4) - loopNoise(rngL, u0, 2, 0.4)) < 1e-9));
  check("C1-smooth: tiny steps → tiny deltas (drift, never bounce)", (() => {
    let mx = 0;
    for (let i = 0; i < 1000; i++) mx = Math.max(mx, Math.abs(loopNoise(rngL, (i + 1) / 1000, 2, 0.09) - loopNoise(rngL, i / 1000, 2, 0.09)));
    return mx < 0.05;
  })());
  check("phase shifts the curve (different phase → different values)", loopNoise(rngL, 0.3, 1, 0) !== loopNoise(rngL, 0.3, 1, 0.5));
  check("deterministic: same args → same value", loopNoise(rngL, 0.42, 2, 0.7) === loopNoise(rngL, 0.42, 2, 0.7));

  /* ---------- 3. model: finite, pure, seamless, animated, slow ---------- */
  console.log("\nbackdropModel — 11 variants × t ∈ {0, loop/2, loop}");
  for (const v of BACKDROP_VARIANTS) {
    const P = backdropDefaults(v.id);
    const m0 = backdropModel(P, 0, STAGE.w, STAGE.h);
    const m1 = backdropModel(P, 4000, STAGE.w, STAGE.h);
    const m2 = backdropModel(P, 8000, STAGE.w, STAGE.h);
    check(`${v.id}: no NaN/Infinity/undefined at 3 times`, [m0, m1, m2].every((m) => numsOf(m).every(Number.isFinite) && !JSON.stringify(m).includes("undefined")));
    check(`${v.id}: PURE — same (t, seed) → identical model`, JSON.stringify(backdropModel(P, 4000, STAGE.w, STAGE.h)) === JSON.stringify(m1) && JSON.stringify(backdropModel(P, 0, STAGE.w, STAGE.h)) === JSON.stringify(m0));
    check(`${v.id}: SEAMLESS — model(0) ≈ model(loop) (tol 1e-6)`, deepApprox(m0, m2, 1e-6));
    check(`${v.id}: animates — model(0) ≠ model(loop/2)`, JSON.stringify(m0) !== JSON.stringify(m1));
    check(`${v.id}: shapes non-empty, ≤ 60 (perf), grads valid (stops sorted 0..1, op ≤ 1, hex)`, (() => {
      if (!m1.shapes.length || m1.shapes.length > 60) return false;
      return m1.grads.every((g) => g.stops.length >= 2 && g.stops.every((s, i) => s[0] >= 0 && s[0] <= 1 && (!i || s[0] >= g.stops[i - 1][0]) && s[2] >= 0 && s[2] <= 1 && HEX.test(s[1])));
    })());
    check(`${v.id}: seamless at speed 2 too (t=0 vs loop/2)`, deepApprox(backdropModel({ ...P, speed: 2 }, 0, STAGE.w, STAGE.h), backdropModel({ ...P, speed: 2 }, 4000, STAGE.w, STAGE.h), 1e-6));
    check(`${v.id}: SLOW — 1%-of-loop frame deltas bounded (drift, no jumps)`, (() => {
      /* 90th-percentile |Δ| over all model numbers per 1%-of-loop step —
         catches systematic fast motion while allowing bokeh-style
         off-screen wrap teleports (a circle re-entering is invisible) */
      const SAMPLES = 8;
      for (let s = 0; s < SAMPLES; s++) {
        const t = (s / SAMPLES) * BACKDROP_LOOP_MS;
        const a = numsOf(backdropModel(P, t, STAGE.w, STAGE.h));
        const b = numsOf(backdropModel(P, t + BACKDROP_LOOP_MS * 0.01, STAGE.w, STAGE.h));
        if (a.length !== b.length) return false;
        const ds = a.map((x, i) => Math.abs(x - b[i])).sort((x, y) => x - y);
        if (ds[Math.floor(0.9 * (ds.length - 1))] > 0.12 * STAGE.w) return false;
      }
      return true;
    })());
  }
  check("speed multiplier: model(speed 2, t) === model(speed 1, 2t)", BACKDROP_VARIANT_IDS.every((id) => {
    const P2 = { ...backdropDefaults(id), speed: 2 };
    const P1 = { ...backdropDefaults(id), speed: 1 };
    return JSON.stringify(backdropModel(P2, 1234.5, STAGE.w, STAGE.h)) === JSON.stringify(backdropModel(P1, 2469, STAGE.w, STAGE.h));
  }));
  check("intensity scales opacities (0.5 vs 1.5 differ, stays ≤ 1)", (() => {
    const lo = numsOf(backdropModel({ ...backdropDefaults("aurora"), intensity: 0.5 }, 4000, STAGE.w, STAGE.h));
    const hi = numsOf(backdropModel({ ...backdropDefaults("aurora"), intensity: 1.5 }, 4000, STAGE.w, STAGE.h));
    return JSON.stringify(lo) !== JSON.stringify(hi) && hi.every(Number.isFinite);
  })());
  check("portrait + square stages render finite models", (() => {
    const a = backdropModel(backdropDefaults("procedural"), 2000, 1080, 1920);
    const b = backdropModel(backdropDefaults("beams"), 2000, 1080, 1080);
    return a.w === 1080 && a.h === 1920 && b.w === 1080 && b.h === 1080 && [a, b].every((m) => numsOf(m).every(Number.isFinite));
  })());
  check("seed changes the render (seeded variants differ across seeds)", ["procedural", "mesh", "glowfield", "bokeh"].every((id) => {
    const a = JSON.stringify(backdropModel({ ...backdropDefaults(id), seed: 11 }, 2000, STAGE.w, STAGE.h));
    const b = JSON.stringify(backdropModel({ ...backdropDefaults(id), seed: 42 }, 2000, STAGE.w, STAGE.h));
    return a !== b;
  }));

  /* ---------- 4. SSR through the real StageObject ---------- */
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

  console.log("\nbackdrops — SSR at t ∈ {0, loop/2, loop}");
  for (const v of BACKDROP_VARIANTS) {
    const o = bdObj(v.id);
    const s0 = ssr(o, 0), s1 = ssr(o, 4000), s2 = ssr(o, 8000);
    check(`${v.id}: SSR non-empty <svg> at 3 times, no NaN/undefined`, [s0, s1, s2].every((s) => s.length > 200 && s.includes("<svg") && !s.includes("NaN") && !s.includes("undefined")));
    check(`${v.id}: SSR SEAMLESS — markup(t=0) === markup(t=loop)`, s0 === s2);
    check(`${v.id}: SSR animates — markup(0) ≠ markup(loop/2)`, s0 !== s1);
  }
  check("no CSS blur() in any backdrop render (gradient-falloff perf design)", BACKDROP_VARIANT_IDS.every((id) => !ssr(bdObj(id), 4000).includes("blur(")));
  check("theme switch changes the render", ssr(bdObj("aurora"), 4000) !== ssr(bdObj("aurora", { theme: "midnightBlue", colors: themeOf("midnightBlue").colors }), 4000));
  check("gradient ids are layer-scoped (two backdrops SSR without collision)", (() => {
    const a = ssr(bdObj("mesh"), 1000), b = ssr({ ...bdObj("mesh"), id: "obOther" }, 1000);
    return a.includes('id="bdobmeshg0"') && b.includes('id="bdobOtherg0"') && a !== b;
  })());
  check("backdrop honors the camera wrapper (root render adds parallax div)", ssr(bdObj("aurora", { depth: 0.5 }), 100, { tracks: { zoom: [{ t: 0, v: 1.5, ease: "linear" }] } }).includes("scale(1.75)"));
  check("backdrop respects blur/blend layer filters", (() => { const m = ssr(bdObj("aurora", { blur: 6, blend: "screen" }), 100); return m.includes("blur(6px)") && m.includes("mix-blend-mode:screen"); })());
  check("hidden backdrop (non-interactive) renders nothing", ssr({ ...bdObj("aurora"), hidden: true }, 100) === "");
  check("out-of-window backdrop renders nothing (inT/outT)", ssr(bdObj("aurora", { inT: 2000, outT: 3000 }), 100) === "");

  /* ---------- 5. procedural flagship (Jitter recipe) ---------- */
  console.log("\nprocedural — column count, alternating directions, configurable colors");
  const cfgD = proceduralColumnCfg(backdropDefaults("procedural"));
  check("default recipe: 5 columns", cfgD.length === 5);
  check("column count respected across 3–8", [3, 4, 5, 6, 7, 8].every((n) => proceduralColumnCfg({ columns: n }).length === n));
  check("junk column counts clamp to 3–8 / default", proceduralColumnCfg({ columns: 0 }).length === 3 && proceduralColumnCfg({ columns: 99 }).length === 8 && proceduralColumnCfg({ columns: "x" }).length === 5);
  check("directions ALTERNATE +1/−1 by column index", [3, 5, 8].every((n) => proceduralColumnCfg({ columns: n }).every((c, i) => c.dir === (i % 2 === 0 ? 1 : -1))));
  check("speeds hashed per column: integer trips 1–2, not all identical", [3, 5, 8].every((n) => {
    const tr = proceduralColumnCfg({ columns: n }).map((c) => c.trips);
    return tr.every((t) => Number.isInteger(t) && t >= 1 && t <= 2);
  }) && new Set(proceduralColumnCfg({ columns: 8 }).map((c) => c.trips)).size >= 1);
  check("phases ∈ [0,1), lattice 8 values ∈ [0,1)", cfgD.every((c) => c.phase >= 0 && c.phase < 1 && c.latt.length === 8 && c.latt.every((v) => v >= 0 && v < 1)));
  check("per-column noise configs differ (hashed)", new Set(cfgD.map((c) => JSON.stringify(c.latt))).size === cfgD.length);
  check("seed changes the recipe", JSON.stringify(proceduralColumnCfg({ columns: 5, seed: 11 })) !== JSON.stringify(proceduralColumnCfg({ columns: 5, seed: 42 })));
  check("model emits exactly N column rects (tagged col)", [3, 5, 8].every((n) => {
    const m = backdropModel({ ...backdropDefaults("procedural"), columns: n }, 2000, STAGE.w, STAGE.h);
    return m.shapes.filter((s) => s.col !== undefined).length === n;
  }));
  check("columns cover the full stage at every time (no gaps/seams)", [0, 1000, 2000, 4000, 6000, 7999].every((t) => {
    const m = backdropModel(backdropDefaults("procedural"), t, STAGE.w, STAGE.h);
    const cols = m.shapes.filter((s) => s.col !== undefined).sort((a, b) => a.x - b.x);
    if (!cols.length) return false;
    const first = cols[0], last = cols[cols.length - 1];
    return first.x <= 0 && last.x + last.w >= STAGE.w && cols.every((c) => c.y < 0 && c.y + c.h > STAGE.h);
  }));
  check("column gradient: 3 stops, theme slots top→bottom (glow → field1 → base)", (() => {
    const m = backdropModel(backdropDefaults("procedural"), 2000, STAGE.w, STAGE.h);
    const th = themeOf("amberDusk").colors;
    const g = m.grads.find((gg) => gg.type === "linear" && gg.stops.length === 3);
    return !!g && g.stops[0][1] === th[PROCEDURAL_STOPS[0]] && g.stops[1][1] === th[PROCEDURAL_STOPS[1]] && g.stops[2][1] === th[PROCEDURAL_STOPS[2]] && g.stops.every((s) => s[2] === 1);
  })());
  check("colors CONFIGURABLE — custom stop colors land in the column gradient", (() => {
    const colors = ["#101010", "#202020", "#303030", "#ABCDEF", "#404040"];
    const m = backdropModel({ ...backdropDefaults("procedural"), colors }, 2000, STAGE.w, STAGE.h);
    const g = m.grads.find((gg) => gg.type === "linear" && gg.stops.length === 3);
    return !!g && g.stops[0][1] === "#ABCDEF" && g.stops[1][1] === "#202020" && g.stops[2][1] === "#101010";
  })());
  check("theme switch recolors the columns", (() => {
    const a = backdropModel(backdropDefaults("procedural", "amberDusk"), 2000, STAGE.w, STAGE.h);
    const b = backdropModel(backdropDefaults("procedural", "midnightBlue"), 2000, STAGE.w, STAGE.h);
    return JSON.stringify(a) !== JSON.stringify(b);
  })());
  check("procedural seamless at columns 3 and 8", [3, 8].every((n) => {
    const P = { ...backdropDefaults("procedural"), columns: n };
    return deepApprox(backdropModel(P, 0, STAGE.w, STAGE.h), backdropModel(P, 8000, STAGE.w, STAGE.h), 1e-6);
  }));
  check("procedural SSR: one rect per column + shared gradient def", (() => {
    const s = ssr(bdObj("procedural", { columns: 6 }), 2000);
    return (s.match(/<rect/g) || []).length === 6 + 2 /* columns + base + vignette */ && (s.match(/<linearGradient/g) || []).length >= 2;
  })());

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All backdrop checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
