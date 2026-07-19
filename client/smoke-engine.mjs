/* Engine-level smoke test: transform GraphicDestinationMotion.jsx with esbuild,
   import its pure exported math, and run every template layer's tracks through
   the real interpolation code paths across the whole 5000 ms timeline. */
import { createRequire } from "node:module";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { TEMPLATES } from "./src/templates/templates.js";

const require = createRequire(import.meta.url);
const { rolldown } = require("rolldown");

const bundle = await rolldown({
  input: "src/components/GraphicDestinationMotion.jsx",
  external: [/^react/, /^react-dom/],
  platform: "node",
});
const { output } = await bundle.generate({ format: "esm" });
/* rolldown code-splits a shared runtime chunk (rolldown-runtime-*.js) that
   the entry imports relatively — write EVERY chunk to a scratch dir and
   import the entry chunk, neutralizing vite env access for node in each. */
const tmpDir = "./.engine-smoke.out";
mkdirSync(tmpDir, { recursive: true });
for (const c of output) writeFileSync(`${tmpDir}/${c.fileName}`, c.code.replaceAll("import.meta.env.VITE_API_BASE", '""'));
const tmp = `${tmpDir}/${output.find((o) => o.isEntry).fileName}`;

let failures = 0;
const fail = (m) => { failures += 1; console.error("  ✗ " + m); };

try {
  const eng = await import(pathToFileURL(process.cwd() + "/" + tmp).href);
  const { valueAt, morphPtsAt, charFx, numberValue, numberColumns, confettiParticles, clipTransition, clipLocalTime } = eng;

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  for (const t of TEMPLATES) {
    console.log(`• ${t.name}`);
    const p = t.buildProject();
    const walk = (layers) => {
      for (const l of layers) {
        for (let time = 0; time <= 5000; time += 100) {
          try {
            for (const prop of ["x", "y", "scale", "rotation", "opacity", "prog"]) {
              const v = valueAt(l, prop, time);
              if (!isNum(v)) fail(`${t.id}/${l.name}: valueAt(${prop}, ${time}) → ${v}`);
            }
            const fill = valueAt(l, "fill", time);
            if (typeof fill !== "string") fail(`${t.id}/${l.name}: fill @${time} → ${fill}`);
            if (l.type === "shape") {
              const pts = morphPtsAt(l, time);
              if (!Array.isArray(pts) || pts.length !== 64 || pts.some((q) => !isNum(q[0]) || !isNum(q[1]))) fail(`${t.id}/${l.name}: morphPtsAt @${time} malformed`);
            }
            if (l.type === "text" && l.props.textFx) {
              const chars = (l.props.upper ? l.props.text.toUpperCase() : l.props.text).split("");
              chars.forEach((ch, i) => {
                const f = charFx(l.props.textFx, i, chars.length, time, ch);
                if (!isNum(f.o) || !isNum(f.dy) || !isNum(f.s) || !isNum(f.dx) || typeof f.ch !== "string") fail(`${t.id}/${l.name}: charFx @${time} char ${i} malformed`);
              });
            }
            if (l.type === "number") {
              const v = numberValue(l.props, time);
              if (!isNum(v)) fail(`${t.id}/${l.name}: numberValue @${time} → ${v}`);
              const cols = numberColumns(l.props, time);
              if (!Array.isArray(cols) || !cols.length) fail(`${t.id}/${l.name}: numberColumns @${time} empty`);
            }
            if (l.type === "confetti") {
              const parts = confettiParticles(l);
              if (parts.length !== l.props.count || parts.some((q) => !isNum(q.vx) || !isNum(q.vy))) fail(`${t.id}/${l.name}: confettiParticles malformed`);
            }
            if (l.type === "clip") {
              clipTransition(l.props, time);
              clipLocalTime(l.props, time);
            }
          } catch (e) {
            fail(`${t.id}/${l.name}: threw @${time} — ${e.message}`);
            break;
          }
        }
        if (l.children) walk(l.children);
      }
    };
    walk(p.objects, p.stage.dur);
    if (!failures) console.log("  ✓ all layers interpolate cleanly 0–5000 ms");
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nEngine smoke test passed for all templates.");
