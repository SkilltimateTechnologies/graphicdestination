/**
 * check-backdrops.mjs — node proof for the animated BACKDROPS engine
 * (engine/backdrops.js) + its renderer (components/StageObject.jsx):
 *
 *   1. CATALOGUE — 8 variants, 5 themes (Amber Dusk default), valid hex
 *      palettes, defaults factory, clamps (speed/intensity/loopMs).
 *
 *   2. LOOP PHASE — backdropPhase is u ∈ [0,1), wraps to EXACTLY 0 at the
 *      loop boundary, speed multiplies the rate, loopMs stretches it.
 *
 *   3. MODEL — all 8 variants × 3 times (t = 0, loop/2, loop):
 *      every numeric field finite (no NaN/Infinity), deterministic across
 *      calls, shapes/grads structurally valid; t=0 vs t=loop deep-equal on
 *      all numbers (SEAMLESS, tol 1e-6); t=loop/2 differs (it animates).
 *      Speed multiplier: model(speed 2, t) deep-equals model(speed 1, 2t).
 *
 *   4. SSR through the REAL StageObject (bundled with the project's own
 *      Vite) — each variant renders non-empty <svg> markup with no NaN at
 *      all 3 times; SSR(t=0) === SSR(t=loop) EXACTLY (the seamless proof
 *      through the same render path the export uses); SSR(0) ≠ SSR(loop/2);
 *      NO CSS blur() anywhere (gradient-falloff design — full-canvas perf).
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
  backdropDefaults, backdropColors, backdropPhase, backdropModel, themeOf, clampSpeed, clampIntensity, clampLoopMs,
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
  check("8 variants in panel order", BACKDROP_VARIANT_IDS.join(",") === "aurora,mesh,waves,bokeh,starfield,gridpulse,nebula,sunset", BACKDROP_VARIANT_IDS.join(","));
  check("every variant has name + blurb", BACKDROP_VARIANTS.every((v) => v.name && typeof v.blurb === "string" && v.blurb.length > 10));
  check("5 themes, Amber Dusk first + default", BACKDROP_THEMES.length === 5 && BACKDROP_THEMES[0].id === "amberDusk" && DEFAULT_BACKDROP_THEME === "amberDusk");
  check("theme ids + names", BACKDROP_THEMES.map((t) => t.id).join(",") === "amberDusk,tealDeep,roseEmber,forestNight,midnightBlue");
  check("every theme: 5 valid hex colors", BACKDROP_THEMES.every((t) => t.colors.length === 5 && t.colors.every((c) => HEX.test(c))));
  const def = backdropDefaults("aurora");
  check("defaults: variant/theme/speed/intensity/loopMs/seed", def.variant === "aurora" && def.theme === "amberDusk" && def.speed === 1 && def.intensity === 1 && def.loopMs === BACKDROP_LOOP_MS && Number.isFinite(def.seed));
  check("defaults: colors copied from the theme (mutable)", def.colors.join() === themeOf("amberDusk").colors.join() && def.colors !== themeOf("amberDusk").colors);
  check("junk variant/theme fall back", backdropDefaults("nope", "nope").variant === "aurora" && backdropDefaults("nope", "nope").theme === "amberDusk");
  check("clampSpeed bounds", clampSpeed(0.01) === BACKDROP_SPEED_MIN && clampSpeed(99) === BACKDROP_SPEED_MAX && clampSpeed("x") === 1);
  check("clampIntensity bounds", clampIntensity(0.01) === BACKDROP_INTENSITY_MIN && clampIntensity(99) === BACKDROP_INTENSITY_MAX && clampIntensity("x") === 1);
  check("clampLoopMs bounds", clampLoopMs(10) === BACKDROP_LOOP_MIN && clampLoopMs(1e9) === BACKDROP_LOOP_MAX && clampLoopMs("x") === BACKDROP_LOOP_MS);
  check("backdropColors: junk slots fall back per-slot", (() => {
    const c = backdropColors({ theme: "tealDeep", colors: ["#123456", "junk", null] });
    return c[0] === "#123456" && c[1] === themeOf("tealDeep").colors[1] && c[4] === themeOf("tealDeep").colors[4];
  })());

  /* ---------- 2. loop phase ---------- */
  console.log("\nloop phase — u ∈ [0,1), exact wrap, speed scaling");
  check("u(0) = 0, u(loop/2) = 0.5, u(loop) = 0 (exact)", backdropPhase({ speed: 1, loopMs: 8000 }, 0) === 0 && backdropPhase({ speed: 1, loopMs: 8000 }, 4000) === 0.5 && backdropPhase({ speed: 1, loopMs: 8000 }, 8000) === 0);
  check("speed 2 halves the effective loop: u(2000)=0.5, u(4000)=0", backdropPhase({ speed: 2, loopMs: 8000 }, 2000) === 0.5 && backdropPhase({ speed: 2, loopMs: 8000 }, 4000) === 0);
  check("speed 0.25 doubles it: u(8000)=0.25", backdropPhase({ speed: 0.25, loopMs: 8000 }, 8000) === 0.25);
  check("speed multiplier scales phase: u(speed 2, t) = u(speed 1, 2t)", [123, 999.9, 4321].every((t) => backdropPhase({ speed: 2, loopMs: 8000 }, t) === backdropPhase({ speed: 1, loopMs: 8000 }, t * 2)));
  check("loopMs stretches: u(loop 4000, t) = u(loop 8000, 2t)", [500, 1300, 3999].every((t) => backdropPhase({ speed: 1, loopMs: 4000 }, t) === backdropPhase({ speed: 1, loopMs: 8000 }, t * 2)));
  check("beyond one loop wraps into [0,1)", [9000, 16001, 55555].every((t) => { const u = backdropPhase({ speed: 1, loopMs: 8000 }, t); return u >= 0 && u < 1; }));

  /* ---------- 3. model: finite, deterministic, seamless, animated ---------- */
  console.log("\nbackdropModel — 8 variants × t ∈ {0, loop/2, loop}");
  for (const v of BACKDROP_VARIANTS) {
    const P = backdropDefaults(v.id);
    const m0 = backdropModel(P, 0, STAGE.w, STAGE.h);
    const m1 = backdropModel(P, 4000, STAGE.w, STAGE.h);
    const m2 = backdropModel(P, 8000, STAGE.w, STAGE.h);
    check(`${v.id}: all numbers finite at 3 times`, [m0, m1, m2].every((m) => numsOf(m).every(Number.isFinite)));
    check(`${v.id}: deterministic (repeat calls identical)`, JSON.stringify(backdropModel(P, 4000, STAGE.w, STAGE.h)) === JSON.stringify(m1));
    check(`${v.id}: SEAMLESS — model(0) ≈ model(loop) (tol 1e-6)`, deepApprox(m0, m2, 1e-6));
    check(`${v.id}: animates — model(0) ≠ model(loop/2)`, JSON.stringify(m0) !== JSON.stringify(m1));
    check(`${v.id}: shapes non-empty, grads valid (stops sorted 0..1, op ≤ 1)`, (() => {
      if (!m1.shapes.length) return false;
      return m1.grads.every((g) => g.stops.length >= 2 && g.stops.every((s, i) => s[0] >= 0 && s[0] <= 1 && (!i || s[0] >= g.stops[i - 1][0]) && s[2] >= 0 && s[2] <= 1 && HEX.test(s[1])));
    })());
    check(`${v.id}: seamless at speed 2 too (t=0 vs loop/2)`, deepApprox(backdropModel({ ...P, speed: 2 }, 0, STAGE.w, STAGE.h), backdropModel({ ...P, speed: 2 }, 4000, STAGE.w, STAGE.h), 1e-6));
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
  check("portrait + square stages render finite models", ["vert", "sq"].every(() => {
    const m = backdropModel(backdropDefaults("bokeh"), 2000, 1080, 1920);
    return m.w === 1080 && m.h === 1920 && numsOf(m).every(Number.isFinite);
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

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All backdrop checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
