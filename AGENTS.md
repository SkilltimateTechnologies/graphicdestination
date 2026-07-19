# AGENTS.md — Zwoosh Guardrails (READ FIRST)

This file exists because features that were **100% working have been accidentally broken by later changes** (see Regression History). If you are an agent touching this repo: respect the frozen behaviors below, keep the check suites green, and update this file when you intentionally change behavior.

## Golden rules
1. **Determinism is load-bearing.** Every visual is a pure function of timeline time. No `Date.now()`, no unseeded `Math.random()` (use `engine/random.js` mulberry32). The export path re-renders the same `StageObject` frame-by-frame — nondeterminism = broken exports.
2. **Run the full check battery before delivering.** Every `client/check-*.mjs` + `client/src/export/test-stage-roundtrip.mjs` + `server/test-*.mjs` must pass. If your change intentionally alters behavior, UPDATE the check in the same change — never delete a failing assertion to go green.
3. **Lint budget:** 0 errors, ≤19 warnings. Build must pass.
4. **Back-compat:** old project JSON must keep rendering. Map legacy ids/props to new behavior; never crash on unknown fields.
5. Don't touch: lockfiles, `.npmrc`, `vendor/`, `Dockerfile` (deploy-critical, hardened against Railway failures).

## FROZEN — verified working, do NOT regress
| Feature | Contract | Guard check |
|---|---|---|
| Export (WebCodecs MP4 + WebM fallback) | deterministic µs timestamps; data-URI asset inlining (canvas-taint); ts-ebml WebM duration repair | `src/export/test-stage-roundtrip.mjs` (11), frame-math (80) |
| Canvas transforms | move/resize/rotate on canvas ALWAYS write timeline keyframes when Animate armed (base edit when disarmed); resize = scale ◆ + base compensation | `check-r8w3` (174), `check-r9w1` (85) |
| Shape morph | `tracks.shape` + `morphPtsAt`; A→B indicators in Inspector/panel/canvas badge | `check-r9w2` (340) |
| Path motion | `props.path.pts` + `prog` ◆; path wins over x/y; `progKeyPlan` never collapses keys at layer end | `check-r9w2` |
| Confetti | clamped to stage bounds (90px fade margin); fraction-of-life fades; `props.dur` explicit duration; 17 styles | `check-confetti` (428), `check-r8w2` (213) |
| Charts | lifecycle maps to object's timeline span: play-once entrance (≤1400ms), static hold, animated exit (≤1100ms); NO start/dur in Inspector | `check-charts` (240) |
| Counters | 6 counter styles via pure `counterModel`; `cdStyle` wins over `style` | `check-counter` (97) |
| Backdrops | 11 variants incl. `procedural` column-noise; pure f(t,seed), seamless f(0)=f(dur) | `check-backdrops` (166) |
| Kits (UI) + legacy icons | locked `"kit"` object type (single layer, variant + color-only Inspector). 6 of the 13 UI elements are offered in the UI panel (7 lower-quality ones retired via `HIDDEN_UI` in `UIElementsPanel.jsx`, kept engine-side for back-compat). The 57 bezier icons remain engine-side (`kitRenderSpec`) for BACK-COMPAT of old projects but are no longer in any picker — the Emoji rail replaced the Icons picker | `check-kits` (1203), `check-r7a` (98) |
| Emoji (Fluent 3D) | 169 Microsoft Fluent Emoji (MIT, "Smileys & Emotion") as 3D PNGs in `client/public/emoji/fluent/3d/`; `engine/emoji.js` `buildEmojiClip` wraps ONE image layer in a seamlessly-looping clip with the in→hold→out motion grammar (heartbeat/spin/rock/bob/pulse by keyword); inserts as a movable clip. Compact rail `EmojiPanel` (featured teaser) → `EmojiLibrary` modal (search + cats). Assets fetched by `scripts/fetch-fluent-emoji.mjs` | `check-emoji` (30) |
| Maps | 239 countries / 7 continents (mapdata.js 154KB); country trace-close-stay; timed color-coded highlights `{id,color,inT,outT}` + legend | `check-maps` (97) |
| Camera | `project.camera.tracks` {x,y,zoom} + per-object `props.depth` (f=1+depth); object-level Camera card writes eased keyframes | `check-editor-camera` (13), `check-r8w3` |
| Timeline | rows use STABLE layer-order packing (`packRows(spans, {stable:true})`) so dragging a clip in TIME never reshuffles other rows (After-Effects/CapCut feel); default `packRows` is still start-sorted for every other caller/guard. Bar-drag row-jump deadzone is stickier (`rowJumpTarget(...,44,0.85)`). Plus: gap pills + ripple-close, lock/hide toggles, scrub-follow playhead chase, per-prop kf glyphs | `check-timeline` (49), `check-r8w1`, `check-r9w1`, `check-editor-w1` (browser) |
| Canvas selection | plain-drag on empty canvas = MARQUEE rubber-band select (`objectsInRect` in model.js, hit-tests logical stage boxes; locked/hidden excluded). Camera pan moved to middle-mouse / Alt+drag. Group via ⌘G / Inspector / timeline / right-click | `check-marquee` (11) |
| Templates | insert as movable content-sized groups; camera tracks only via buildProject (root-level) | `check-templates` |
| Settings | `/settings` brand kits + 4-tier text styles + default bg (black fallback); `user_settings` table; editor brand switcher applies via `kitToBrand` | `check-r9w3` (62), `server/test-settings` (38) |
| Panels | mutually exclusive rail panels (openOnly); thumbs = representative hold frame (never t=0), hover plays | `check-r8w4` (69) |
| Undo/hide/Animate | Ctrl+Z restores deleted objects (snapshot undo, inputs keep native undo); hidden layers FULLY invisible on canvas (no ghost opacity); Animate disarm shows re-arm nudge | `check-r10` (137) |
| Rotation save chain | rotate→◆→save→reload→◆ browser-proven for text/shape/image/kit/clip; the historic trap is Animate-arm persistence (`gd:animateArm`) — disarm = base edits BY DESIGN | `check-r10` |
| Editor shell | slim 40px top row (logo+name, BrandSwitcher, avatar menu: Dashboard/Profile/Settings/Logout); Export beside Save in timeline bar; Main crumb beside Animate; left drawers width 268 | `check-r10`, `check-r9w1` (86) |

## Regression history (learn from these)
- **Rotation keyframes lost** (v2.7): an Inspector edit over-cut the keyframable prop list. → prop lists are asserted now.
- **Text canvas-edits wrote no keyframes** (v3.3 report): keyframes only written if a track pre-existed. → always-write when armed, per-type audit in `check-r8w3`.
- **Path motion froze at end** (v3.3): "Animate along path" clamped both prog keys to the same t. → `progKeyPlan`.
- **Icon thumbs blank** (v3.3): thumbs rendered t=0 = entrance start (invisible). → hold-frame stills.
- **Morph "lost"** (v3.3): engine fine, zero UI indication. → features need visible indicators, not just engine support.
- **Mirror-URL deploy failures** (v2.1–2.6): never let `npm.mirrors.*` into lockfiles; registry is pinned via `.npmrc`.
- **Canvas-taint empty exports** (v2.1): blob-URL SVGs taint the canvas; all assets inlined as data-URIs.

## Architecture map (modules ARE separated)
- `client/src/engine/` — pure modules: `fx.js` (charts/numbers/counters/confetti), `kits.js` (UI + legacy bezier icons), `emoji.js` + `emojiData.js` (Fluent 3D emoji, generated manifest), `maps.js`+`mapdata.js`, `backdrops.js`, `shapes.js`, `easing.js`, `random.js`, `camera.js`, `keyframes.js`
- Emoji assets: `client/public/emoji/fluent/3d/*.png` (Fluent Emoji, MIT — see that dir's LICENSE.txt); regenerate with `node scripts/fetch-fluent-emoji.mjs`. Panels: `EmojiPanel.jsx` (compact) + `EmojiLibrary.jsx` (modal). `IconsPanel.jsx` was removed.
- `client/src/components/StageObject.jsx` — the ONE renderer (editor preview + SSR + export)
- `client/src/components/editor/panels/` — one panel per widget family
- `client/src/components/GraphicDestinationMotion.jsx` — editor state owner (cloud seam: `initialProject`, `onChange`)
- `server/index.js` — auth, projects, assets, share, settings (additive routes only)
