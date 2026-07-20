/**
 * check-confetti.mjs — node proof for the confetti engine + renderer:
 *
 *   1. REGISTRY — all 17 emission styles (8 legacy + 9 new) registered with
 *      unique ids, names, glyphs and hints; every id has a positive finite
 *      lifetime; the family mapping (streamers→rain, tornado→spiral,
 *      popring→pop, drift→snow) is exact; missing/unknown props.style still
 *      falls back to the legacy burst, byte-identical.
 *
 *   2. PURITY — confettiParticles() runs with Math.random and Date.now
 *      replaced by throwing stubs: any wall-clock or unseeded randomness in a
 *      generator would blow up here (export determinism is load-bearing).
 *
 *   3. DETERMINISM + FINITENESS — every style × 2 seeds: same seed ⇒
 *      identical JSON across calls; different seeds ⇒ different JSON; every
 *      numeric field finite (no NaN/Infinity); particle count exactly equals
 *      props.count (bounded) at 1 / 40 / 160 and 0; power changes the output.
 *
 *   4. SSR THROUGH THE REAL StageObject (bundled with the project's own Vite,
 *      react shared with the server renderer — same pattern as
 *      check-content.mjs): full time sweep (before burst → past end of life)
 *      for every style renders without throwing and with no "NaN" in the
 *      markup; at burst peak the render is non-empty and contains exactly
 *      props.count particle nodes; SSR is byte-deterministic; and every pair
 *      of styles produces DISTINCT markup at peak (new styles are visibly
 *      new, including vs. their kinematics-family source).
 *
 *   5. R8 LIFECYCLE — duration prop (props.dur ms, engine confettiDurMs:
 *      absent ⇒ per-style default, explicit clamped to [MIN,MAX]); the pure
 *      fitDurForConfetti end-only timeline-extension contract; CANVAS CLAMP
 *      (zero particles beyond the stage box across a full sweep per style);
 *      LIFETIME FLOOR (no particle below 0.45 opacity before 60% of its
 *      styled life on a clamp-free stage); duration honored through SSR
 *      (active window exactly [burst, burst+dur], outT does not cut confetti).
 *      The full R8 contract lives in check-r8w2.mjs.
 *
 * Run:  node check-confetti.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONFETTI_STYLES, confettiParticles, confettiLife, confettiStyleOf, confettiDurMs, CONFETTI_DUR_MIN, CONFETTI_DUR_MAX, fitDurForConfetti } from "./src/engine/fx.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".confetti-check-tmp");

const NEW_IDS = ["cannons", "fountain", "celebration", "patriotic", "mono", "streamers", "tornado", "popring", "drift"];
const FAMILY = { streamers: "rain", tornado: "spiral", popring: "pop", drift: "snow" };

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
const confettiObj = (style, seed, count = 40, power = 1.2) => ({
  id: "ob900", type: "confetti", name: "Confetti", tracks: {}, locked: false, hidden: false,
  props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 200, h: 200, inT: 0, outT: null, path: null, prog: 0, burst: 200, count, power, seed, ...(style ? { style } : {}) },
});

async function main() {
  /* ---------- 1. registry ---------- */
  console.log(`registry — ${CONFETTI_STYLES.length} styles`);
  const ids = CONFETTI_STYLES.map((s) => s.id);
  check("17 styles registered (8 legacy + 9 new)", CONFETTI_STYLES.length === 17, ids.join(","));
  check("all 9 new style ids present", NEW_IDS.every((id) => ids.includes(id)), NEW_IDS.filter((id) => !ids.includes(id)).join(","));
  check("style ids unique", new Set(ids).size === ids.length);

  /* ---------- 1b. brand palette (colors prop) ---------- */
  console.log("\nbrand palette — colors[] prop recolors the generic picks");
  {
    const BRAND = ["#112233", "#445566"];
    const withColors = (style, seed) => { const o = confettiObj(style, seed); o.props.colors = BRAND; return o; };
    const branded = confettiParticles(withColors("burst", 7));
    check("burst particles come ONLY from the brand palette", branded.length > 0 && branded.every((p) => BRAND.includes(p.color)), branded.slice(0, 3).map((p) => p.color).join(","));
    check("brand palette is deterministic (same seed → same particles)", JSON.stringify(branded) === JSON.stringify(confettiParticles(withColors("burst", 7))));
    check("the palette prop changes the colors (≠ legacy build)", JSON.stringify(branded.map((p) => p.color)) !== JSON.stringify(confettiParticles(confettiObj("burst", 7)).map((p) => p.color)));
    check("no colors prop → the fixed swatches (back-compat)", confettiParticles(confettiObj("burst", 7)).some((p) => !BRAND.includes(p.color)));
  }
  check("every style has a non-empty name", CONFETTI_STYLES.every((s) => typeof s.name === "string" && s.name.length > 0));
  check("every style has a non-empty glyph", CONFETTI_STYLES.every((s) => typeof s.glyph === "string" && s.glyph.length > 0));
  check("every style has a non-empty hint", CONFETTI_STYLES.every((s) => typeof s.hint === "string" && s.hint.length > 0));
  check("glyphs unique", new Set(CONFETTI_STYLES.map((s) => s.glyph)).size === CONFETTI_STYLES.length);
  for (const s of CONFETTI_STYLES) {
    const life = confettiLife(s.id);
    check(`${s.id}: confettiLife positive finite (${life} ms)`, Number.isFinite(life) && life > 0);
  }
  for (const [id, fam] of Object.entries(FAMILY)) {
    check(`${id}: kinematics family = ${fam}`, confettiStyleOf({ style: id }) === fam);
    check(`${id}: raw life matches family life (${confettiLife(id)} = ${confettiLife(fam)})`, confettiLife(id) === confettiLife(fam));
  }
  check("non-family styles normalize to themselves", ids.filter((id) => !FAMILY[id]).every((id) => confettiStyleOf({ style: id }) === id));
  check("unknown style → burst", confettiStyleOf({ style: "nope" }) === "burst");
  check("missing style → burst", confettiStyleOf({}) === "burst" && confettiStyleOf(null) === "burst");
  check("confettiLife(undefined) = 2400 (legacy window)", confettiLife(undefined) === 2400);
  const noStyle = confettiParticles(confettiObj(null, 7));
  const burst = confettiParticles(confettiObj("burst", 7));
  check("missing style → burst fields (byte-identical)", JSON.stringify(noStyle) === JSON.stringify(burst));
  check("unknown style → burst fields (byte-identical)", JSON.stringify(confettiParticles(confettiObj("nope", 7))) === JSON.stringify(burst));
  const legacyKeys = ["vx", "vy", "size", "color", "spin", "round", "drift", "wob"];
  check("burst keeps the legacy particle field set", legacyKeys.every((k) => k in burst[0]), Object.keys(burst[0]).join(","));

  /* ---------- 2. purity: no Math.random / wall-clock in the generators ---------- */
  console.log("\npurity — generators run with Math.random / Date.now disabled");
  const realRandom = Math.random, realNow = Date.now;
  let purityError = null;
  Math.random = () => { throw new Error("Math.random used in confetti generator"); };
  Date.now = () => { throw new Error("Date.now used in confetti generator"); };
  try {
    for (const s of CONFETTI_STYLES) for (const seed of [7, 1234]) confettiParticles(confettiObj(s.id, seed));
  } catch (e) { purityError = e; }
  Math.random = realRandom; Date.now = realNow;
  check("confettiParticles is pure (seeded rng only) for all 17 styles", !purityError, purityError ? String(purityError.message || purityError) : "");
  check("purity probe actually ran (stubbed functions restored)", Math.random === realRandom && Date.now === realNow);

  /* ---------- 3. determinism, finiteness, counts, power ---------- */
  console.log("\nconfettiParticles — determinism / finiteness / bounded counts / power");
  for (const s of CONFETTI_STYLES) {
    for (const seed of [7, 1234]) {
      const a = confettiParticles(confettiObj(s.id, seed));
      const b = confettiParticles(confettiObj(s.id, seed));
      check(`${s.id} seed ${seed}: deterministic (${a.length} particles)`, a.length === 40 && JSON.stringify(a) === JSON.stringify(b));
      check(`${s.id} seed ${seed}: all fields finite`, allFinite(a));
    }
    check(`${s.id}: different seeds → different fields`, JSON.stringify(confettiParticles(confettiObj(s.id, 7))) !== JSON.stringify(confettiParticles(confettiObj(s.id, 1234))));
    const one = confettiParticles(confettiObj(s.id, 7, 1));
    const max = confettiParticles(confettiObj(s.id, 7, 160));
    const zero = confettiParticles(confettiObj(s.id, 7, 0));
    check(`${s.id}: count bounded (1→${one.length}, 160→${max.length}, 0→${zero.length})`, one.length === 1 && max.length === 160 && zero.length === 0);
    check(`${s.id}: power changes the fields`, JSON.stringify(confettiParticles(confettiObj(s.id, 7, 40, 1))) !== JSON.stringify(confettiParticles(confettiObj(s.id, 7, 40, 1.8))));
  }

  /* ---------- 3.5 R8: duration prop + fitDurForConfetti contract ---------- */
  console.log("\nR8 — confetti duration prop (confettiDurMs) + timeline auto-extend helper");
  for (const s of CONFETTI_STYLES) {
    check(`${s.id}: absent dur ⇒ per-style default (${confettiLife(s.id)} ms)`, confettiDurMs({ style: s.id }) === confettiLife(s.id));
  }
  check("explicit dur honored; clamped to [MIN, MAX]", confettiDurMs({ dur: 1200 }) === 1200 && confettiDurMs({ dur: 10 }) === CONFETTI_DUR_MIN && confettiDurMs({ dur: 99999 }) === CONFETTI_DUR_MAX);
  check("junk dur ⇒ style default (old projects unchanged)", confettiDurMs({}) === 2400 && confettiDurMs({ dur: NaN }) === 2400 && confettiDurMs({ dur: -5 }) === 2400);
  check("fitDurForConfetti: no-op when the span fits", fitDurForConfetti({ stage: { dur: 5000 } }, { props: { burst: 500, dur: 1200 } }) === 5000);
  check("fitDurForConfetti: extends AT THE END to burst+dur", fitDurForConfetti({ stage: { dur: 2000 } }, { props: { burst: 1500, dur: 1200 } }) === 2700);
  check("fitDurForConfetti: default style life when dur absent (burst 4000 + snow 6500)", fitDurForConfetti({ stage: { dur: 5000 } }, { props: { style: "snow", burst: 4000 } }) === 10500);
  const fp = { stage: { dur: 3000 } }, fo = { props: { burst: 2500, dur: 2000 } };
  const fBefore = JSON.stringify([fp, fo]);
  check("fitDurForConfetti: pure + monotonic (inputs untouched, never shrinks)", fitDurForConfetti(fp, fo) === 4500 && JSON.stringify([fp, fo]) === fBefore && fitDurForConfetti({ stage: { dur: 9000 } }, fo) === 9000);

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
  check("StageObject export present", typeof StageObject === "function" || (typeof StageObject === "object" && StageObject !== null));

  const stage = { w: 1280, h: 720 };
  const ssr = (obj, time) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));
  const COUNT = 40;

  console.log("\nSSR — full time sweep: renders, no NaN");
  for (const s of CONFETTI_STYLES) {
    const obj = confettiObj(s.id, 7, COUNT);
    const life = confettiLife(s.id);
    let err = null, nan = false;
    try {
      for (let t = 0; t <= 200 + life + 600; t += 150) { const html = ssr(obj, t); if (html.includes("NaN")) { nan = true; break; } }
    } catch (e) { err = e; }
    check(`${s.id}: sweep 0..${200 + life + 600}ms renders, no NaN`, !err && !nan, err ? String(err && err.message || err) : "");
  }

  console.log("\nSSR — burst peak: non-empty, exact particle count, deterministic");
  const peakMarkup = {};
  for (const s of CONFETTI_STYLES) {
    const obj = confettiObj(s.id, 7, COUNT);
    const life = confettiLife(s.id);
    const peak = 200 + Math.round(life * 0.42);
    let html = "", err = null;
    try { html = ssr(obj, peak); } catch (e) { err = e; }
    peakMarkup[s.id] = html;
    const nodes = (html.match(/border-radius:/g) || []).length;
    check(`${s.id}: peak @${peak}ms non-empty with all ${COUNT} particles`, !err && html.length > 200 && nodes === COUNT, err ? String(err && err.message || err) : `nodes=${nodes} len=${html.length}`);
    check(`${s.id}: SSR byte-deterministic at peak`, !err && ssr(obj, peak) === html);
  }

  console.log("\nSSR — pairwise distinct at burst peak");
  for (let i = 0; i < CONFETTI_STYLES.length; i++) {
    for (let j = i + 1; j < CONFETTI_STYLES.length; j++) {
      const a = CONFETTI_STYLES[i].id, b = CONFETTI_STYLES[j].id;
      check(`${a} ≠ ${b}`, peakMarkup[a] !== peakMarkup[b]);
    }
  }
  for (const [id, fam] of Object.entries(FAMILY)) {
    check(`${id}: distinct from its ${fam} kinematics family`, peakMarkup[id] !== peakMarkup[fam]);
  }

  /* ---------- 5. R8 SSR: canvas clamp + lifetime floor + duration ---------- */
  console.log("\nR8 SSR — canvas clamp: zero particles beyond the stage box");
  const NUM_RE = "-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?";
  const particlesOf = (html) => html.split("<div").slice(1).filter((s) => s.includes("border-radius:")).map((s) => {
    const num = (re) => { const m = re.exec(s); return m ? Number(m[1]) : NaN; };
    return {
      left: num(new RegExp(`left:(${NUM_RE})px`)), top: num(new RegExp(`top:(${NUM_RE})px`)),
      w: num(new RegExp(`width:(${NUM_RE})px`)), h: num(new RegExp(`height:(${NUM_RE})px`)),
      op: num(new RegExp(`opacity:(${NUM_RE})`)),
    };
  });
  for (const s of CONFETTI_STYLES) {
    const obj = confettiObj(s.id, 7, COUNT, 1.8); /* high power — worst case for escaping */
    const life = confettiDurMs(obj.props);
    let worst = null;
    for (let t = obj.props.burst; t <= obj.props.burst + life + 1; t += 90) {
      for (const p of particlesOf(ssr(obj, t))) {
        const sx = obj.props.x - 22 + p.left, sy = obj.props.y - 22 + p.top;
        if (sx < -1e-9 || sy < -1e-9 || sx + p.w > stage.w + 1e-9 || sy + p.h > stage.h + 1e-9) worst = `t=${t} box=(${sx.toFixed(1)},${sy.toFixed(1)},${p.w},${p.h})`;
      }
    }
    check(`${s.id}: no particle beyond ${stage.w}×${stage.h} across the full sweep`, !worst, worst || "");
  }
  console.log("\nR8 SSR — lifetime floor (6000×5000 clamp-free stage): no early vanish");
  const ssrBig = (obj, time) => renderToStaticMarkup(h(StageObject, { obj, time, stage: { w: 6000, h: 5000 }, selected: false, interactive: false }));
  for (const s of CONFETTI_STYLES) {
    const obj = { ...confettiObj(s.id, 7, COUNT, 1), props: { ...confettiObj(s.id, 7, COUNT, 1).props, x: 3000, y: 2500 } };
    const life = confettiDurMs(obj.props);
    const mid = particlesOf(ssrBig(obj, obj.props.burst + life * 0.55)).filter((p) => {
      const sx = obj.props.x - 22 + p.left, sy = obj.props.y - 22 + p.top;
      return sx > 0 && sy > 0 && sx + p.w < 6000 && sy + p.h < 5000; /* free-flight only — edge-faded excluded */
    });
    const end = particlesOf(ssrBig(obj, obj.props.burst + life * 0.97));
    check(`${s.id}: floor — free-flight particles ≥ 0.45 opacity at 55% of life`, mid.length >= 4 && mid.every((p) => p.op >= 0.45), `n=${mid.length} min=${Math.min(...mid.map((p) => p.op))}`);
    check(`${s.id}: settled to ≤ 0.25 opacity by 97% of life (no pop-out)`, end.length === COUNT && end.every((p) => p.op <= 0.25), `max=${Math.max(...end.map((p) => p.op))}`);
  }
  console.log("\nR8 SSR — duration honored: active window exactly [burst, burst+dur]");
  {
    const obj = confettiObj("burst", 7, COUNT);
    obj.props.dur = 1200;
    check("dur=1200: all particles mid-life, gone right after", particlesOf(ssr(obj, 800)).length === COUNT && particlesOf(ssr(obj, 1500)).length === 0);
  }
  {
    const obj = confettiObj("burst", 7, COUNT);
    obj.props.outT = 500; /* timeline bar ends early — confetti must NOT be cut */
    check("outT does not cut confetti (plays exactly its duration)", particlesOf(ssr(obj, 1200)).length === COUNT && particlesOf(ssr(obj, 2500)).length === COUNT);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (!failed) console.log("All confetti checks pass.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
