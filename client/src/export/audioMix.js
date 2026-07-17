/**
 * audioMix.js — decode, place and mix the optional project audio track for
 * the video exporters.
 *
 * PROJECT AUDIO SCHEMA (exact contract with the editor):
 *   project.audio = { src, name?, startT?, volume?, fadeIn?, fadeOut? }
 *   - src     same-origin relative URL (fetched with credentials:"include")
 *             or a data: URL. Required; a missing/empty src = no audio.
 *   - startT  ms on the composition timeline where the audio starts
 *             (default 0; negative values play the file from -startT ms in).
 *   - volume  linear gain, default 1.
 *   - fadeIn / fadeOut  ms of linear fade applied at the start / end of the
 *             audible window (default 0). Overlapping fades are scaled down
 *             proportionally so they never cross.
 *   Times are always milliseconds. A project without `audio` exports silent
 *   video exactly as before.
 *
 * EXPORT DURATION = composition duration, regardless of audio length: audio
 * longer than the comp is trimmed at the comp end; audio shorter than the
 * comp leaves silence after it ends.
 *
 * renderAudioPcm() renders that contract to raw per-channel PCM at a fixed
 * sample rate (for the WebCodecs MP4 path). The WebM path reuses the same
 * fetch/decode helpers and the SAME placement/gain math (computeAudioWindow
 * + scheduleGainAutomation) on a realtime AudioContext.
 *
 * Every failure (fetch, decode, abort) throws a friendly Error; callers
 * convert it to a warning and export without sound — audio must never crash
 * an export.
 */

/** Default sample rate for exported audio (Hz). */
export const AUDIO_SAMPLE_RATE = 48000;

/** Throw the exporters' standard cancellation error when aborted. */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("Export cancelled");
}

/**
 * Fetch audio bytes from a same-origin URL or data: URL.
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchAudioBytes(src, signal) {
  let res;
  try {
    res = await fetch(src, { credentials: "include", signal });
  } catch (err) {
    throwIfAborted(signal);
    throw new Error(`audio fetch failed (${err?.message || err})`);
  }
  if (!res.ok) throw new Error(`audio fetch failed (HTTP ${res.status})`);
  try {
    return await res.arrayBuffer();
  } catch (err) {
    throw new Error(`audio read failed (${err?.message || err})`);
  }
}

/**
 * Decode audio bytes to an AudioBuffer. Decoding happens on a throwaway
 * OfflineAudioContext so no user gesture / running realtime context is
 * needed and no sound is produced. The buffer is resampled to sampleRate.
 */
export async function decodeAudioBytes(bytes, sampleRate = AUDIO_SAMPLE_RATE) {
  const ctx = new OfflineAudioContext(1, 1, sampleRate);
  try {
    return await ctx.decodeAudioData(bytes);
  } catch (err) {
    throw new Error(`audio could not be decoded — unsupported or corrupt file (${err?.message || err})`);
  }
}

/**
 * Placement of the audio file on the composition timeline (all ms).
 * @returns {{audible:boolean, t0:number, t1:number, skip:number}}
 *   t0/t1 = timeline window where audio is heard; skip = offset into the
 *   file (for negative startT). t1 - t0 is what actually plays.
 */
export function computeAudioWindow({ startT = 0, audioDurationMs, durationMs }) {
  const skip = Math.max(0, -Number(startT) || 0); // ms skipped at the head of the file
  const t0 = Math.max(0, Number(startT) || 0); // timeline ms where playback starts
  const available = Math.max(0, (Number(audioDurationMs) || 0) - skip);
  const t1 = Math.min(durationMs, t0 + available); // trimmed at comp end
  return { audible: t1 > t0, t0, t1, skip };
}

/**
 * Schedule volume + fadeIn/fadeOut on a GainNode's AudioParam. Shared by the
 * OfflineAudioContext (MP4) and realtime AudioContext (WebM) paths so both
 * produce the same gain curve. Times here are SECONDS on the context's own
 * timeline (t0 etc. come from computeAudioWindow, converted by the caller).
 */
export function scheduleGainAutomation(param, { t0s, t1s, volume = 1, fadeInMs = 0, fadeOutMs = 0 }) {
  const v = Math.min(10, Math.max(0, Number(volume) || 0));
  let fIn = Math.max(0, Number(fadeInMs) || 0);
  let fOut = Math.max(0, Number(fadeOutMs) || 0);
  const winMs = Math.max(0, (t1s - t0s) * 1000);
  if (fIn + fOut > winMs && fIn + fOut > 0) {
    const scale = winMs / (fIn + fOut); // never let the fades cross
    fIn *= scale;
    fOut *= scale;
  }
  param.setValueAtTime(0, 0); // anchor: silence before the audio starts
  if (fIn > 0) {
    param.setValueAtTime(0, t0s);
    param.linearRampToValueAtTime(v, t0s + fIn / 1000);
  } else {
    param.setValueAtTime(v, t0s);
  }
  if (fOut > 0) {
    param.setValueAtTime(v, t1s - fOut / 1000);
    param.linearRampToValueAtTime(0, t1s);
  } else {
    param.setValueAtTime(0, t1s); // hard cut / natural end at the window edge
  }
}

/**
 * Render the project's audio track to raw PCM on the composition timeline.
 *
 * Pipeline: fetch bytes → decodeAudioData → OfflineAudioContext(2ch,
 * durationMs·sampleRate) → BufferSource started at the startT position →
 * GainNode automated for volume/fadeIn/fadeOut → render → per-channel
 * Float32Arrays (each exactly round(durationMs/1000·sampleRate) samples).
 *
 * @param {object} opts
 * @param {string} opts.src  audio URL (same-origin or data:)
 * @param {number} [opts.startT=0]  ms on the comp timeline
 * @param {number} [opts.volume=1]
 * @param {number} [opts.fadeIn=0]  ms
 * @param {number} [opts.fadeOut=0] ms
 * @param {number} opts.durationMs  composition duration (output length)
 * @param {number} [opts.sampleRate=48000]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Float32Array[]>} per-channel PCM (2 channels)
 */
export async function renderAudioPcm({ src, startT = 0, volume = 1, fadeIn = 0, fadeOut = 0, durationMs, sampleRate = AUDIO_SAMPLE_RATE, signal }) {
  if (!src || typeof src !== "string") throw new Error("audio track has no src");
  throwIfAborted(signal);
  const bytes = await fetchAudioBytes(src, signal);
  throwIfAborted(signal);
  const decoded = await decodeAudioBytes(bytes, sampleRate);
  throwIfAborted(signal);

  const lengthSamples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const offline = new OfflineAudioContext(2, lengthSamples, sampleRate);

  const win = computeAudioWindow({ startT, audioDurationMs: decoded.duration * 1000, durationMs });
  const source = offline.createBufferSource();
  source.buffer = decoded;
  const gain = offline.createGain();
  scheduleGainAutomation(gain.gain, {
    t0s: win.t0 / 1000,
    t1s: win.t1 / 1000,
    volume,
    fadeInMs: fadeIn,
    fadeOutMs: fadeOut,
  });
  source.connect(gain);
  gain.connect(offline.destination);
  if (win.audible) {
    source.start(win.t0 / 1000, win.skip / 1000, (win.t1 - win.t0) / 1000);
  }

  const rendered = await offline.startRendering();
  throwIfAborted(signal);
  const channels = [];
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    channels.push(new Float32Array(rendered.getChannelData(ch))); // copy, not a view
  }
  return channels;
}
