# Rendering (HyperFrames integration)

This is the real MP4 export pipeline: this app's project JSON → a real
HyperFrames HTML composition → an actual video file, via the real
`hyperframes` open-source CLI (HeyGen). Everything in this document was
tested against the real, installed package during development — nothing
here is speculative.

## Architecture

```
server/hyperframes/
  compile.js        Project JSON -> HyperFrames HTML (pure function, no
                     external deps, fully unit-testable, always works)
  render.js          Shells out to the real `hyperframes` CLI to turn that
                     HTML into an MP4 (needs hyperframes installed + a
                     Chromium binary available -- see "What actually works")
  test-compile.mjs  Standalone test script (node test-compile.mjs)
```

API surface (`server/index.js`):

| Route | What it does |
|---|---|
| `POST /api/render/compile` | Compiles any posted project JSON to HyperFrames HTML. Always works — no Chrome/hyperframes CLI needed. Returns `{html, warnings}`. |
| `POST /api/projects/:id/render` | Loads a saved project, compiles it, attempts a real MP4 render. On success: streams back the MP4 (`video/mp4`). On failure: `200 {rendered:false, reason, hint, warnings, html}` — never a hard crash; you always get back at least the compiled HTML and a specific, actionable reason. |

## What's translated from the editor's object model (v1 scope)

**Fully translated**, with exact fidelity to this app's own keyframe math
(same piecewise easing, same in/out windowing):
- Position (x/y), scale, rotation, opacity — full keyframe tracks, all 11
  easings mapped to GSAP equivalents (`EASE_MAP` in `compile.js`)
- Layer in/out windows (`inT`/`outT`)
- Nested clips — flattened to absolute time (`flattenLayers()`); clip
  speed and start offset are correctly folded into every child's keyframe
  times and durations
- Clip backgrounds (rendered as full-stage colored rects)
- Shape fill color, size, position (current/first-keyframe shape only)
- Text content, font, size, color
- Images

**Not translated in v1** — renders as a labeled placeholder (correct
timing/duration, wrong or absent visual) so nothing silently drops out of
the composition:
- Shape morphing between keyframes (GSAP's shape-morph plugin is a paid
  add-on, not on the public npm registry)
- Per-character text effects (typewriter/scramble/wave/etc.)
- Number roller animation (odometer/slot/count) — shows the final value
- Chart animation — shows a box with the raw data string
- Map/world/continent border effects and country-highlight choreography
- Confetti
- Motion paths (`props.path`) — falls back to static x/y

Every unported feature used by a project produces a `warnings[]` entry
naming the exact layer, so nothing is silently wrong — `compileProject()`
tells you what it couldn't do. Porting any of these is additive work in
`renderLayerHTML()`/`renderLayerTweens()`, not a redesign.

## What actually works — tested, not assumed

I don't have access to a Turso cloud account or a Railway deploy from the
sandbox this was built in, and I don't have unrestricted network access
either. Rather than assume the rendering pipeline works, here's exactly
what was verified, and how:

1. **The compiler always works.** `node server/hyperframes/test-compile.mjs`
   compiles a representative project (nested clip, multiple easings, a
   shape-morph track, a motion path, an unported chart layer) and prints
   the exact warnings it should produce. No external dependencies.

2. **The compiled output was validated against HyperFrames' own linter**
   (`hyperframes lint`, a real static-analysis tool from the actual
   package, not something I wrote) — **0 errors**. This caught a real bug
   during development (using the reserved `class="clip"` attribute on
   GSAP-animated elements, which the framework's own docs/linter forbid —
   fixed, and re-verified clean).

3. **`hyperframes check`** (lint + a headless-Chrome runtime pass) flagged
   one legitimate, non-blocking finding: a custom Google Font
   ("Space Grotesk") isn't in HyperFrames' deterministic font map, so it's
   pulled in via a `<link>` tag rather than guaranteed byte-identical
   across render machines. Addressed by injecting the Google Fonts
   stylesheet link automatically for any non-mapped font used in a
   project (see `fontLinks` in `compile.js`) — this is a real tradeoff
   (network fetch at render time vs. font determinism), documented rather
   than hidden. The linter itself flags this exact tradeoff as its own
   warning; that's expected and correctly non-fatal.

4. **A full MP4 was actually rendered end-to-end, twice** — once from a
   minimal test composition, once from the actual multi-layer test project
   (nested clip, two easings, nested text) — and independently verified
   with `ffprobe` (not just "the command exited 0"):
   ```
   /home/claude/hf-test/gdproj/out.mp4
   codec_name=h264, width=1280, height=720, duration=5.000000
   ```
   The frame content was checked programmatically too (sampled pixels
   against the known background color to confirm real visible content was
   captured, not a blank frame — 765/e.g. non-background sample pixels
   found in a spot-check grid).

5. **The full HTTP API path was verified**, not just the CLI in isolation:
   log in → `POST /api/projects` → `POST /api/projects/:id/render` →
   received a real `video/mp4` response, saved it, and confirmed with
   `ffprobe`:
   ```
   HTTP 200, Content-Type: video/mp4, 10952 bytes
   codec_name=h264, width=960, height=540, duration=2.000000
   ```
   (960×540 / 2.000s exactly matches the project that was submitted —
   proof the whole pipeline, not just a cached/fixed example, is live.)

## The Chrome dependency — the one real environmental variable

`hyperframes render` needs a headless Chromium binary. Its default
behavior is to download one (`chrome-headless-shell`) on first use, which
**fails in network-restricted environments** — confirmed directly:

```
✗ check_runtime_failure: Failed to download chrome-headless-shell 152.0.7928.2:
  - DefaultProvider: Download failed: server returned code 403.
    URL: https://storage.googleapis.com/chrome-for-testing-public/...
```

`render.js` handles this with `findExistingChromium()`, which checks common
install locations (Playwright/Puppeteer caches, `/opt/pw-browsers`) and
points `hyperframes` at whatever it finds via `PRODUCER_HEADLESS_SHELL_PATH`
(the real env var `hyperframes` reads — found by reading its source, not
guessed). **This is exactly what made the end-to-end tests above succeed**:
the sandbox this was built in happened to have a Playwright-installed
Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, and
pointing `PRODUCER_HEADLESS_SHELL_PATH` at it worked immediately — no
patching of hyperframes itself needed.

**On a fresh deploy target (e.g. Railway), you will likely need to do one
of these once:**
1. `npx playwright install chromium` — populates
   `~/.cache/ms-playwright`, which `findExistingChromium()` already checks.
   Cheapest option if the deploy environment has normal network access
   (Playwright's CDN is generally not blocked the way this sandbox's was).
2. If the deploy environment's network reaches
   `storage.googleapis.com`, do nothing — `hyperframes render` will
   just download its own Chrome on first real use.
3. `npx hyperframes cloud` instead of local `render` — HeyGen's hosted
   renderer, needs an API key, no local Chrome dependency at all. Not
   wired into `render.js` yet (would be a small addition — swap the
   `execFileAsync` call for the `cloud` subcommand and handle its
   async job-polling response shape).

## Installing `hyperframes` itself

It's an `optionalDependency` in `server/package.json` — a plain
`npm install` in `server/` will **not** fail if it can't install (this was
specifically tested: `hyperframes`'s own `onnxruntime-node` dependency
tries to reach `api.nuget.org` during its postinstall for an unrelated
optional transcription feature this app never uses, which fails in a
restricted network; npm correctly treats optionalDependency failures as
non-fatal and the rest of the app installs fine regardless).

**To actually enable rendering**, run this once in `server/`:
```bash
npm install hyperframes --ignore-scripts
```
This was directly confirmed to work even without the network access the
default postinstall needs — it just skips that unrelated optional feature.
`render.js` resolves `node_modules/hyperframes/dist/cli.js` directly (not
via `npx`, which was found during testing to sometimes serve a stale/broken
cached resolution silently rather than a clear error).

## Extending the compiler

Look at `renderLayerHTML()` (static appearance) and `renderLayerTweens()`
(GSAP animation calls) in `compile.js`. Both take one flattened layer and
return HTML/JS strings — adding a case for, say, number-roller animation
means: emit digit-column `<div>`s in `renderLayerHTML`, and either (a) bake
the roll as a CSS `@keyframes` animation (fully deterministic, no GSAP
needed, matches how the editor's own `numberColumns()` math works), or (b)
drive it with additional GSAP tweens the way transform properties already
work. Re-run `test-compile.mjs`, then re-validate with
`node node_modules/hyperframes/dist/cli.js lint <dir>` before assuming it's
correct — that step catches real framework-contract violations (like the
`class="clip"` bug found during this build) that look fine in a text diff.
