# WebM export — test procedure

Scope: `client/src/export/exportWebm.js`, `client/src/export/frameRenderer.js`,
`client/src/components/ExportDialog.jsx`.

## 1. Automated frame-math validation (node)

The exporter paints frames with the *same* pure functions the editor uses. This
check bundles the real engine file with the project's own Vite and verifies the
math against hand-computed values at sample times:

```sh
cd client
node src/export/validateFrameMath.mjs
```

Expected tail: `60 passed, 0 failed`.

Covered: eased keyframe interpolation (`valueAt`, incl. unknown-ease → linear
fallback), color keyframes (`colorAt`/`lerpColor`), 64-pt shape morphing
(`morphPtsAt` = `lerpPts` of endpoint shapes, easing taken from the FROM
keyframe), arc-length motion paths (`pointOnPath`/`posOf`), clip time mapping
(`clipLocalTime` hold/hide/loop), clip transitions, number rollers
(`numberValue`/`numberColumns` incl. decimal + slot modes), text FX
(`charFx` incl. scramble determinism), seeded confetti streams
(`confettiParticles` == independent mulberry32 reference), `highlightFlick`,
`parseChart`.

One informational note is printed (not a failure): the engine's `EASE` table
currently does not define `easeInOutSine`, which `worldCameraAt` calls inside
zoom-transition windows and the chart renderer calls unconditionally. The
preview hits the same engine path; the exporter isolates the failure per layer
(error boundary → entry in `warnings[]`, export continues). Fixing `EASE` is
out of scope for the export feature (engine file must stay logic-identical).

## 2. Manual in-app test (Chromium)

Requires: a Chromium-based browser (Chrome/Edge/Brave/Arc). `foreignObject`
canvas rasterization is unsupported in Firefox (canvas gets tainted) — the
dialog disables the WebM card there.

1. `cd client && npm run dev`, open the editor.
2. Build or load a project that exercises the layer types:
   - shape with morph keyframes + fill keyframes (e.g. the demo "Morpher"),
   - text with a Text FX (rise / scramble / wave) and a box (bg+border+glow),
   - a number roller (odometer), a chart (bar), a country map (comet),
   - confetti, an image (uploaded → stored as data URL),
   - two clips with in/out transitions (fade / slide up).
3. Open **Export** (dialog: `ExportDialog`) → keep **WebM — instant, in-browser**
   (RECOMMENDED) → fps 30 → Quality High → **Export**.
4. During export: progress bar advances with %, **Cancel** aborts cleanly
   (back to options, no download, console shows `Export cancelled` rejection
   handled by the dialog).
5. On completion the file `zwoosh-<name>.webm` downloads
   automatically and the success state shows filename + size; any warnings are
   listed below it.
6. Verify the video in Chrome/VLC:
   - duration ≈ comp duration (e.g. 5.0s for the demo at any fps),
   - frame size = stage size (1280×720),
   - scrub frame-by-frame: morphs, easings, text FX, odometer and map FX match
     the editor preview at the same times,
   - run the same export twice → videos are visually identical (byte-identical
     output is NOT guaranteed: encoder metadata/timestamps vary).
7. Repeat at fps 24 and 60, and Quality Low (file should be noticeably smaller).

### Warnings paths to exercise

- **Remote image**: set an image layer's `src` to an `https://` URL that blocks
  CORS → export completes, warning says the image may render blank.
- **Offline fonts**: disable network before export → warning "Web fonts could
  not be embedded…", text falls back to system fonts.
- **Chart / world-zoom layers**: with the current engine gap (see §1) these
  layers are skipped with a warning instead of crashing the export.

## 3. Console smoke test (no UI wiring needed)

The dialog is wired into the top bar by the orchestrator; until then the
exporter can be driven from DevTools while `vite dev` runs:

```js
const { exportProjectToWebM, downloadBlob } = await import("/src/export/exportWebm.js");
const project = JSON.parse(`…paste project JSON from Save/Load…`);
const { blob, warnings } = await exportProjectToWebM({
  project, fps: 30,
  onProgress: (p) => console.log((p * 100).toFixed(0) + "%"),
});
console.log("warnings:", warnings);
downloadBlob(blob, "smoke.webm");
```

Expected: progress 0→100, blob of type `video/webm` (VP9 in Chrome), size in
the MB range at 8 Mbps for a 5s comp.

## Known limitations (by design)

- Export wall time ≈ video duration (frames are paced so MediaRecorder's
  wall-clock timestamps land on the intended timeline; slower-than-realtime
  machines still emit every frame, the container just stretches).
- No audio track (the engine has none).
- Chromium-focused; Firefox unsupported (canvas tainting), Safari untested.
