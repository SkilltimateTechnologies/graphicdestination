/**
 * check-ai-recipe.mjs — guard suite for the AI Asset Studio recipe engine:
 *
 *   1. SPEC VALIDATION (engine/aiRecipe.js) — model output is untrusted:
 *      junk rejected, wild values clamped, enum fallbacks, bounds honored.
 *   2. CLIENT ⇄ SERVER PARITY — validateAiSpec (client) and
 *      server/aiValidate.js return IDENTICAL verdicts on the same inputs.
 *   3. CLIP CONTRACT — buildAiClip: one image child, seamless loop (child
 *      enters after t=0 and exits before dur → t=0 === t=dur empty frame),
 *      keyframes sorted/finite, deterministic across two builds.
 *   4. RENDER DETERMINISM — the REAL StageObject (bundled with Vite) SSRs a
 *      built clip identically across two renders at the same t, non-empty
 *      mid-hold, NaN-free.
 *
 * Run:  node check-ai-recipe.mjs        (from client/)
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateAiSpec, buildAiClip, AI_FALLBACK_SPEC } from "./src/engine/aiRecipe.js";
import { validateAiSpec as validateAiSpecServer } from "../server/aiValidate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".airecipe-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* ---------- 1. spec validation ---------- */
console.log("spec validation");
{
  check("junk rejected (non-object)", !validateAiSpec("pop").ok && !validateAiSpec(null).ok && !validateAiSpec([1]).ok);
  check("valid spec passes untouched", (() => { const v = validateAiSpec({ dur: 4000, size: 180, intro: { type: "rise", dur: 300 }, hold: { type: "pulse", amp: 6, period: 1200 }, outro: { type: "fade", dur: 400 } }); return v.ok && v.spec.dur === 4000 && v.spec.hold.type === "pulse" && v.clamped.length === 0; })());
  check("unknown enums fall back (hold.type wobble→bob)", validateAiSpec({ hold: { type: "wobble" } }).spec.hold.type === "bob");
  check("unknown intro/outro enums fall back", validateAiSpec({ intro: { type: "blast" }, outro: { type: "yeet" } }).spec.intro.type === "pop" && validateAiSpec({ intro: { type: "blast" }, outro: { type: "yeet" } }).spec.outro.type === "whip");
  check("dur clamps into 1500..8000", validateAiSpec({ dur: 10 }).spec.dur === 1500 && validateAiSpec({ dur: 99999 }).spec.dur === 8000);
  check("size clamps into 80..400", validateAiSpec({ size: 1 }).spec.size === 80 && validateAiSpec({ size: 9999 }).spec.size === 400);
  check("hold amp/period clamp", (() => { const s = validateAiSpec({ hold: { type: "bob", amp: 500, period: 1 } }).spec.hold; return s.amp === 24 && s.period === 400; })());
  check("clamps are REPORTED (not silent)", validateAiSpec({ dur: 10, hold: { type: "wobble" } }).clamped.length >= 2);
  check("missing sections default honestly", (() => { const s = validateAiSpec({ dur: 3000 }).spec; return s.intro.type === "pop" && s.hold.type === "bob" && s.outro.type === "whip"; })());
}

/* ---------- 2. client ⇄ server validator parity ---------- */
console.log("\nclient ⇄ server validator parity");
{
  const cases = [null, "x", {}, { dur: 10 }, { dur: 99999, size: 0, intro: { type: "blast" }, hold: { type: "wobble", amp: 500 }, outro: { type: "yeet" } }, { dur: 4000, size: 180, intro: { type: "rise", dur: 300 }, hold: { type: "pulse", amp: 6, period: 1200 }, outro: { type: "fade", dur: 400 } }];
  check("identical verdicts + specs on every case", cases.every((c) => {
    const a = validateAiSpec(c), b = validateAiSpecServer(c);
    return a.ok === b.ok && JSON.stringify(a.spec) === JSON.stringify(b.spec) && JSON.stringify(a.clamped) === JSON.stringify(b.clamped);
  }));
}

/* ---------- 3. clip contract ---------- */
console.log("\nbuildAiClip contract");
{
  const clip = buildAiClip({ dur: 3000, size: 220, intro: { type: "pop", dur: 470 }, hold: { type: "bob", amp: 8, period: 900 }, outro: { type: "whip", dur: 560 } }, { src: SRC, name: "Test" });
  check("builds ONE image child inside a looping clip", clip.type === "clip" && clip.children.length === 1 && clip.children[0].type === "image" && clip.props.end === "loop");
  check("the child carries the src + spec size", clip.children[0].props.src === SRC && clip.children[0].props.w === 220 && clip.children[0].props.h === 220);
  const child = clip.children[0];
  check("seamless loop: child enters after t=0 and exits before dur", child.props.inT > 0 && child.props.outT < clip.props.dur, `inT=${child.props.inT} outT=${child.props.outT} dur=${clip.props.dur}`);
  const flat = Object.values(child.tracks).flat();
  check("every keyframe is finite + sorted per track", Object.values(child.tracks).every((tr) => tr.every((k, i) => Number.isFinite(k.t) && Number.isFinite(k.v) && (i === 0 || tr[i - 1].t <= k.t))));
  check("deterministic: two builds are byte-identical (structure)", JSON.stringify(stripIds(clip)) === JSON.stringify(stripIds(buildAiClip({ dur: 3000, size: 220, intro: { type: "pop", dur: 470 }, hold: { type: "bob", amp: 8, period: 900 }, outro: { type: "whip", dur: 560 } }, { src: SRC, name: "Test" }))));
  check("invalid spec throws (never builds a bad clip)", (() => { try { buildAiClip("junk", { src: SRC }); return false; } catch { return true; } })());
  check("fallback spec builds a valid clip", (() => { const c = buildAiClip(AI_FALLBACK_SPEC, { src: SRC }); return c.children[0].props.inT > 0; })());
}
function stripIds(o) {
  const c = JSON.parse(JSON.stringify(o));
  const walk = (l) => { l.id = "X"; (l.children || []).forEach(walk); };
  walk(c);
  return c;
}

/* ---------- 4. render determinism (real StageObject SSR) ---------- */
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
{
  const clip = buildAiClip({ dur: 3000, size: 220, intro: { type: "pop", dur: 470 }, hold: { type: "pulse", amp: 6, period: 900 }, outro: { type: "whip", dur: 560 } }, { src: SRC, name: "Pulse" });
  const stage = { w: 1280, h: 720 };
  const ssr = (time) => renderToStaticMarkup(h(StageObject, { obj: clip, time, stage, selected: false, interactive: false }));
  const hold = ssr(1500);
  check("mid-hold render is non-empty", hold.length > 200, `len=${hold.length}`);
  check("same t renders identically twice (export re-render safe)", ssr(1500) === ssr(1500));
  check("render is NaN-free", !hold.includes("NaN"));
  check("loop points render the same empty frame (t=0 === t=dur)", ssr(0) === ssr(3000));
}
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
