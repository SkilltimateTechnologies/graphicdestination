/**
 * check-timeline.mjs — node proof for the timeline lane packing:
 *
 *   packRows (editor/model.js) — greedy first-fit interval packing:
 *     · overlapping spans land on DIFFERENT rows
 *     · touching spans (a.end === b.start) are NOT an overlap → SHARE a row
 *     · chains of touching spans collapse into one row
 *     · first-fit reuses the earliest row with room (nested/contained spans)
 *     · identical spans keep the classic front-on-top order (later layer first)
 *     · deterministic regardless of input order · empty input → []
 *
 *   layerSpan (editor/model.js) — the exact [start, end] math the lanes use:
 *     clips run [start, start + dur/speed) clamped to the context duration,
 *     other layers run [inT, outT) with outT null meaning "to the end".
 *
 * Run:  node check-timeline.mjs        (from client/)
 * (no dependencies needed — pure functions)
 */

import { packRows, layerSpan } from "./src/components/editor/model.js";
import fs from "node:fs";

/* the R8w1 timeline helpers are pure functions exported from Timeline.jsx —
   extract them from source (node can't import JSX) and exercise them for real */
const TL_SRC = fs.readFileSync(new URL("./src/components/editor/Timeline.jsx", import.meta.url), "utf8");
function grabFn(name) {
  const at = TL_SRC.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`Timeline.jsx is missing export function ${name}`);
  let depth = 0;
  for (let j = at; j < TL_SRC.length; j++) {
    const ch = TL_SRC[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (!depth) return TL_SRC.slice(at, j + 1).replace(/^export /, ""); }
  }
  throw new Error(`unterminated function ${name}`);
}
const { rowJumpTarget, rowGaps, rippleShift, gapKey } = new Function(
  `${grabFn("rowJumpTarget")}\n${grabFn("rowGaps")}\n${grabFn("gapKey")}\n${grabFn("rippleShift")}\nreturn { rowJumpTarget, rowGaps, rippleShift, gapKey };`
)();

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const S = (id, start, end) => ({ id, start, end });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- overlapping vs touching ---------- */
console.log("packRows — overlap vs touch");
check("two overlapping spans → 2 rows", eq(packRows([S("a", 0, 150), S("b", 100, 200)]), [["a"], ["b"]]));
check("touching spans (end === start) share a row", eq(packRows([S("a", 0, 100), S("b", 100, 200)]), [["a", "b"]]));
check("chain of touching spans → 1 row", eq(packRows([S("a", 0, 100), S("b", 100, 150), S("c", 150, 200)]), [["a", "b", "c"]]));
check("1ms overlap is still an overlap", eq(packRows([S("a", 0, 101), S("b", 100, 200)]), [["a"], ["b"]]));

/* ---------- first-fit / gap reuse ---------- */
console.log("packRows — greedy first-fit");
/* sorted: a(0,100) b(100,200) c(200,300) → all touch → one row */
check("back-to-back chain packs to 1 row", eq(packRows([S("a", 0, 100), S("b", 100, 200), S("c", 200, 300)]), [["a", "b", "c"]]));
/* a(0,50) c(60,110) b(100,150): a→r0, c fits r0 (60≥50, end 110), b starts 100 < 110 → r1 */
check("first-fit reuses a row only when the LATEST end allows it", eq(packRows([S("a", 0, 50), S("b", 100, 150), S("c", 60, 110)]), [["a", "c"], ["b"]]));
/* big(0,1000) blocks row 0; small(100,200)+mid(300,400) share row 1 */
check("contained span opens a new row, later span reuses it", eq(packRows([S("big", 0, 1000), S("small", 100, 200), S("mid", 300, 400)]), [["big"], ["small", "mid"]]));
check("zero-length span touches on both sides", eq(packRows([S("a", 0, 100), S("z", 100, 100), S("b", 100, 200)]), [["a", "z", "b"]]));

/* ---------- stable mode (timeline: pack in layer order, no start-sort) ---------- */
console.log("packRows — stable (layer-order) mode");
/* default start-sorts b before a (b starts earlier), so they SHARE a row;
   stable keeps input/layer order — a is processed first, b(0-50) can't precede
   it, so b opens its own row. A clip's row is now a function of layer order,
   not of its current time → dragging in time never reshuffles other rows. */
check("stable packs in the GIVEN order (not start-sorted)", eq(packRows([S("a", 100, 200), S("b", 0, 50)], { stable: true }), [["a"], ["b"]]));
check("default (unset) still start-sorts the same spans onto one row", eq(packRows([S("a", 100, 200), S("b", 0, 50)]), [["b", "a"]]));
check("stable still shares a row for in-order non-overlapping clips", eq(packRows([S("a", 0, 100), S("b", 100, 200)], { stable: true }), [["a", "b"]]));
check("stable keeps overlapping clips in layer order (no time-based swap)", eq(packRows([S("a", 0, 100), S("b", 50, 150)], { stable: true }), [["a"], ["b"]]));

/* ---------- order + determinism ---------- */
console.log("packRows — order & determinism");
check("rows come out ordered by ascending start (overlapping pair)", eq(packRows([S("late", 500, 900), S("early", 0, 600)]), [["early"], ["late"]]));
check("identical spans stack 1-per-row, front-most (later layer) first", eq(packRows([S("back", 0, 100), S("mid", 0, 100), S("front", 0, 100)]), [["front"], ["mid"], ["back"]]));
const shuffled = [S("c", 200, 300), S("a", 0, 100), S("b", 100, 200)];
check("input order does not change the result", eq(packRows(shuffled), packRows([S("a", 0, 100), S("b", 100, 200), S("c", 200, 300)])));
check("empty input → no rows", eq(packRows([]), []));

/* ---------- layerSpan: the same math the bars render with ---------- */
console.log("layerSpan — lane span math");
const clip = (start, dur, speed = 1) => ({ type: "clip", props: { start, dur, speed } });
const plain = (inT, outT) => ({ type: "shape", props: { inT, outT } });
check("clip span = [start, start + dur/speed)", eq(layerSpan(clip(150, 2500), 6000), [150, 2650]));
check("clip span clamps to the context duration", eq(layerSpan(clip(2750, 3250), 5000), [2750, 5000]));
check("clip span honors speed", eq(layerSpan(clip(0, 3000, 2), 6000), [0, 1500]));
check("layer span = [inT, outT)", eq(layerSpan(plain(550, 2400), 6000), [550, 2400]));
check("outT null = to the end", eq(layerSpan(plain(0, null), 6000), [0, 6000]));
check("missing inT = 0", eq(layerSpan(plain(undefined, 1000), 6000), [0, 1000]));
/* the demo root: Scene 1 (150–2650) + Scene 2 (2750–6000) share, Mexico (0–6000) blocks */
check("demo root packs Scene 1 + Scene 2 together", eq(
  packRows([
    { id: "mex", ...Object.fromEntries([["start", 0], ["end", 6000]]) },
    { id: "s1", ...Object.fromEntries([["start", 150], ["end", 2650]]) },
    { id: "s2", ...Object.fromEntries([["start", 2750], ["end", 6000]]) },
  ].map((o) => S(o.id, o.start, o.end))),
  [["mex"], ["s1", "s2"]]));

/* ---------- R8w1: row-jump deadzone ---------- */
console.log("rowJumpTarget — vertical deadzone for bar drags (30px rows)");
const ROW = 30;
check("pointer mid-row stays put", rowJumpTarget(45, ROW, 1) === 1);
check("1px past the lower edge stays put (deadzone)", rowJumpTarget(61, ROW, 1) === 1);
check("17px past the lower edge still stays (< 60% AND < 20px)", rowJumpTarget(77, ROW, 1) === 1);
check("18px into the next row = 60% → row changes", rowJumpTarget(78, ROW, 1) === 2);
check("20px past the edge trips the px threshold", rowJumpTarget(80, ROW, 1) === 2);
check("deep into a far row jumps straight there", rowJumpTarget(105, ROW, 1) === 3);
check("1px past the upper edge stays put (deadzone)", rowJumpTarget(29, ROW, 1) === 1);
check("into the top 40% of the row above = 60% into it → row changes", rowJumpTarget(11, ROW, 1) === 0);
check("20px above the edge trips the px threshold", rowJumpTarget(10, ROW, 1) === 0);
check("far above jumps straight there (caller clamps to row 0)", rowJumpTarget(-5, ROW, 2) === -1);
check("horizontal-only drag (y fixed mid-row) never changes row", [10, 100, 500, 1000].every(() => rowJumpTarget(45, ROW, 1) === 1));

/* ---------- R8w1: empty-gap detection ---------- */
console.log("rowGaps — gaps between two clips of one row");
check("no members → no gaps", eq(rowGaps([]), []));
check("one member → no gaps (gaps live BETWEEN clips)", eq(rowGaps([S("a", 0, 100)]), []));
check("touching spans have no gap", eq(rowGaps([S("a", 0, 100), S("b", 100, 300)]), []));
check("one real gap with both neighbour ids + bounds", eq(rowGaps([S("a", 0, 100), S("b", 250, 300)]), [{ leftId: "a", rightId: "b", start: 100, end: 250 }]));
check("two gaps in a three-clip row", eq(rowGaps([S("a", 0, 100), S("b", 150, 200), S("c", 400, 500)]).map((g) => [g.start, g.end]), [[100, 150], [200, 400]]));
check("input order does not matter", eq(rowGaps([S("b", 250, 300), S("a", 0, 100)]), [{ leftId: "a", rightId: "b", start: 100, end: 250 }]));
check("1ms gap is a gap (minGap default)", rowGaps([S("a", 0, 100), S("b", 101, 200)]).length === 1);
check("contained span (drag-pin transient) produces no false gap", eq(rowGaps([S("a", 0, 200), S("b", 100, 150), S("c", 200, 300)]), []));
check("max-end sweep: gap is measured from the furthest end, not the previous span", eq(rowGaps([S("a", 0, 200), S("b", 100, 150), S("c", 250, 300)]), [{ leftId: "a", rightId: "c", start: 200, end: 250 }]));
check("gapKey identifies a gap by its neighbours", gapKey({ leftId: "a", rightId: "b" }) === "a|b");

/* ---------- R8w1: ripple-close math ---------- */
console.log("rippleShift — closing a gap shifts later clips left");
{
  const spans = [S("a", 0, 100), S("b", 250, 400), S("c", 400, 600)];
  const gap = rowGaps(spans)[0]; /* 100..250 */
  const shifts = rippleShift(spans, gap);
  check("shift = -(gap width)", shifts.every((s) => s.dt === -150));
  check("only the clips at/after the gap shift", eq(shifts.map((s) => s.id), ["b", "c"]));
  check("applying it closes the gap exactly (b.start lands on a.end)", spans.find((s) => s.id === "b").start - 150 === 100);
  check("left clip untouched — other rows never enter the list", !shifts.some((s) => s.id === "a"));
  check("zero-width gap → no shifts", eq(rippleShift(spans, { leftId: "a", rightId: "a", start: 50, end: 50 }), []));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All timeline checks pass.");
process.exit(failed ? 1 : 0);
