/**
 * check-svg-icons.mjs — guard suite for the custom SVG-icon feature:
 *
 *   1. ENGINE (client/src/engine/svgIcon.js, pure):
 *      svgDataUri produces a base64 data:image/svg+xml URI (never blob:);
 *      svgViewBox parses viewBox with width/height fallback; iconInsertSize
 *      caps the longest side while preserving aspect.
 *   2. RENDER DETERMINISM (the REAL StageObject, bundled with Vite):
 *      an image layer carrying an inline-SVG data-URI src SSRs to the SAME
 *      markup at t=0 and t=2000 (pure f(t) — export re-renders frames), with
 *      the data-URI intact and no blob: anywhere.
 *   3. WIRING — GDM inserts SVG icons through makeObject("image") at
 *      DEFAULT_INSERT_SIZE via svgDataUri + iconInsertSize.
 *
 * Run:  node check-svg-icons.mjs        (from client/)
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { svgDataUri, svgViewBox, iconInsertSize } from "./src/engine/svgIcon.js";
import { DEFAULT_INSERT_SIZE } from "./src/components/editor/model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".svgicons-check-tmp");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0" fill="none" stroke="#F5A524" stroke-width="2"/></svg>`;
const WIDE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24"><rect width="48" height="24" fill="#F5A524"/></svg>`;

/* ---------- 1. engine ---------- */
console.log("svgIcon engine");
{
  const uri = svgDataUri(ICON);
  check("svgDataUri → base64 data:image/svg+xml URI", uri.startsWith("data:image/svg+xml;base64,"), uri.slice(0, 40));
  check("never a blob: URL (canvas-taint guard)", !uri.startsWith("blob:"));
  check("the payload round-trips back to the markup", Buffer.from(uri.split(",")[1], "base64").toString("utf8") === ICON);
  check("svgViewBox reads the viewBox", svgViewBox(ICON).w === 24 && svgViewBox(ICON).h === 24);
  check("svgViewBox falls back to width/height", (() => { const v = svgViewBox(`<svg width="48" height="16"><rect/></svg>`); return v.w === 48 && v.h === 16; })());
  check("svgViewBox survives junk (100×100 default)", (() => { const v = svgViewBox("nope"); return v.w === 100 && v.h === 100; })());
  check("iconInsertSize: square stays square at the default", (() => { const s = iconInsertSize(ICON, DEFAULT_INSERT_SIZE); return s.w === DEFAULT_INSERT_SIZE && s.h === DEFAULT_INSERT_SIZE; })());
  check("iconInsertSize: longest side capped, aspect preserved (2:1)", (() => { const s = iconInsertSize(WIDE, DEFAULT_INSERT_SIZE); return s.w === DEFAULT_INSERT_SIZE && s.h === DEFAULT_INSERT_SIZE / 2; })());
}

/* ---------- 2. render determinism (real StageObject SSR) ---------- */
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
  const obj = {
    id: "ob1", type: "image", name: "Pulse ring", tracks: {}, locked: false, hidden: false,
    props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: 100, h: 100, inT: 0, outT: null, path: null, prog: 0, src: svgDataUri(ICON) },
  };
  const stage = { w: 1280, h: 720 };
  const ssr = (time) => renderToStaticMarkup(h(StageObject, { obj, time, stage, selected: false, interactive: false }));
  const a = ssr(0), b = ssr(2000);
  check("svg-icon image SSRs non-empty markup", a.length > 100, `len=${a.length}`);
  check("markup is identical at t=0 and t=2000 (pure f(t) — export-safe)", a === b);
  check("the inline-SVG data-URI survives into the render", a.includes("data:image/svg+xml;base64,"));
  check("no blob: URL anywhere in the render", !a.includes("blob:"));
  check("render is NaN-free", !a.includes("NaN"));
}
fs.rmSync(tmpDir, { recursive: true, force: true });

/* ---------- 3. GDM wiring ---------- */
console.log("\nGDM wiring");
{
  const GDM = fs.readFileSync(path.join(here, "src", "components", "GraphicDestinationMotion.jsx"), "utf8");
  const fn = GDM.slice(GDM.indexOf("const insertSvgIcon"), GDM.indexOf("const insertSvgIcon") + 700);
  check("insertSvgIcon inserts through makeObject(\"image\")", fn.includes('makeObject("image"'));
  check("insertSvgIcon uses svgDataUri (inline data-URI src, never blob:)", fn.includes("svgDataUri(icon.svg)") && !fn.includes("blob:"));
  check("insertSvgIcon sizes via iconInsertSize at DEFAULT_INSERT_SIZE", fn.includes("iconInsertSize(icon.svg, DEFAULT_INSERT_SIZE)"));
  /* hardening: NO surface renders admin SVG inline — thumbs and layers both
     go through the inert data-URI <img> path, so nothing leans on the
     sanitizer alone */
  const PANEL = fs.readFileSync(path.join(here, "src", "components", "editor", "panels", "IconsPanel.jsx"), "utf8");
  check("IconsPanel thumb renders via data-URI <img> (no dangerouslySetInnerHTML)", !PANEL.includes("dangerouslySetInnerHTML") && PANEL.includes("svgDataUri(icon.svg)"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
