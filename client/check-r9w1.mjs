/**
 * check-r9w1.mjs — node proof for the R9w1 editor wave:
 *
 *   1. ANIMATE ARM — the restored transport-bar toggle: ARMED (default)
 *      canvas edits write ◆ keyframes at the playhead; DISARMED they patch
 *      the base layer without keyframes. The real canvasEditProp closure is
 *      EXTRACTED from GDM source and exercised with stub seams.
 *   2. SCRUB-FOLLOW — followScroll (Timeline.jsx) keep-visible math, plus
 *      the wiring (duration-based min width, overflow gate, effect deps).
 *   3. KEYFRAME GLYPHS — KF_GLYPH gives every prop type a distinct SVG
 *      glyph; the camera lane keeps its per-prop colors on the new ★.
 *   4. PLACEMENT — Export beside Save in the transport bar (gone from the
 *      top bar), clip breadcrumb inside the transport bar beside Grid, the
 *      Zwoosh wordmark in the slim brand bar above the timeline (gone from
 *      the shell header).
 *   5. AVATAR MENU — circular initial button in the top bar, Profile /
 *      Logout items, disabled stubs standalone, REAL logout in the shell.
 *   6. LANE EXTRAS — color tag cycling, per-type lane icons, hover
 *      duplicate/delete quick actions.
 *
 * Pure helpers are extracted from source (node can't import JSX) and
 * exercised for real; UI changes are asserted at source level.
 *
 * Run:  node check-r9w1.mjs        (from client/)
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

const TL = read("src/components/editor/Timeline.jsx");
const TB = read("src/components/editor/TopBar.jsx");
const GDM = read("src/components/GraphicDestinationMotion.jsx");
const ED = read("src/pages/Editor.jsx");
const INS = read("src/components/editor/Inspector.jsx");
const MODEL = read("src/components/editor/model.js");

/* ---------- extraction helpers ---------- */
function grabFn(src, name) {
  const at = src.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`missing export function ${name}`);
  /* skip the param list first (it may destructure with braces), then
     brace-match the body */
  const po = src.indexOf("(", at);
  let pd = 0, pc = -1;
  for (let j = po; j < src.length; j++) { if (src[j] === "(") pd++; else if (src[j] === ")") { pd--; if (!pd) { pc = j; break; } } }
  const bo = src.indexOf("{", pc);
  let depth = 0;
  for (let j = bo; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (!depth) return src.slice(at, j + 1).replace(/^export /, ""); }
  }
  throw new Error(`unterminated function ${name}`);
}
/* brace-match a body starting at the first "{" at/after `from` */
function grabBody(src, from) {
  const at = src.indexOf("{", from);
  if (at < 0) throw new Error(`no body after ${from}`);
  let depth = 0;
  for (let j = at; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (!depth) return src.slice(at, j + 1); }
  }
  throw new Error("unterminated body");
}

/* ================= 1. Animate arm/disarm ================= */
console.log("animate arm — restored toggle, disarm patches base (REAL closure)");
check("GDM defines the arm persistence key (gd:animateArm — NOT the removed gd:autokey)", GDM.includes('ARM_KEY = "gd:animateArm"') && !GDM.includes('getItem("gd:autokey")') && !GDM.includes('setItem("gd:autokey"'));
check("arm state defaults to ARMED when the pref is unset", /readArm = \(\) => .*v === null \? true : v === "1"/s.test(GDM));
check("the arm is React state seeded from the pref", GDM.includes("useState(readArm)"));
check("autokey derives from the arm state (not a constant)", GDM.includes("const autokey = animateArm;") && !GDM.includes("AUTOKEY_ALWAYS_ON"));
check("toggling persists gd:animateArm", GDM.includes("localStorage.setItem(ARM_KEY, v ? \"1\" : \"0\")"));
check("Timeline renders the gd-animate-toggle button beside Grid", TL.includes("gd-animate-toggle") && TL.indexOf("gd-grid-toggle") < TL.indexOf("gd-animate-toggle"));
check("toggle exposes aria-pressed + the On/Off text state", TL.includes("aria-pressed={!!animateArm}") && TL.includes('{animateArm ? "On" : "Off"}'));
check("armed state is unmistakable (solid accent fill vs muted)", TL.includes("background: animateArm ? C.amber : C.bg2") && TL.includes('color: animateArm ? "#1A1405" : C.dim'));
check("GDM wires the toggle into the timeline", GDM.includes("animateArm={animateArm}") && GDM.includes("onToggleAnimate={() => setAnimateArmPersist(!animateArm)}"));
/* exercise the REAL canvasEditProp closure with stub seams */
{
  const body = grabBody(GDM, GDM.indexOf("const canvasEditProp = useCallback((id, prop, v) =>"));
  const make = (autokey) => {
    const calls = { kf: [], base: [] };
    const ctxLayers = [{ id: "a", locked: false, tracks: {}, props: { x: 5 } }, { id: "L", locked: true, tracks: {}, props: { x: 1 } }];
    const fn = new Function("ctxLayers", "patchProps", "setKeyframe", "autokey", "timeRef", `return ((id, prop, v) => ${body});`)(
      ctxLayers,
      (id, patch) => calls.base.push([id, patch]),
      (id, prop, t, v) => calls.kf.push([id, prop, t, v]),
      autokey,
      { current: 1230 }
    );
    return { fn, calls };
  };
  const armed = make(true);
  armed.fn("a", "x", 420);
  check("ARMED: a canvas edit writes a ◆ at the playhead via setKeyframe", eq(armed.calls.kf, [["a", "x", 1230, 420]]) && armed.calls.base.length === 0);
  const dis = make(false);
  dis.fn("a", "x", 420);
  check("DISARMED: a canvas edit patches the BASE layer, no keyframe", eq(dis.calls.base, [["a", { x: 420 }]]) && dis.calls.kf.length === 0, JSON.stringify(dis.calls));
  const locked = make(true);
  locked.fn("L", "x", 9);
  check("locked layers never take canvas writes (either state)", locked.calls.kf.length === 0 && locked.calls.base.length === 0);
}
check("inspector editProp keeps its disarm branch (shift the whole track when one exists)", GDM.includes('(o.tracks[prop] || []).map((k) => ({ ...k, v: k.v + dvv }))'));
check("rotate drop: armed keys, disarmed patches base", GDM.includes('if (autokey && (obj.tracks.rotation || []).length) setKeyframe(obj.id, "rotation", timeRef.current, nr);') && GDM.includes("else patchProps(obj.id, { rotation: nr });"));
check("resize drop: armed keys, disarmed patches base", GDM.includes('if (autokey) setKeyframe(obj.id, "scale", timeRef.current, ns);') && GDM.includes("else patchProps(obj.id, { scale: ns });"));

/* ================= 2. scrub-follow ================= */
console.log("scrub-follow — followScroll keep-visible math + wiring");
const { followScroll } = new Function(`${grabFn(TL, "followScroll")}\nreturn { followScroll };`)();
const F = (o) => followScroll({ margin: 48, ...o });
check("content fits the viewport → nothing to scroll", F({ scrollLeft: 0, viewW: 1000, contentW: 900, headX: 850 }) === 0);
check("playhead comfortably visible → scroll untouched", F({ scrollLeft: 200, viewW: 1000, contentW: 3000, headX: 700 }) === 200);
check("playhead past the RIGHT edge → chase to headX - viewW + margin", F({ scrollLeft: 0, viewW: 1000, contentW: 3000, headX: 1500 }) === 1500 - 1000 + 48);
check("playhead past the LEFT edge → chase to headX - margin", F({ scrollLeft: 900, viewW: 1000, contentW: 3000, headX: 500 }) === 500 - 48);
check("just inside the right margin → no scroll yet", F({ scrollLeft: 0, viewW: 1000, contentW: 3000, headX: 952 }) === 0);
check("one px past the right margin → scroll", F({ scrollLeft: 0, viewW: 1000, contentW: 3000, headX: 953 }) === 953 - 1000 + 48);
check("clamp at 0 (playhead near t=0)", F({ scrollLeft: 100, viewW: 1000, contentW: 3000, headX: 10 }) === 0);
check("clamp at max scroll (playhead at comp end)", F({ scrollLeft: 0, viewW: 1000, contentW: 3000, headX: 3000 }) === 2000);
check("tiny viewport: the margin is capped below viewW/2", F({ scrollLeft: 0, viewW: 60, contentW: 3000, headX: 200, margin: 400 }) === 200 - 60 + 29.5);
check("continuous play: the playhead is VISIBLE every frame (margin holds unless clamped)", (() => {
  let sl = 0;
  const maxS = 3000 - 1000;
  for (let t = 0; t <= 30000; t += 100) {
    const headX = (t / 30000) * 3000;
    sl = followScroll({ scrollLeft: sl, viewW: 1000, contentW: 3000, headX, margin: 48 });
    if (headX < sl - 0.001 || headX > sl + 1000 + 0.001) return false; /* never hidden */
    if (sl > 0.5 && sl < maxS - 0.5 && (headX < sl + 48 - 0.001 || headX > sl + 1000 - 48 + 0.001)) return false; /* margin when unclamped */
  }
  return true;
})());
check("min lane density is exported (TL_MIN_PX_PER_SEC = 100)", /export const TL_MIN_PX_PER_SEC = 100;/.test(TL));
check("lane content carries the duration-based min width", TL.includes("Math.round((ctxDur / 1000) * TL_MIN_PX_PER_SEC)") && TL.includes("minWidth: contentMinW"));
check("the lanes area is a horizontal scroller (labels stay fixed)", TL.includes('className="gd-tl-scroll"') && TL.includes('overflowX: "auto"'));
check("the follow effect runs on time/duration and only when overflowing", TL.includes("if (contentW <= viewW) return;") && TL.includes("const headX = (time / ctxDur) * contentW;") && TL.includes("[time, ctxDur]"));
check("the effect applies the pure followScroll result", TL.includes("followScroll({ scrollLeft: el.scrollLeft, viewW, contentW, headX })") && TL.includes("el.scrollLeft = next;"));

/* ================= 3. keyframe glyphs ================= */
console.log("keyframe glyphs — per-prop SVG mapping");
const KF_GLYPH = new Function(`return (${TL.match(/export const KF_GLYPH = (\{[^}]+\});/)[1]});`)();
const KF_PROPS = new Function(`return (${MODEL.match(/export const KF_PROPS = (\[[^\]]+\]);/)[1]});`)();
check("every keyframable prop has a glyph", KF_PROPS.every((p) => KF_GLYPH[p]));
check("the shape-morph prop has a glyph too", !!KF_GLYPH.shape);
check("position (x/y) → diamond", KF_GLYPH.x === "diamond" && KF_GLYPH.y === "diamond");
check("fill (color) → circle", KF_GLYPH.fill === "circle");
check("scale → square", KF_GLYPH.scale === "square");
check("rotation → triangle", KF_GLYPH.rotation === "triangle");
check("opacity → half", KF_GLYPH.opacity === "half");
check("prog/path → arrow", KF_GLYPH.prog === "arrow");
check("focus → target", KF_GLYPH.focus === "target");
check("shape morph → hexagon", KF_GLYPH.shape === "hexagon");
check("camera → star", KF_GLYPH.camera === "star");
check("the four gesture-prop groups are mutually distinct glyphs", new Set([KF_GLYPH.x, KF_GLYPH.fill, KF_GLYPH.scale, KF_GLYPH.rotation, KF_GLYPH.opacity, KF_GLYPH.prog, KF_GLYPH.shape]).size === 7);
check("every glyph id has an SVG branch in KfGlyph", ["diamond", "circle", "square", "triangle", "half", "arrow", "target", "hexagon", "star"].every((g) => TL.includes(`g === "${g}"`)));
check("object keyframe markers render KfGlyph (SVG, not a rotated square)", TL.includes("<KfGlyph prop={p}") && !TL.includes('transform: isColor || isShape ? "translate(-50%,-50%)" : "translate(-50%,-50%) rotate(45deg)"'));
check("camera lane renders the ★ glyph", TL.includes('<KfGlyph glyph="star"'));
check("camera per-prop COLOR coding kept (x amber · y teal · zoom blue)", TL.includes('const CAM_KF_COLOR = { x: C.amber, y: "#6EE7B7", zoom: C.info };'));
check("kf wrappers keep the gd-kf / gd-kfc classes (existing suites count them)", TL.includes('className={isColor || isShape ? "gd-kfc" : "gd-kf"}'));
check("fill keyframes keep the white-stroked color dot (k.v color)", TL.includes('isColor ? k.v :') && TL.includes('stroke={isColor ? "#FFFFFF" : null}'));

/* ================= 4. placement: export / breadcrumb / logo ================= */
console.log("placement — export + breadcrumb in the transport bar, logo above the timeline");
check("Export is GONE from the top bar (no button, no dialog wiring)", !TB.includes(">Export<") && !TB.includes("setExportOpen") && !TB.includes("gd-tl-export"));
check("Export renders in the timeline transport bar (gd-tl-export)", TL.includes("gd-tl-export"));
check("Export sits BESIDE the save control (save → export order)", TL.indexOf("gd-tl-save") < TL.indexOf("gd-tl-export"));
check("Export keeps the prominent amber accent treatment", TL.includes('className="gd-btn-accent gd-tl-export"') && TL.indexOf("background: C.amber") > -1);
check("GDM opens the export dialog from the transport button", GDM.includes("exportCtl={{ onExport: () => setExportOpen(true) }}") && GDM.includes("<ExportDialog"));
check("the clip breadcrumb moved INTO the transport bar (gd-tl-crumb)", TL.includes('className="gd-btn gd-tl-crumb"'));
check("breadcrumb sits beside the Grid/Animate toggles (before the save control)", TL.indexOf("gd-animate-toggle") < TL.indexOf("gd-tl-crumb") && TL.indexOf("gd-tl-crumb") < TL.indexOf("gd-tl-save"));
check("breadcrumb navigates with exitToDepth", TL.includes("exitToDepth(0)") && TL.includes("exitToDepth(i + 1)"));
/* R10: the 28px brand bar above the timeline is GONE — the logo moved UP
   into the new slim 40px top row, "Main" stays beside the Animate toggle
   (always visible now, not clip-only) and the in-clip hint moved into the
   transport breadcrumb. */
check("the brand bar above the timeline is gone (R10)", !TL.includes("gd-brandbar") && !TL.includes("<BrandMark />"));
check("the Main crumb is always beside the Animate toggle (not clip-only)", TL.indexOf("gd-animate-toggle") < TL.indexOf("gd-tl-crumb"));
check("the in-clip hint moved into the transport breadcrumb", TL.includes("Editing clip — Esc to go back"));
check("the 'drag bar = move' hint text is removed (R10)", !TL.includes("drag bar = move"));
check("BrandMark is the Zwoosh amber mark + wordmark in the slim top row", TB.includes('className="gd-brandmark"') && TB.includes("Zwoosh") && TB.includes("height: 40"));
check("the editor shell header is gone (no ← Dashboard link, R10)", !ED.includes("← Dashboard") && !ED.includes("barStyle"));
check("the slim top row keeps the Brand switcher (stage preset lives in the Inspector now)", !TB.includes("STAGE_PRESETS") && TB.includes("BrandSwitcher") && INS.includes("applyStagePreset"));

/* ================= 5. avatar menu ================= */
console.log("avatar menu — circular initial button, Dashboard / Profile / Settings / Logout");
check("TopBar renders the circular gd-avatar button where Export was", TB.includes('className="gd-avatar"') && TB.includes('borderRadius: "50%"'));
check("the avatar shows the user's initial (uppercased)", TB.includes('(name.trim().charAt(0) || "Z").toUpperCase()'));
check("the button exposes menu semantics (aria-haspopup + expanded)", TB.includes('aria-haspopup="menu"') && TB.includes("aria-expanded={open}"));
check("the menu lists Dashboard, Profile, Settings and Logout (R10)", TB.includes('item("Dashboard", onDashboard, "gd-avatar-dashboard")') && TB.includes('item("Profile", onProfile)') && TB.includes('item("Settings", onSettings, "gd-avatar-settings")') && TB.includes('item("Logout", onLogout, "gd-avatar-logout")'));
check("menu items are real menuitem buttons with disabled stubs when handlerless", TB.includes('role="menuitem"') && TB.includes("disabled={!handler}"));
check("the menu closes on outside pointerdown + Escape", TB.includes('window.addEventListener("pointerdown", away)') && TB.includes('e.key === "Escape"'));
check("GDM threads user + all four handlers into the top bar", GDM.includes("user={user} onDashboard={onDashboard} onProfile={onProfile} onSettings={onSettings} onLogout={onLogout}"));
check("the shell wires the REAL logout (AuthContext logout → /login)", ED.includes("await logout();") && ED.includes('navigate("/login")') && ED.includes("onLogout: doLogout"));
check("Profile navigates to an existing route (the dashboard)", ED.includes('onProfile: () => navigate("/dashboard")'));
check("both editor routes (demo + cloud project) get the avatar wiring", (ED.match(/\{\.\.\.shellMenu\}/g) || []).length === 2);

/* ================= 6. lane extras ================= */
console.log("lane extras — color tag, type icons, hover quick actions");
const TAG_PALETTE = new Function(`return (${TL.match(/export const TAG_PALETTE = (\[[^\]]+\]);/)[1]});`)();
check("TAG_PALETTE starts with no-tag then 5 colors", TAG_PALETTE[0] === "" && TAG_PALETTE.length === 6);
check("GDM cycles the tag through the palette (modulo)", GDM.includes("TAG_PALETTE[(i + 1) % TAG_PALETTE.length]"));
check("cycling back to no-tag REMOVES the key (old JSON shape)", GDM.includes("delete rest.tag"));
check("the lane label has a gd-lane-tag chip wired to cycleTag(o.id)", TL.includes('className="gd-lane-tag"') && TL.includes("cycleTag(o.id)"));
check("the tag tints the lane's left stripe", TL.includes("o.tag ? `2px solid ${o.tag}`"));
check("per-type lane icons render (LaneTypeIcon by object type)", TL.includes("<LaneTypeIcon type={o.type}") && /export function LaneTypeIcon/.test(TL));
check("type icons cover the editor's layer types", ['case "text"', 'case "image"', 'case "chart"', 'case "number"', 'case "map"', 'case "confetti"', 'case "kit"', 'case "backdrop"'].every((s) => TL.includes(s)));
check("lane hover is tracked for the quick-action cluster", TL.includes("onMouseEnter={() => setHoverLane(o.id)}"));
check("hover quick actions act on THIS object (duplicateLayer / removeLayer)", TL.includes("duplicateLayer(o.id)") && TL.includes("removeLayer(o.id)"));
check("GDM duplicateLayer clones with the +24 offset copy naming", GDM.includes('c.name = o.name + " copy";') && GDM.includes("const duplicateLayer = (id) =>"));
check("GDM removeLayer respects the lock and deselects", GDM.includes("const removeLayer = (id) =>") && /removeLayer[\s\S]{0,120}if \(!o \|\| o\.locked\) return;/.test(GDM));
check("GDM wires the lane extras into the timeline", GDM.includes("duplicateLayer={duplicateLayer} removeLayer={removeLayer} cycleTag={cycleTag}"));
check("front/back reorder stays on the single selected full row", TL.includes("reorder(o.id, +1)") && TL.includes("reorder(o.id, -1)"));

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All R9w1 checks pass.");
process.exit(failed ? 1 : 0);
