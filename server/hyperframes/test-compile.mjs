import { compileProject } from "./compile.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A representative project exercising: top-level + nested-in-clip layers,
// multiple easings, a shape-morph track (unported, should warn), a motion
// path (unported, should warn), an unported layer type (chart), and layer
// in/out windows narrower than the full stage duration.
const project = {
  app: "graphic-destination-motion",
  v: 5,
  stage: { w: 1280, h: 720, dur: 5000, bg: "#101218" },
  objects: [
    {
      id: "ob_title", type: "text", name: "Title", locked: false, hidden: false,
      tracks: {
        opacity: [{ t: 0, v: 0, ease: "easeOutQuad" }, { t: 500, v: 1, ease: "linear" }],
        y: [{ t: 0, v: 400, ease: "easeOutCubic" }, { t: 600, v: 300, ease: "linear" }],
      },
      props: { x: 640, y: 300, scale: 1, rotation: 0, opacity: 1, fill: "#FFFFFF", w: 0, h: 0,
        inT: 0, outT: null, path: null, prog: 0,
        text: "GRAPHIC DESTINATION", fontSize: 64, fontWeight: 700, fontFamily: "Space Grotesk" },
    },
    {
      id: "ob_chart", type: "chart", name: "Sales", locked: false, hidden: false, tracks: {},
      props: { x: 900, y: 500, scale: 1, rotation: 0, opacity: 1, w: 400, h: 240,
        inT: 1000, outT: 4500, path: null, prog: 0,
        chartType: "bar", dataStr: "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84" },
    },
    {
      id: "ob_clip", type: "clip", name: "Hero", locked: false, hidden: false, tracks: {},
      props: { x: 640, y: 360, scale: 1, rotation: 0, opacity: 1, start: 200, dur: 3000, speed: 1, end: "hold", bg: "#1a1f2b" },
      children: [
        {
          id: "ob_star", type: "shape", name: "Morpher", locked: false, hidden: false,
          tracks: {
            shape: [{ t: 0, v: "ellipse", ease: "easeInOutCubic" }, { t: 1000, v: "star", ease: "easeInOutCubic" }],
            rotation: [{ t: 0, v: 0, ease: "linear" }, { t: 2000, v: 360, ease: "linear" }],
            scale: [{ t: 0, v: 0, ease: "easeOutBack" }, { t: 500, v: 1, ease: "linear" }],
          },
          props: { x: 300, y: 200, scale: 1, rotation: 0, opacity: 1, fill: "#FFB224", w: 120, h: 120,
            inT: 0, outT: null, path: { pts: [[300, 200], [500, 100]], curved: true }, prog: 0, shape: "ellipse" },
        },
        {
          id: "ob_badge", type: "text", name: "Badge", locked: false, hidden: false,
          tracks: { opacity: [{ t: 0, v: 0, ease: "easeOutElastic" }, { t: 700, v: 1, ease: "linear" }] },
          props: { x: 700, y: 250, scale: 1, rotation: 0, opacity: 1, fill: "#6EE7B7", w: 0, h: 0,
            inT: 0, outT: null, path: null, prog: 0,
            text: "NEW", fontSize: 32, fontWeight: 700, fontFamily: "Inter" },
        },
      ],
    },
  ],
};

const { html, warnings } = compileProject(project);

const outDir = path.join(__dirname, "__test_output__");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);

console.log(`Wrote ${path.join(outDir, "index.html")} (${html.length} bytes)\n`);
console.log("--- Warnings (expected: unported types flagged) ---");
warnings.forEach((w) => console.log(" -", w));
console.log(`\nTotal warnings: ${warnings.length}`);
