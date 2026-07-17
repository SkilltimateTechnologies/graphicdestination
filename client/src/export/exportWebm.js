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
 * 4. Audio (optional project.audio track — see audioMix.js for the schema)
 *    is mixed live: a realtime AudioContext plays the decoded track through
 *    a GainNode (same placement/volume/fade math as the MP4 path) into a
 *    MediaStreamDestination, whose track is recorded alongside the canvas
 *    video track (VP9/VP8 + Opus). Because MediaRecorder timestamps are
 *    wall-clock (limitation 1), A/V sync is best-effort — the audio start is
 *    scheduled on the audio clock when the recorder starts, which can drift
 *    a few ms from the paced frame timeline. The MP4 export is sample-exact;
 *    prefer it when audio sync matters. Any audio failure degrades to a
 *    silent video with a warning — audio never crashes an export.
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
import { fetchAudioBytes, decodeAudioBytes, computeAudioWindow, scheduleGainAutomation } from "./audioMix.js";

const MIME_CANDIDATES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
/* MediaRecorder always encodes WebM audio as Opus. */
const MIME_CANDIDATES_AUDIO = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

/** Best WebM mime type for MediaRecorder on this browser. "" = browser default, null = unsupported. */
export function pickWebmMimeType(withAudio = false) {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  for (const c of withAudio ? MIME_CANDIDATES_AUDIO : MIME_CANDIDATES) if (MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

export function isWebmExportSupported() {
  return pickWebmMimeType() !== null && typeof HTMLCanvasElement !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build the live audio path for a WebM export: decoded project.audio played
 * through a GainNode into a MediaStreamDestination. Returns null when the
 * track lands entirely outside the composition (nothing audible to record).
 * The gain curve and source start are scheduled by begin() at recorder
 * start so audio lands on the same (wall-clock) timeline as the paced
 * frames — same placement/volume/fade math as the MP4 path (audioMix.js).
 *
 * @returns {Promise<{dest: MediaStreamAudioDestinationNode, begin: () => void, stop: () => void} | null>}
 */
async function setupWebmAudioTrack({ audioCfg, durationMs, signal }) {
  const bytes = await fetchAudioBytes(audioCfg.src, signal);
  const decoded = await decodeAudioBytes(bytes); // AudioBuffer is context-independent
  const win = computeAudioWindow({ startT: audioCfg.startT, audioDurationMs: decoded.duration * 1000, durationMs });
  if (!win.audible) return null;

  const ctx = new AudioContext();
  /* Autoplay policy: exports are triggered by a user gesture, so resume()
     normally resolves immediately; a headless browser may need
     --autoplay-policy=no-user-gesture-required. */
  await Promise.race([ctx.resume(), sleep(1000)]);
  if (ctx.state !== "running") {
    try { ctx.close(); } catch { /* noop */ }
    throw new Error("the browser blocked audio playback (AudioContext suspended)");
  }

  const dest = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  const gain = ctx.createGain();
  source.connect(gain);
  gain.connect(dest);

  let started = false;
  return {
    dest,
    begin() {
      const base = ctx.currentTime;
      scheduleGainAutomation(gain.gain, {
        t0s: base + win.t0 / 1000,
        t1s: base + win.t1 / 1000,
        volume: audioCfg.volume,
        fadeInMs: audioCfg.fadeIn,
        fadeOutMs: audioCfg.fadeOut,
      });
      source.start(base + win.t0 / 1000, win.skip / 1000, (win.t1 - win.t0) / 1000);
      started = true;
    },
    stop() {
      try { if (started) source.stop(); } catch { /* already ended */ }
      try { for (const t of dest.stream.getTracks()) t.stop(); } catch { /* noop */ }
      try { ctx.close(); } catch { /* noop */ }
    },
  };
}

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

  /* Optional audio track (project.audio) — fetch+decode runs in parallel
     with renderer setup; failures degrade to silent video + warning. */
  const audioCfg = project?.audio && typeof project.audio.src === "string" && project.audio.src ? project.audio : null;
  if (project?.audio && !audioCfg) warn("Audio track is missing its src — exporting without sound.");
  const audioPrep = audioCfg ? setupWebmAudioTrack({ audioCfg, durationMs, signal }) : null;
  audioPrep?.catch(() => {}); // rejection is handled below

  const renderer = await createFrameRenderer({ project, ctx, width, height, warn });

  let audio = null;
  if (audioPrep) {
    try {
      audio = await audioPrep;
    } catch (err) {
      if (signal?.aborted || err?.message === "Export cancelled") {
        renderer.dispose();
        throw new Error("Export cancelled");
      }
      warn(`Audio track${audioCfg.name ? ` "${audioCfg.name}"` : ""} could not be used — exporting without sound (${err?.message || err}).`);
    }
  }

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const mimeType = pickWebmMimeType(!!audio);
  /* One MediaStream for the recorder: canvas video track + (optional)
     MediaStreamDestination audio track → VP9/VP8 + Opus. */
  const combined = audio ? new MediaStream([track, ...audio.dest.stream.getAudioTracks()]) : stream;
  const recorder = new MediaRecorder(combined, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond,
    ...(audio ? { audioBitsPerSecond: 128_000 } : {}),
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
    audio?.stop();
    renderer.dispose();
  };

  recorder.start();
  const t0 = performance.now();
  audio?.begin(); // schedule source start + gain curve on the audio clock
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
  audio?.stop();
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
