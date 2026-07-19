/*
 * Guard suite for the Fluent-emoji engine module (client/src/engine/emoji.js).
 * Pure — imports only the emoji module (which imports the generated manifest).
 * Prints PASS/FAIL and exits non-zero on any failure.
 *
 *   node check-emoji.mjs
 */
import { EMOJIS, EMOJI_CATS, buildEmojiClip, holdFor, FLUENT_EMOJI, FEATURED_EMOJI } from "./src/engine/emoji.js";

let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`); }
};

const DUR = 3000;
const flat = (tr) => Object.values(tr || {}).flat();

/* ---------- manifest + registry ---------- */
console.log("registry");
check("manifest is non-empty", Array.isArray(FLUENT_EMOJI) && FLUENT_EMOJI.length > 100, `${FLUENT_EMOJI.length}`);
check("EMOJIS mirrors the manifest length", EMOJIS.length === FLUENT_EMOJI.length);
check("every emoji row has id/name/build", EMOJIS.every((e) => e.id && e.name && typeof e.build === "function"));
check("every emoji points at a /emoji/fluent/3d/*.png file", FLUENT_EMOJI.every((e) => /^\/emoji\/fluent\/3d\/[a-z0-9-]+\.png$/.test(e.file)));
check("emoji ids are unique", new Set(EMOJIS.map((e) => e.id)).size === EMOJIS.length);
check("every row has a category in EMOJI_CATS", EMOJIS.every((e) => EMOJI_CATS.includes(e.category)));

/* ---------- clip shape ---------- */
console.log("clip shape");
const sample = EMOJIS.find((e) => /heart/.test(e.tags.join(" "))) || EMOJIS[0];
const clip = sample.build({ variant: "animated" });
check("build returns a looping clip", clip.type === "clip" && clip.props.end === "loop");
check("clip has exactly one image child", clip.children.length === 1 && clip.children[0].type === "image");
check("image child carries the src", typeof clip.children[0].props.src === "string" && clip.children[0].props.src.endsWith(".png"));
check("image child has finite w/h (measurable by frameOf)", Number.isFinite(clip.children[0].props.w) && Number.isFinite(clip.children[0].props.h));
check("clip duration is the loop length", clip.props.dur === DUR);

/* ---------- seamless loop contract ---------- */
console.log("seamless loop");
const child = clip.children[0];
check("child enters after t=0 (empty at loop point)", child.props.inT > 0);
check("child exits before dur (empty at loop end)", child.props.outT < DUR);
{
  const sc = flat(child.tracks).length ? child.tracks : {};
  const scale = sc.scale || [];
  check("pop: first scale keyframe is 0 at inT", scale.length > 0 && scale[0].v === 0 && scale[0].t === child.props.inT);
  const lastScale = scale[scale.length - 1];
  check("whip: final scale keyframe is 0 (gone)", lastScale && lastScale.v === 0);
  const op = child.tracks.opacity || [];
  check("opacity returns to 0 by the exit", op.length > 0 && op[op.length - 1].v === 0);
}

/* ---------- determinism ---------- */
console.log("determinism");
check("two builds are byte-identical", JSON.stringify(strip(sample.build({ variant: "animated" }))) === JSON.stringify(strip(sample.build({ variant: "animated" }))));
check("no NaN / non-finite keyframe times anywhere", EMOJIS.every((e) => flat(e.build({ variant: "animated" }).children[0].tracks).every((k) => Number.isFinite(k.t) && Number.isFinite(k.v))));
check("every track is sorted ascending by t", EMOJIS.every((e) => {
  const tr = e.build({ variant: "animated" }).children[0].tracks;
  return Object.values(tr).every((arr) => arr.every((k, i) => i === 0 || k.t >= arr[i - 1].t));
}));

/* ---------- variants ---------- */
console.log("variants");
check("static variant has no tracks", flat(sample.build({ variant: "static" }).children[0].tracks).length === 0);
check("animated variant has tracks", flat(sample.build({ variant: "animated" }).children[0].tracks).length > 0);
check("static child spans the whole clip (inT 0, outT null)", (() => { const c = sample.build({ variant: "static" }).children[0]; return c.props.inT === 0 && c.props.outT === null; })());

/* ---------- motion selection ---------- */
console.log("motion recipes");
check("hearts get a heartbeat", holdFor(["red", "heart"]).type === "heartbeat");
check("dizzy gets a spin", holdFor(["dizzy", "face"]).type === "spin");
check("angry gets a rock", holdFor(["angry", "rage"]).type === "rock");
check("unknown falls back to pulse", holdFor(["blblbl"]).type === "pulse");
check("build never throws for any emoji", (() => { try { EMOJIS.forEach((e) => { e.build({ variant: "animated" }); e.build({ variant: "static" }); }); return true; } catch { return false; } })());

/* ---------- featured teaser set ---------- */
console.log("featured");
check("exactly 4 featured emoji", FEATURED_EMOJI.length === 4);
check("featured are real registry rows with build()", FEATURED_EMOJI.every((e) => EMOJIS.includes(e) && typeof e.build === "function"));
check("featured are distinct", new Set(FEATURED_EMOJI.map((e) => e.id)).size === 4);

function strip(o) { const c = JSON.parse(JSON.stringify(o)); const drop = (n) => { delete n.id; (n.children || []).forEach(drop); }; drop(c); return c; }

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All emoji checks pass.");
process.exit(failed ? 1 : 0);
