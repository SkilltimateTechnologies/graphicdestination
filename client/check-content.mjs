/**
 * check-content.mjs — node proof for the content features:
 *
 *   1. CONFETTI STYLES — all 8 styles × 2 seeds: confettiParticles() returns
 *      deterministic arrays (same seed ⇒ identical JSON) with only finite
 *      numeric fields (no NaN/Infinity), and confettiLife() is a positive
 *      finite ms value. Missing/unknown props.style falls back to "burst",
 *      identical to the pre-styles engine (old projects render unchanged).
 *
 *   2. CHART TYPES — all 7 chartTypes SSR-render through the real StageObject
 *      component (bundled with the project's own Vite, react externalized so
 *      the server renderer shares one react instance) at a mid-animation and
 *      a settled time: no throw, non-empty markup, real <svg> output, no NaN.
 *      Confetti styles get the same SSR smoke pass (renderer kinematics).
 *
 * Run:  node check-content.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONFETTI_STYLES, confettiParticles, confettiLife, confettiStyleOf } from "./src/engine/fx.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".content-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const allFinite = (v) => {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v && typeof v === "object") return Object.values(v).every(allFinite);
  return true; /* strings / booleans / null */
};
const confettiObj = (style, seed, count = 40) => ({
  id: "ob900", type: "confetti", name: "Confetti", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, burst: 200, count, power: 1.2, seed, ...(style ? { style } : {}) },
});
const chartObj = (chartType, dataStr = "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84") => ({
  id: "ob901", type: "chart", name: "Chart", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 560, h: 340, inT: 0, outT: null, path: null, prog: 0, chartType, dataStr, start: 200, dur: 1400, showVals: true, bg: "#171B24", bgOp: 1, radius: 18, borderC: "#2B3140", borderW: 1, pad: 20 },
});

async function main() {
  /* ---------- 1. confetti styles: deterministic + finite ---------- */
  console.log(`confettiParticles — ${CONFETTI_STYLES.length} styles × 2 seeds`);
  check("8 styles registered", CONFETTI_STYLES.length === 8, CONFETTI_STYLES.map((s) => s.id).join(","));
  for (const s of CONFETTI_STYLES) {
    for (const seed of [7, 1234]) {
      const a = confettiParticles(confettiObj(s.id, seed));
      const b = confettiParticles(confettiObj(s.id, seed));
      check(`${s.id} seed ${seed}: deterministic (${a.length} particles)`, a.length === 40 && JSON.stringify(a) === JSON.stringify(b));
      check(`${s.id} seed ${seed}: all fields finite`, allFinite(a));
    }
    const life = confettiLife(s.id);
    check(`${s.id}: confettiLife positive finite (${life} ms)`, Number.isFinite(life) && life > 0);
  }
  /* backward compatibility: no style (pre-styles projects) = burst, byte-identical */
  const noStyle = confettiParticles(confettiObj(null, 7));
  const burst = confettiParticles(confettiObj("burst", 7));
  check("missing style → burst (identical output)", JSON.stringify(noStyle) === JSON.stringify(burst));
  check("unknown style → burst", confettiStyleOf({ style: "nope" }) === "burst" && JSON.stringify(confettiParticles(confettiObj("nope", 7))) === JSON.stringify(burst));
  check("confettiLife(undefined) = 2400 (legacy window)", confettiLife(undefined) === 2400);
  const legacyKeys = ["vx", "vy", "size", "color", "spin", "round", "drift", "wob"];
  check("burst keeps the legacy particle field set", legacyKeys.every((k) => k in burst[0]), Object.keys(burst[0]).join(","));

  /* ---------- 2. bundle the real StageObject for SSR ----------
     One bundle that ALSO re-exports react's createElement + react-dom's
     renderToStaticMarkup, so the component, the element factory and the
     renderer all share the single bundled react instance. */
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

  const stage = { w: 1280, h: 720 };
  const ssr = (obj, time) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));

  /* ---------- 3. all 7 chart types SSR ---------- */
  console.log("\nchart renderer — 7 chartTypes SSR");
  const CHART_TYPES = ["bar", "line", "donut", "pie", "area", "hbar", "gauge"];
  for (const ct of CHART_TYPES) {
    const obj = chartObj(ct, ct === "gauge" ? "Progress, 68" : undefined);
    let mid = "", done = "", err = null;
    try { mid = ssr(obj, 900); done = ssr(obj, 4000); } catch (e) { err = e; }
    check(`${ct}: SSR renders without throwing`, !err, err ? String(err && err.message || err) : "");
    check(`${ct}: non-empty <svg> output (mid + settled)`, mid.includes("<svg") && done.includes("<svg") && mid.length > 100 && done.length > 100, `mid=${mid.length} done=${done.length}`);
    check(`${ct}: no NaN in output`, !mid.includes("NaN") && !done.includes("NaN"));
  }

  /* ---------- 4. confetti renderer smoke (all styles, incl. legacy no-style) ---------- */
  console.log("\nconfetti renderer — SSR smoke at 3 sample times");
  for (const s of [...CONFETTI_STYLES.map((x) => x.id), null]) {
    const obj = confettiObj(s, 7);
    const label = s || "(legacy · no style)";
    let err = null, nan = false;
    try {
      for (const t of [200, 900, 2600, 6600]) { const html = ssr(obj, t); if (html.includes("NaN")) nan = true; }
    } catch (e) { err = e; }
    check(`${label}: renders, no NaN`, !err && !nan, err ? String(err && err.message || err) : "");
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All content checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
