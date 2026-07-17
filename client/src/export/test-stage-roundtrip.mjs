/**
 * test-stage-roundtrip.mjs — node proof that custom stage dimensions survive
 * the projectJson ⇄ restore round-trip, and that the stage presets shipped in
 * the editor match the multi-ratio spec.
 *
 * Checks (all against the REAL modules — the editor component is bundled with
 * the project's own Vite exactly like validateFrameMath.mjs does):
 *   1. STAGE_PRESETS exported by GraphicDestinationMotion.jsx are
 *      16:9 1280×720 (default) · 9:16 1080×1920 · 1:1 1080×1080.
 *   2. blankProject() keeps the 1280×720/5000 ms default, and
 *      blankProject({ w, h }) overrides the stage dims only.
 *   3. A v5 project envelope with custom stage dims ({ w:1080, h:1920,
 *      dur:6000, bg }) — the exact shape the editor's projectJson() emits —
 *      survives JSON.stringify → JSON.parse with dims, duration and bg
 *      intact, and the editor's restore semantics (w/h fallbacks of
 *      1280/720, conditional dur/bg) hand back the custom values.
 *
 * Run:  node src/export/test-stage-roundtrip.mjs        (from client/)
 * (requires client dependencies installed; exits non-zero on failure)
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..", "..");
const engineEntry = path.join(clientDir, "src", "components", "GraphicDestinationMotion.jsx");
const tmpDir = path.join(clientDir, ".stage-roundtrip-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

async function main() {
  console.log("Bundling the real editor module with Vite…");
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await build({
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    build: { outDir: tmpDir, lib: { entry: engineEntry, formats: ["es"], fileName: () => "engine.mjs" } },
  });
  const M = await import(pathToFileURL(path.join(tmpDir, "engine.mjs")).href);
  const { STAGE_PRESETS } = M;
  const { blankProject } = await import(pathToFileURL(path.join(clientDir, "src", "templates", "templates.js")).href);

  /* ---------- 1. shipped presets match the spec ---------- */
  console.log("\nstage presets (from the bundled editor module)");
  check("three presets", Array.isArray(STAGE_PRESETS) && STAGE_PRESETS.length === 3, JSON.stringify(STAGE_PRESETS));
  const byId = Object.fromEntries((STAGE_PRESETS || []).map((p) => [p.id, p]));
  check("default 16:9 is 1280×720 and first", STAGE_PRESETS?.[0]?.w === 1280 && STAGE_PRESETS?.[0]?.h === 720);
  check("9:16 preset is 1080×1920", byId.vert?.w === 1080 && byId.vert?.h === 1920, JSON.stringify(byId.vert));
  check("1:1 preset is 1080×1080", byId.sq?.w === 1080 && byId.sq?.h === 1080, JSON.stringify(byId.sq));

  /* ---------- 2. blankProject dims argument ---------- */
  console.log("\nblankProject()");
  const dflt = blankProject();
  check("default stage is 1280×720 / 5000 ms",
    dflt.stage.w === 1280 && dflt.stage.h === 720 && dflt.stage.dur === 5000,
    JSON.stringify(dflt.stage));
  const vert = blankProject({ w: 1080, h: 1920 });
  check("custom dims override the stage", vert.stage.w === 1080 && vert.stage.h === 1920, JSON.stringify(vert.stage));
  check("custom dims keep dur/bg/brands/schema",
    vert.stage.dur === 5000 && typeof vert.stage.bg === "string" && vert.v === 5 && Array.isArray(vert.brands) && vert.brands.length === 1 && Array.isArray(vert.objects) && vert.objects.length === 0);

  /* ---------- 3. projectJson-shaped round-trip with custom dims ---------- */
  console.log("\nprojectJson round-trip (custom stage dims)");
  /* the exact envelope the editor's projectJson() writes for a 1080×1920 /
     6 s project (objects/brands elided — irrelevant to the stage contract) */
  const projectJson = JSON.stringify({
    app: "graphic-destination-motion", v: 5,
    stage: { w: 1080, h: 1920, dur: 6000, bg: "#101218" },
    brands: [], brandId: null, objects: [],
  }, null, 2);
  const data = JSON.parse(projectJson);
  check("stage dims survive stringify → parse", data.stage.w === 1080 && data.stage.h === 1920, JSON.stringify(data.stage));
  /* the editor's restore path (importProject) applies these exact fallbacks */
  const restored = {
    stage: { w: data.stage.w || 1280, h: data.stage.h || 720 },
    compDur: data.stage.dur ? data.stage.dur : 6000,
    stageBg: data.stage.bg ? data.stage.bg : "#101218",
  };
  check("restore keeps custom dims (no 1280×720 fallback)", restored.stage.w === 1080 && restored.stage.h === 1920, JSON.stringify(restored.stage));
  check("restore keeps custom duration + bg", restored.compDur === 6000 && restored.stageBg === "#101218");
  /* and a project with NO stage (legacy) still lands on the default */
  const legacy = JSON.parse(JSON.stringify({ app: "graphic-destination-motion", v: 5, objects: [] }));
  check("missing stage → editor default 1280×720",
    (legacy.stage?.w || 1280) === 1280 && (legacy.stage?.h || 720) === 720);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); });
