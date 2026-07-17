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

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All timeline checks pass.");
process.exit(failed ? 1 : 0);
