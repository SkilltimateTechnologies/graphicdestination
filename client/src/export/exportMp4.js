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
 *
 * AUDIO
 * -----
 * When project.audio is set ({ src, startT, volume, fadeIn, fadeOut } — see
 * audioMix.js for the exact schema), the track is rendered to PCM with an
 * OfflineAudioContext (audioMix.renderAudioPcm), encoded with WebCodecs
 * AudioEncoder and muxed as a second track:
 *   1. "mp4a.40.2" — AAC-LC, the canonical MP4 audio codec (preferred)
 *   2. "opus"      — only when AAC is unavailable; mp4-muxer allows Opus in
 *                    MP4, but players besides Chromium/FFmpeg rarely do, so
 *                    this fallback is reported in warnings[]
 * The PCM is chunked into 1024-sample AudioData frames with deterministic
 * µs timestamps (chunk k at round(k·1024·1e6/sampleRate) µs — same no-wall-
 * clock rule as the video frames). With audio, onProgress maps video encode
 * to 0–90% and audio encode to 90–100%. ANY audio failure (fetch, decode,
 * encode) degrades to a silent video with a warning — audio never crashes
 * an export. Abort closes both encoders.
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { createFrameRenderer } from "./frameRenderer.js";
import { renderAudioPcm, AUDIO_SAMPLE_RATE } from "./audioMix.js";

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

/* ---------- audio (optional project.audio track) ---------- */

/** AudioEncoder candidates in preference order: AAC-LC first (canonical MP4
    audio), Opus only as a fallback (mp4-muxer allows it in MP4; most
    non-Chromium players don't). */
const AUDIO_CODEC_CANDIDATES = [
  { codec: "mp4a.40.2", muxerCodec: "aac", label: "AAC-LC", bitrate: 128_000 },
  { codec: "opus", muxerCodec: "opus", label: "Opus", bitrate: 128_000 },
];

/**
 * Probe WebCodecs for a usable audio encoder config (not cached — cheap, and
 * sampleRate/channel count can vary per export).
 * @returns {Promise<{codec:string, muxerCodec:string, label:string, bitrate:number}|null>}
 */
export async function probeAudioCodec(sampleRate = AUDIO_SAMPLE_RATE, numberOfChannels = 2) {
  if (typeof AudioEncoder === "undefined" || typeof AudioEncoder.isConfigSupported !== "function") return null;
  for (const cand of AUDIO_CODEC_CANDIDATES) {
    try {
      const { supported } = await AudioEncoder.isConfigSupported({
        codec: cand.codec,
        sampleRate,
        numberOfChannels,
        bitrate: cand.bitrate,
      });
      if (supported) return cand;
    } catch { /* config rejected — try the next one */ }
  }
  return null;
}

/** AAC frames are 1024 samples — chunk PCM to match. */
const AUDIO_FRAME_SAMPLES = 1024;

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

  /* Audio prep (fetch → decode → offline PCM render → probe) runs in
     parallel with renderer setup (font/image inlining is the slow part).
     Failures degrade to a silent video + warning — never a crashed export. */
  const audioCfg = project?.audio && typeof project.audio.src === "string" && project.audio.src ? project.audio : null;
  if (project?.audio && !audioCfg) warn("Audio track is missing its src — exporting without sound.");
  const audioPrep = audioCfg
    ? (async () => {
        const pcm = await renderAudioPcm({ ...audioCfg, durationMs, sampleRate: AUDIO_SAMPLE_RATE, signal });
        const config = await probeAudioCodec(AUDIO_SAMPLE_RATE, pcm.length);
        if (!config) throw new Error("this browser cannot encode AAC or Opus audio (WebCodecs AudioEncoder unsupported)");
        return { pcm, config };
      })()
    : null;
  audioPrep?.catch(() => {}); // rejection is handled below — silence the unhandled-rejection event

  const renderer = await createFrameRenderer({ project, ctx, width, height, warn });

  /* Encode the audio track into buffered chunks BEFORE the muxer is built,
     so an audio failure still leaves a clean video-only MP4. Audio encode is
     the first 10% of progress when present; video encode is the rest. */
  let audio = null; // { config, chunks: [{chunk, meta}], channels }
  if (audioPrep) {
    try {
      const { pcm, config } = await audioPrep;
      const chunks = await encodeAudioToChunks({ pcm, config, signal, onProgress: (f) => onProgress?.(f * 0.1) });
      audio = { config, chunks, channels: pcm.length };
      if (config.muxerCodec !== "aac") {
        warn("AAC audio encoding is unavailable in this browser — the MP4 carries Opus audio, which players other than Chromium/FFmpeg-based ones may not play.");
      }
    } catch (err) {
      if (signal?.aborted || err?.message === "Export cancelled") {
        renderer.dispose();
        throw new Error("Export cancelled");
      }
      warn(`Audio track${audioCfg.name ? ` "${audioCfg.name}"` : ""} could not be used — exporting without sound (${err?.message || err}).`);
    }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    ...(audio ? { audio: { codec: audio.config.muxerCodec, sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: audio.channels } } : {}),
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

      onProgress?.(audio ? 0.1 + 0.9 * ((i + 1) / totalFrames) : (i + 1) / totalFrames);
      if (encoder.encodeQueueSize > 8) await waitForQueue();
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    if (audio) for (const { chunk, meta } of audio.chunks) muxer.addAudioChunk(chunk, meta);
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

/**
 * Encode per-channel PCM into buffered audio chunks (AAC or Opus, per the
 * probed config). PCM is cut into 1024-sample AudioData frames — one AAC
 * frame each — stamped deterministically (chunk k at round(k·1024·1e6/sr)
 * µs, exactly like the video frames' i·1e6/fps rule). Chunks are buffered,
 * not muxed, so a failure here can still fall back to a video-only MP4.
 * The encoder is always closed before returning (success or failure).
 *
 * @returns {Promise<Array<{chunk: EncodedAudioChunk, meta: object}>>}
 */
async function encodeAudioToChunks({ pcm, config, signal, onProgress }) {
  const channels = pcm.length;
  const totalSamples = pcm[0]?.length ?? 0;
  const sampleRate = AUDIO_SAMPLE_RATE;
  let encodeError = null;
  const chunks = [];
  const encoder = new AudioEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta }),
    error: (err) => { encodeError = err; },
  });
  encoder.configure({
    codec: config.codec,
    sampleRate,
    numberOfChannels: channels,
    bitrate: config.bitrate,
  });
  /* Same queue-drain backpressure as the video encoder. */
  const waitForQueue = () =>
    new Promise((resolve) => encoder.addEventListener("dequeue", resolve, { once: true }));

  try {
    const totalChunks = Math.ceil(totalSamples / AUDIO_FRAME_SAMPLES);
    for (let k = 0; k < totalChunks; k++) {
      if (signal?.aborted) throw new Error("Export cancelled");
      if (encodeError) throw encodeError;
      const n = Math.min(AUDIO_FRAME_SAMPLES, totalSamples - k * AUDIO_FRAME_SAMPLES);
      const data = new Float32Array(n * channels); // f32-planar: channel planes concatenated
      for (let ch = 0; ch < channels; ch++) {
        data.set(pcm[ch].subarray(k * AUDIO_FRAME_SAMPLES, k * AUDIO_FRAME_SAMPLES + n), ch * n);
      }
      const frame = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((k * AUDIO_FRAME_SAMPLES * 1e6) / sampleRate),
        data,
      });
      encoder.encode(frame);
      frame.close();
      onProgress?.((k + 1) / totalChunks);
      if (encoder.encodeQueueSize > 16) await waitForQueue();
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    return chunks;
  } finally {
    try { if (encoder.state !== "closed") encoder.close(); } catch { /* already closed */ }
  }
}
