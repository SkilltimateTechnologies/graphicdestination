/* visual QA harness (not part of the gate): SSR every kit at its hold time
   into standalone HTML files, then screenshot them with headless chromium
   into a contact sheet per category. Run: node check-kits-shots.mjs */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ICONS, UI_ELEMENTS, frameOf } from "./src/engine/kits.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(here, ".kits-shots-tmp");
const outDir = "/home/kimi/shots";
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(tmpDir, "entry.js");
fs.writeFileSync(entry, [
  `export { StageObject } from ${JSON.stringify(path.join(here, "src", "components", "StageObject.jsx"))};`,
  `export { createElement } from "react";`,
  `export { renderToStaticMarkup } from "react-dom/server";`,
  "",
].join("\n"));
await build({ configFile: false, logLevel: "silent", plugins: [react()], build: { outDir: tmpDir, lib: { entry, formats: ["es"], fileName: () => "engine.mjs" } } });
const M = await import(pathToFileURL(path.join(tmpDir, "engine.mjs")).href);
const { StageObject, createElement: h, renderToStaticMarkup } = M;
const stage = { w: 1280, h: 720 };

const CELL = 220;
function cell(kit, time) {
  const clip = kit.build();
  const fr = frameOf(clip);
  const s = Math.min(CELL / fr.w, (CELL * 0.72) / fr.h);
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  const inner = renderToStaticMarkup(h(StageObject, { obj: clip, time, stage, selected: false, interactive: false }));
  return `<div style="width:${CELL}px;height:${Math.round(CELL * 0.72)}px;position:relative;overflow:hidden;background:#10131A;border:1px solid #2A2F3A;border-radius:8px">
    <div style="width:1280px;height:720px;position:absolute;left:0;top:0;transform:translate(${CELL / 2 - s * cx}px,${CELL * 0.36 - s * cy}px) scale(${s});transform-origin:0 0">${inner}</div>
  </div><div style="color:#9aa;font:11px sans-serif;margin-top:4px">${kit.id}</div>`;
}
function page(kits, title, t) {
  const cells = kits.map((k) => `<div style="display:inline-block;margin:8px;text-align:center">${cell(k, t)}</div>`).join("\n");
  return `<!doctype html><html><body style="background:#0B0D12;margin:0;padding:16px;width:1000px"><div style="color:#fff;font:16px sans-serif">${title} @ t=${t}</div>${cells}</body></html>`;
}

const times = [0.5, 0.18];
for (const t of times) {
  fs.writeFileSync(path.join(outDir, `icons-${t}.html`), page(ICONS, `ICONS (${ICONS.length})`, Math.round(3200 * t)));
  fs.writeFileSync(path.join(outDir, `ui-${t}.html`), page(UI_ELEMENTS, `UI (${UI_ELEMENTS.length})`, Math.round(3600 * t)));
}
console.log("html written to", outDir);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);
