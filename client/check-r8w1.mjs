/**
 * check-r8w1.mjs — node proof for the R8w1 editor wave:
 *
 *   1. ROW-JUMP DEADZONE — rowJumpTarget (Timeline.jsx): a horizontal bar
 *      drag keeps its row; the row changes only when the pointer crosses a
 *      boundary with intent (≥60% into another row OR ≥20px past the edge).
 *   2. GAP PILLS — rowGaps detection between two clips of one row, gapKey
 *      identity, rippleShift ripple-close math (later clips shift left by
 *      the gap width; other rows/playhead untouched).
 *   3. LOCK + HIDE — explicit two-state icon buttons wired to the existing
 *      toggleHide/toggleLock mechanisms.
 *   4. STICKY HEADER + DOCKED TIMELINE — the shell can't scroll the header
 *      away; the timeline is docked with only its track area scrolling.
 *   5. TOP-BAR PURGE — logo / duplicate title / "saved" text / Save+Load /
 *      Share / autokey all gone from the top bar; the save control + state
 *      indicator lives in the timeline bar. R9w1: the Animate arm toggle
 *      was restored beside Grid and Export moved into the timeline bar.
 *   6. GRID — enable-grid toggle renders a StageView-only overlay that the
 *      export render path can never include.
 *
 * Pure helpers are extracted from Timeline.jsx source (node can't import
 * JSX) and exercised for real; UI changes are asserted at source level.
 *
 * Run:  node check-r8w1.mjs        (from client/)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- extract the pure timeline helpers (same approach as check-timeline) ---------- */
const TL = read("src/components/editor/Timeline.jsx");
function grabFn(src, name) {
  const at = src.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`Timeline.jsx is missing export function ${name}`);
  let depth = 0;
  for (let j = at; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (!depth) return src.slice(at, j + 1).replace(/^export /, ""); }
  }
  throw new Error(`unterminated function ${name}`);
}
const { rowJumpTarget, rowGaps, rippleShift, gapKey } = new Function(
  `${grabFn(TL, "rowJumpTarget")}\n${grabFn(TL, "rowGaps")}\n${grabFn(TL, "gapKey")}\n${grabFn(TL, "rippleShift")}\nreturn { rowJumpTarget, rowGaps, rippleShift, gapKey };`
)();
const S = (id, start, end) => ({ id, start, end });

/* ================= 1. row-jump deadzone ================= */
console.log("row-jump deadzone (rowJumpTarget)");
{
  const R = 30; /* TL_ROW_H */
  check("mid-row pointer keeps the current row", rowJumpTarget(45, R, 1) === 1);
  check("1px across the lower edge: deadzone holds", rowJumpTarget(61, R, 1) === 1);
  check("10px across the lower edge: deadzone holds", rowJumpTarget(70, R, 1) === 1);
  check("17px across: still held (< 60% and < 20px)", rowJumpTarget(77, R, 1) === 1);
  check("18px into the next row = 60% → intent, row changes", rowJumpTarget(78, R, 1) === 2);
  check("20px beyond the edge → px threshold trips", rowJumpTarget(80, R, 1) === 2);
  check("fully inside a far row jumps straight to it", rowJumpTarget(105, R, 1) === 3);
  check("1px across the upper edge: deadzone holds", rowJumpTarget(29, R, 1) === 1);
  check("top 40% of the row above = 60% into it → row changes", rowJumpTarget(11, R, 1) === 0);
  check("20px beyond the upper edge → px threshold trips", rowJumpTarget(10, R, 1) === 0);
  check("above all rows returns a negative target (caller clamps to 0)", rowJumpTarget(-5, R, 2) === -1);
  check("horizontal-only drag at fixed y never re-rows", rowJumpTarget(45, R, 1) === 1 && rowJumpTarget(45, R, 1) === 1);
  check("thresholds are parameters (px, frac) with 20 / 0.6 defaults", rowJumpTarget(79, R, 1, 100, 0.9) === 1 && rowJumpTarget(79, R, 1) === 2);
}
check("Timeline.jsx exports the TL_ROW_H lane constant (30)", /export const TL_ROW_H = 30;/.test(TL));
check("GDM pins the row on bar move-drags via rowJumpTarget + rowsRef (stickier 44px/0.85 deadzone)", (() => {
  const gdm = read("src/components/GraphicDestinationMotion.jsx");
  return gdm.includes("rowJumpTarget(ev.clientY - rr.top, TL_ROW_H, b.row, 44, 0.85)") && gdm.includes("barDragRef.current = { id: obj.id, row: startRow, rowCount: startRows.length }");
})());
check("the pin releases on pointer-up (packing resumes)", read("src/components/GraphicDestinationMotion.jsx").includes("setBarDrag(null); /* release the row pin"));
check("Timeline re-pins the dragged bar into its pinned row (display-only)", TL.includes("if (barDrag && byId.has(barDrag.id))"));

/* ================= 2. gap pills ================= */
console.log("gap pills — detection + ripple-close math");
check("no gaps inside a single clip row", eq(rowGaps([S("a", 0, 500)]), []));
check("touching clips are NOT a gap", eq(rowGaps([S("a", 0, 100), S("b", 100, 300)]), []));
check("a real empty stretch is one gap with neighbours + bounds", eq(rowGaps([S("a", 0, 100), S("b", 250, 300)]), [{ leftId: "a", rightId: "b", start: 100, end: 250 }]));
check("two gaps in a three-clip row, in order", eq(rowGaps([S("a", 0, 100), S("b", 150, 200), S("c", 400, 500)]).map((g) => gapKey(g)), ["a|b", "b|c"]));
check("order-independent detection", eq(rowGaps([S("b", 250, 300), S("a", 0, 100)]), [{ leftId: "a", rightId: "b", start: 100, end: 250 }]));
check("contained span (transient overlap) yields no false gap", eq(rowGaps([S("a", 0, 200), S("b", 100, 150), S("c", 200, 300)]), []));
check("max-end sweep measures from the furthest end", eq(rowGaps([S("a", 0, 200), S("b", 100, 150), S("c", 250, 300)]), [{ leftId: "a", rightId: "c", start: 200, end: 250 }]));
{
  const spans = [S("a", 0, 100), S("b", 250, 400), S("c", 400, 600)];
  const gap = rowGaps(spans)[0];
  const shifts = rippleShift(spans, gap);
  check("ripple shifts exactly the clips at/after the gap", eq(shifts.map((s) => s.id), ["b", "c"]));
  check("ripple shift = -(gap width)", shifts.every((s) => s.dt === -150));
  check("after the ripple the gap is closed (b.start === a.end)", spans.find((s) => s.id === "b").start + shifts[0].dt === 100);
  check("the left clip never moves", !shifts.some((s) => s.id === "a"));
  check("zero-width gap → nothing shifts", eq(rippleShift(spans, { leftId: "a", rightId: "a", start: 10, end: 10 }), []));
}
check("gap pills render as dashed buttons inside the lanes", TL.includes("gd-gap-pill") && TL.includes('border: `1px dashed'));
check("selected gap gets the gd-gap-sel highlight", TL.includes("gd-gap-sel"));
check("a ✕ Close gap chip appears in the transport bar when a gap is selected", TL.includes("gd-gap-delete") && TL.includes("onCloseGap"));
check("GDM wires Delete/Backspace to closeGap before any other delete", /if \(selGap\) closeGap\(\);\s*\n\s*else if \(selKf\)/.test(read("src/components/GraphicDestinationMotion.jsx")));
check("closeGap ripples via shiftLayerTimes (keyframes travel) and skips locked layers", (() => {
  const gdm = read("src/components/GraphicDestinationMotion.jsx");
  return gdm.includes("dtById.has(o.id) && !o.locked ? shiftLayerTimes(o, dtById.get(o.id), ctxDur) : o");
})());
check("gap selection is exclusive (selecting a layer clears it)", read("src/components/GraphicDestinationMotion.jsx").includes("useEffect(() => { if (selIds.length) setSelGap(null); }, [selIds]);"));

/* ================= 3. lock + hide toggles ================= */
console.log("lock + hide toggles");
check("eye/eye-off toggle button wired to toggleHide", TL.includes('className="gd-tl-hide"') && TL.includes("toggleHide(o.id)"));
check("open/closed padlock toggle button wired to toggleLock", TL.includes('className="gd-tl-lock"') && TL.includes("toggleLock(o.id)"));
check("hide toggle is a real two-state icon (EyeIcon with off state, not a color-only glyph)", /export function EyeIcon\(\{ off/.test(TL) && TL.includes("<EyeIcon off={!!o.hidden}"));
check("lock toggle is a real two-state icon (PadlockIcon solid when locked)", /export function PadlockIcon\(\{ locked/.test(TL) && TL.includes("<PadlockIcon locked={!!o.locked}"));
check("both toggles expose aria-pressed state", TL.includes("aria-pressed={!!o.hidden}") && TL.includes("aria-pressed={!!o.locked}"));
check("the old text glyphs are gone from the lane headers", !TL.includes('"⊘"') && !TL.includes('"◉"'));
check("GDM still provides the original toggleHide/toggleLock mechanisms", (() => {
  const gdm = read("src/components/GraphicDestinationMotion.jsx");
  return gdm.includes("const toggleHide = (id) => patchObject(id, (o) => ({ ...o, hidden: !o.hidden }));")
    && gdm.includes("const toggleLock = (id) => patchObject(id, (o) => ({ ...o, locked: !o.locked }));");
})());

/* ================= 4. sticky header + docked timeline ================= */
console.log("sticky header + docked timeline");
{
  const ed = read("src/pages/Editor.jsx");
  const gdm = read("src/components/GraphicDestinationMotion.jsx");
  check("editor shell root clips any page scroll (overflow hidden)", ed.includes('overflow: "hidden"'));
  check("editor header is sticky at top as a fallback", ed.includes('position: "sticky"') && ed.includes("top: 0"));
  check("GDM fills its parent (height 100% — no more 100vh overflow under the shell header)", gdm.includes('height: "100%"') && !gdm.includes('height: "100vh"'));
  check("timeline is docked: fixed height, flexShrink 0", TL.includes("height: tlH") && TL.includes("flexShrink: 0"));
  check("only the timeline track area scrolls internally", TL.includes('overflowY: "auto"'));
}

/* ================= 5. top-bar purge + relocated save ================= */
console.log("top-bar purge + save relocation");
{
  const tb = read("src/components/editor/TopBar.jsx");
  const gdm = read("src/components/GraphicDestinationMotion.jsx");
  const ed = read("src/pages/Editor.jsx");
  check("logo block removed from the editor top bar", !tb.includes("Zwoosh") && !tb.includes("v0.5"));
  check("duplicate project-title input removed from the top bar", !tb.includes("gd-name-input") && !tb.includes("setName"));
  check("Save/Load button removed from the top bar", !tb.includes("Save / Load") && !tb.includes("setIoOpen"));
  check("Share button removed from the editor chrome", !tb.includes("Share") && !ed.includes("ShareDialog") && !ed.includes("shareOpen") && !ed.includes("sharedPill"));
  check('"saved" status text removed from the shell header', !ed.includes("status.text") && !ed.includes("saveBtnState") && !ed.includes("gd-save"));
  check("autokey control removed from the top bar", !/autokey/i.test(tb));
  /* R9w1: the Animate arm toggle was RESTORED beside the Grid toggle (the
     user asked for it back with explicit arm/disarm behavior) */
  check("R9w1: the Animate arm toggle is restored beside the Grid toggle", TL.includes("gd-animate-toggle") && TL.includes("aria-pressed={!!animateArm}") && TL.indexOf("gd-grid-toggle") < TL.indexOf("gd-animate-toggle"));
  check("R9w1: autokey follows the arm (no constant, no old gd:autokey pref)", gdm.includes("const autokey = animateArm;") && !gdm.includes("AUTOKEY_ALWAYS_ON") && !gdm.includes('getItem("gd:autokey")'));
  check("canvas keyframing sites still consult `autokey` (the arm state)", gdm.includes("if (autokey && (obj.tracks.rotation || []).length)") && gdm.includes("if (!autokey) { patchProps(id, { [prop]: v }); return; }"));
  check("Save/Load modal fully disconnected (no IOModal usage)", !gdm.includes("IOModal") && !/\bioOpen\b/.test(gdm) && !gdm.includes("copyProject"));
  /* R9w1: Export moved from the top bar into the timeline transport bar,
     beside the save control, keeping the amber accent treatment */
  check("R9w1: Export left the top bar for the timeline transport bar (still prominent)", !tb.includes(">Export<") && TL.includes("gd-tl-export") && TL.includes("gd-btn-accent"));
  check("stage preset + Brand survive the purge", tb.includes("STAGE_PRESETS") && tb.includes("Brand"));
  check("shell still shows the project title once (center of the sticky header)", ed.includes("{proj.name}"));
  check("shell passes saveState + onSaveNow into the editor", ed.includes("saveState={saveState}") && ed.includes("onSaveNow={saveNow}"));
  check("GDM builds the save control only when the shell wires it", gdm.includes("const saveCtl = saveState && onSaveNow ? { state: saveState, onSave: onSaveNow } : null;"));
  check("save control renders in the timeline transport bar", TL.includes("gd-tl-save") && TL.includes("saveCtl.onSave"));
  check("save button IS the state indicator (4 color states)", TL.includes("SAVE_BTN_STATE") && ["dirty", "saving", "saved", "error"].every((s) => TL.includes(`${s}: {`)));
  check("save button clickability matches the old top-bar rule (dirty/error only)", TL.includes('disabled={saveCtl.state !== "dirty" && saveCtl.state !== "error"}'));
  check("demo route passes no save props (saveCtl stays null → no button)", (() => {
    const demoLine = ed.split("!id ? (")[1].split(") : loadErr")[0];
    return demoLine.includes("<GraphicDestinationMotion") && !demoLine.includes("saveState") && !demoLine.includes("onSaveNow");
  })());
}

/* ================= 6. grid toggle ================= */
console.log("enable-grid toggle + export exclusion");
{
  const sv = read("src/components/editor/StageView.jsx");
  const gdm = read("src/components/GraphicDestinationMotion.jsx");
  const exportSrc = fs.readdirSync(path.join(here, "src/export")).filter((f) => f.endsWith(".js")).map((f) => read(`src/export/${f}`)).join("\n");
  const engineSrc = fs.readdirSync(path.join(here, "src/engine")).filter((f) => f.endsWith(".js")).map((f) => read(`src/engine/${f}`)).join("\n");
  check("grid toggle sits in the timeline transport bar", TL.includes("gd-grid-toggle") && TL.includes("onToggleGrid"));
  check("toggle is labelled Enable grid with an export-safety hint", TL.includes("Enable grid") && TL.includes("never exported"));
  check("toggle state is persisted (gd:grid)", gdm.includes('GRID_KEY = "gd:grid"') && gdm.includes("localStorage.setItem(GRID_KEY"));
  check("GDM threads showGrid into StageView", gdm.includes("showGrid={showGrid}"));
  check("grid overlay renders only when enabled (showGrid gate)", sv.includes("{showGrid && ("));
  check("grid is a subtle 40px low-opacity lattice", sv.includes('backgroundSize: "40px 40px"') && sv.includes("rgba(255,255,255,.05)"));
  check("grid never intercepts pointer events", /gd-grid-overlay[\s\S]*?pointerEvents: "none"/.test(sv));
  check("grid overlay is StageView-only (exports render StageObject, never StageView)", sv.includes("gd-grid-overlay") && !TL.includes("gd-grid-overlay") && !gdm.includes("gd-grid-overlay"));
  check("export pipeline has no grid reference at all", !exportSrc.includes("grid-overlay") && !exportSrc.includes("showGrid"));
  check("frameRenderer renders StageObject directly (StageView is not in the export path)", exportSrc.includes("StageObject") && !exportSrc.includes("StageView"));
  check("engine render code has no grid reference", !engineSrc.includes("grid-overlay") && !engineSrc.includes("showGrid"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All R8w1 checks pass.");
process.exit(failed ? 1 : 0);
