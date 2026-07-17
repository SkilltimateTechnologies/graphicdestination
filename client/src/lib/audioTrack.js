/**
 * audioTrack.js — the project-level audio track model (pure, no React/DOM).
 *
 * Project JSON contract (coded against by the export pipeline):
 *   "audio": { "src": "/api/assets/5", "name": "track.mp3",
 *              "startT": 0, "volume": 0.8, "fadeIn": 500, "fadeOut": 1000 }
 * The field is a top-level OPTIONAL member of the project object — it is
 * omitted entirely when no audio is attached. All times are milliseconds in
 * engine units (the same clock as keyframes / the playhead). volume is 0..1.
 *
 * GraphicDestinationMotion.jsx keeps the same shape in its `audioTrack` state
 * ({ src, name, startT, volume, fadeIn, fadeOut } | null) and uses:
 *   audioToJson(track)  → object for projectJson(), or undefined to OMIT
 *   audioFromJson(raw)  → sanitized track on project load, or null
 *   audioGainAt(t, ms)  → playback gain (volume × fades) at engine time
 */

export const AUDIO_DEFAULTS = { startT: 0, volume: 0.8, fadeIn: 500, fadeOut: 1000 };

/* upload constraints for the audio rail panel */
export const AUDIO_ACCEPT_EXTS = [".mp3", ".wav", ".ogg", ".m4a", ".aac"];
export const AUDIO_ACCEPT_ATTR = AUDIO_ACCEPT_EXTS.join(",");
export const AUDIO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB raw file size
export const AUDIO_MIME_BY_EXT = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

const clamp01n = (v) => Math.max(0, Math.min(1, v));
/* coerce to a non-negative integer number of ms; fallback when not finite */
const msVal = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};
const volVal = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp01n(n) : fallback;
};

/* Normalize any partial/loose input into the exact track shape. Missing
 * fields fall back to AUDIO_DEFAULTS; out-of-range values are clamped. */
export function makeAudioTrack(over = {}) {
  return {
    src: String(over.src || ""),
    name: String(over.name || "Audio track"),
    startT: msVal(over.startT, AUDIO_DEFAULTS.startT),
    volume: over.volume == null ? AUDIO_DEFAULTS.volume : volVal(over.volume, AUDIO_DEFAULTS.volume),
    fadeIn: msVal(over.fadeIn, AUDIO_DEFAULTS.fadeIn),
    fadeOut: msVal(over.fadeOut, AUDIO_DEFAULTS.fadeOut),
  };
}

/* projectJson(): returns the JSON-ready object, or undefined when there is no
 * usable track — callers spread it conditionally so the "audio" key is OMITTED
 * entirely (not null) when nothing is attached. */
export function audioToJson(track) {
  if (!track || typeof track !== "object" || !track.src) return undefined;
  const t = makeAudioTrack(track);
  return { src: t.src, name: t.name, startT: t.startT, volume: t.volume, fadeIn: t.fadeIn, fadeOut: t.fadeOut };
}

/* importProject(): restore the attached track (sanitized), or null when the
 * project has no usable "audio" field. */
export function audioFromJson(raw) {
  if (!raw || typeof raw !== "object" || !raw.src || typeof raw.src !== "string") return null;
  return makeAudioTrack(raw);
}

/**
 * Playback gain (0..1) at engine time t (ms), for a track with the shape above.
 *   - 0 before the track's startT
 *   - ramps 0 → volume over fadeIn ms (linear)
 *   - ramps volume → 0 over the last fadeOut ms of the audio (needs durMs,
 *     the audio file's own duration; pass null/undefined before metadata is
 *     known and the fade-out is simply not applied yet)
 * durMs is the AUDIO duration, not the composition duration.
 */
export function audioGainAt(track, t, durMs) {
  if (!track) return 0;
  const local = t - (track.startT || 0);
  if (local < 0) return 0;
  let g = volVal(track.volume, AUDIO_DEFAULTS.volume);
  if (track.fadeIn > 0) g *= clamp01n(local / track.fadeIn);
  if (durMs != null && Number.isFinite(durMs) && track.fadeOut > 0) g *= clamp01n((durMs - local) / track.fadeOut);
  return clamp01n(g);
}

/* True when the playhead t (ms) sits inside the audible window
 * [startT, startT+durMs). durMs null/undefined = duration unknown → open end. */
export function audioWithinAt(track, t, durMs) {
  if (!track) return false;
  const local = t - (track.startT || 0);
  if (local < 0) return false;
  return durMs == null || !Number.isFinite(durMs) || local < durMs;
}

/**
 * Validate a File picked in the audio panel before reading/uploading it.
 * Returns { ok: true, mime } or { ok: false, error } with friendly copy.
 * Checks the extension (.mp3/.wav/.ogg/.m4a/.aac) and the RAW byte size (≤5 MB);
 * mime falls back to an extension mapping when the browser reports none.
 */
export function validateAudioFile(file) {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  if (!AUDIO_ACCEPT_EXTS.includes(ext)) {
    return { ok: false, error: "That file type isn't supported — use MP3, WAV, OGG, M4A or AAC." };
  }
  if (!Number.isFinite(file?.size) || file.size > AUDIO_MAX_BYTES) {
    return { ok: false, error: "That audio file is too large — 5 MB max." };
  }
  const mime = typeof file.type === "string" && file.type.startsWith("audio/") ? file.type : AUDIO_MIME_BY_EXT[ext];
  return { ok: true, mime };
}
