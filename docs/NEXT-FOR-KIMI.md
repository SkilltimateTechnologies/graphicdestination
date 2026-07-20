# Instructions for Kimi — what to do next

Handoff based on a deep Fable 5 code review (root causes confirmed against the
actual code). Do these **in order** — sequenced for maximum user relief at lowest
risk. Full context/rationale for each is in [UPDATES.md](UPDATES.md).

## Ground rules (read `AGENTS.md` first)
- **Determinism is load-bearing.** No `Date.now()` / unseeded `Math.random()` on
  any render path. Exports re-render `StageObject` frame-by-frame.
- **Run the whole battery before delivering:** `node scripts/run-checks.mjs`
  (client checks + browser suites + server). It must be green **except** the 5
  export-**inspection** suites (`test-mp4/ratio/camera/backdrop/filters-export`),
  which shell out to `ffprobe` — if `ffprobe`/`ffmpeg` isn't installed they print
  `ffprobe failed: ENOENT` / `got: 0 stream(s)` even though the export itself
  wrote a valid file (`{"ok":true,...}`). That's an environment gap, not a
  regression. Install ffmpeg to get a true 45/45, or eyeball the `ok:true` lines.
- **If you change a FROZEN behavior, update its guard in the SAME change** — never
  delete a failing assertion to go green.
- **Lint budget:** ≤19 warnings, build must pass.
- **Line numbers below are approximate** (the review anchored to an older commit;
  the editor file has since moved). **Locate by symbol/grep, not by line.**

---

## ▶ START HERE — current work (2026-07, supersedes items 1–6 below)

Items 1–6 and the CapCut-tracks experiment are **DONE/RESOLVED** (see the ✅ and
RESOLVED sections lower down). Editor state as of `fd9d212` on `main`: folder
grouping (Shift-select, ≤3 levels), emoji-as-image, pinned duration, settings
auto-save. Do the two below **in order**.

### A. Quick win — kill the emoji Animated/Static toggle lie (~30 min)
The Emoji panel still shows an **Animated / Static** toggle, but `pick` in
`EmojiPanel.jsx` drops the variant and **every insert is static** (emoji now
insert as a plain `image` so they resize via the 8-way grips — that's the
intended behaviour, don't undo it). The toggle promises motion it never delivers.
**Do:** remove the toggle + its state from `EmojiPanel.jsx` (simplest honest fix),
so the panel just inserts a still emoji image. **Do NOT** re-introduce the looping
clip to "make Animated work" — that brings back the resize bug we just fixed.
**Guard:** update `check-emoji` / the r8w4 emoji assertion to expect no toggle;
full battery green.

### B. Custom SVG animated icons — the big feature, replaces Fluent emoji
Goal (user's words): "get rid of the Microsoft emoji, add our own SVG animated
icons, admin adds them from the backend." Full spec in [UPDATES.md](UPDATES.md)
under "Custom SVG animated icons". Build it in phases, one commit
each, battery green after every phase. **Two constraints are load-bearing — get
them wrong and it's unshippable:**

1. **Sanitize every uploaded SVG HARD (server-side, before store).** SVG is an XSS
   vector. Strip `<script>`, all `on*` handlers, `<foreignObject>`, external
   `href`/`xlink:href`/`url()` refs, `<use>` to remote docs, DOCTYPE/entities,
   `<style>` with `@import`. Allow-list elements/attrs, don't block-list. Guard
   with a `server/test-svg-sanitize.mjs` that feeds known payloads and asserts
   they're neutralised.
2. **Keep export DETERMINISTIC.** Default path = static SVG rendered as an image +
   the existing engine motion grammar (in→hold→out) so it exports frame-by-frame
   exactly like emoji do today. Any "inline animated SVG" option must be driven by
   `setCurrentTime(t)` off the timeline clock — **never** CSS/SMIL animation or
   `requestAnimationFrame`, which the export re-render can't sample.

Suggested phases:
- **Phase 1 (server):** an admin-gated store for SVG icons (reuse the `assets`
  table with a `kind:"svg_icon"` + role check, or a new `svg_icons` table) +
  `POST /api/svg-icons` (admin only) running the sanitizer, + `GET` list. Guards:
  `server/test-svg-icons.mjs` + the sanitize test above.
- **Phase 2 (client layer):** render sanitized SVG as a resizable layer — cleanest
  is `image` type carrying an inline-SVG data-URI `src`, so it flows through the
  same 8-way `onResize` as emoji/images and needs no new StageObject branch. Verify
  it exports (roundtrip + a browser insert/resize check).
- **Phase 3 (panel):** a new Icons rail panel fed by the store (thumbs = hold
  frame, hover plays — same pattern as every other panel).
- **Phase 4 (retire Fluent):** remove the Fluent emoji from the picker but keep
  `engine/emoji.js` + the PNGs engine-side for BACK-COMPAT of old projects (same
  way the bezier icons were retired). Update AGENTS.md Emoji/Icons contract.

When A + B land, the next backlog items are: **apply brand colors by default**,
then Editable Templates → Uploads hub → AI Asset Studio (all in UPDATES.md).

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

## ✅ RESOLVED — Option B chosen: folders, not tracks (tracks reverted)
A Fable 5 verification pass found the CapCut multi-clip-track commit (748c573)
shipped 4 real defects (BUG 1 z-order canvas↔export; BUG 2 duplicate no track;
BUG 3 trims not clamped to mates; BUG 4 trackless-child fallback mismatch). Rather
than harden a model we weren't committed to, the user chose the **simpler main +
nested-folders model** (per their spec: only main timeline + groups, groups nest
3 levels folder 1›2›3, Shift-select items to group).

Done (this branch):
- **Tracks reverted** (commit 2edda37) — `normalizeTracks`/`trackRows`/`zOrder`/
  `moveToTrack` gone; z-order is array-order everywhere again. **BUG 1–4 are all
  moot** (BUG 1 too: no `zOrder(children)` divergence when render + edit both use
  array order).
- **Timeline back to one-lane-per-object** (`rows = ctxLayers.map(o => [o])`).
- **Shift-click multi-select** on canvas objects AND timeline lanes (commit 4b0f87e).
- **3-level folder cap** — `groupSelection` blocks at `path.length ≥ 3`
  (`GROUP_MAX_DEPTH`); group/ungroup glyph pair + depth crumb already in the timeline.
- Full battery 29/29 green, lint 17.

Still live (product decision, not blocking):
- **Emoji Animated/Static toggle shows but every insert is static** — `EmojiPanel`
  `pick` drops the variant; emoji insert as a plain `image` (that's the resize fix).
  Either remove the toggle or wire the animated variant through the image path.

If tracks are ever revisited: it's a proper rewrite with a persistent `track` field
(NOT time-based auto-packing — that resurrects the row-jump regression), and BUG 1–4
above are the checklist. But folders are the shipped direction.

## ✅ Fixes 1–6 — DONE
Near-term fixes implemented + committed: remove Animate nudge; emoji
insert-as-image + `DEFAULT_INSERT_SIZE`; pin duration-extend; inline group/ungroup
glyphs + depth crumb; morph verify-only. Item 6 (CapCut tracks) was built then
**reverted in favour of the folder model** — see the RESOLVED section above. Next
work is the feature backlog below.

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
