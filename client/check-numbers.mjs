/**
 * check-numbers.mjs — node proof for the Number-layer upgrade:
 *
 *   1. MODES — props.mode: "countup" (current behavior; ABSENT mode is
 *      identical), "countdown" (plays the from→to setup end→start, e.g.
 *      From 0 / To 10 displays 10 → 0 at sample times), "odometer"
 *      (slot-machine roll settling left → right on the final digits).
 *
 *   2. FORMATS — formatNumber(value, format, decimals) is pure: compact
 *      (12.4K/3.2M), currency ($1,234), percent (42%), time (mm:ss from
 *      seconds), plain (legacy toFixed — zero drift), unknown → plain.
 *
 *   3. ODOMETER determinism — same props ⇒ identical columns, settles
 *      left→right, mode "odometer" === legacy style "slot" machinery.
 *
 *   4. SSR — each of the 6 style presets renders through the REAL
 *      StageObject (bundled with the project's own Vite, one shared react)
 *      with its expected attributes (stroke / pill / glow / tabular-nums /
 *      tracking / weight), each mode + format renders its expected text,
 *      and a pre-upgrade layer (no new props) SSRs byte-identical to the
 *      same layer with explicit countup/plain defaults.
 *
 * Run:  node check-numbers.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { numberValue, numberColumns, formatNumber, numMode, contrastOn } from "./src/engine/fx.js";
import { NUM_MODES, NUM_STYLE_PRESETS, NUM_STYLE_RESET } from "./src/components/editor/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".numbers-check-tmp");

let passed = 0, failed = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

/* number layer props factory — mirrors makeObject("number") defaults */
const numObj = (over = {}) => ({
  id: "ob910", type: "number", name: "Number", tracks: {}, locked: false, hidden: false,
  props: {
    x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0,
    from: 0, to: 100, start: 200, dur: 1600, style: "odometer", decimals: 0, prefix: "", suffix: "", fontSize: 96,
    numEase: "easeOutCubic", fontFamily: "JetBrains Mono", ring: "none", ringC: "#FFB224", ringW: 8,
    bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none", ...over,
  },
});

async function main() {
  /* ---------- 1. modes ---------- */
  console.log("modes — numMode + numberValue");
  check("3 modes registered", NUM_MODES.length === 3 && NUM_MODES.map((m) => m.id).join(",") === "countup,countdown,odometer");
  check("absent mode → countup", numMode({}) === "countup" && numMode({ mode: "nope" }) === "countup");
  check("countdown + odometer recognized", numMode({ mode: "countdown" }) === "countdown" && numMode({ mode: "odometer" }) === "odometer");
  const cd = { from: 0, to: 10, start: 0, dur: 1000, numEase: "linear", mode: "countdown" };
  check("countdown starts at To (10 → 0)", numberValue(cd, 0) === 10);
  check("countdown quarter → 7.5", approx(numberValue(cd, 250), 7.5));
  check("countdown midpoint → 5", approx(numberValue(cd, 500), 5));
  check("countdown ends at From (0) + clamps", numberValue(cd, 1000) === 0 && numberValue(cd, 5000) === 0);
  const cdE = { ...cd, numEase: "easeOutCubic" };
  check("countdown honors easing (easeOutCubic u=0.5 → 1.25)", approx(numberValue(cdE, 500), 10 - 10 * 0.875));
  const cu = { from: 3, to: 42, start: 100, dur: 900, numEase: "easeOutCubic" };
  check("explicit countup === absent mode (zero drift)", [0, 550, 1000, 5000].every((t) => numberValue(cu, t) === numberValue({ ...cu, mode: "countup" }, t)));
  check("legacy From>To countdown unchanged", numberValue({ from: 10, to: 0, start: 0, dur: 1000, numEase: "linear" }, 500) === 5);

  /* ---------- 2. odometer determinism ---------- */
  console.log("odometer mode — deterministic slot roll, settles left → right");
  const odo = { from: 0, to: 1234, start: 0, dur: 2000, decimals: 0, mode: "odometer" };
  check("same props → identical columns", JSON.stringify(numberColumns(odo, 400)) === JSON.stringify(numberColumns(odo, 400)));
  const settled = numberColumns(odo, 99999);
  check("settles on final digits 1·2·3·4", settled.length === 4 && settled.map((c) => c.d).join("") === "1234", JSON.stringify(settled));
  const mid = numberColumns(odo, 1600); /* j=0 settled (t≥1500), j=3 still spinning */
  check("settles LEFT → RIGHT (col 0 done, col 3 rolling)", mid[0].d === 1 && mid[3].d !== 4, JSON.stringify(mid));
  const slotLegacy = { from: 0, to: 1234, start: 0, dur: 2000, decimals: 0, style: "slot" };
  check("mode odometer === legacy style slot machinery", [0, 400, 1600, 99999].every((t) => JSON.stringify(numberColumns(slotLegacy, t)) === JSON.stringify(numberColumns(odo, t))));
  const cdSlot = { from: 0, to: 57, start: 0, dur: 1000, decimals: 0, style: "slot", mode: "countdown" };
  const cdSet = numberColumns(cdSlot, 9999);
  check("countdown slot settles on From (00)", cdSet.length === 2 && cdSet[0].d === 0 && cdSet[1].d === 0, JSON.stringify(cdSet));

  /* ---------- 3. formats ---------- */
  console.log("formatNumber — 5 formats, pure");
  check("compact 12.4K / 3.2M / 2.5B", formatNumber(12360, "compact") === "12.4K" && formatNumber(3200000, "compact") === "3.2M" && formatNumber(2500000000, "compact") === "2.5B");
  check("compact trims .0 + signs + passthrough < 1000", formatNumber(1000, "compact") === "1K" && formatNumber(-2400, "compact") === "-2.4K" && formatNumber(999, "compact") === "999");
  check("currency $1,234 / decimals / grouping", formatNumber(1234, "currency") === "$1,234" && formatNumber(1234.5, "currency", 2) === "$1,234.50" && formatNumber(1000000, "currency") === "$1,000,000" && formatNumber(0, "currency") === "$0");
  check("percent 42% / 42.5%", formatNumber(42, "percent") === "42%" && formatNumber(42.5, "percent", 1) === "42.5%");
  check("time mm:ss from seconds", formatNumber(75, "time") === "01:15" && formatNumber(600, "time") === "10:00" && formatNumber(0, "time") === "00:00" && formatNumber(3599, "time") === "59:59" && formatNumber(3600, "time") === "60:00");
  check("plain = legacy toFixed", formatNumber(3.14159, "plain", 2) === "3.14" && formatNumber(7, "plain", 0) === "7" && formatNumber(7, "plain") === (7).toFixed(0));
  check("unknown format → plain · NaN → 0", formatNumber(5, "bogus") === "5" && formatNumber(NaN, "currency") === "$0");
  check("contrastOn: dark ink on amber, light ink on navy", contrastOn("#FFB224") === "#1A1405" && contrastOn("#141926") === "#F9F9F9");

  /* ---------- 4. bundle the real StageObject for SSR ---------- */
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

  /* ---------- 5. style presets SSR ---------- */
  console.log("\nstyle presets — 6 swatches SSR with expected attributes");
  check("6 presets registered", NUM_STYLE_PRESETS.length === 6, NUM_STYLE_PRESETS.map((p) => p.id).join(","));
  const EXPECT = {
    bold: ["font-weight:800"],
    mono: ["JetBrains Mono", "tabular-nums"],
    outline: ["-webkit-text-stroke:2px #FFB224", "color:transparent"],
    pill: ["border-radius:999px", "background:#FFB224", "color:#1A1405"],
    neon: ["text-shadow:", "color:#FFD984"],
    minimal: ["font-weight:400", "letter-spacing:4px", "color:#939BAD"],
  };
  for (const p of NUM_STYLE_PRESETS) {
    const obj = numObj({ ...NUM_STYLE_RESET, ...p.patch, numStyle: p.id, style: "count", start: 0, dur: 1000 });
    let html = "", err = null;
    try { html = ssr(obj, 2000); } catch (e) { err = e; }
    check(`${p.id}: SSR renders, no NaN`, !err && !html.includes("NaN"), err ? String(err && err.message || err) : "");
    check(`${p.id}: expected attributes`, EXPECT[p.id].every((s) => html.includes(s)), EXPECT[p.id].filter((s) => !html.includes(s)).join(" · "));
  }

  /* ---------- 6. modes + formats SSR ---------- */
  console.log("\nmodes + formats — SSR renders the right text");
  const cdObj = numObj({ mode: "countdown", style: "count", from: 0, to: 10, start: 0, dur: 1000, numEase: "linear" });
  check("countdown SSR: 10 at start, 0 at end", ssr(cdObj, 0).includes(">10<") && ssr(cdObj, 1000).includes(">0<"));
  check("currency SSR: $1,234", ssr(numObj({ format: "currency", from: 0, to: 1234, start: 0, dur: 1000, numEase: "linear" }), 1000).includes("$1,234"));
  check("compact SSR: 12.4K", ssr(numObj({ format: "compact", from: 0, to: 12360, start: 0, dur: 1000, numEase: "linear" }), 1000).includes("12.4K"));
  check("percent SSR: 42%", ssr(numObj({ format: "percent", from: 0, to: 42, start: 0, dur: 1000, numEase: "linear" }), 1000).includes("42%"));
  check("time SSR: 10:00 counts down to 00:00", ssr(numObj({ format: "time", mode: "countdown", from: 0, to: 600, start: 0, dur: 1000, numEase: "linear" }), 0).includes("10:00") && ssr(numObj({ format: "time", mode: "countdown", from: 0, to: 600, start: 0, dur: 1000, numEase: "linear" }), 1000).includes("00:00"));
  const odoHtml = ssr(numObj({ mode: "odometer", from: 0, to: 1234, start: 0, dur: 2000 }), 99999);
  check("odometer SSR: digit wheels render, no NaN", odoHtml.includes("1.08em") && !odoHtml.includes("NaN"));
  const ringCd = numObj({ ring: "ring", mode: "countdown", style: "count", from: 0, to: 10, start: 0, dur: 1000 });
  const offs = (html) => (html.match(/stroke-dashoffset="[0-9.]+"/g) || []).join(",");
  check("countdown ring DEPLETES (full → empty)", ssr(ringCd, 0).includes('stroke-dashoffset="0"') && ssr(ringCd, 1000).includes('stroke-dashoffset="100"'), `t0=[${offs(ssr(ringCd, 0))}] t1=[${offs(ssr(ringCd, 1000))}]`);
  const ringCu = numObj({ ring: "ring", mode: "countup", style: "count", from: 0, to: 10, start: 0, dur: 1000 });
  check("countup ring FILLS (empty → full)", ssr(ringCu, 0).includes('stroke-dashoffset="100"') && ssr(ringCu, 1000).includes('stroke-dashoffset="0"'), `t0=[${offs(ssr(ringCu, 0))}] t1=[${offs(ssr(ringCu, 1000))}]`);

  /* ---------- 7. zero-drift back-compat ---------- */
  console.log("\nback-compat — pre-upgrade layers render unchanged");
  const legacy = numObj(); /* no mode / format / style-preset props */
  const explicit = numObj({ mode: "countup", format: "plain" });
  check("legacy SSR === explicit countup/plain SSR", [0, 500, 2000, 5000].every((t) => ssr(legacy, t) === ssr(explicit, t)));
  const legacyHtml = ssr(legacy, 500);
  check("legacy markup has no preset ink", !legacyHtml.includes("text-shadow") && !legacyHtml.includes("-webkit-text-stroke") && !legacyHtml.includes("999px") && !legacyHtml.includes("tabular-nums"));
  check("legacy odometer columns still roll", legacyHtml.includes("1.08em"));
  const legacyCount = numObj({ style: "count", from: 5, to: 1, numEase: "linear", start: 250, dur: 4000 }); /* countdown template shape */
  check("legacy count style (template) counts 5 → 1", ssr(legacyCount, 250).includes(">5<") && ssr(legacyCount, 4250).includes(">1<"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All number checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
