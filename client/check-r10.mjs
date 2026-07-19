/**
 * check-r10.mjs — guard suite for the R10 UX wave (12 fixes). Two parts:
 *
 *   PART A — source-level guards (cheap, runs anywhere node does):
 *     1. AudioPanel wired to the REAL audioFileRef (not assetFileRef) — the
 *        Upload button must click the audio input (AUDIO_ACCEPT_ATTR +
 *        onPickAudioAsset), not the image-asset input.
 *     2. Empty audio lane click selects nothing / opens nothing — only a
 *        real track selects; the rail Audio button is the only panel opener.
 *     3. Undo-delete: undoRef/pushUndo/undoDelete wired into removeSelected +
 *        removeLayer + the Ctrl/Cmd+Z keydown handler, with a form-field bail
 *        so text inputs keep native undo.
 *     4. StageView receives hidden-filtered ctxLayers (hidden layers are
 *        FULLY invisible on the canvas, not 32%-opacity ghosts); the Timeline
 *        still lists every layer (eye toggle un-hides).
 *     5. No hide/lock controls in the Inspector (passive status text only);
 *        the timeline lane keeps the eye + padlock toggles.
 *     6. Disarm-nudge: .gd-disarm-nudge banner (+ gdNudgeIn animation), raise
 *        sites on disarmed move/rotate/clip-scale, re-arm + dismiss paths,
 *        re-arm settles the nudge, arm persists in localStorage.
 *     7. Old top chrome gone: no 44px TopBar / Editor shell header; ONE slim
 *        40px .gd-topbar with BrandMark/"Zwoosh" + BrandSwitcher + avatar
 *        menu (Dashboard/Profile/Settings/Logout — real logout via the shell).
 *     8. The "drag bar = move · edges = trim · right-click = easing" hint is
 *        gone from the timeline.
 *     9. The "Main" crumb lives in the timeline transport bar beside the
 *        Animate toggle (root marker + in-clip link), not in the top bar.
 *    10. MapsPanel is a standard LEFT .gd-panel drawer (left:84 · width 268 ·
 *        zIndex 30) + the .gd-main > .gd-panel width-normalization CSS.
 *    11. Text effects are gone from the TextPanel (the 4 style presets stay);
 *        textFx chips stay available in the Inspector's Text card.
 *    12. The country ChipRow is gone from the Inspector's map card (picking
 *        happens in the Maps panel at insert); trace style/timing stay.
 *
 *   PART B — full-stack browser run (ONE server boot: real Express serving
 *   the BUILT client + headless Chromium):
 *     1. ROTATION FULL CHAIN per type (shape/text/image/kit/clip): insert →
 *        rotate on canvas → rotation ▲ on the timeline → save → reload →
 *        ▲ persists (two rotates per type, scrubbed ~600ms apart so the
 *        ±5ms keyframe-replace never merges them).
 *     2. UNDO-DELETE: Delete key removes (canvas + timeline) → Ctrl+Z in a
 *        form field does NOT restore → Ctrl+Z outside restores both.
 *     3. HIDE INVISIBILITY: the eye toggle removes the layer's canvas node
 *        entirely (no ghost opacity) while the lane stays listed.
 *     4. TEXT LIVE EDIT: typing in the Inspector text box updates the canvas.
 *     5. DISARM-NUDGE: disarm Animate → canvas drag writes no ◆ and raises
 *        the banner → one click re-arms (banner settles, pref persisted).
 *     6. AUDIO PROBE: hidden audio input carries the exact accept attr; an
 *        empty-lane click opens no panel; the rail button does.
 *     7. ZERO page errors / app console errors across the whole run.
 *
 * Run:  npm run build && node check-r10.mjs        (from client/)
 * Requires: client deps + server deps + a Chromium (Playwright's or
 * /usr/bin/chromium). The server is spawned on an ephemeral port with a
 * throwaway JWT secret and killed at the end.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, "..", "server");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ok   ${name}${detail !== "" ? ` (${detail})` : ""}`); }
  else { failed++; console.log(`  FAIL ${name}${detail !== "" ? ` — ${detail}` : ""}`); }
}

const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");
const GDM = read("src/components/GraphicDestinationMotion.jsx");
const AP = read("src/components/editor/panels/AudioPanel.jsx");
const TL = read("src/components/editor/Timeline.jsx");
const TB = read("src/components/editor/TopBar.jsx");
const ED = read("src/pages/Editor.jsx");
const INS = read("src/components/editor/Inspector.jsx");
const MP = read("src/components/editor/panels/MapsPanel.jsx");
const TP = read("src/components/editor/panels/TextPanel.jsx");
const SV = read("src/components/editor/StageView.jsx");
const SO = read("src/components/StageObject.jsx");

/* ---------- extraction helpers ---------- */
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
/* extract a `const name = … => {…}` / `function name(…) {…}` body — anchored
   at the DEFINITION (earlier comment mentions of the name don't mislead it) */
function fnBody(src, name) {
  let at = src.indexOf(`const ${name} =`);
  if (at < 0) at = src.indexOf(`function ${name}(`);
  if (at < 0) at = src.indexOf(name);
  if (at < 0) throw new Error(`missing ${name}`);
  return grabBody(src, at);
}
/* extract one JSX element's props substring: `<Tag …` up to the closing `>` or `/>` at paren-depth 0 */
function jsxProps(src, tag, from = 0) {
  const at = src.indexOf(`<${tag} `, from);
  if (at < 0) return "";
  let i = at + tag.length + 1, depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth <= 0) break;
  }
  return src.slice(at, i);
}
/* strip /* *\/ + // comments so prose never satisfies a negative guard */
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* ================================================================
   PART A — source-level guards
   ================================================================ */
console.log("\n=== PART A — source-level guards ===");

/* ---------- 1. AudioPanel ← the REAL audioFileRef ---------- */
console.log("\n#A1 AudioPanel wired to the real audioFileRef (not assetFileRef)");
{
  const ap = jsxProps(GDM, "AudioPanel");
  check("GDM renders <AudioPanel audioFileRef={audioFileRef}>", /\baudioFileRef=\{audioFileRef\}/.test(ap), ap.slice(0, 90));
  check("GDM's AudioPanel wiring never touches assetFileRef (the old bug)", !/assetFileRef/.test(ap));
  check("AudioPanel destructures the audioFileRef prop", /\{\s*audioFileRef,/.test(AP) || /,\s*audioFileRef,/.test(AP));
  check("AudioPanel never references assetFileRef", !/assetFileRef/.test(AP));
  check("the Upload button clicks audioFileRef.current?.click()", AP.includes("audioFileRef.current?.click()"));
  const audioInput = GDM.match(/<input ref=\{audioFileRef\}[^>]*>/);
  check("GDM mounts a dedicated audio file input", !!audioInput);
  check("the audio input carries accept={AUDIO_ACCEPT_ATTR} + onChange={onPickAudioAsset}",
    !!audioInput && audioInput[0].includes("accept={AUDIO_ACCEPT_ATTR}") && audioInput[0].includes("onChange={onPickAudioAsset}"), audioInput ? audioInput[0] : "missing");
  const pick = fnBody(GDM, "onPickAudioAsset");
  check("onPickAudioAsset validates (validateAudioFile), uploads (api.uploadAsset), attaches (attachAudioAsset)",
    pick.includes("validateAudioFile(") && pick.includes("api.uploadAsset(") && pick.includes("attachAudioAsset("));
}

/* ---------- 2. Empty audio lane click does NOT pop the panel ---------- */
console.log("\n#A2 empty audio lane click doesn't call setAudioOpen");
{
  const lane = fnBody(GDM, "onAudioLaneDown");
  check("onAudioLaneDown never calls setAudioOpen (the old surprise upload window)", !lane.includes("setAudioOpen"), noComments(lane).replace(/\s+/g, " ").slice(0, 120));
  check("onAudioLaneDown still selects a real attached track", lane.includes("if (audioTrack) selectAudio()"));
  check("onAudioLaneDown keeps the right-button bail + stopPropagation", lane.includes("e.button === 2") && lane.includes("e.stopPropagation()"));
  check("timeline lane header hint points at the rail (not a click-to-open)", TL.includes("No audio attached — open the Audio panel from the rail to add a track"));
  check("timeline lane bar empty-state hint points at the Audio panel", TL.includes("No audio attached — open the Audio panel to add a track"));
}

/* ---------- 3. Undo-delete ---------- */
console.log("\n#A3 undoRef/pushUndo/undoDelete → removeSelected + removeLayer + Ctrl/Cmd+Z");
{
  check("GDM declares the single-slot undoRef", GDM.includes("const undoRef = useRef(null)"));
  const push = fnBody(GDM, "pushUndo");
  check("pushUndo snapshots the FULL tree + selection + clip path (deep copy)",
    push.includes("JSON.parse(JSON.stringify(objects))") && push.includes("selIds: [...selIds]") && push.includes("path: [...path]"));
  const undo = fnBody(GDM, "undoDelete");
  check("undoDelete returns false when the slot is empty", undo.includes("if (!snap) return false"));
  check("undoDelete consumes the slot + restores objects/path/selection",
    undo.includes("undoRef.current = null") && undo.includes("setObjects(snap.objects)") && undo.includes("setPath(snap.path)") && undo.includes("setSelIds(snap.selIds)"));
  const rmSel = fnBody(GDM, "removeSelected");
  check("removeSelected snapshots via pushUndo before filtering", rmSel.includes("pushUndo()"));
  check("removeSelected only snapshots when an UNLOCKED selected layer exists (lock-respecting)", /selIds\.some\(\(id\) => .*!l\.locked/.test(rmSel.replace(/\s+/g, " ")));
  const rmLayer = fnBody(GDM, "removeLayer");
  check("removeLayer snapshots via pushUndo (timeline lane ✕ / hover delete)", rmLayer.includes("pushUndo()"));
  check("removeLayer respects the lock", rmLayer.includes("if (!o || o.locked) return"));
  const keyBody = fnBody(GDM, "onKey");
  check("Ctrl/Cmd+Z routes to undoDelete()", /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "z"[\s\S]*?undoDelete\(\)/.test(keyBody));
  check("the z-handler preventDefaults (no browser undo clash)", /key\.toLowerCase\(\) === "z"[\s\S]*?e\.preventDefault\(\)/.test(keyBody));
  check("the z-handler BAILS on form fields + contentEditable (native text undo wins)",
    /=== "z"[\s\S]*?"INPUT"[\s\S]*?"TEXTAREA"[\s\S]*?"SELECT"[\s\S]*?isContentEditable[\s\S]*?return/.test(keyBody));
  check("Delete/Backspace still routes through removeSelected", keyBody.includes('e.key === "Delete" || e.key === "Backspace"') && keyBody.includes("removeSelected()"));
}

/* ---------- 4. Hidden-filtered StageView ---------- */
console.log("\n#A4 StageView receives hidden-filtered ctxLayers");
{
  const sv = jsxProps(GDM, "StageView");
  check("StageView gets ctxLayers={ctxLayers.filter((o) => !o.hidden)}", sv.includes("ctxLayers={ctxLayers.filter((o) => !o.hidden)}"));
  const tl = jsxProps(GDM, "Timeline");
  check("Timeline still gets the UNFILTERED ctxLayers (hidden lanes stay listed)", /\bctxLayers=\{ctxLayers\}/.test(tl));
  check("StageView maps ctxLayers to <StageObject> nodes", SV.includes("ctxLayers.map((obj)") && SV.includes("<StageObject"));
  check("StageObject's non-interactive (export) path drops hidden layers outright", SO.includes("if (obj.hidden && !(interactive && selected)) return null"));
}

/* ---------- 5. No hide/lock controls in the Inspector ---------- */
console.log("\n#A5 Inspector has no hide/lock controls; timeline lane toggles exist");
{
  check("Inspector never references toggleHide", !INS.includes("toggleHide"));
  check("Inspector never references toggleLock", !INS.includes("toggleLock"));
  check("Inspector renders no Hide/Show/Lock/Unlock titled buttons",
    !/title=\{sel\.(hidden|locked)/.test(INS) && !INS.includes('title="Hide"') && !INS.includes('title="Lock"') && !INS.includes('title="Show"') && !INS.includes('title="Unlock"'));
  check("Inspector keeps the passive locked/hidden status readout", INS.includes("(timeline lane)"));
  const ins = jsxProps(GDM, "Inspector");
  check("GDM no longer passes toggleHide/toggleLock into the Inspector", !ins.includes("toggleHide") && !ins.includes("toggleLock"));
  check("timeline lane eye toggle: gd-tl-hide → toggleHide(o.id) with aria-pressed", TL.includes('className="gd-tl-hide"') && TL.includes("toggleHide(o.id)") && /gd-tl-hide[\s\S]{0,220}aria-pressed/.test(TL));
  check("timeline lane padlock toggle: gd-tl-lock → toggleLock(o.id) with aria-pressed", TL.includes('className="gd-tl-lock"') && TL.includes("toggleLock(o.id)") && /gd-tl-lock[\s\S]{0,220}aria-pressed/.test(TL));
}

/* ---------- 6. Disarm-nudge banner ---------- */
console.log("\n#A6 disarm-nudge banner classes + re-arm paths");
{
  check("the .gd-disarm-nudge class + gdNudgeIn animation are defined", GDM.includes(".gd-disarm-nudge{animation:gdNudgeIn") && GDM.includes("@keyframes gdNudgeIn"));
  check("the banner renders only while disarmed (armNudge && !animateArm), role=status",
    GDM.includes("{armNudge && !animateArm && (") && GDM.includes('className="gd-disarm-nudge" role="status"'));
  check("the banner explains the miss (Animate is Off · no ◆ written)", GDM.includes("Animate is Off") && GDM.includes("no ◆ keyframes were written"));
  check("the gd-nudge-rearm button re-arms via setAnimateArmPersist(true)", /gd-nudge-rearm"[\s\S]{0,160}setAnimateArmPersist\(true\)/.test(GDM));
  check("the gd-nudge-dismiss button dismisses via setArmNudge(false)", /gd-nudge-dismiss"[\s\S]{0,160}setArmNudge\(false\)/.test(GDM));
  const arm = fnBody(GDM, "setAnimateArmPersist");
  check("re-arming (any path) settles the nudge", arm.includes("if (v) setArmNudge(false)"));
  check("the arm persists across sessions (localStorage ARM_KEY)", arm.includes('localStorage.setItem(ARM_KEY, v ? "1" : "0")'));
  const raises = GDM.match(/if \(!autokey\) setArmNudge\(true\)/g) || [];
  check("THREE raise sites: disarmed move + rotate + clip-scale all nudge", raises.length === 3, `${raises.length} sites`);
}

/* ---------- 7. Slim 40px top bar replaces the 44px chrome ---------- */
console.log("\n#A7 old top bar removed — slim .gd-topbar with brand + switcher + avatar menu");
{
  check("TopBar renders the .gd-topbar row", TB.includes('className="gd-topbar"'));
  check("the topbar is SLIM (height: 40, not the old 44px)", TB.includes("height: 40") && !TB.includes("height: 44"));
  check("BrandMark carries the gd-brandmark class + the Zwoosh wordmark", TB.includes('className="gd-brandmark"') && TB.includes("Zwoosh"));
  check("BrandSwitcher stays in the top bar (gd-brandswitch)", TB.includes("gd-brandswitch"));
  check("AvatarMenu renders the circular gd-avatar button (Account menu)", TB.includes('className="gd-avatar"') && TB.includes('aria-label="Account menu"'));
  check("the avatar menu carries Dashboard / Profile / Settings / Logout",
    TB.includes('item("Dashboard", onDashboard') && TB.includes('item("Profile", onProfile') && TB.includes('item("Settings", onSettings') && TB.includes('item("Logout", onLogout'));
  check("menu items render disabled without handlers (standalone stubs)", TB.includes("disabled={!handler}"));
  check("TopBar itself has NO Main crumb and NO Export button (both moved out)", !TB.includes(">Main<") && !TB.includes("Export"));
  check("GDM mounts <TopBar> with brand + kits + the four account handlers",
    GDM.includes("<TopBar brand={brand}") && GDM.includes("user={user} onDashboard={onDashboard} onProfile={onProfile} onSettings={onSettings} onLogout={onLogout}"));
  check("the old 28px brand bar is gone from GDM", !GDM.includes("gd-brandbar"));
  check("Editor shell: no 44px header strip, no Sign-out button", !ED.includes("height: 44") && !ED.includes("Sign out") && !ED.includes("Sign Out"));
  check("Editor shell wires user + onDashboard/onProfile/onSettings/onLogout into GDM",
    ED.includes("onDashboard: () => navigate") && ED.includes("onSettings: () => navigate") && ED.includes("onLogout: doLogout") && /\{\.\.\.shellMenu\}/.test(ED));
  check("Editor logout really logs out via AuthContext then navigates to /login",
    /const doLogout = async \(\) => \{\s*await logout\(\);\s*navigate\("\/login"\);/.test(ED));
}

/* ---------- 8. "drag bar = move" hint gone ---------- */
console.log("\n#A8 the drag-bar hint is gone from the timeline");
{
  check("no 'drag bar = move' hint text in Timeline", !TL.includes("drag bar = move"));
  check("no 'edges = trim · right-click = easing' hint text in Timeline", !TL.includes("edges = trim") && !TL.includes("right-click = easing"));
}

/* ---------- 9. Main crumb beside Animate ---------- */
console.log("\n#A9 Main crumb sits beside the Animate toggle in the transport bar");
{
  const iAnim = TL.indexOf("gd-animate-toggle");
  const iMain = TL.indexOf(">Main</button>");
  check("the Animate arm toggle exists in the transport bar", iAnim > 0);
  check("a Main crumb renders AFTER the Animate toggle in source order", iMain > iAnim, `animate@${iAnim} main@${iMain}`);
  check("TWO Main crumb variants: root marker + in-clip link", (TL.match(/>Main<\/button>/g) || []).length === 2);
  check("the in-clip Main crumb links back to the root timeline (exitToDepth(0))", />Main<\/button>/.test(TL) && TL.includes("onClick={() => exitToDepth(0)}"));
  check("crumbs carry the gd-tl-crumb class + GDM feeds crumbs={ctx.names}", TL.includes("gd-tl-crumb") && jsxProps(GDM, "Timeline").includes("crumbs={ctx.names}"));
}

/* ---------- 10. MapsPanel — standard left drawer, 268 ---------- */
console.log("\n#A10 MapsPanel is a left .gd-panel drawer (width 268) + width normalization");
{
  check("MapsPanel root is className=gd-panel with data-maps-panel", MP.includes('className="gd-panel" data-maps-panel'));
  const wrapAt = MP.indexOf("wrap: {");
  const wrap = wrapAt >= 0 ? MP.slice(wrapAt, wrapAt + 420) : ""; /* window — template-literal ${} braces defeat naive matching */
  check("the wrap anchors left:84 · top:12 · width:268 · zIndex:30",
    wrap.includes("left: 84") && wrap.includes("top: 12") && wrap.includes("width: 268") && wrap.includes("zIndex: 30"), wrap.slice(0, 130));
  check("no right-side overlay positioning remains (was right:12 · width:372 · zIndex:50)",
    !MP.includes("right: 12") && !MP.includes("width: 372") && !MP.includes("zIndex: 50"));
  check("GDM normalizes every left-rail drawer to 268 (.gd-main > .gd-panel)", GDM.includes(".gd-main > .gd-panel{width:268px !important}"));
  check("GDM's main region carries the gd-main class", GDM.includes('className="gd-main"'));
}

/* ---------- 11. Text effects gone from TextPanel (4 presets stay) ---------- */
console.log("\n#A11 TextPanel: effects removed, the 4 style presets stay (fx live in the Inspector)");
{
  check("no TEXT_EFFECTS registry remains", !TP.includes("TEXT_EFFECTS"));
  check("no effectInsertProps helper remains", !TP.includes("effectInsertProps"));
  check("no textFx writes anywhere outside comments", !noComments(TP).includes("textFx"));
  const m = TP.match(/export const TEXT_TIER_PRESETS = (\[[\s\S]*?\]);/);
  let presets = null;
  try { presets = m && eval(m[1]); } catch { /* eval failed */ }
  check("TEXT_TIER_PRESETS holds EXACTLY the 4 tiers (heading/subheading/body/caption)",
    Array.isArray(presets) && presets.length === 4 && JSON.stringify(presets.map((p) => p.id)) === '["heading","subheading","body","caption"]',
    presets ? presets.map((p) => p.id).join(",") : "unreadable");
  /* exercise the REAL presetInsertProps (pure — extracted verbatim) */
  let pip = null;
  try {
    const decl = TP.indexOf("export function presetInsertProps(");
    const body = grabBody(TP, decl);
    const head = TP.slice(decl, TP.indexOf("{", decl));
    pip = new Function(`${head.replace(/^export /, "")} ${body}\nreturn presetInsertProps;`)();
  } catch { /* extraction failed */ }
  check("presetInsertProps extracts + runs in node", typeof pip === "function");
  if (pip) {
    const out = pip({ id: "heading", ls: 0.5, sample: "Heading" }, { heading: { fontFamily: "Inter", fontSize: 64, fontWeight: 800 } }, { colors: ["a", "b", "c", "d", "#EEEEEE"] });
    check("presetInsertProps: settings tier wins, brand text color fills, sample text used",
      out.text === "Heading" && out.fontFamily === "Inter" && out.fontSize === 64 && out.fontWeight === 800 && out.ls === 0.5 && out.fill === "#EEEEEE", JSON.stringify(out));
    const dflt = pip({ id: "caption", ls: 1, sample: "Caption" }, {}, null);
    check("presetInsertProps: empty settings + no brand fall back to engine defaults",
      dflt.fontFamily === "Space Grotesk" && dflt.fontSize === 48 && dflt.fontWeight === 700 && dflt.fill === "#F9F9F9", JSON.stringify(dflt));
  }
  check("the panel renders one button per preset (data-preset)", TP.includes("TEXT_TIER_PRESETS.map(") && TP.includes("data-preset={p.id}"));
  check("textFx chips STAY in the Inspector's Text card (moved, not deleted)", INS.includes("TEXT FX") && INS.includes("TEXTFX_LIST.map("));
}

/* ---------- 12. Country ChipRow gone from the Inspector map card ---------- */
console.log("\n#A12 country ChipRow gone from the Inspector map card");
{
  check("no 'Country' ChipRow remains in the Inspector", !INS.includes('label="Country"'));
  check("the map card (Country map) keeps its trace Effect chips", INS.includes('title="Country map"') && /title="Country map"[\s\S]*?label="Effect"/.test(INS));
  check("the map card keeps fill/border + timing controls", /title="Country map"[\s\S]*?label="Fill"/.test(INS) && /title="Country map"[\s\S]*?label="Border"/.test(INS));
}

/* ---------- lib import: the real AUDIO_ACCEPT_ATTR ---------- */
console.log("\n#A13 audio lib — the accept attr is the five upload extensions");
{
  const at = await import("./src/lib/audioTrack.js");
  check("AUDIO_ACCEPT_ATTR === .mp3,.wav,.ogg,.m4a,.aac", at.AUDIO_ACCEPT_ATTR === ".mp3,.wav,.ogg,.m4a,.aac", at.AUDIO_ACCEPT_ATTR);
  check("validateAudioFile rejects an oversize/wrong-type pick", at.validateAudioFile({ name: "x.exe", size: 100, type: "application/x-msdownload" }).ok === false);
  check("makeAudioTrack carries the schema defaults (startT 0 · vol .8 · fades)", (() => { const t = at.makeAudioTrack({ src: "/a", name: "n" }); return t.startT === 0 && t.volume === 0.8 && t.fadeIn === 500 && t.fadeOut === 1000; })());
}

/* ================================================================
   PART B — full-stack browser run (ONE server boot)
   ================================================================ */
console.log("\n=== PART B — browser (real server + built client + chromium) ===");

/* 48×36 red PNG for the image-layer insert (setInputFiles on the hidden input) */
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAIAAABAJy5dAAAAM0lEQVR42u3OQQkAAAgEsOvqz9wGsYbCYAGWqT4lQkJCQkJCQkJCQkJCQkJCQkJCQp9CC3f0a2YDG56sAAAAAElFTkSuQmCC";

if (!fs.existsSync(path.join(here, "dist", "index.html"))) {
  console.error("run npm run build first");
  process.exit(1);
}

/* ---------- playwright + chromium resolution (same convention as the other UI checks) ---------- */
const req = createRequire(import.meta.url);
let playwright = null;
for (const base of [path.join(here, "node_modules"), "/home/kimi/.npm-global/lib/node_modules", "/usr/lib/node_modules"]) {
  try { playwright = req(req.resolve("playwright", { paths: [base] })); break; } catch { /* next */ }
}
if (!playwright) { console.error("playwright not found"); process.exit(1); }

/* ---------- spawn the real server on an ephemeral port ---------- */
const PORT = 8300 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ["index.js"], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), JWT_SECRET: "r10-smoke-secret" },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not come up");
}

const USER = `r10${Date.now().toString(36)}`;
const PASS = "r10-pass-123";

async function apiFetch(p, opts = {}, cookie) {
  return fetch(`${BASE}${p}`, {
    ...opts,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  });
}

const STAGE_RECT = `(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.style.width === "1280px" && d.style.height === "720px");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, scale: r.width / 1280 };
})()`;
const STAGE_TEXT = `(() => {
  const el = [...document.querySelectorAll("div")].find((d) => d.style.width === "1280px" && d.style.height === "720px");
  return el ? el.textContent : "";
})()`;

async function main() {
  await waitServer();
  let browser = null;
  for (const executablePath of [process.env.CHROMIUM_PATH, "/usr/bin/chromium", null].filter((p, i, a) => p !== undefined && a.indexOf(p) === i)) {
    try { browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] }); break; } catch { /* next */ }
  }
  if (!browser) throw new Error("no usable chromium found");

  const consoleErrors = [];
  const badResponses = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
    page.on("pageerror", (e) => { consoleErrors.push(String(e)); console.log("[pageerror]", String(e).slice(0, 400)); });
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) { consoleErrors.push(m.text()); console.log("[console.error]", m.text().slice(0, 400)); }
    });
    page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

    const stageRect = () => page.evaluate(STAGE_RECT);
    const stageText = () => page.evaluate(STAGE_TEXT);
    const toScreen = (r, sx, sy) => ({ x: r.left + sx * r.scale, y: r.top + sy * r.scale });
    const drag = async (from, ddx, ddy) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (ddx * i) / 6, from.y + (ddy * i) / 6);
      await page.mouse.up();
      await page.waitForTimeout(140);
    };
    const laneCount = () => page.evaluate(() => document.querySelectorAll("button.gd-tl-hide").length);
    const laneNames = () => page.evaluate(() => [...document.querySelectorAll("button.gd-tl-hide")].map((b) => b.getAttribute("aria-label").replace(/^(Hide|Show) /, "")));
    const triCount = () => page.evaluate(() => document.querySelectorAll('.gd-kf [data-glyph="triangle"]').length);
    const diaCount = () => page.evaluate(() => document.querySelectorAll('.gd-kf [data-glyph="diamond"]').length);
    /* ruler click scrubs the playhead (fraction of the 6s comp) */
    const scrubTo = async (frac) => {
      const r = await page.evaluate(() => { const el = document.querySelector("div[style*='col-resize']"); const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
      await page.mouse.click(r.left + r.width * frac, r.top + r.height / 2);
      await page.waitForTimeout(130);
    };
    /* drag the selected layer's rotate grip ~60px (writes one rotation ◆ per drag) */
    const rotateSelected = async () => {
      const grip = page.locator('div[title="Drag to rotate · Shift = 15° steps"]').first();
      const gb = await grip.boundingBox();
      await drag({ x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 }, 60, 0);
    };

    /* ==================== B1. signup → dashboard ==================== */
    console.log("\n#B1 signup");
    await page.goto(`${BASE}/login`);
    await page.waitForTimeout(600);
    await page.locator('button:has-text("Create account")').first().click();
    await page.locator("#gd-user").fill(USER);
    await page.locator("#gd-pass").fill(PASS);
    await page.locator("#gd-confirm").fill(PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    check("signup signs in and lands on the dashboard", page.url().includes("/dashboard"), page.url());
    const cookies = await page.context().cookies(BASE);
    const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    /* ==================== B2. fresh cloud project ==================== */
    console.log("\n#B2 fresh project opens in the editor");
    const cr = await apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name: "R10 rotation chain", data: { objects: [] } }) }, cookieHdr);
    const { id: projId } = await cr.json();
    check("created the fresh project via API", !!projId, `id=${projId}`);
    await page.goto(`${BASE}/editor/${projId}`);
    await page.waitForTimeout(2100);
    check("blank project opens with zero lanes", (await laneCount()) === 0, `${await laneCount()} lanes`);
    check("the stage renders at 1280×720", (await stageRect()) !== null);
    check("the Animate arm starts ARMED (autokey for the rotates)", (await page.locator("button.gd-animate-toggle").getAttribute("aria-pressed")) === "true");

    /* ==================== B3. ROTATION FULL CHAIN per type ==================== */
    console.log("\n#B3 rotation full chain — shape / text / image / kit / clip");
    /* scrub targets ~600ms and ~1200ms — 600ms apart, so the ±5ms
       keyframe-replace can never merge the two rotates */
    const T1 = 0.1, T2 = 0.2;
    const chain = async (label, insertFn, spanFn = null) => {
      const lanes0 = await laneCount();
      await insertFn();
      check(`insert ${label} → a new lane (auto-selected)`, (await laneCount()) === lanes0 + 1, (await laneNames()).join(" · "));
      const [f1, f2] = spanFn ? await spanFn() : [T1, T2];
      const tri0 = await triCount();
      await scrubTo(f1);
      await rotateSelected();
      check(`${label}: canvas rotate #1 lands a rotation ▲ on the timeline`, (await triCount()) === tri0 + 1, `${tri0} → ${await triCount()}`);
      await scrubTo(f2);
      await rotateSelected();
      check(`${label}: canvas rotate #2 lands a SECOND ▲ (no ±5ms merge)`, (await triCount()) === tri0 + 2, `${tri0} → ${await triCount()}`);
    };

    await chain("shape", async () => {
      await page.locator('button:has(span:text-is("Shapes"))').first().click();
      await page.waitForTimeout(260);
      await page.locator('.gd-panel button[title="Rectangle"]').first().click();
      await page.waitForTimeout(320);
    });
    await chain("text", async () => {
      await page.locator('button:has(span:text-is("Text"))').first().click();
      await page.waitForTimeout(300);
      await page.locator('[data-text-panel] button[data-preset="body"]').first().click();
      await page.waitForTimeout(320);
    });
    await chain("image", async () => {
      const before = await laneCount();
      await page.locator('input[accept="image/png,image/jpeg,image/webp,image/gif"]').setInputFiles({ name: "r10-pixel.png", mimeType: "image/png", buffer: Buffer.from(PNG_B64, "base64") });
      await page.waitForFunction((n) => document.querySelectorAll("button.gd-tl-hide").length === n + 1, before, { timeout: 9000 }).catch(() => {});
      await page.waitForTimeout(200);
    });
    await chain("kit", async () => {
      /* the Icons picker was replaced by the Emoji rail (emoji insert as clips);
         UI elements are still "kit"-type objects, so insert one of those to keep
         exercising the kit rotation save/reload chain. */
      await page.locator('button:has(span:text-is("UI"))').first().click();
      await page.waitForTimeout(300);
      await page.locator('button[title$="as a locked, movable kit object"]').first().click();
      await page.waitForTimeout(350);
    });
    /* clip: the template lands AT the playhead — park the playhead at ~3s
       first, then aim the two scrubs INSIDE the clip's actual span (read off
       the lane bar's left/width percentages so the rotates always land where
       the clip is alive) */
    await scrubTo(0.5);
    await chain("clip", async () => {
      await page.locator('button:has(span:text-is("Templates"))').first().click();
      await page.waitForTimeout(320);
      await page.locator('button[title$="as a movable group at the playhead"]').first().click();
      await page.waitForTimeout(400);
    }, async () => {
      const span = await page.locator('div[title$="· drag to retime · dbl-click to open"]').first().evaluate((el) => ({ left: parseFloat(el.style.left), width: parseFloat(el.style.width) }));
      const f1 = (span.left + span.width * 0.35) / 100, f2 = (span.left + span.width * 0.75) / 100;
      check("clip span read off the lane bar keeps the two scrubs >5ms apart", Number.isFinite(f1) && Number.isFinite(f2) && f2 - f1 > 0.02, JSON.stringify(span));
      return [f1, f2];
    });

    /* ==================== B4. save → server-side rotation tracks ========== */
    console.log("\n#B4 save → reload full chain");
    await page.locator("button.gd-tl-save").click();
    await page.waitForFunction(() => document.querySelector("button.gd-tl-save")?.getAttribute("data-state") === "saved", null, { timeout: 6000 }).catch(() => {});
    check("save control settles to saved", (await page.locator("button.gd-tl-save").getAttribute("data-state")) === "saved", await page.locator("button.gd-tl-save").textContent());
    const gr = await apiFetch(`/api/projects/${projId}`, {}, cookieHdr);
    const saved = gr.ok ? (await gr.json()).data : null;
    check("server-side GET returns the saved project", !!saved && Array.isArray(saved.objects), gr.status);
    for (const t of ["shape", "text", "image", "kit", "clip"]) {
      const o = saved && saved.objects.find((x) => x.type === t);
      const rot = (o && o.tracks && o.tracks.rotation) || [];
      check(`saved ${t} carries TWO rotation ◆ (>5ms apart, non-zero angles)`,
        rot.length === 2 && Math.abs(rot[1].t - rot[0].t) > 5 && rot.every((k) => Math.abs(k.v) > 0.5),
        JSON.stringify(rot));
    }

    /* ==================== B5. reload → ◆ persist ========================== */
    await page.reload();
    await page.waitForTimeout(2300);
    check("after reload: all 5 lanes are back", (await laneCount()) === 5, (await laneNames()).join(" · "));
    check("after reload: all 10 rotation ▲ keyframes persist on the timeline", (await triCount()) === 10, `${await triCount()} ▲`);

    /* ==================== B6. text live edit ============================== */
    console.log("\n#B6 text live edit — Inspector → canvas");
    await page.locator('div[title="Normal text"]').first().click();
    await page.waitForTimeout(250);
    const textInput = page.locator('[data-inspector] div:has(> span:text-is("Text")) input');
    check("selecting the text layer shows the Inspector text box", (await textInput.count()) === 1);
    await textInput.fill("R10 Livetype");
    await page.waitForTimeout(200);
    check("typing in the Inspector text box updates the CANVAS text live", (await stageText()).includes("R10 Livetype"), (await stageText()).slice(0, 60));

    /* ==================== B7. undo-delete ================================= */
    console.log("\n#B7 undo-delete — Delete key, form-field bail, Ctrl+Z restore");
    await page.locator('div[title="Normal text"]').first().click(); /* focus out of the input, keep the layer selected */
    await page.waitForTimeout(150);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(250);
    check("Delete removes the layer from the TIMELINE", (await laneCount()) === 4, (await laneNames()).join(" · "));
    check("Delete removes the layer's CANVAS node", !(await stageText()).includes("R10 Livetype"));
    /* the form-field bail: focus an Inspector input → Ctrl+Z must NOT restore */
    await page.locator('div[title="Rectangle"]').first().click();
    await page.waitForTimeout(200);
    await page.locator("[data-inspector] input").first().click();
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(250);
    check("Ctrl+Z INSIDE a form field does NOT fire undo-delete (native text undo wins)", (await laneCount()) === 4, `${await laneCount()} lanes`);
    /* blur back to the canvas world → Ctrl+Z restores */
    await page.locator('div[title="Rectangle"]').first().click();
    await page.waitForTimeout(150);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
    check("Ctrl+Z restores the deleted layer on the TIMELINE", (await laneCount()) === 5, (await laneNames()).join(" · "));
    check("Ctrl+Z restores the deleted layer's CANVAS node (text intact)", (await stageText()).includes("R10 Livetype"));

    /* ==================== B8. hide invisibility =========================== */
    console.log("\n#B8 hide — canvas node gone entirely, lane stays");
    await page.locator('button[aria-label="Hide Normal text"]').click();
    await page.waitForTimeout(250);
    check("hide removes the layer's canvas node (NOT a ghost-opacity shell)", !(await stageText()).includes("R10 Livetype"));
    check("hidden layer's canvas node is truly absent (no element carries its text at any opacity)",
      await page.evaluate(() => {
        const stage = [...document.querySelectorAll("div")].find((d) => d.style.width === "1280px" && d.style.height === "720px");
        return ![...stage.querySelectorAll("*")].some((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes("R10 Livetype")));
      }));
    check("the timeline still lists the hidden lane (eye shows Show + pressed)",
      (await page.locator('button[aria-label="Show Normal text"]').count()) === 1
      && (await page.locator('button[aria-label="Show Normal text"]').getAttribute("aria-pressed")) === "true");
    await page.locator('button[aria-label="Show Normal text"]').click();
    await page.waitForTimeout(250);
    check("un-hide brings the canvas node back", (await stageText()).includes("R10 Livetype"));

    /* ==================== B9. disarm-nudge ================================ */
    console.log("\n#B9 disarm-nudge — banner raises on a disarmed canvas edit, re-arm settles it");
    const dia0 = await diaCount();
    await page.locator("button.gd-animate-toggle").click();
    await page.waitForTimeout(180);
    check("disarm flips the toggle OFF", (await page.locator("button.gd-animate-toggle").getAttribute("aria-pressed")) === "false");
    const r9 = await stageRect();
    await drag(toScreen(r9, 150, 120), 40, 30); /* the clip's full-canvas body is topmost */
    check("DISARMED canvas drag writes NO x/y ◆", (await diaCount()) === dia0, `${dia0} → ${await diaCount()}`);
    check("the disarm-nudge banner appears (Animate is Off + re-arm button)",
      (await page.locator(".gd-disarm-nudge").count()) === 1 && (await page.locator(".gd-disarm-nudge .gd-nudge-rearm").count()) === 1);
    check("the banner explains the miss", (await page.locator(".gd-disarm-nudge").textContent()).includes("Animate is Off"));
    await page.locator(".gd-nudge-rearm").click();
    await page.waitForTimeout(200);
    check("clicking re-arm re-arms the toggle + settles the banner",
      (await page.locator("button.gd-animate-toggle").getAttribute("aria-pressed")) === "true" && (await page.locator(".gd-disarm-nudge").count()) === 0);
    check("the re-arm persists (gd:animateArm=1)", (await page.evaluate(() => localStorage.getItem("gd:animateArm"))) === "1");

    /* ==================== B10. audio probe ================================ */
    console.log("\n#B10 audio — accept attr + empty lane never auto-opens the panel");
    check("the hidden audio input carries the exact accept attr",
      await page.evaluate(() => [...document.querySelectorAll('input[type="file"]')].some((i) => i.getAttribute("accept") === ".mp3,.wav,.ogg,.m4a,.aac")));
    await page.locator('div[title="No audio attached — open the Audio panel from the rail to add a track"]').first().click();
    await page.waitForTimeout(300);
    check("clicking the EMPTY audio lane opens NO panel", (await page.locator(".gd-panel").count()) === 0, `${await page.locator(".gd-panel").count()} panels`);
    await page.locator('button:has(span:text-is("Audio"))').first().click();
    await page.waitForTimeout(300);
    check("the rail Audio button DOES open the panel (Upload audio inside)",
      (await page.locator(".gd-panel").count()) === 1 && (await page.locator('.gd-panel button:has-text("Upload audio")').count()) === 1);
    await page.locator('button:has(span:text-is("Audio"))').first().click();
    await page.waitForTimeout(250);
    check("the panel toggles closed again", (await page.locator(".gd-panel").count()) === 0);

    /* ==================== B11. console watch ============================== */
    console.log("\n#B11 console watch");
    check("zero page errors + app console errors across the whole run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");
    const unexpected = badResponses.filter((s) => !s.includes("/api/auth/me") && !s.includes("/api/auth/admin-hint"));
    check("only the deliberate 401/404 auth probes fail over HTTP", unexpected.length === 0, unexpected.slice(0, 3).join(" | ") || `allowlisted: ${badResponses.length} probes`);

    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); failed++; })
  .finally(() => {
    srv.kill();
    console.log(`\n${passed} passed · ${failed ? failed + " FAILURE(S)" : "0 failed"}`);
    console.log(failed ? `${failed} FAILURE(S)` : "all r10 checks passed");
    process.exit(failed ? 1 : 0);
  });
