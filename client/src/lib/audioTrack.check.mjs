/**
 * audioTrack.check.mjs — node check for the project "audio" schema round-trip
 * and playback-gain math used by GraphicDestinationMotion.jsx.
 *
 * Verifies the exact contract the export team codes against:
 *   projectJson() emits a top-level optional "audio" field
 *     { "src": "/api/assets/5", "name": "track.mp3", "startT": 0,
 *       "volume": 0.8, "fadeIn": 500, "fadeOut": 1000 }
 *   — present when a track is attached, OMITTED entirely when not,
 *     and restored (sanitized) by audioFromJson on project load.
 *
 * Run:  node src/lib/audioTrack.check.mjs        (from client/)
 */

import {
  AUDIO_DEFAULTS, AUDIO_MAX_BYTES,
  makeAudioTrack, audioToJson, audioFromJson, audioGainAt, audioWithinAt, validateAudioFile,
} from "./audioTrack.js";

let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* assemble a project object exactly like the component's projectJson() does */
const assembleProject = (track) => JSON.parse(JSON.stringify({
  app: "graphic-destination-motion", v: 5,
  stage: { w: 1280, h: 720, dur: 6000 }, objects: [],
  ...(audioToJson(track) ? { audio: audioToJson(track) } : {}),
}));

console.log("\naudio schema round-trip\n");

/* 1 — attached track → exact field shape + key order */
const attached = { src: "/api/assets/5", name: "track.mp3", startT: 0, volume: 0.8, fadeIn: 500, fadeOut: 1000 };
const withAudio = assembleProject(attached);
check("projectJson includes top-level audio when set", "audio" in withAudio);
check("audio field has the exact contract shape", eq(withAudio.audio, attached), JSON.stringify(withAudio.audio));
check("audio keys in contract order", eq(Object.keys(withAudio.audio), ["src", "name", "startT", "volume", "fadeIn", "fadeOut"]));

/* 2 — no track → field omitted entirely (not null) */
const noAudio = assembleProject(null);
check("audio omitted entirely when null", !("audio" in noAudio));
check("serialized JSON has no audio key", !JSON.stringify(noAudio).includes('"audio"'));
check("falsy/src-less track is also omitted", !("audio" in assembleProject({ name: "x" })));

/* 3 — round trip: serialize → parse → restore */
const restored = audioFromJson(withAudio.audio);
check("restore returns the same values", eq(restored, makeAudioTrack(attached)));
check("double round-trip is stable", eq(audioToJson(audioFromJson(JSON.parse(JSON.stringify(audioToJson(attached))))), attached));

/* 4 — sanitize on load: defaults, clamps, junk */
check("missing fields fall back to defaults", eq(audioFromJson({ src: "/api/assets/9", name: "a.wav" }),
  { src: "/api/assets/9", name: "a.wav", ...AUDIO_DEFAULTS }));
check("volume clamped to 0..1", audioFromJson({ src: "s", volume: 7 }).volume === 1 && audioFromJson({ src: "s", volume: -2 }).volume === 0);
check("times coerced to non-negative ms ints", eq(audioFromJson({ src: "s", startT: -40, fadeIn: "500", fadeOut: 1200.6 }),
  { src: "s", name: "Audio track", startT: 0, volume: AUDIO_DEFAULTS.volume, fadeIn: 500, fadeOut: 1201 }));
check("garbage volume falls back to default", audioFromJson({ src: "s", volume: "loud" }).volume === AUDIO_DEFAULTS.volume);
check("no src → not a track", audioFromJson({ name: "x.mp3" }) === null && audioFromJson(null) === null && audioFromJson("audio") === null && audioFromJson({ src: 42 }) === null);

/* 5 — playback gain (volume × fades), times in ms */
const trk = makeAudioTrack({ src: "s", startT: 1000, volume: 0.8, fadeIn: 500, fadeOut: 1000 });
check("gain 0 before startT", audioGainAt(trk, 999, 10000) === 0);
check("gain 0 exactly at local 0 (fade-in start)", audioGainAt(trk, 1000, 10000) === 0);
check("gain ramps linearly through fade-in", Math.abs(audioGainAt(trk, 1250, 10000) - 0.4) < 1e-9);
check("gain = volume on the plateau", audioGainAt(trk, 4000, 10000) === 0.8);
check("gain ramps to 0 across fade-out", Math.abs(audioGainAt(trk, 10500, 10000) - 0.4) < 1e-9 && audioGainAt(trk, 11000, 10000) === 0);
check("fade-out needs duration; skipped while unknown", audioGainAt(trk, 99000, null) === 0.8);
check("no fades → constant volume after start", audioGainAt(makeAudioTrack({ src: "s", startT: 0, volume: 0.5, fadeIn: 0, fadeOut: 0 }), 1234, 4000) === 0.5);
check("window: inside / before / past audio end", audioWithinAt(trk, 1000, 3000) && !audioWithinAt(trk, 999, 3000) && !audioWithinAt(trk, 4000, 3000) && audioWithinAt(trk, 9000, null));

/* 6 — upload validation */
check("accepts .mp3 by extension", validateAudioFile({ name: "mix.MP3", size: 1024, type: "" }).ok && validateAudioFile({ name: "mix.MP3", size: 1024, type: "" }).mime === "audio/mpeg");
check("keeps browser audio mime", validateAudioFile({ name: "a.m4a", size: 10, type: "audio/x-m4a" }).mime === "audio/x-m4a");
check("rejects wrong type with friendly error", !validateAudioFile({ name: "notes.txt", size: 10, type: "text/plain" }).ok);
check("rejects over 5 MB raw", !validateAudioFile({ name: "big.mp3", size: AUDIO_MAX_BYTES + 1, type: "audio/mpeg" }).ok);
check("accepts exactly 5 MB", validateAudioFile({ name: "edge.wav", size: AUDIO_MAX_BYTES, type: "audio/wav" }).ok);
check("rejects extension-less names", !validateAudioFile({ name: "noext", size: 10, type: "audio/mpeg" }).ok);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
