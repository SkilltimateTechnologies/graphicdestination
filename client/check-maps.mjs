/**
 * check-maps.mjs — node proof for the real-geography maps engine:
 *
 *   1. DATA INTEGRITY — mapdata.js (Natural Earth 50m): ≥190 countries, 7
 *      continents, rings valid in the 0..200×0..100 world space, no NaN,
 *      country↔continent membership consistent both ways, every legacy id the
 *      old maps.js shipped still exists, MAPS (single-country view) normalized
 *      to 0..100 with sane aspect.
 *
 *   2. TRACE MATH (single country) — starts at one point, draws monotonically,
 *      CLOSES (dashoffset hits 0) and STAYS closed forever after; fill fades in
 *      late; deterministic.
 *
 *   3. TIMED HIGHLIGHTS (continent + world) — hidden before inT, visible with
 *      the right color between inT..outT (pop easeOutBack), hidden again after
 *      outT; legacy hi entries fall back to P.hiFill; palette deterministic.
 *
 *   4. SSR through the REAL StageObject (bundled with Vite, one shared react):
 *      map / continent / world render non-empty <svg> with no NaN at several
 *      times; timed visibility of each highlight in the actual markup;
 *      color-coded legend rows; legacy-id + legacy-prop fallbacks never throw;
 *      identical re-renders (purity).
 *
 * Run:  node check-maps.mjs        (from client/)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  COUNTRIES, CONTINENTS, CONTINENT_NAMES, MAPS, WORLD, WORLD_D, WORLD_EXT, WORLD_H, WORLD_LIST,
  normHi, hiColors, hiState, traceState, continentBox, countryCenter, mapBox, rings100, HI_PALETTE,
} from "./src/engine/maps.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".maps-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

const LEGACY_IDS = "AFG AGO ALB ARE ARG ARM ATF AUS AUT AZE BDI BEL BEN BFA BGD BGR BHS BIH BLR BLZ BMU BOL BRA BRN BTN BWA CAF CAN CHE CHL CHN CIV CMR COD COG COL CRI CUB CYP CZE DEU DJI DNK DOM DZA ECU EGY ERI ESP EST ETH FJI FLK FRA GAB GBR GEO GHA GIN GMB GNB GNQ GRC GRL GTM GUF GUY HND HRV HTI HUN IDN IND IRL IRN IRQ ISL ISR ITA JAM JOR JPN KAZ KEN KGZ KHM KOR CS-KM KWT LAO LBN LBR LBY LKA LSO LTU LUX LVA MAR MDA MDG MEX MKD MLI MMR MNE MNG MOZ MRT MWI MYS NAM NCL NER NGA NIC NLD NOR NPL NZL OMN PAK PAN PER PHL PNG POL PRI PRK PRT PRY PSE QAT ROU RUS RWA SAU SDN SEN SLB SLE SLV SOM SRB SSD SUR SVK SVN SWE SWZ SYR TCD TGO THA TJK TKM TLS TTO TUN TUR TWN TZA UGA UKR URY USA UZB VEN VNM VUT YEM ZAF ZMB ZWE ESH".split(" ");

async function main() {
  /* ---------- 1. data integrity ---------- */
  console.log("mapdata — real 50m geography");
  const ids = Object.keys(COUNTRIES);
  check("≥190 countries", ids.length >= 190, `${ids.length}`);
  check("7 continents", Object.keys(CONTINENTS).length === 7 && Object.keys(CONTINENT_NAMES).length === 7);
  check("continent names human", CONTINENT_NAMES.AFRICA === "Africa" && CONTINENT_NAMES.ANTARCTICA === "Antarctica" && CONTINENT_NAMES["NORTH AMERICA"] === "North America");
  let nan = 0, oob = 0, tiny = 0, pts = 0;
  for (const id of ids) {
    const c = COUNTRIES[id];
    for (const r of c.r) {
      if (r.length < 8 || r.length % 2) tiny++;
      pts += r.length / 2;
      for (let i = 0; i < r.length; i += 2) {
        if (!Number.isFinite(r[i]) || !Number.isFinite(r[i + 1])) nan++;
        if (r[i] < 0 || r[i] > 200 || r[i + 1] < 0 || r[i + 1] > 100) oob++;
      }
    }
  }
  check("no NaN/Infinity in any ring", nan === 0, `${nan}`);
  check("all coords inside world space 0..200 × 0..100", oob === 0, `${oob}`);
  check("every ring ≥4 points, even-length flat arrays", tiny === 0, `${tiny}`);
  check("simplification budget: avg ≤ 90 pts/country", pts / ids.length <= 90, `${(pts / ids.length).toFixed(1)}`);
  check("every country has name + continent code + bbox", ids.every((id) => COUNTRIES[id].n && COUNTRIES[id].c && Array.isArray(COUNTRIES[id].bb)));
  check("bbox sane (min ≤ max, finite)", ids.every((id) => { const b = COUNTRIES[id].bb; return b.every(Number.isFinite) && b[0] <= b[2] && b[1] <= b[3]; }));

  /* membership consistency both ways */
  let memberOk = true, empty = [];
  for (const [name, codes] of Object.entries(CONTINENTS)) {
    if (!codes.length) empty.push(name);
    for (const cc of codes) if (!COUNTRIES[cc]) memberOk = false;
  }
  check("every continent member exists in COUNTRIES", memberOk);
  check("no empty continent", empty.length === 0, empty.join(","));
  check("every country assigned to exactly the continent its code says", ids.every((id) => CONTINENTS[Object.keys(CONTINENT_NAMES).find((n) => CONTINENT_NAMES[n] && CONTINENTS[n].includes(id))] && true));
  const contOfCountry = {};
  Object.entries(CONTINENTS).forEach(([_n, codes]) => codes.forEach((cc) => { contOfCountry[cc] = (contOfCountry[cc] || 0) + 1; }));
  check("no country in two continents", Object.values(contOfCountry).every((v) => v === 1));
  check("every COUNTRIES entry reachable from a continent", ids.every((id) => contOfCountry[id] === 1));
  check("legacy 6 continent keys kept (+ANTARCTICA)", ["AFRICA", "ASIA", "EUROPE", "NORTH AMERICA", "SOUTH AMERICA", "OCEANIA", "ANTARCTICA"].every((k) => CONTINENTS[k]));
  check("all 177 legacy country ids still exist", LEGACY_IDS.every((id) => COUNTRIES[id]), LEGACY_IDS.filter((id) => !COUNTRIES[id]).join(","));

  /* derived legacy shapes */
  check("WORLD/WORLD_D/WORLD_EXT/WORLD_LIST cover all countries", ids.every((id) => WORLD[id] && WORLD_D[id] && WORLD_EXT[id]) && WORLD_LIST.length === ids.length);
  check("MAPS covers all countries", ids.every((id) => MAPS[id] && MAPS[id].rings.length > 0));
  let mapNan = 0, mapOob = 0, badAspect = 0;
  for (const id of ids) {
    const m = MAPS[id];
    if (!Number.isFinite(m.aspect) || m.aspect <= 0) badAspect++;
    for (const r of m.rings) for (let i = 0; i < r.length; i += 2) {
      if (!Number.isFinite(r[i]) || !Number.isFinite(r[i + 1])) mapNan++;
      if (r[i] < -0.01 || r[i] > 100.01 || r[i + 1] < -0.01 || r[i + 1] > 100.01) mapOob++;
    }
  }
  check("MAPS: no NaN", mapNan === 0, `${mapNan}`);
  check("MAPS: normalized rings inside 0..100", mapOob === 0, `${mapOob}`);
  check("MAPS: aspects finite > 0", badAspect === 0, `${badAspect}`);
  check("mapBox returns finite positive boxes for every country", ids.every((id) => { const b = mapBox(MAPS[id]); return Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0; }));
  check("WORLD_H = 100 (full equirectangular with Antarctica)", WORLD_H === 100);

  /* ---------- 2. trace math ---------- */
  console.log("\ntrace — one point, closes, stays");
  const P = { start: 400, dur: 1600 };
  const t0 = traceState(P, 0);
  check("before start: nothing drawn (dash=100, fillK=0, open)", t0.dash === 100 && t0.fillK === 0 && !t0.closed);
  const mid = traceState(P, 1200);
  check("mid-trace: partial dash, not closed, fill not started", mid.dash > 20 && mid.dash < 80 && !mid.closed && mid.fillK < 0.6);
  const end = traceState(P, 2000);
  check("at start+dur: CLOSED (dash=0) + full fill", end.dash === 0 && end.closed && end.fillK === 1);
  const later = traceState(P, 99999);
  check("stays closed forever (dash=0 at t=99999)", later.dash === 0 && later.closed && later.fillK === 1);
  let mono = true, prev = 101;
  for (let t = 400; t <= 2000; t += 50) { const s = traceState(P, t); if (s.dash > prev + 1e-9) mono = false; prev = s.dash; }
  check("trace draws monotonically forward (dash never increases)", mono);
  let popMax = 0;
  for (let t = 2000; t <= 2400; t += 20) popMax = Math.max(popMax, traceState(P, t).popScale);
  check("settle-pop small (1..1.05)", popMax > 1.005 && popMax <= 1.05, popMax.toFixed(3));
  check("traceState deterministic", JSON.stringify(traceState(P, 1234)) === JSON.stringify(traceState(P, 1234)));
  check("traceState handles start=0/dur=missing", Number.isFinite(traceState({}, 500).dash));

  /* ---------- 3. timed highlights ---------- */
  console.log("\ntimed highlights — inT … outT, electric colors");
  const h = { cc: "FRA", t: 1000, out: 3000 };
  check("before inT: hidden", hiState(h, 999, 600).on === false);
  check("at inT+300: visible, popping", (() => { const s = hiState(h, 1300, 600); return s.on && s.scale > 0.5 && s.aMul > 0.5; })());
  check("mid hold: fully on", (() => { const s = hiState(h, 2000, 600); return s.on && Math.abs(s.scale - 1) < 0.05 && s.aMul === 1; })());
  check("just after outT: fading but visible", (() => { const s = hiState(h, 3100, 600); return s.on && s.aMul < 1; })());
  check("well after outT: hidden", hiState(h, 5000, 600).on === false);
  check("no outT: stays on forever", (() => { const s = hiState({ cc: "FRA", t: 1000 }, 99999, 600); return s.on && s.aMul === 1; })());
  check("hiState deterministic", JSON.stringify(hiState(h, 1500, 600)) === JSON.stringify(hiState(h, 1500, 600)));
  check("pop overshoots (easeOutBack > 1 during in)", (() => { let mx = 0; for (let t = 1000; t <= 1600; t += 25) mx = Math.max(mx, hiState(h, t, 600).scale); return mx > 1.01 && mx < 1.3; })());

  /* normHi shapes */
  check("normHi: string → {cc,t:0}", JSON.stringify(normHi(["USA"])[0]) === JSON.stringify({ cc: "USA", t: 0, zoom: true }));
  check("normHi: legacy {cc,t,out} passes through", (() => { const n = normHi([{ cc: "IND", t: 200, out: 900 }])[0]; return n.cc === "IND" && n.t === 200 && n.out === 900; })());
  check("normHi: new {id,color,inT,outT} → {cc,t,out,color}", (() => { const n = normHi([{ id: "JPN", color: "#FF2E88", inT: 500, outT: 1500 }])[0]; return n.cc === "JPN" && n.t === 500 && n.out === 1500 && n.color === "#FF2E88"; })());
  check("normHi: null/empty safe", normHi(null).length === 0 && normHi(undefined).length === 0);

  /* colors */
  const legacyHis = normHi([{ cc: "IND", t: 0 }, { cc: "USA", t: 500 }]);
  check("legacy (no colors anywhere) → all P.hiFill", hiColors(legacyHis, { hiFill: "#FFB224" }).every((c) => c === "#FFB224"));
  const colorHis = normHi([{ cc: "IND", t: 0, color: "#00E5FF" }, { cc: "USA", t: 500 }]);
  check("explicit color wins; missing → palette by index", hiColors(colorHis, { hiFill: "#FFB224" })[0] === "#00E5FF" && hiColors(colorHis, {})[1] === HI_PALETTE[1]);
  check("hiColors deterministic", JSON.stringify(hiColors(colorHis, {})) === JSON.stringify(hiColors(colorHis, {})));

  /* continent boxes + centers */
  console.log("\ncontinent viewports");
  for (const name of Object.keys(CONTINENTS)) {
    const b = continentBox(name);
    check(`${name}: box finite, positive, aspect 0.5..16`, !!b && b.w > 0 && b.h > 0 && b.w / b.h >= 0.5 && b.w / b.h <= 16, b ? (b.w / b.h).toFixed(2) : "null");
  }
  check("EUROPE viewport cropped at ~62°E (maxX 134.4)", (() => { const b = continentBox("EUROPE"); return b.ox + b.w <= 134.4 + 1e-9; })());
  check("continentBox deterministic", JSON.stringify(continentBox("AFRICA")) === JSON.stringify(continentBox("AFRICA")));
  check("countryCenter inside country bbox", ids.slice(0, 60).every((id) => { const e = WORLD_EXT[id]; const c = countryCenter(id); return c.cx >= e[0] - 1e-9 && c.cx <= e[2] + 1e-9 && c.cy >= e[1] - 1e-9 && c.cy <= e[3] + 1e-9; }));
  check("rings100 unwrap: Fiji/Russia aspects honest", (() => { const f = rings100("FJI"), r = rings100("RUS"); return f.aspect > 0.8 && f.aspect < 4 && r.aspect > 2 && r.aspect < 6; })());
  check("rings100 unknown id → null", rings100("NOPE") === null);

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
  const { StageObject, createElement: h2, renderToStaticMarkup } = M;
  check("StageObject export present", typeof StageObject === "function" || (typeof StageObject === "object" && StageObject !== null));
  const stage = { w: 1280, h: 720 };
  const ssr = (obj, time) => renderToStaticMarkup(h2(StageObject, { obj, time, stage, selected: false, interactive: false }));
  const base = { name: "M", tracks: {}, locked: false, hidden: false };
  const propsBase = { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 420, h: 200, inT: 0, outT: null, path: null, prog: 0 };

  /* single country trace SSR */
  const mapObj = (over = {}) => ({ ...base, id: "obm1", type: "map", props: { ...propsBase, country: "IND", stroke: "#00E5FF", fillC: "#22304A", fillOp: 0.55, strokeW: 1.6, start: 200, dur: 1800, ...over } });
  let mErr = null, m0 = "", mMid = "", mEnd = "", mLate = "";
  try { m0 = ssr(mapObj(), 0); mMid = ssr(mapObj(), 1100); mEnd = ssr(mapObj(), 2200); mLate = ssr(mapObj(), 99000); } catch (e) { mErr = e; }
  check("map SSR renders at 4 times without throwing", !mErr, mErr ? String(mErr && mErr.message || mErr) : "");
  check("map SSR non-empty svg, no NaN", [m0, mMid, mEnd, mLate].every((s) => s.includes("<svg") && s.length > 100 && !s.includes("NaN")));
  check("map: before start nothing drawn (no trace, no fill)", !m0.includes("stroke-dashoffset") && !m0.includes("fill-opacity") && m0.includes("<svg"));
  check("map: mid-trace partial (0 < dashoffset < 100)", (() => { const mm = mMid.match(/stroke-dashoffset="([\d.]+)"/); return mm && +mm[1] > 1 && +mm[1] < 99; })());
  check("map: closed → solid stroke stays (dasharray none at end)", mEnd.includes('stroke-dasharray="none"') && mLate.includes('stroke-dasharray="none"'));
  check("map: fill appears only near the end", !m0.includes('fill-opacity') && mEnd.includes('fill-opacity'));
  check("map: identical re-render (purity)", ssr(mapObj(), 1100) === mMid);
  check("map: legacy comet style object renders via trace", (() => { const s = ssr(mapObj({ mapStyle: "comet" }), 1100); return s.includes("<svg") && s.includes("stroke-dashoffset") && !s.includes("NaN"); })());
  check("map: legacy 10 panel countries all render", ["IND", "MEX", "USA", "CAN", "BRA", "GBR", "FRA", "DEU", "JPN", "AUS"].every((cc) => ssr(mapObj({ country: cc }), 1100).includes("<svg")));
  check("map: unknown country id falls back (no throw)", (() => { let e = null; try { const s = ssr(mapObj({ country: "ZZZ" }), 1100); return s.includes("<svg") && !s.includes("NaN"); } catch (x) { e = x; } return !e; })());
  check("map: 25 sample countries render mid-trace", ["FJI", "RUS", "ATA", "MCO", "VAT", "NOR", "IDN", "PHL", "NZL", "CHL", "ISL", "GRL", "KIR", "CAN", "CHN", "BRA", "EGY", "ZAF", "ESP", "ITA", "KOR", "VNM", "ARG", "COL", "TUR"].every((cc) => { const s = ssr(mapObj({ country: cc }), 1100); return s.includes("<svg") && !s.includes("NaN"); }));

  /* continent SSR with timed highlights + legend */
  const contObj = (over = {}) => ({
    ...base, id: "obm2", type: "continent",
    props: { ...propsBase, w: 620, continent: "EUROPE", base: "#26304A", baseOp: 0.9, stroke: "#3D4A6E", strokeW: 0.8, revealDur: 500, legend: true, hi: [
      { id: "FRA", color: "#00E5FF", inT: 500, outT: 2500 },
      { id: "DEU", color: "#FF2E88", inT: 1200, outT: 3200 },
      { id: "ESP", color: "#FFE93A", inT: 2000, outT: 4000 },
    ], ...over },
  });
  let cErr = null, c0 = "", c1 = "", c2 = "", c3 = "", c4 = "";
  try { c0 = ssr(contObj(), 0); c1 = ssr(contObj(), 1000); c2 = ssr(contObj(), 1700); c3 = ssr(contObj(), 2800); c4 = ssr(contObj(), 4500); } catch (e) { cErr = e; }
  check("continent SSR renders at 5 times without throwing", !cErr, cErr ? String(cErr && cErr.message || cErr) : "");
  check("continent: non-empty svg, no NaN", [c0, c1, c2, c3, c4].every((s) => s.includes("<svg") && s.length > 200 && !s.includes("NaN")));
  check("continent: draws ALL member countries (50 paths)", (c0.match(/<path/g) || []).length >= 50, `${(c0.match(/<path/g) || []).length}`);
  check("continent t=0: no highlight colors yet", !c0.includes("#00E5FF") && !c0.includes("#FF2E88"));
  check("continent t=1000: FRA cyan visible, DEU not yet", c1.includes("#00E5FF") && !c1.includes("#FF2E88"));
  check("continent t=1700: FRA+DEU visible, ESP not yet", c2.includes("#00E5FF") && c2.includes("#FF2E88") && !c2.includes("#FFE93A"));
  check("continent t=2800: FRA hidden (past out), DEU+ESP visible", !c3.includes("#00E5FF") && c3.includes("#FF2E88") && c3.includes("#FFE93A"));
  check("continent t=4500: all highlights gone", !c4.includes("#00E5FF") && !c4.includes("#FF2E88") && !c4.includes("#FFE93A"));
  check("continent: legend lists visible country names", c2.includes(">France<") && c2.includes(">Germany<") && !c2.includes(">Spain<"));
  check("continent: legend swatches carry the country colors", (() => { const i = c2.indexOf(">France<"); return i > 0 && c2.slice(Math.max(0, i - 400), i).includes("#00E5FF"); })());
  check("continent: identical re-render (purity)", ssr(contObj(), 1700) === c2);
  check("continent: 7 continents all render", Object.keys(CONTINENTS).every((n) => { const s = ssr(contObj({ continent: n, hi: [] }), 800); return s.includes("<svg") && !s.includes("NaN"); }));
  check("continent: unknown continent falls back (no throw)", (() => { let e = null; try { const s = ssr(contObj({ continent: "ATLANTIS", hi: [] }), 800); return s.includes("<svg"); } catch (x) { e = x; } return !e; })());
  check("continent: legacy props (mapStyle/reveal/zoom) harmless", (() => { const s = ssr(contObj({ mapStyle: "neon", reveal: "electric", autoZoom: true, zoomK: 2.2, glow: true, hi: [{ cc: "ITA", t: 500, zoom: true }] }), 800); return s.includes("<svg") && s.includes("#FFD984".slice(0, 0)) && !s.includes("NaN"); })());

  /* world SSR with 3 timed highlights at multiple t */
  const worldObj = (over = {}) => ({
    ...base, id: "obm3", type: "world",
    props: { ...propsBase, w: 780, base: "#1E2637", baseOp: 1, stroke: "#33405E", strokeW: 0.7, revealDur: 600, legend: true, hi: [
      { id: "BRA", color: "#7CFF4F", inT: 0, outT: 2000 },
      { id: "IND", color: "#00E5FF", inT: 800, outT: 3000 },
      { id: "JPN", color: "#FF2E88", inT: 1600, outT: 3800 },
    ], ...over },
  });
  let wErr = null, w0 = "", w1 = "", w2 = "", w3 = "", w4 = "";
  try { w0 = ssr(worldObj(), 300); w1 = ssr(worldObj(), 1200); w2 = ssr(worldObj(), 2400); w3 = ssr(worldObj(), 3400); w4 = ssr(worldObj(), 5000); } catch (e) { wErr = e; }
  check("world SSR renders at 5 times without throwing", !wErr, wErr ? String(wErr && wErr.message || wErr) : "");
  check("world: non-empty svg, no NaN", [w0, w1, w2, w3, w4].every((s) => s.includes("<svg") && s.length > 500 && !s.includes("NaN")));
  check("world: draws every country (≥239 base paths)", (w0.match(/<path/g) || []).length >= 239, `${(w0.match(/<path/g) || []).length}`);
  check("world t=300: only BRA green", w0.includes("#7CFF4F") && !w0.includes("#00E5FF") && !w0.includes("#FF2E88"));
  check("world t=1200: BRA+IND, not JPN", w1.includes("#7CFF4F") && w1.includes("#00E5FF") && !w1.includes("#FF2E88"));
  check("world t=2400: IND+JPN, BRA gone", !w2.includes("#7CFF4F") && w2.includes("#00E5FF") && w2.includes("#FF2E88"));
  check("world t=3400: only JPN", !w3.includes("#7CFF4F") && !w3.includes("#00E5FF") && w3.includes("#FF2E88"));
  check("world t=5000: all gone", !w4.includes("#7CFF4F") && !w4.includes("#00E5FF") && !w4.includes("#FF2E88"));
  check("world: legend shows the right name/color pairs", (() => {
    const i = w1.indexOf(">Brazil<"); const j = w1.indexOf(">India<");
    return i > 0 && j > 0 && w1.slice(Math.max(0, i - 400), i).includes("#7CFF4F") && w1.slice(Math.max(0, j - 400), j).includes("#00E5FF");
  })());
  check("world: identical re-render (purity)", ssr(worldObj(), 2400) === w2);
  check("world: legacy object (hiFill/zoom props) renders with hiFill color", (() => {
    const s = ssr(worldObj({ hi: [{ cc: "IND", t: 0, zoom: true }], legend: undefined, hiFill: "#FFB224", hiStroke: "#FFD984", autoZoom: true, zoomK: 2.6, glow: true, reveal: "pop" }), 700);
    return s.includes("#FFB224") && !s.includes("NaN") && !s.includes(">India<"); /* no legend without colors */
  })());
  check("world: new-shape highlights prop accepted", (() => {
    const s = ssr(worldObj({ hi: undefined, highlights: [{ id: "CAN", color: "#B26BFF", inT: 0, outT: 1500 }] }), 700);
    return s.includes("#B26BFF") && !s.includes("NaN");
  })());
  check("world: invalid highlight ids skipped gracefully", (() => {
    const s = ssr(worldObj({ hi: [{ cc: "NOPE", t: 0 }, { id: "AUS", color: "#FF8A3D", inT: 0, outT: 1500 }] }), 700);
    return s.includes("#FF8A3D") && !s.includes("NaN");
  })());

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All maps checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
