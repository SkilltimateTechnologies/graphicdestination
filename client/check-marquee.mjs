/*
 * Guard suite for the canvas marquee hit-test (model.js objectsInRect).
 * Pure — imports the editor model (which pulls only pure engine modules).
 * Prints PASS/FAIL and exits non-zero on any failure.
 *
 *   node check-marquee.mjs
 */
import { objectsInRect } from "./src/components/editor/model.js";

let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`); }
};

/* minimal object: a 100×100 shape centered at (x,y), scale 1 */
const S = (id, x, y, w = 100, h = 100, extra = {}) => ({ id, type: "shape", props: { x, y, w, h, scale: 1, shape: "rect" }, tracks: {}, ...extra });
const rect = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
const t = 0;

const a = S("a", 200, 200);  /* box 150..250 */
const b = S("b", 600, 400);  /* box 550..650 x, 350..450 y */
const c = S("c", 1000, 600);
const objs = [a, b, c];

console.log("selection geometry");
check("rect fully containing an object selects it", objectsInRect(objs, rect(100, 100, 300, 300), t).join() === "a");
check("rect fully outside selects nothing", objectsInRect(objs, rect(0, 0, 50, 50), t).length === 0);
check("rect overlapping a corner still selects (intersection, not containment)", objectsInRect(objs, rect(240, 240, 260, 260), t).join() === "a");
check("a wide rect selects every intersected object", objectsInRect(objs, rect(0, 0, 1280, 720), t).join() === "a,b,c");
check("rect between objects selects only what it touches", objectsInRect(objs, rect(520, 320, 680, 480), t).join() === "b");

console.log("corner order independence");
check("inverted (x1<x0,y1<y0) rect works the same", objectsInRect(objs, rect(300, 300, 100, 100), t).join() === "a");

console.log("lock / hide exclusion");
check("locked objects are never selected", objectsInRect([S("a", 200, 200, 100, 100, { locked: true })], rect(0, 0, 1280, 720), t).length === 0);
check("hidden objects are never selected", objectsInRect([S("a", 200, 200, 100, 100, { hidden: true })], rect(0, 0, 1280, 720), t).length === 0);

console.log("edge cases");
check("empty object list → []", objectsInRect([], rect(0, 0, 100, 100), t).length === 0);
check("null-safe on a null entry", objectsInRect([null, a], rect(100, 100, 300, 300), t).join() === "a");
check("edge-touching counts as intersecting", objectsInRect([a], rect(250, 200, 400, 200), t).join() === "a");

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All marquee checks pass.");
process.exit(failed ? 1 : 0);
