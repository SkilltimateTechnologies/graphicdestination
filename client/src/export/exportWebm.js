/**
 * exportWebm.js — deterministic, client-side WebM export for Graphic
 * Destination Motion projects. Instant export, no server render farm.
 *
 * APPROACH
 * --------
 * For each frame index i (t = i / fps) the exact visual state is computed by
 * the editor's OWN engine: the same <StageObject> component and the same pure
 * keyframe/easing/morph/FX functions that drive the preview render the frame
 * into an offscreen DOM stage at full export resolution. The subtree is then
 * serialized (XMLSerializer) into an SVG <foreignObject> image and painted
 * onto a canvas (see frameRenderer.js for that half).
 *
 * Encoding uses canvas.captureStream(0) + track.requestFrame() driven by a
 * MediaRecorder, preferring video/webm;codecs=vp9, then vp8, then the
 * browser default. Frame CONTENT is fully deterministic: every layer is a
 * pure function of timeline time (seeded RNG only), never of the wall clock.
 *
 * KNOWN LIMITATIONS (by design, documented for callers)
 * -----------------------------------------------------
 * 1. MediaRecorder stamps each captured frame with its capture time, and
 *    offers no API to override timestamps. To land frames on the intended
 *    timeline we therefore PACE requestFrame() calls at the export fps
 *    (export wall time ≈ video duration when rendering keeps up). If the
 *    machine renders slower than real time, every frame is still present
 *    exactly once — the container just stretches. Deterministic content,
 *    best-effort timestamps: a MediaRecorder-level constraint, not math.
 * 2. foreignObject rasterization is a Chromium (and partially Safari)
 *    feature; Firefox taints the canvas and the export fails gracefully
 *    with an explanatory error instead of a crash.
 * 3. Web fonts are embedded as data: URLs (Google Fonts CSS is inlined);
 *    if that fetch fails, text falls back to system fonts and a warning is
 *    reported. Remote (non-data-URL) images are inlined up front; CORS
 *    failures are warnings too.
 * 4. Audio is out of scope — the engine has no audio tracks.
 *
 * API
 * ---
 * exportProjectToWebM({ project, width=1280, height=720, fps=30,
 *   videoBitsPerSecond=8_000_000, onProgress, signal })
 *   → Promise<{ blob, warnings }>
 *   - onProgress(fraction01) fires once per encoded frame
 *   - signal.aborted → recorder stopped, rejects with Error("Export cancelled")
 *   - per-layer render failures are skipped and listed in warnings[]
 */

import { createFrameRenderer } from "./frameRenderer.js";

const MIME_CANDIDATES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

/** Best WebM mime type for MediaRecorder on this browser. "" = browser default, null = unsupported. */
export function pickWebmMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  for (const c of MIME_CANDIDATES) if (MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

export function isWebmExportSupported() {
  return pickWebmMimeType() !== null && typeof HTMLCanvasElement !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} opts
 * @param {object} opts.project  project JSON ({ stage:{w,h,dur,bg}, objects:[...] })
 * @param {number} [opts.width=1280]
 * @param {number} [opts.height=720]
 * @param {number} [opts.fps=30]
 * @param {number} [opts.videoBitsPerSecond=8000000]
 * @param {(fraction:number)=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{blob: Blob, warnings: string[]}>}
 */
export async function exportProjectToWebM({
  project,
  width = 1280,
  height = 720,
  fps = 30,
  videoBitsPerSecond = 8_000_000,
  onProgress,
  signal,
}) {
  if (!project || !Array.isArray(project.objects)) throw new Error("Nothing to export — project has no layers.");
  if (!isWebmExportSupported()) throw new Error("This browser cannot export WebM (MediaRecorder/canvas.captureStream unsupported). Try Chromium-based browsers.");

  const durationMs = Math.min(60_000, Math.max(200, Number(project?.stage?.dur) || 5000));
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const frameDur = 1000 / fps;

  const warnings = [];
  const seen = new Set();
  const warn = (m) => { if (!seen.has(m)) { seen.add(m); warnings.push(m); } };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });

  const renderer = await createFrameRenderer({ project, ctx, width, height, warn });

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const mimeType = pickWebmMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (e) => reject(e.error || new Error("Recorder error"));
  });
  stopped.catch(() => {}); // avoid unhandled rejection on the cancel path

  const cleanup = () => {
    try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* already stopped */ }
    try { track.stop(); } catch { /* noop */ }
    renderer.dispose();
  };

  recorder.start();
  const t0 = performance.now();
  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error("Export cancelled");
      /* Pace capture so the recorder's wall-clock timestamps match the
         intended timeline. Rendering slower than real time simply drops the
         wait; every frame is still emitted exactly once. */
      const wait = t0 + i * frameDur - performance.now();
      if (wait > 2) await sleep(wait);
      await renderer.renderFrame(i * frameDur); // deterministic content at t = i/fps
      if (signal?.aborted) throw new Error("Export cancelled");
      track.requestFrame();
      onProgress?.((i + 1) / totalFrames);
      await sleep(0); // let the encoder thread keep up
    }
  } catch (err) {
    cleanup();
    if (signal?.aborted || err?.message === "Export cancelled") throw new Error("Export cancelled");
    throw err;
  }

  if (recorder.state !== "inactive") recorder.stop();
  await stopped;
  track.stop();
  renderer.dispose();

  if (!chunks.length) throw new Error("The encoder produced no data — export failed.");
  const blob = new Blob(chunks, { type: mimeType || "video/webm" });
  return { blob, warnings };
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
