/**
 * check-snapping.mjs — pure node proof for the smart-snap engine
 * (src/components/editor/snapping.js — no DOM, no build step):
 *
 *   1. OBJECT SNAPS — edge-to-edge (left/right/top/bottom), center-to-center,
 *      cross-edge (left→right), both axes at once, exact-alignment stickiness.
 *   2. CANVAS SNAPS — center lines + all four edges; canvas-center beats
 *      canvas-edge; object beats canvas-center even when farther.
 *   3. THRESHOLD — inclusive at exactly N px, no snap beyond it, default
 *      SNAP_THRESHOLD when omitted, zoom scaling (threshold = 6/zoom).
 *   4. NEAREST WINS inside a priority group; multi-selection bbox snaps as
 *      one box; guide spans = union of the aligned extents ± SNAP_GUIDE_EXT;
 *      `points` restriction (the resize-grip path) limits snappable edges.
 *
 * Run:  node check-snapping.mjs        (from client/)
 */

import { computeSnap, SNAP_THRESHOLD, SNAP_GUIDE_EXT } from "./src/components/editor/snapping.js";

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`); }
  else { failed++; console.log(`  FAIL ${name}${detail !== "" ? ` — ${detail}` : ""}`); }
}
const B = (x, y, w, h) => ({ x, y, w, h });
const W = 1280, H = 720;
const snap = (moving, others = [], extra = {}) => computeSnap({ moving, others, stageW: W, stageH: H, threshold: 6, ...extra });
const guide = (r, axis) => r.guides.find((g) => g.axis === axis);

console.log("snapping engine — pure checks");

/* ---------- 1. object snaps ---------- */
{
  const r = snap(B(103, 100, 50, 50), [B(100, 300, 80, 80)]);
  check("left edge → left edge snaps by -3", r.dx === -3 && r.edges.x === "left", `dx=${r.dx}`);
  const g = guide(r, "x");
  check("  guide at the shared x with union span ±12", g && g.pos === 100 && g.from === 100 - SNAP_GUIDE_EXT && g.to === 380 + SNAP_GUIDE_EXT, g && `pos=${g.pos} [${g.from},${g.to}]`);
}
{
  const r = snap(B(500, 100, 60, 40), [B(400, 200, 162, 50)]);
  check("right edge → right edge snaps by +2", r.dx === 2 && r.edges.x === "right" && guide(r, "x").pos === 562, `dx=${r.dx}`);
}
{
  const r = snap(B(295, 400, 50, 50), [B(200, 100, 100, 100)]);
  check("left edge → other's right edge snaps by +5", r.dx === 5 && r.edges.x === "left" && guide(r, "x").pos === 300, `dx=${r.dx}`);
}
{
  const r = snap(B(610, 100, 100, 60), [B(618, 300, 80, 80)]);
  check("centerX → centerX snaps by -2", r.dx === -2 && r.edges.x === "centerX" && guide(r, "x").pos === 658, `dx=${r.dx}`);
}
{
  const r = snap(B(500, 203, 50, 50), [B(100, 200, 80, 80)]);
  check("top edge → top edge snaps by -3", r.dy === -3 && r.edges.y === "top" && guide(r, "y").pos === 200, `dy=${r.dy}`);
}
{
  const r = snap(B(500, 300, 50, 58), [B(900, 100, 60, 260)]);
  check("bottom edge → bottom edge snaps by +2", r.dy === 2 && r.edges.y === "bottom" && guide(r, "y").pos === 360, `dy=${r.dy}`);
}
{
  const r = snap(B(100, 306, 40, 40), [B(500, 285, 70, 80)]);
  check("centerY → centerY snaps by -1", r.dy === -1 && r.edges.y === "centerY" && guide(r, "y").pos === 325, `dy=${r.dy}`);
}
{
  const r = snap(B(103, 204, 50, 50), [B(100, 200, 80, 80)]);
  const gx = guide(r, "x"), gy = guide(r, "y");
  check("corner drag snaps both axes → two guides", r.dx === -3 && r.dy === -4 && r.guides.length === 2 && gx.pos === 100 && gy.pos === 200, `dx=${r.dx} dy=${r.dy} guides=${r.guides.length}`);
  check("  both guide spans use the post-snap position", gx.from === 188 && gx.to === 292 && gy.from === 88 && gy.to === 192, gx && `x[${gx.from},${gx.to}] y[${gy.from},${gy.to}]`);
}
{
  const r = snap(B(100, 100, 50, 50), [B(100, 300, 80, 80)]);
  check("already aligned → sticky guide with zero delta", r.dx === 0 && r.guides.length === 1 && guide(r, "x").pos === 100, `dx=${r.dx}`);
}

/* ---------- 2. canvas snaps ---------- */
{
  const r = snap(B(618, 100, 50, 50));
  const g = guide(r, "x");
  check("canvas center X snaps by -3", r.dx === -3 && r.edges.x === "centerX" && g.pos === 640, `dx=${r.dx}`);
  check("  canvas-center guide spans the full canvas ±12", g.from === -SNAP_GUIDE_EXT && g.to === 720 + SNAP_GUIDE_EXT, g && `[${g.from},${g.to}]`);
}
{
  const r = snap(B(900, 342, 60, 40));
  check("canvas center Y snaps by -2", r.dy === -2 && r.edges.y === "centerY" && guide(r, "y").pos === 360, `dy=${r.dy}`);
}
{
  const r = snap(B(4, 100, 50, 50));
  check("canvas left edge snaps by -4", r.dx === -4 && guide(r, "x").pos === 0, `dx=${r.dx}`);
}
{
  const r = snap(B(1226, 100, 50, 50));
  check("canvas right edge snaps by +4", r.dx === 4 && r.edges.x === "right" && guide(r, "x").pos === 1280, `dx=${r.dx}`);
}
{
  const rT = snap(B(100, 3, 50, 50));
  const rB = snap(B(100, 667, 50, 50));
  check("canvas top + bottom edges snap", rT.dy === -3 && guide(rT, "y").pos === 0 && rB.dy === 3 && guide(rB, "y").pos === 720, `top dy=${rT.dy} bottom dy=${rB.dy}`);
}
{
  /* full-width box: left edge is 3 from canvas edge (pr 2), centerX is exactly
     on the canvas center (pr 1) — the center line must win */
  const r = snap(B(3, 100, 1274, 50));
  check("canvas center beats canvas edge (priority order)", r.dx === 0 && r.edges.x === "centerX" && guide(r, "x").pos === 640, `dx=${r.dx} edge=${r.edges.x}`);
}
{
  /* object line 5 away (pr 0) vs canvas center 2 away (pr 1) — object wins */
  const r = snap(B(613, 100, 50, 50), [B(608, 300, 80, 80)]);
  check("object edge beats a nearer canvas center", r.dx === -5 && r.edges.x === "left" && guide(r, "x").pos === 608, `dx=${r.dx}`);
}

/* ---------- 3. threshold ---------- */
{
  const r = snap(B(106, 100, 50, 50), [B(100, 300, 80, 80)]);
  check("delta == threshold still snaps (inclusive)", r.dx === -6, `dx=${r.dx}`);
}
{
  const r = snap(B(106.5, 100, 50, 50), [B(100, 300, 80, 80)]);
  check("delta > threshold → no snap, no guides", r.dx === 0 && r.dy === 0 && r.guides.length === 0 && r.edges.x === null, `dx=${r.dx} guides=${r.guides.length}`);
}
{
  const r = computeSnap({ moving: B(105, 100, 50, 50), others: [B(100, 300, 80, 80)], stageW: W, stageH: H });
  check("omitted threshold → SNAP_THRESHOLD default", SNAP_THRESHOLD === 6 && r.dx === -5, `dx=${r.dx}`);
}
{
  /* the integration divides the 6 screen px by the current zoom */
  const far = snap(B(104, 100, 50, 50), [B(100, 300, 80, 80)], { threshold: 6 / 2 }); /* zoom 2 → 3 stage px */
  const near = snap(B(104, 100, 50, 50), [B(100, 300, 80, 80)], { threshold: 6 / 0.5 }); /* zoom 0.5 → 12 stage px */
  check("zoom scaling: 4px gap is out at zoom 2, in at zoom 0.5", far.dx === 0 && far.guides.length === 0 && near.dx === -4, `zoom2 dx=${far.dx} zoom0.5 dx=${near.dx}`);
}

/* ---------- 4. nearest / multi-bbox / points ---------- */
{
  const r = snap(B(104, 100, 50, 50), [B(100, 300, 80, 80), B(107, 500, 80, 80)]);
  check("nearest candidate wins within the group", r.dx === 3 && guide(r, "x").pos === 107, `dx=${r.dx}`);
}
{
  /* a multi-selection drag passes ONE union bbox — it snaps as a single box */
  const r = snap(B(254, 100, 160, 120), [B(410, 400, 90, 90)]);
  check("multi-selection union bbox snaps by its right edge", r.dx === -4 && r.edges.x === "right" && guide(r, "x").pos === 410, `dx=${r.dx}`);
}
{
  /* resize path: only the grip's own edge may snap */
  const noX = snap(B(100, 100, 50, 50), [B(153, 300, 80, 80)], { points: { x: ["left"], y: [] } });
  const gripped = snap(B(100, 100, 50, 50), [B(153, 300, 80, 80)], { points: { x: ["right"], y: ["bottom"] } });
  check("points restriction: non-gripped edges never snap", noX.dx === 0 && noX.guides.length === 0 && gripped.dx === 3 && gripped.edges.x === "right", `restricted dx=${noX.dx} gripped dx=${gripped.dx}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All snapping checks pass.");
process.exit(failed ? 1 : 0);
