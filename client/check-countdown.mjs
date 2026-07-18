/**
 * check-countdown.mjs — node proof for the Countdown Style Pack
 * (props.cdStyle on countdown-MODE number layers):
 *
 *   1. cdStyleOf — absent/unknown cdStyle or a non-countdown mode ⇒
 *      "digits" (legacy render path, old projects byte-identical); the
 *      5 registered styles round-trip.
 *
 *   2. countdownFraction — remaining share of the run (1 → 0), value-based
 *      via numberValue so it tracks the digits under any numEase: linear
 *      samples, eased sample, clamps, legacy From>To setups, degenerate
 *      from===to.
 *
 *   3. SSR — every cdStyle renders through the REAL StageObject (bundled
 *      with the project's own Vite — the same component export/
 *      frameRenderer.js uses, so the export path flows automatically)
 *      with its expected DOM/SVG markers:
 *        digits  no data-cdstyle attribute (legacy markup)
 *        flip    data-cdstyle="flip" + one data-cd="split" center line
 *                per digit card (mm:ss ⇒ separators stay unboxed)
 *        ring    data-cd="arc" arc path from the top; end point matches
 *                359.9°·fraction geometry; gone at fraction 0
 *        bar     data-cd="fill" width = fraction % (50% at the midpoint)
 *        boxed   data-cd="digit" LED box per digit + glow text-shadow
 *      plus back-compat guards (no mode ⇒ no cdStyle render, explicit
 *      "digits" === absent cdStyle).
 *
 * Run:  node check-countdown.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CD_STYLES, cdStyleOf, countdownFraction } from "./src/engine/fx.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".countdown-check-tmp");

let passed = 0, failed = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

/* number layer props factory — mirrors makeObject("number") defaults */
const numObj = (over = {}) => ({
  id: "ob911", type: "number", name: "Countdown", tracks: {}, locked: false, hidden: false,
  props: {
    x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0,
    from: 0, to: 100, start: 200, dur: 1600, style: "odometer", decimals: 0, prefix: "", suffix: "", fontSize: 96,
    numEase: "easeOutCubic", fontFamily: "JetBrains Mono", ring: "none", ringC: "#FFB224", ringW: 8,
    bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none", ...over,
  },
});
/* countdown-mode layer: 10 → 0 over 1s, linear */
const cdObj = (over = {}) => numObj({ mode: "countdown", style: "count", from: 0, to: 10, start: 0, dur: 1000, numEase: "linear", ...over });

async function main() {
  /* ---------- 1. cdStyleOf ---------- */
  console.log("cdStyleOf — registry + guards");
  check("5 styles registered", CD_STYLES.length === 5 && CD_STYLES.map((s) => s.id).join(",") === "digits,flip,ring,bar,boxed");
  check("absent cdStyle → digits", cdStyleOf({ mode: "countdown" }) === "digits");
  check("unknown cdStyle → digits", cdStyleOf({ mode: "countdown", cdStyle: "nope" }) === "digits");
  check("non-countdown mode ⇒ digits (guard)", cdStyleOf({ cdStyle: "flip" }) === "digits" && cdStyleOf({ mode: "countup", cdStyle: "flip" }) === "digits" && cdStyleOf({ mode: "odometer", cdStyle: "flip" }) === "digits");
  check("each style round-trips in countdown mode", CD_STYLES.every((s) => cdStyleOf({ mode: "countdown", cdStyle: s.id }) === s.id));

  /* ---------- 2. countdownFraction ---------- */
  console.log("countdownFraction — remaining share 1 → 0, value-based");
  const P = { from: 0, to: 10, start: 0, dur: 1000, numEase: "linear", mode: "countdown" };
  check("start → 1 (full)", countdownFraction(P, 0) === 1);
  check("quarter → 0.75", approx(countdownFraction(P, 250), 0.75));
  check("midpoint → 0.5", approx(countdownFraction(P, 500), 0.5));
  check("three-quarter → 0.25", approx(countdownFraction(P, 750), 0.25));
  check("end → 0 + clamps past the end", countdownFraction(P, 1000) === 0 && countdownFraction(P, 9999) === 0);
  check("before start clamps to 1", countdownFraction(P, -500) === 1);
  check("honors easing (easeOutCubic u=0.5 → 0.125)", approx(countdownFraction({ ...P, numEase: "easeOutCubic" }, 500), 0.125));
  check("legacy From>To countdown depletes (5→1, u=0.5 → 0.5)", approx(countdownFraction({ from: 5, to: 1, start: 250, dur: 4000, numEase: "linear", mode: "countdown" }, 2250), 0.5));
  check("degenerate from===to → 0", countdownFraction({ from: 7, to: 7, start: 0, dur: 1000, mode: "countdown" }, 500) === 0);

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
  const stage = { w: 1280, h: 720 };
  const ssr = (obj, time) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));

  /* ---------- 4. per-style SSR markers ---------- */
  console.log("\ncdStyle SSR — markers through the shared render point (export-safe)");
  const digits = ssr(cdObj(), 500);
  check("digits (default): no cdStyle markup", !digits.includes("data-cdstyle") && digits.includes(">5<"));

  const flip0 = ssr(cdObj({ cdStyle: "flip" }), 0);
  const flipEnd = ssr(cdObj({ cdStyle: "flip" }), 1000);
  check("flip: data-cdstyle + one split line per digit (10 → 2)", flip0.includes('data-cdstyle="flip"') && (flip0.match(/data-cd="split"/g) || []).length === 2);
  check("flip: split count follows the digits (0 → 1)", (flipEnd.match(/data-cd="split"/g) || []).length === 1);
  check("flip: dark two-tone card + rounded corners", flip0.includes("linear-gradient(180deg") && flip0.includes("border-radius:0.1em"));
  const flipTime = ssr(cdObj({ cdStyle: "flip", format: "time", to: 600, prefix: "T-", suffix: " left" }), 0);
  check("flip: mm:ss boxes 4 digits, colon unboxed, affixes render", (flipTime.match(/data-cd="split"/g) || []).length === 4 && flipTime.includes(":") && flipTime.includes("T-") && flipTime.includes(" left"));

  const R = 96 * 1.15, SIZE = R * 2 + 8 * 2 + 10, CC = SIZE / 2;
  const arcD = (html) => (html.match(/data-cd="arc" d="([^"]+)"/) || [])[1] || "";
  const arcNums = (d) => d.match(/-?[0-9.]+/g).map(Number); /* [x0,y0,rx,ry,rot,laf,sweep,x1,y1] */
  const ring0 = ssr(cdObj({ cdStyle: "ring" }), 0);
  const ringMid = ssr(cdObj({ cdStyle: "ring" }), 500);
  check("ring: track circle + arc path marker", ringMid.includes('data-cdstyle="ring"') && ringMid.includes("<circle") && !!arcD(ringMid));
  const a0 = arcNums(arcD(ringMid));
  check("ring: arc starts at the top (c, c−R)", approx(a0[0], CC, 0.01) && approx(a0[1], CC - R, 0.01), arcD(ringMid));
  const expA = (-90 + 359.9 * 0.5) * (Math.PI / 180);
  check("ring: midpoint arc end = 359.9°·0.5 geometry", approx(a0[7], CC + R * Math.cos(expA), 0.01) && approx(a0[8], CC + R * Math.sin(expA), 0.01), arcD(ringMid));
  check("ring: half arc ⇒ small-arc flag 0, full arc ⇒ flag 1", a0[5] === 0 && arcNums(arcD(ring0))[5] === 1);
  check("ring: fully depleted ⇒ no arc", !ssr(cdObj({ cdStyle: "ring" }), 1000).includes('data-cd="arc"'));

  const barMid = ssr(cdObj({ cdStyle: "bar" }), 500);
  check("bar: fill width 50% at the midpoint", barMid.includes('data-cdstyle="bar"') && barMid.includes('data-cd="fill"') && barMid.includes("width:50%"));
  check("bar: 75% at the quarter, 100% at the start", ssr(cdObj({ cdStyle: "bar" }), 250).includes("width:75%") && ssr(cdObj({ cdStyle: "bar" }), 0).includes("width:100%"));
  check("bar: shows the current value (5 at midpoint)", barMid.includes(">5<"));

  const boxed = ssr(cdObj({ cdStyle: "boxed" }), 0);
  check("boxed: one LED box per digit (10 → 2)", boxed.includes('data-cdstyle="boxed"') && (boxed.match(/data-cd="digit"/g) || []).length === 2);
  check("boxed: LED glow text-shadow + tabular mono", boxed.includes("text-shadow:") && boxed.includes("tabular-nums"));

  /* ---------- 5. back-compat ---------- */
  console.log("\nback-compat — pre-pack layers render unchanged");
  const legacy = numObj(); /* no mode, no cdStyle — the old-project shape */
  check("legacy layer: no cdStyle markup", !ssr(legacy, 500).includes("data-cdstyle"));
  check("cdStyle on a non-countdown layer is inert", !ssr(numObj({ cdStyle: "flip" }), 500).includes("data-cdstyle") && !ssr(numObj({ mode: "countup", cdStyle: "ring" }), 500).includes("data-cdstyle"));
  check("explicit digits === absent cdStyle (byte-identical)", ssr(cdObj({ cdStyle: "digits" }), 500) === ssr(cdObj(), 500));
  check("countdown digits path untouched (legacy count markup)", ssr(cdObj(), 500) === ssr(numObj({ mode: "countdown", style: "count", from: 0, to: 10, start: 0, dur: 1000, numEase: "linear" }), 500));

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All countdown style checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
