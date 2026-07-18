/**
 * check-counter.mjs — node proof for the 6 Jitter-grade counter styles
 * (props.style ∈ COUNTER_STYLES — engine/fx.js counterModel):
 *
 *   1. REGISTRY + GUARDS — the 6 style ids round-trip; odometer/count/slot
 *      (and absent/unknown styles) are NOT counter styles (counterStyleOf →
 *      null → legacy render paths, old projects byte-identical).
 *
 *   2. counterEpoch — pure value-epoch detection: t0/t1 bracket the current
 *      display string (10 → 0 countdown changes every 1000ms), null before
 *      the first change / after the last.
 *
 *   3. PURITY — every counterModel is a pure function of (props, time):
 *      same inputs ⇒ byte-identical JSON at every sampled time.
 *
 *   4. NO NaN — all numeric model fields finite across a wide time sweep
 *      (negative, zero, mid-run, past the end) for all 6 styles.
 *
 *   5. IN → HOLD → OUT + per-style behavior probes —
 *      bold:  digit scenes spring in past 1 (easeOutBack overshoot), hold,
 *             accelerate out; 2 wave-echo ghosts of the previous digit
 *             scale up + fade on each change.
 *      blur:  outgoing blurs 0 → 24px while fading, incoming 24 → 0;
 *             settled hold is crisp; zero state before start.
 *      dotted: changed chars slide-swap (old up accelerating, new from
 *             below in the accent tone); conic pie sweep fills per unit time.
 *      poster: linear count, rule draw-on, easeOutBack ONLY on the scene
 *             entrance, opacity 0 at both bounds.
 *      pixel: per-digit pop-in stagger; seeded 2-3 slice color-split ghosts
 *             on digit change (deterministic), none during the hold.
 *      progressring: expo-out count, arc = p × 354°, dot trails the tip,
 *             flash accents the snap/reset — state at t ≥ end ≡ t ≤ start.
 *
 *   6. SSR — every style renders through the REAL StageObject (bundled with
 *      the project's own Vite — the same component export/frameRenderer.js
 *      uses, so the export path flows automatically) with its data-cs
 *      markers, plus back-compat guards (legacy styles carry no data-cs;
 *      an explicit cdStyle still wins over a counter style).
 *
 * Run:  node check-counter.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COUNTER_STYLES, counterStyleOf, counterModel, counterEpoch, counterText, PIXEL_FONT } from "./src/engine/fx.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".counter-check-tmp");

let passed = 0, failed = 0;
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
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

/* number layer props factory — mirrors makeObject("number") defaults */
const numObj = (over = {}) => ({
  id: "ob930", type: "number", name: "Counter", tracks: {}, locked: false, hidden: false,
  props: {
    x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0,
    from: 0, to: 100, start: 200, dur: 1600, style: "odometer", decimals: 0, prefix: "", suffix: "", fontSize: 96,
    numEase: "easeOutCubic", fontFamily: "JetBrains Mono", ring: "none", ringC: "#FFB224", ringW: 8,
    bg: "", pad: 16, borderC: "#FFB224", borderW: 0, radius: 14, boxFx: "none", ...over,
  },
});
/* slow countdown 10 → 0 over 10s, linear — display changes every 1000ms at
   t = 500, 1500, … 9500 (the .5-crossings), so every style gets clean
   in / hold / out windows to probe */
const cd10 = (over = {}) => ({ mode: "countdown", from: 0, to: 10, start: 0, dur: 10000, numEase: "linear", format: "plain", decimals: 0, prefix: "", suffix: "", ...over });
/* the default probe props per style (model-level; start 0 keeps epochs readable) */
const STYLE_PROPS = {
  bold: cd10({ style: "bold" }),
  blur: cd10({ style: "blur" }),
  dotted: cd10({ style: "dotted" }),
  poster: { from: 20, to: 80, start: 200, dur: 3600, numEase: "linear", format: "plain", decimals: 0, prefix: "", suffix: "count", style: "poster" },
  pixel: cd10({ style: "pixel" }),
  progressring: { from: 0, to: 99, start: 200, dur: 3000, numEase: "linear", format: "plain", decimals: 0, prefix: "", suffix: "%", style: "progressring" },
};
const SWEEP = [-500, -1, 0, 130, 500, 1560, 2500, 4999, 5000, 7300, 9999, 10000, 10001, 12500, 1e6];

async function main() {
  /* ---------- 1. registry + guards ---------- */
  console.log("registry + guards");
  check("6 counter styles registered", COUNTER_STYLES.length === 6 && COUNTER_STYLES.map((s) => s.id).join(",") === "bold,blur,dotted,poster,pixel,progressring", COUNTER_STYLES.map((s) => s.id).join(","));
  check("each style id round-trips", COUNTER_STYLES.every((s) => counterStyleOf({ style: s.id }) === s.id));
  check("legacy styles are NOT counter styles", counterStyleOf({ style: "odometer" }) === null && counterStyleOf({ style: "count" }) === null && counterStyleOf({ style: "slot" }) === null);
  check("absent / unknown style → null", counterStyleOf({}) === null && counterStyleOf({ style: "nope" }) === null && counterStyleOf(null) === null);
  check("counterModel null for legacy styles", counterModel({ style: "odometer", from: 0, to: 5, start: 0, dur: 1000 }, 500) === null && counterModel({}, 500) === null);
  check("pixel font covers all 10 digits", "0123456789".split("").every((d) => Array.isArray(PIXEL_FONT[d]) && PIXEL_FONT[d].length === 5 && PIXEL_FONT[d].every((r) => /^[01]{3}$/.test(r))));

  /* ---------- 2. counterText + counterEpoch ---------- */
  console.log("\ncounterText + counterEpoch — pure value epochs");
  const P0 = cd10();
  check("counterText counts down (10 → 8)", counterText(P0, 0) === "10" && counterText(P0, 2500) === "8" && counterText(P0, 99999) === "0");
  check("counterText carries affixes", counterText(cd10({ prefix: "T-", suffix: " left" }), 2500) === "T-8 left");
  const ep = counterEpoch(P0, 2500);
  check("epoch brackets the change (t0 ≈ 1500, t1 ≈ 2500)", approx(ep.t0, 1500, 0.5) && approx(ep.t1, 2500, 0.5), `t0=${ep.t0} t1=${ep.t1}`);
  check("epoch strings (now 8, prev 9)", ep.txt === "8" && ep.prevTxt === "9");
  const epFirst = counterEpoch(P0, 250);
  check("before the first change: t0 null, t1 ≈ 500", epFirst.t0 === null && approx(epFirst.t1, 500, 0.5), `t0=${epFirst.t0} t1=${epFirst.t1}`);
  const epLast = counterEpoch(P0, 12000);
  check("after the last change: t0 ≈ 9500, t1 null", approx(epLast.t0, 9500, 0.5) && epLast.t1 === null, `t0=${epLast.t0} t1=${epLast.t1}`);
  check("epoch deterministic", JSON.stringify(counterEpoch(P0, 3456)) === JSON.stringify(counterEpoch(P0, 3456)));

  /* ---------- 3. purity + no NaN (all 6 styles) ---------- */
  console.log("\npurity + finiteness — pure f(props, time), no NaN");
  for (const s of COUNTER_STYLES) {
    const P = STYLE_PROPS[s.id];
    check(`${s.id}: pure — same props+time ⇒ identical model`, SWEEP.every((t) => JSON.stringify(counterModel(P, t)) === JSON.stringify(counterModel(P, t))));
    check(`${s.id}: all numeric fields finite across the sweep`, SWEEP.every((t) => allFinite(counterModel(P, t))));
  }

  /* ---------- 4a. bold — poster scenes + wave echoes ---------- */
  console.log("\nbold — digit scenes spring in / hold / accelerate out + echo ghosts");
  const B = STYLE_PROPS.bold;
  const bIn = counterModel(B, 1530); /* 30ms into the scene */
  check("bold IN: digit springs in (scale < 1, opacity < 1)", bIn.scale > 0 && bIn.scale < 1 && bIn.op < 1, JSON.stringify(bIn));
  const bOver = counterModel(B, 1650); /* easeOutBack peak zone */
  check("bold IN: overshoot past 1 (easeOutBack ≈ cubic-bezier(.34,1.56,.64,1))", bOver.scale > 1 && bOver.op === 1, `scale=${bOver.scale}`);
  const bHold = counterModel(B, 2300);
  check("bold HOLD: settled (scale 1, op 1, echoes faded)", bHold.scale === 1 && bHold.op === 1 && bHold.echoes.length === 0, JSON.stringify(bHold));
  const o2400 = counterModel(B, 2400).op, o2450 = counterModel(B, 2450).op, o2499 = counterModel(B, 2499).op;
  check("bold OUT: accelerates into the next change (op → 0)", o2400 > o2450 && o2450 > o2499 && o2499 < 0.05, `${o2400} → ${o2450} → ${o2499}`);
  const bEcho = counterModel(B, 1560);
  check("bold ECHO: 2 wave-echo ghosts of the previous digit", bEcho.echoes.length === 2 && bEcho.echoes.every((e) => e.txt === "9"), JSON.stringify(bEcho.echoes));
  check("bold ECHO: ghosts scale up + fade behind (fill then accent layer)", bEcho.echoes[0].scale > 1 && bEcho.echoes[0].op > 0 && bEcho.echoes[1].scale > bEcho.echoes[0].scale && bEcho.echoes[0].accent === false && bEcho.echoes[1].accent === true);
  check("bold zero state before start (scale 0.3, op 0)", (() => { const m = counterModel(cd10({ style: "bold", start: 200 }), 0); return m.scale === 0.3 && m.op === 0; })());
  check("bold holds the final digit after the run ends", (() => { const m = counterModel(B, 12000); return m.txt === "0" && m.scale === 1 && m.op === 1; })());

  /* ---------- 4b. blur — 0→24px outgoing, 24→0 incoming ---------- */
  console.log("\nblur — transitions ride the blur ramp");
  const L = STYLE_PROPS.blur;
  const lMid = counterModel(L, 1630); /* mid-crossfade (iu = 0.5) */
  check("blur X-FADE: outgoing ≈ 12px fading, incoming ≈ 12px arriving", lMid.out && lMid.out.blur > 8 && lMid.out.blur < 16 && lMid.in.blur > 8 && lMid.in.blur < 16 && approx(lMid.out.op, 0.5, 0.03) && approx(lMid.in.op, 0.5, 0.03), JSON.stringify(lMid));
  check("blur ramp: outgoing 0 → 24px", counterModel(L, 1550).out.blur < counterModel(L, 1650).out.blur && counterModel(L, 1510).out.blur < 8);
  check("blur ramp: incoming 24 → 0", counterModel(L, 1510).in.blur > 16 && counterModel(L, 1700).in.blur < 8);
  check("blur ramps capped at 24px", SWEEP.every((t) => { const m = counterModel(L, t); return m.in.blur <= 24 && (!m.out || m.out.blur <= 24); }));
  const lHold = counterModel(L, 2300);
  check("blur HOLD: crisp settled digit (no out layer, blur 0)", lHold.out === null && lHold.in.blur === 0 && lHold.in.op === 1);
  check("blur zero state before start (blur 24, op 0)", (() => { const m = counterModel(cd10({ style: "blur", start: 200 }), 0); return m.in.blur === 24 && m.in.op === 0 && m.out === null; })());

  /* ---------- 4c. dotted — vertical slide-swap + conic pie ---------- */
  console.log("\ndotted — slide-swap digits + dotted pie sweep");
  const D = STYLE_PROPS.dotted;
  const dMid = counterModel(D, 1620); /* su ≈ 0.5 right after the change */
  check("dotted SWAP: changed char flagged with the previous glyph", dMid.chars.length === 1 && dMid.chars[0].changed && dMid.chars[0].prevCh === "9" && dMid.chars[0].ch === "8", JSON.stringify(dMid.chars));
  check("dotted SWAP: outgoing slides UP, incoming from BELOW, accent mix ½", dMid.chars[0].outDy < 0 && dMid.chars[0].inDy > 0 && approx(dMid.chars[0].mix, 0.5, 0.03));
  check("dotted SWAP: outgoing accelerates up (easeInCubic)", counterModel(D, 1550).chars[0].outDy > counterModel(D, 1650).chars[0].outDy);
  check("dotted PIE: conic sweep fills per unit time (0 → 359.9°)", approx(counterModel(D, 0).pie, 0) && counterModel(D, 3000).pie > counterModel(D, 1600).pie && counterModel(D, 1600).pie > 0 && approx(counterModel(D, 10000).pie, 359.9, 0.01));
  check("dotted HOLD: swap settled (su 1), initial scene slides all chars in", counterModel(D, 2300).chars[0].su === 1 && counterModel(cd10({ style: "dotted", start: 200 }), 300).chars.every((c) => c.changed && c.prevCh === null));

  /* ---------- 4d. poster — Swiss counter ---------- */
  console.log("\nposter — linear count, rule draw-on, easeOutBack entrance only");
  const S = STYLE_PROPS.poster;
  check("poster IN: opacity 0 before start, springs past 1 on the entrance", counterModel(S, 0).op === 0 && Math.max(...[340, 360, 400, 440].map((t) => counterModel(S, t).scale)) > 1, `maxScale=${Math.max(...[340, 360, 400, 440].map((t) => counterModel(S, t).scale))}`);
  check("poster COUNT: linear (20 at start, 50 at the midpoint)", counterModel(S, 200).txt === "20" && counterModel(S, 2000).txt === "50");
  check("poster RULES: draw on over the first 38%", counterModel(S, 400).rule < counterModel(S, 1500).rule && counterModel(S, 2000).rule === 1);
  check("poster SWISS: small-caps caption + zero-padded index marker", counterModel(S, 2000).caption === "COUNT" && counterModel(S, 2000).idx === "N.50");
  const sHold = counterModel(S, 2000);
  check("poster HOLD: settled (op 1, scale 1, no drift)", sHold.op === 1 && sHold.scale === 1 && sHold.dy === 0);
  const sO1 = counterModel(S, 3400).op, sO2 = counterModel(S, 3700).op, sO3 = counterModel(S, 3800).op;
  check("poster OUT: accelerates off, opacity 0 at the end (zero states at both bounds)", sO1 > sO2 && sO2 > sO3 && sO3 === 0 && counterModel(S, 0).op === 0, `${sO1} → ${sO2} → ${sO3}`);
  check("poster caption falls back to COUNT without a suffix", counterModel({ ...S, suffix: "" }, 2000).caption === "COUNT");

  /* ---------- 4e. pixel — rect digits + seeded glitch slices ---------- */
  console.log("\npixel — pop-in stagger + deterministic glitch slices");
  const X = STYLE_PROPS.pixel;
  const stagger = counterModel({ from: 20, to: 80, start: 200, dur: 10000, numEase: "linear", format: "plain", decimals: 0, prefix: "", suffix: "", style: "pixel" }, 260);
  check("pixel IN: per-digit pop-in stagger (left digit ahead)", stagger.chars.length === 2 && stagger.chars[0].pop > stagger.chars[1].pop && stagger.chars[1].pop < 1, JSON.stringify(stagger.chars.map((c) => c.pop)));
  check("pixel HOLD: settled digits (pop 1), no ghosts mid-hold", counterModel(X, 2300).chars.every((c) => c.pop === 1) && counterModel(X, 2300).ghosts.length === 0);
  check("pixel zero state before start (all pops 0)", counterModel({ ...X, start: 200 }, 0).chars.every((c) => c.pop === 0));
  const epochs = [500, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 9500].map((t0) => counterModel(X, t0 + 30).ghosts);
  const on = epochs.filter((g) => g.length >= 2);
  check("pixel GLITCH: occasional — fires on some changes (2-3 slices), skips others", on.length >= 1 && epochs.some((g) => g.length === 0) && on.every((g) => g.length <= 3), epochs.map((g) => g.length).join(","));
  check("pixel GLITCH: deterministic at the same time", JSON.stringify(counterModel(X, 1560).ghosts) === JSON.stringify(counterModel(X, 1560).ghosts));
  const g0 = on[0] || [];
  check("pixel GLITCH: slice offsets ±12px, clip bands in range, color-split palette", g0.every((g) => Math.abs(g.dx) <= 12 && g.top >= 0 && g.top < 100 && g.bot >= 0 && g.bot < 100 && ["#FFB224", "#5B8CFF", "#FF6B6B"].includes(g.color) && g.op >= 0.5 && g.op <= 0.75), JSON.stringify(g0));
  check("pixel GLITCH: window is 200ms after a change", (() => { const t0 = 500 + epochs.findIndex((g) => g.length >= 2) * 1000; return t0 >= 500 && counterModel(X, t0 + 60 + 200).ghosts.length === 0; })());

  /* ---------- 4f. progressring — expo count + arc + snap/reset ---------- */
  console.log("\nprogressring — expo-out 0 → 99, synced arc, snap/reset at the loop point");
  const R = STYLE_PROPS.progressring;
  check("pring IN: p 0 at start (arc 0, dot at the top, fading in)", (() => { const m = counterModel(R, 200); return m.p === 0 && m.arc === 0 && m.dotA === -90 && m.op === 0; })());
  const rMid = counterModel(R, 1700); /* u = 0.5 → expo 0.969 */
  check("pring COUNT: expo-out (96 at the midpoint), txt 96", approx(rMid.p, 0.969, 0.001) && rMid.txt === "96", `p=${rMid.p} txt=${rMid.txt}`);
  check("pring ARC: sweeps p × 354° from the top", approx(rMid.arc / 354, rMid.p, 0.001) && approx(rMid.dotA, -90 + rMid.arc, 0.01));
  check("pring ARC: monotonic rise, never past 354°", counterModel(R, 700).p < counterModel(R, 1200).p && counterModel(R, 1200).p < counterModel(R, 1700).p && SWEEP.every((t) => counterModel(R, t).arc <= 354.001 && counterModel(R, t).arc >= 0));
  check("pring SNAP: flash accents the loop point (last 180ms)", counterModel(R, 3080).flash > 0 && counterModel(R, 1700).flash === 0);
  const rEnd = counterModel(R, 3200), rStart = counterModel(R, 200);
  check("pring RESET: state at t ≥ end ≡ state at t ≤ start (seamless loop point)", rEnd.p === 0 && rEnd.arc === 0 && rEnd.dotA === rStart.dotA && rEnd.flash === rStart.flash && rEnd.txt === rStart.txt, JSON.stringify(rEnd));
  check("pring holds the reset (0%) past the end", counterModel(R, 4000).p === 0 && counterModel(R, 4000).txt === "0");
  check("pring honors from/to (50 → 150 sweeps the same arc)", approx(counterModel({ ...R, from: 50, to: 150 }, 1700).p, counterModel(R, 1700).p) && counterModel({ ...R, from: 50, to: 150 }, 1700).txt === "147");

  /* ---------- 5. bundle the real StageObject for SSR ---------- */
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
  const ssr = (props, time) => renderToStaticMarkup(h(StageObject, { obj: numObj(props), time, stage, selected: false, interactive: false }));

  /* ---------- 6. per-style SSR: non-empty, markers, no NaN ---------- */
  console.log("\nSSR — every counter style through the shared render point (export-safe)");
  const SSR_TIMES = { bold: [1560, 2300], blur: [1630, 2300], dotted: [1620, 2300], poster: [2000, 3400], pixel: [1560, 2300], progressring: [1700, 3300] };
  for (const s of COUNTER_STYLES) {
    const times = SSR_TIMES[s.id];
    let err = null, htmls = [];
    try { htmls = times.map((t) => ssr(STYLE_PROPS[s.id], t)); } catch (e) { err = e; }
    check(`${s.id}: SSR renders at ${times.join(" + ")}, no throw`, !err, err ? String(err && err.message || err) : "");
    check(`${s.id}: non-empty markup, data-cs marker, no NaN`, !err && htmls.every((x) => x.length > 300 && x.includes(`data-cs="${s.id}"`) && !x.includes("NaN")), err ? "" : htmls.map((x) => x.length).join(","));
  }

  const bHtml = ssr(STYLE_PROPS.bold, 1560);
  check("bold SSR: 2 echo layers behind the scaled digit", (bHtml.match(/data-cs="echo"/g) || []).length === 2 && /data-cs="digit"[^>]*scale\(0\.[0-9]/.test(bHtml));
  const bHoldHtml = ssr(STYLE_PROPS.bold, 2300);
  check("bold SSR hold: no echoes, scale(1)", !bHoldHtml.includes('data-cs="echo"') && bHoldHtml.includes("scale(1)"));

  const lHtml = ssr(STYLE_PROPS.blur, 1630);
  const lBlurs = (lHtml.match(/blur\(([0-9.]+)px\)/g) || []).map((s) => parseFloat(s.slice(5)));
  check("blur SSR: out + in layers with a real blur() ramp", lHtml.includes('data-cs="out"') && lBlurs.length === 2 && lBlurs.every((b) => b > 8 && b < 16), lBlurs.join(","));
  const lHoldHtml = ssr(STYLE_PROPS.blur, 2300);
  check("blur SSR hold: no out layer, no blur filter", !lHoldHtml.includes('data-cs="out"') && !lHoldHtml.includes("blur("));

  const dHtml = ssr(STYLE_PROPS.dotted, 1620);
  check("dotted SSR: dotted circle + conic pie + swap mask", dHtml.includes('data-cs="dots"') && dHtml.includes('data-cs="pie"') && dHtml.includes('data-cs="swap"'));
  const dHoldHtml = ssr(STYLE_PROPS.dotted, 2300);
  check("dotted SSR hold: ring stays, swap mask settled away", dHoldHtml.includes('data-cs="dots"') && !dHoldHtml.includes('data-cs="swap"'));

  const ruleW = (html) => parseFloat((html.match(/data-cs="rule"[^>]*width:([0-9.]+)%/) || [])[1]);
  check("poster SSR: rule draws on (width grows), caption + index render", ruleW(ssr(STYLE_PROPS.poster, 400)) < ruleW(ssr(STYLE_PROPS.poster, 1500)) && ssr(STYLE_PROPS.poster, 2000).includes("COUNT") && ssr(STYLE_PROPS.poster, 2000).includes("N.50"));
  check("poster SSR: tabular huge numeral, opacity 0 at both bounds", ssr(STYLE_PROPS.poster, 2000).includes("tabular-nums") && ssr(STYLE_PROPS.poster, 0).includes("opacity:0") && ssr(STYLE_PROPS.poster, 3800).includes("opacity:0"));

  const xHtml = ssr(STYLE_PROPS.pixel, 1560);
  const xDigits = counterModel(STYLE_PROPS.pixel, 1560).chars.filter((c) => c.bmp).length;
  check("pixel SSR: one rect-composed svg per digit", (xHtml.match(/data-cs="px"/g) || []).length === xDigits && xHtml.includes("crispEdges"), `${(xHtml.match(/data-cs="px"/g) || []).length} vs ${xDigits}`);
  const xGlitchT = 500 + epochs.findIndex((g) => g.length >= 2) * 1000 + 60;
  const xGhosts = xGlitchT >= 560 ? (ssr(STYLE_PROPS.pixel, xGlitchT).match(/data-cs="ghost"/g) || []).length : 0;
  check("pixel SSR: color-split slice ghosts on a glitching change (clip-path inset bands)", xGhosts >= 2 && ssr(STYLE_PROPS.pixel, xGlitchT).includes("clip-path:inset("), `t=${xGlitchT} ghosts=${xGhosts}`);
  check("pixel SSR hold: no ghosts", !ssr(STYLE_PROPS.pixel, 2300).includes('data-cs="ghost"'));

  const rHtml0 = ssr(STYLE_PROPS.progressring, 200), rHtmlMid = ssr(STYLE_PROPS.progressring, 1700), rHtmlEnd = ssr(STYLE_PROPS.progressring, 3300);
  check("pring SSR: arc grows in from 0, glow dot always present", !rHtml0.includes('data-cs="arc"') && rHtmlMid.includes('data-cs="arc"') && rHtml0.includes('data-cs="dot"') && rHtmlMid.includes('data-cs="dot"'));
  check("pring SSR: shows the count + % suffix (96%), resets to 0% past the end", rHtmlMid.includes(">96<") && rHtmlMid.includes("%") && rHtmlEnd.includes(">0<") && !rHtmlEnd.includes(">96<"));
  check("pring SSR: flash ring accents the snap window", ssr(STYLE_PROPS.progressring, 3080).includes('data-cs="flash"') && !rHtmlMid.includes('data-cs="flash"'));

  /* ---------- 7. back-compat ---------- */
  console.log("\nback-compat — legacy number layers carry no counter markup");
  const legacy = numObj(); /* pre-upgrade layer shape */
  check("legacy odometer: no data-cs, digit wheels still roll", !ssr(legacy.props, 500).includes("data-cs") && ssr(legacy.props, 500).includes("1.08em"));
  check("legacy count: no data-cs, plain text path", !ssr({ ...legacy.props, style: "count" }, 500).includes("data-cs"));
  const cdFlip = ssr({ mode: "countdown", cdStyle: "flip", style: "bold", from: 0, to: 10, start: 0, dur: 1000 }, 500);
  check("explicit cdStyle still wins over a counter style", cdFlip.includes('data-cdstyle="flip"') && !cdFlip.includes('data-cs="bold"'));
  const csNoMode = ssr({ style: "bold", from: 0, to: 10, start: 0, dur: 10000, numEase: "linear" }, 1560);
  check("counter styles also work in plain count-up mode", csNoMode.includes('data-cs="bold"') && !csNoMode.includes("NaN"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All counter style checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
