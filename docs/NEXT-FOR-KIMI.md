# Instructions for Kimi — what to do next

Handoff based on a deep Fable 5 code review (root causes confirmed against the
actual code). Do these **in order** — sequenced for maximum user relief at lowest
risk. Full context/rationale for each is in [UPDATES.md](UPDATES.md).

## Ground rules (read `AGENTS.md` first)
- **Determinism is load-bearing.** No `Date.now()` / unseeded `Math.random()` on
  any render path. Exports re-render `StageObject` frame-by-frame.
- **Run the whole battery before delivering:** `node scripts/run-checks.mjs`
  (client checks + browser suites + server). It must be fully green.
- **If you change a FROZEN behavior, update its guard in the SAME change** — never
  delete a failing assertion to go green.
- **Lint budget:** ≤19 warnings, build must pass.
- **Line numbers below are approximate** (the review anchored to an older commit;
  the editor file has since moved). **Locate by symbol/grep, not by line.**

---

## 1. Remove the "re-arm Animate" nudge — quick win, do first
**Why:** users toggle Animate on/off themselves; the nudge banner is noise.
**Do:** in `GraphicDestinationMotion.jsx` delete —
- the `@keyframes gdNudgeIn` + `.gd-disarm-nudge` CSS,
- the `armNudge` state + the `if (v) setArmNudge(false)` clause in `setAnimateArmPersist`,
- the banner JSX (`gd-disarm-nudge` / `gd-nudge-rearm` / `gd-nudge-dismiss`),
- the three `setArmNudge(true)` raise sites (move-drop, rotate, clip-scale).
Keep the arm toggle itself.
**Guard:** in `check-r10.mjs` remove the `#A6` static block and the `#B9` browser
block, and fix the header comment. **Verify:** `node client/check-r10.mjs` green.

## 2. Emoji resize + standard default size — biggest tactile win (combine items 2+3)
**Root cause (confirmed):** emoji insert as a `type:"clip"` (`insertEmojiClip` →
`buildEmojiClip` in `engine/emoji.js`). A clip only gets 4 corner **clip-scale**
grips (not the 8-way `onResize` a shape/image gets); the grip box is the
**animated per-frame content bbox** (it breathes during the loop and hits a bogus
fallback rect on empty frames → grips jump/wander); and the scale math is
hypersensitive (short lever from stage center). That's the "weird / can't resize."
**Do:**
- Add a central `DEFAULT_INSERT_SIZE = 100` (or 150) in `editor/model.js`; consume
  it from `makeObject`'s base + shape branch. For image/kit/chart, cap the
  **longest side** to it (preserve aspect), don't force a square.
- **Insert the emoji as a plain `image` object**, not a clip:
  `makeObject("image", { name, props: { src: emoji.file, w: DEFAULT, h: DEFAULT } })`
  at the standard size. It then flows through `onResizeDown` (8-way w/h grips) and
  resizes exactly like any image — for both animated and static variants.
  - Trade-off: you lose the built-in in→hold→out loop motion. That's the doc's
    accepted trade for "resize like everything else." (If the loop must stay, the
    harder fallback is real box-grips on clips driving a uniform scale from a
    reference box captured **at insert** — not the per-frame bbox — anchored to
    the object, not stage center. Prefer the plain-image route.)
**Guard/verify:** update `check-emoji` / any emoji-insert browser assertion (r8w4)
to the image-object shape; add a browser resize check. Full battery green.

## 3. Duration extend must not stretch timings — confirmed bug
**Root cause:** `stretchClips` defaults **true** (`GraphicDestinationMotion.jsx`
~`:422`); the comp-duration input passes it through (`Timeline.jsx` ~`:281`) →
`setCtxDurMs` runs `scaleLayerTimes(o, nd/compDur)` over every object → multiplies
all keyframe `t` / `inT` / `outT` / clip `start` / clip `dur` (×4 for 5s→20s).
**Do:** make the duration-**extend** path pin (call `setCtxDurMs(v)` **without**
the flag — extend only adds empty room). Flip the checkbox default to `false`.
Keep the explicit "scale contents" checkbox for the rare intent. Nested clip `dur`
is its own field, so pinning keeps scene lengths independent of the main timeline.
**Guard:** update whichever check encodes the stretch default. **Verify** with a
browser test: set 5s, add objects, extend to 20s, assert `inT/outT` unchanged.

## 4. Inline group/ungroup glyphs + nesting depth crumb — UI only
**Note:** the model already nests to any depth — `groupSelection` wraps any
selection into a clip (nesting a selected clip automatically), `ungroupClip` peels
one level, `path`/`enterClip` navigate depth. **No engine work.**
**Do:** put an always-visible **group + ungroup glyph pair** where the group
button lives now (`Timeline.jsx` ~`:342`, acting on the current selection), add a
per-lane ungroup glyph in the label column, and show the current nesting depth
from `path.length` as a small crumb. **Verify:** browser — group → group again →
group again (3 levels), ungroup one level at a time, render + export clean.

## 5. Shape morph — VERIFY-ONLY (was mis-diagnosed)
The morph UI is **intact** (Inspector Shape + Morph cards, target picker, A→B
chip — `Inspector.jsx` ~452–517, guarded by `check-r9w2`). It only shows when a
**shape** is selected (only shapes morph). **Do:** browser-verify it appears;
optionally add a "select a shape to morph" hint. Likely **no code change**.

## 6. Real tracks (multiple clips per track, CapCut) — the big one, do LAST
**Verdict (Fable 5): sound, but budget it as a proper rewrite.**
- Add a **persistent `track` field** per object; switch `rows = ctxLayers.map(o=>[o])`
  (`Timeline.jsx`) to `groupBy(track)`, each lane laying its clips out by time.
- **Vertical drag = explicit `track` reassignment persisted on drop** — NOT
  time-based auto-packing. Reviving `packRows` packing would resurrect the old
  "row-jump" bug (see AGENTS regression history). This is the #1 risk.
- **Define two rules before coding:** (a) intra-track overlap → snap/push so
  clips on a track are sequential; (b) z-order → decide track-order vs array-order
  and keep them consistent (across-track stacking = track order).
- **Guards:** `check-timeline`'s `packRows` tests stay green (that helper is
  untouched). Rewrite the **browser** lane-count assertions (`check-editor-w1`,
  any r8w1/r9w1 lane checks) to the track model in the same change.
- Export/determinism unaffected — `track` is pure lane metadata.
- Good moment to extract the timeline-manipulation handlers out of the ~2100-line
  `GraphicDestinationMotion.jsx`.

---

## After each item
1. `node scripts/run-checks.mjs` fully green (browser suites included).
2. Lint ≤19, build passes.
3. Update the relevant guard + AGENTS.md contract in the SAME commit.
4. One small, focused commit per item.

## ⚠️ Review found: tracks commit (748c573) is NOT merge-safe — fix these first
A Fable 5 verification pass confirmed fixes 1–6 + settings are sound, but the
CapCut-tracks commit ships 4 real defects (all small, all guard-testable). **Note:
if we adopt the simpler "main + nested folders" model instead of tracks (pending
user decision), bugs 2–4 become moot — but BUG 1 must be fixed either way.**

1. **BUG 1 (worst) — clip-children z-order disagrees canvas ↔ export.**
   `StageObject.jsx:329` renders `obj.children` in ARRAY order, but in-clip
   editing uses `zOrder(ctxLayers)`. Since drag/reorder now change only `track`
   (not array position), a group's child stacking shown in the clip editor
   differs from what exits/exports. **Fix: render `zOrder(obj.children)` at
   `StageObject.jsx:329`** (back-compat safe — migrated tracks = array index) +
   add a guard. *Matters regardless of tracks-vs-folders.*
2. **BUG 2 — `duplicateSelected` (GDM:~935) assigns no new `track`** → duplicate
   lands on the source's lane with an identical span (full overlap). Mirror the
   `pasteClipboard` pattern: `c.track = nextTrack(...)`.
3. **BUG 3 — trims not clamped to track mates.** The rule-(a) clamp is only in
   `mode==="move"` (GDM:~1841); the `in`/`out` edge-drag branches (GDM:~1850)
   clamp only to `[0,ctxDur]` → an edge drag can overlap a lane neighbour. Clamp
   `ni`/`no` against `trackMates`.
4. **BUG 4 — trackless children (fresh template inserts) use inconsistent
   fallbacks** (`?? 0` in reorder/moveToTrack vs `?? i` in trackRows/zOrder) →
   ▲/▼ on such a child moves it wrong. `normalizeTracks` children at insert
   (GDM:~849) or unify the fallback.

Log-and-defer (product decisions, don't block merge once 1–4 are fixed):
- **Shared-track z is unreachable + ▲/▼ can silently retime** via `trackSnap`.
- **Emoji Animated/Static toggle still shows but every insert is static**
  (`EmojiPanel.jsx` `pick` drops the variant) — remove the toggle or note the loss.

## ✅ Fixes 1–6 — DONE
All six near-term fixes are implemented + committed (remove Animate nudge; emoji
insert-as-image + `DEFAULT_INSERT_SIZE`; pin duration-extend; inline group/ungroup
glyphs + depth crumb; morph verify-only; real CapCut tracks). Next work is the
feature backlog below.

## Feature backlog (build on ONE shared admin-content foundation)
These four are the same shape — admin/user-managed content with sanitize +
role-gating + a merged panel — so design the store/routes once and reuse:

1. **Custom SVG animated icons — replace the Fluent emoji** (see
   [UPDATES.md](UPDATES.md)). Retire the Fluent PNG emoji from the picker; admin
   adds our own **SVG** icons from the backend. Two must-dos: keep it
   export-deterministic (default = static SVG + engine motion grammar; option =
   inline SVG driven by `setCurrentTime(t)`), and **sanitize uploaded SVG hard**
   (strip scripts/handlers/external refs — SVG is an XSS vector). New vector
   layer type (or `image` + `svg` payload) resizes via the normal grips. Guard:
   `check-svg-icons.mjs`.
2. **Editable Templates** — admin global + user personal overlays on `templates.js`.
3. **Uploads hub** — unified images/audio/video, project-scoped + cross-project search.
4. **AI Asset Studio** — Route A, reference-driven, `/studio` page, Kimi 3 API,
   save to Templates.

Each is speced with phases in [UPDATES.md](UPDATES.md). Icons (#1) is the user's
current priority.
