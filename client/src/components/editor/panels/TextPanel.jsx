/* text drawer (R9w3) — the old rail button dropped ONE generic text layer;
   now the panel offers:
   · STYLE PRESETS — Heading / Subheading / Normal text / Caption, styled
     from the user's settings text-style config (Settings page) with the
     active brand's fonts filling any gap and its text color as the fill.
   · TEXT EFFECTS — ten drop-in animated presets built ONLY from the
     engine's existing textFx ids (typewriter/rise/pop/fall/tracking/
     scramble/wave) combined with styling (fills, box treatments, glow/
     pulse chips, letterspacing, weights). One click inserts a ready text
     layer whose effect starts at the playhead.
   Every effect card is a LIVE preview through the same StageObject the
   stage and the export use: a representative HOLD frame by default (the
   entrance has fully landed), the shared hover-play ticker animates it
   only while hovered and mouse-leave resets to the still (the same
   useHoverPlay pattern the icons/templates panels use). */
import { C, sectionLabel } from "../model";
import { StageObject } from "../../StageObject";
import { useHoverPlay } from "../TemplateThumb.jsx";
import { TEXT_TIER_LABELS } from "../../../lib/settings.js";

/* ---------- style presets (tiers) ---------- */
export const TEXT_TIER_PRESETS = [
  { id: "heading", ls: 0.5, sample: "Heading" },
  { id: "subheading", ls: 0.5, sample: "Subheading" },
  { id: "body", ls: 0, sample: "Normal text" },
  { id: "caption", ls: 1, sample: "Caption" },
];

/* ---------- text effects ----------
   fx.type MUST stay one of the engine's textFx ids (checked by
   check-templates.mjs TEXTFX_IDS + check-r9w3.mjs); styling rides the
   existing text render path only (fill / font / ls / upper / box). */
export const TEXT_EFFECTS = [
  { id: "terminal", name: "Typewriter Terminal", hint: "Mono · green on dark console", sample: "HELLO WORLD",
    fx: { type: "typewriter", seed: 3 },
    props: { fontFamily: "JetBrains Mono", fontSize: 34, fontWeight: 700, fill: "#6EE7B7", ls: 1, upper: false, bg: "#0B1410", borderC: "#6EE7B7", borderW: 1, radius: 10, pad: 18, boxFx: "none" } },
  { id: "cinematic", name: "Cinematic Tracking", hint: "Wide caps pull together", sample: "EPIC TITLE",
    fx: { type: "tracking", seed: 3 },
    props: { fontFamily: "Oswald", fontSize: 54, fontWeight: 600, fill: "#F9F9F9", ls: 6, upper: true, bg: "", borderC: "#FFB224", borderW: 0, radius: 14, pad: 16, boxFx: "none" } },
  { id: "neonpop", name: "Neon Pop", hint: "Glow chip · chars pop in", sample: "Neon Pop",
    fx: { type: "pop", seed: 5 },
    props: { fontFamily: "Archivo Black", fontSize: 42, fontWeight: 400, fill: "#FFD984", ls: 1, upper: false, bg: "#17102A", borderC: "#C084FC", borderW: 1.5, radius: 16, pad: 22, boxFx: "glow" } },
  { id: "waveparty", name: "Wave Party", hint: "Endless loopy bounce", sample: "Wave Party",
    fx: { type: "wave", seed: 7 },
    props: { fontFamily: "Pacifico", fontSize: 46, fontWeight: 400, fill: "#FF6B6B", ls: 1, upper: false, bg: "", borderC: "#FFB224", borderW: 0, radius: 14, pad: 16, boxFx: "none" } },
  { id: "decode", name: "Scramble Decode", hint: "Glyphs resolve to amber caps", sample: "TOP SECRET",
    fx: { type: "scramble", seed: 7 },
    props: { fontFamily: "JetBrains Mono", fontSize: 36, fontWeight: 600, fill: "#F5A524", ls: 3, upper: true, bg: "", borderC: "#FFB224", borderW: 0, radius: 14, pad: 16, boxFx: "none" } },
  { id: "riseheadline", name: "Rise Headline", hint: "Chars float up, staggered", sample: "Big News",
    fx: { type: "rise", seed: 3 },
    props: { fontFamily: "Space Grotesk", fontSize: 64, fontWeight: 700, fill: "#F9F9F9", ls: 0.5, upper: false, bg: "", borderC: "#FFB224", borderW: 0, radius: 14, pad: 16, boxFx: "none" } },
  { id: "fallbounce", name: "Fall Bounce", hint: "Drops in with a bounce", sample: "BOING",
    fx: { type: "fall", seed: 3 },
    props: { fontFamily: "Bebas Neue", fontSize: 56, fontWeight: 400, fill: "#5B8CFF", ls: 2, upper: true, bg: "", borderC: "#FFB224", borderW: 0, radius: 14, pad: 16, boxFx: "none" } },
  { id: "sticker", name: "Pop Sticker", hint: "White caps on a coral pill", sample: "NEW!",
    fx: { type: "pop", seed: 5, speed: 1.2 },
    props: { fontFamily: "Montserrat", fontSize: 40, fontWeight: 800, fill: "#FFFFFF", ls: 1, upper: true, bg: "#FF6B6B", borderC: "#FF6B6B", borderW: 0, radius: 999, pad: 24, boxFx: "none" } },
  { id: "pulsebadge", name: "Pulse Badge", hint: "Live-chip pulse + rise", sample: "LIVE",
    fx: { type: "rise", seed: 5, speed: 1.15 },
    props: { fontFamily: "JetBrains Mono", fontSize: 30, fontWeight: 700, fill: "#5B8CFF", ls: 4, upper: true, bg: "#10151F", borderC: "#5B8CFF", borderW: 1.5, radius: 12, pad: 18, boxFx: "pulse" } },
  { id: "softpop", name: "Soft Pop Caption", hint: "Quiet lower-third chip", sample: "lower third",
    fx: { type: "pop", seed: 3, speed: 0.9 },
    props: { fontFamily: "Inter", fontSize: 28, fontWeight: 600, fill: "#E9ECF3", ls: 0, upper: false, bg: "#171B24", borderC: "#2E3546", borderW: 1, radius: 14, pad: 16, boxFx: "none" } },
];

/* ---------- pure insert-prop builders (node-checked) ---------- */
/* preset insert: style from the resolved settings tiers, fill from the
   active brand's text color (colors[4]) — the same brand application the
   old dialog used for plain text */
export function presetInsertProps(preset, textStyles, brand) {
  const st = (textStyles && textStyles[preset.id]) || {};
  return {
    text: preset.sample,
    fontFamily: st.fontFamily || "Space Grotesk",
    fontSize: st.fontSize || 48,
    fontWeight: st.fontWeight || 700,
    ls: preset.ls,
    fill: (brand && Array.isArray(brand.colors) && brand.colors[4]) || "#F9F9F9",
  };
}

/* effect insert: the card's styling + a textFx whose start is stamped at
   the playhead (10 ms grid, like every other engine time) so the effect
   plays from the moment it is dropped */
export function effectInsertProps(def, playheadMs = 0) {
  return {
    text: def.sample,
    ...def.props,
    textFx: { ...def.fx, start: Math.max(0, Math.round(playheadMs / 10) * 10) },
  };
}

/* one thumb frame for an effect card (SSR-safe, hover-play driven) */
const THUMB_STAGE = { w: 236, h: 60 };
const THUMB_WRAP_MS = 2600;
function EffectThumb({ def }) {
  const hp = useHoverPlay({ dur: THUMB_WRAP_MS, still: 0.62 });
  const p = def.props;
  const obj = {
    id: `fxthumb-${def.id}`, type: "text", name: def.name, tracks: {}, locked: false, hidden: false,
    props: {
      x: THUMB_STAGE.w / 2, y: THUMB_STAGE.h / 2, scale: 1, rotation: 0, opacity: 1, w: 0, h: 0, inT: 0, outT: null, path: null, prog: 0,
      text: def.sample, textFx: { ...def.fx, start: 240 }, pathMode: "flow",
      fontFamily: p.fontFamily, fontSize: Math.min(p.fontSize, 22), fontWeight: p.fontWeight, fill: p.fill, ls: p.ls, upper: p.upper,
      bg: p.bg, pad: Math.min(p.pad, 12), borderC: p.borderC, borderW: p.borderW, radius: Math.min(p.radius, 14), boxFx: p.boxFx,
    },
  };
  return (
    <span {...hp.bind} data-fx-thumb={def.id} data-thumb-still={Math.round(THUMB_WRAP_MS * 0.62)}
      style={{ display: "block", position: "relative", width: THUMB_STAGE.w, height: THUMB_STAGE.h, borderRadius: 7, overflow: "hidden", border: `1px solid ${C.line}`, background: "#0A0C10", pointerEvents: "none" }}>
      <StageObject obj={obj} time={hp.time} stage={THUMB_STAGE} selected={false} interactive={false} />
    </span>
  );
}

export default function TextPanel({ addObject, setTextOpen, textStyles, brand, getPlayheadMs }) {
  const playhead = () => (typeof getPlayheadMs === "function" ? getPlayheadMs() : 0);
  const insertPreset = (p) => { addObject("text", { name: TEXT_TIER_LABELS[p.id] || p.id, props: presetInsertProps(p, textStyles, brand) }); setTextOpen(false); };
  const insertEffect = (def) => { addObject("text", { name: def.name, props: effectInsertProps(def, playhead()) }); setTextOpen(false); };
  return (
    <div className="gd-panel" data-text-panel style={{ position: "absolute", left: 84, top: 12, width: 268, maxHeight: "calc(100% - 24px)", overflowY: "auto", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <div style={{ ...sectionLabel, marginBottom: 4 }}>Text</div>
      <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginBottom: 10 }}>Click a preset to insert — fonts & sizes come from your <b>Settings</b> text styles.</div>

      {/* style presets — 2×2 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        {TEXT_TIER_PRESETS.map((p) => {
          const st = (textStyles && textStyles[p.id]) || {};
          return (
            <button key={p.id} className="gd-btn" data-preset={p.id} title={`Insert ${TEXT_TIER_LABELS[p.id]} — ${st.fontFamily || ""} ${st.fontSize || ""}px`}
              onClick={() => insertPreset(p)}
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ color: C.txt, fontFamily: `'${st.fontFamily || "Space Grotesk"}'`, fontWeight: st.fontWeight || 700, fontSize: p.id === "heading" ? 17 : p.id === "subheading" ? 14.5 : 12.5, lineHeight: 1.25, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.sample}
              </span>
              <span style={{ fontSize: 9, color: C.faint, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{TEXT_TIER_LABELS[p.id]}</span>
              <span style={{ fontSize: 8.5, color: C.faint }}>{st.fontFamily} · {st.fontSize}px · {st.fontWeight}</span>
            </button>
          );
        })}
      </div>

      {/* effects shelf — live hover-play cards */}
      <div style={{ ...sectionLabel, margin: "14px 0 4px" }}>Text effects · drop & use</div>
      <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginBottom: 10 }}>Hover a card to play it. Click to drop it on the stage — the animation starts at the playhead.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TEXT_EFFECTS.map((def) => (
          <button key={def.id} className="gd-btn" data-fx={def.id} title={`${def.name} — ${def.hint}. Click to insert.`}
            onClick={() => insertEffect(def)}
            style={{ background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 5, cursor: "pointer", textAlign: "left" }}>
            <EffectThumb def={def} />
            <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.txt, marginTop: 5 }}>{def.name}</span>
            <span style={{ display: "block", fontSize: 9, color: C.faint, marginTop: 1 }}>{def.hint} · {def.fx.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
