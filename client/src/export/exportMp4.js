/**
 * exportMp4.js — deterministic, client-side MP4 (H.264) export for Graphic
 * Destination Motion projects. Instant export, no server render farm, and —
 * unlike the MediaRecorder WebM path — a file with real duration metadata
 * that QuickTime / Windows Media Player / phones can actually play.
 *
 * APPROACH
 * --------
 * Frames come from the SAME createFrameRenderer() the WebM exporter uses
 * (identical visuals — the editor's own engine paints every frame). Instead
 * of captureStream + MediaRecorder, each painted canvas is wrapped in a
 * WebCodecs VideoFrame with a DETERMINISTIC timestamp (frame i lands at
 * round(i · 1e6 / fps) µs — no wall-clock involvement anywhere), encoded by
 * VideoEncoder (H.264), and muxed into a fragmented-free MP4 with mp4-muxer
 * (fastStart "in-memory": moov up front, plays everywhere).
 *
 * Codec negotiation: VideoEncoder.isConfigSupported is probed for
 *   1. avc1.640028 — High profile, level 4.0
 *   2. avc1.4d0028 — Main profile, level 4.0
 *   3. avc1.42001f — Baseline profile, level 3.1
 * and the first supported config wins. The probe result is cached for the
 * session (isMp4ExportSupported / exportProjectToMp4 share it).
 *
 * API
 * ---
 * exportProjectToMp4({ project, width=1280, height=720, fps=30,
 *   videoBitsPerSecond=8_000_000, onProgress, signal })
 *   → Promise<{ blob, warnings }>
 *   - onProgress(fraction01) fires once per encoded frame
 *   - signal.aborted → encoder closed, rejects with Error("Export cancelled")
 *   - per-layer render failures are skipped and listed in warnings[]
 *
 * isMp4ExportSupported() → Promise<boolean> (WebCodecs probing is async;
 * the result is cached, so repeat calls are cheap).
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { createFrameRenderer } from "./frameRenderer.js";

/** H.264 configs, in preference order: High L4.0 → Main L4.0 → Baseline L3.1. */
const AVC_CODEC_CANDIDATES = [
  { codec: "avc1.640028", label: "H.264 High L4.0" },
  { codec: "avc1.4d0028", label: "H.264 Main L4.0" },
  { codec: "avc1.42001f", label: "H.264 Baseline L3.1" },
];

/* Probe result cache: Promise<string | null> — the chosen codec string, or
   null when WebCodecs/H.264 is unavailable. Shared by isMp4ExportSupported()
   and exportProjectToMp4() so probing happens once per session. */
let _probePromise = null;

/**
 * Probe WebCodecs for a usable H.264 encoder config.
 * @returns {Promise<string|null>} codec string (e.g. "avc1.640028") or null.
 */
export function probeMp4Codec() {
  if (!_probePromise) {
    _probePromise = (async () => {
      if (typeof VideoEncoder === "undefined" || typeof VideoEncoder.isConfigSupported !== "function") return null;
      for (const { codec } of AVC_CODEC_CANDIDATES) {
        try {
          const { supported } = await VideoEncoder.isConfigSupported({
            codec,
            width: 1280,
            height: 720,
            bitrate: 8_000_000,
            framerate: 30,
            latencyMode: "quality",
            hardwareAcceleration: "no-preference",
            avc: { format: "avc" },
          });
          if (supported) return codec;
        } catch { /* config rejected — try the next one */ }
      }
      return null;
    })();
  }
  return _probePromise;
}

/**
 * @returns {Promise<boolean>} true when WebCodecs VideoEncoder exists and at
 * least one of the H.264 configs is supported. Cached after the first call.
 */
export async function isMp4ExportSupported() {
  return (await probeMp4Codec()) !== null;
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
export async function exportProjectToMp4({
  project,
  width = 1280,
  height = 720,
  fps = 30,
  videoBitsPerSecond = 8_000_000,
  onProgress,
  signal,
}) {
  if (!project || !Array.isArray(project.objects)) throw new Error("Nothing to export — project has no layers.");
  const codec = await probeMp4Codec();
  if (!codec) throw new Error("This browser cannot encode H.264 (WebCodecs VideoEncoder unsupported). Try Chrome/Edge, or use the WebM export.");

  /* Same duration/frame math as the WebM path. */
  const durationMs = Math.min(60_000, Math.max(200, Number(project?.stage?.dur) || 5000));
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const frameDurMs = 1000 / fps;

  const warnings = [];
  const seen = new Set();
  const warn = (m) => { if (!seen.has(m)) { seen.add(m); warnings.push(m); } };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });

  const renderer = await createFrameRenderer({ project, ctx, width, height, warn });

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
  });

  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), // meta carries decoderConfig.description
    error: (err) => { encodeError = err; },
  });
  encoder.configure({
    codec,
    width,
    height,
    bitrate: videoBitsPerSecond,
    framerate: fps,
    latencyMode: "quality",
    hardwareAcceleration: "no-preference",
    avc: { format: "avc" },
  });

  /* Waits for the encoder queue to drain so a long export can't queue the
     whole video worth of uncompressed frames in memory. */
  const waitForQueue = () =>
    new Promise((resolve) => encoder.addEventListener("dequeue", resolve, { once: true }));

  const cleanup = () => {
    try { if (encoder.state !== "closed") encoder.close(); } catch { /* already closed */ }
    renderer.dispose();
  };

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error("Export cancelled");
      if (encodeError) throw encodeError;

      await renderer.renderFrame(i * frameDurMs); // deterministic content at t = i/fps

      /* Deterministic timestamps: frame i starts at round(i·1e6/fps) µs and
         lasts exactly 1e6/fps µs — no wall clock, no MediaRecorder stretch. */
      const timestamp = Math.round((i * 1e6) / fps);
      const frame = new VideoFrame(canvas, { timestamp, duration: 1e6 / fps });
      encoder.encode(frame, { keyFrame: i % (fps * 4) === 0 }); // keyframe every 4 s
      frame.close();

      onProgress?.((i + 1) / totalFrames);
      if (encoder.encodeQueueSize > 8) await waitForQueue();
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
  } catch (err) {
    cleanup();
    if (signal?.aborted || err?.message === "Export cancelled") throw new Error("Export cancelled");
    throw err;
  }

  const { buffer } = muxer.target;
  cleanup();
  if (!buffer || buffer.byteLength === 0) throw new Error("The encoder produced no data — export failed.");
  const blob = new Blob([buffer], { type: "video/mp4" });
  return { blob, warnings };
}
