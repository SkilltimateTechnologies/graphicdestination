/* text drawer (R10) — the panel offers the four STYLE PRESETS:
   Heading / Subheading / Normal text / Caption, styled from the user's
   settings text-style config (Settings page) with the active brand's
   fonts filling any gap and its text color as the fill.
   R10: the ten drop-in TEXT EFFECT cards (typewriter terminal, cinematic
   tracking, neon pop, …) are REMOVED from this panel — textFx stays
   available per-layer in the Inspector's Text card (fx chips + timing),
   applied to any text layer. */
import { C, sectionLabel } from "../model";
import { TEXT_TIER_LABELS } from "../../../lib/settings.js";

/* ---------- style presets (tiers) ---------- */
export const TEXT_TIER_PRESETS = [
  { id: "heading", ls: 0.5, sample: "Heading" },
  { id: "subheading", ls: 0.5, sample: "Subheading" },
  { id: "body", ls: 0, sample: "Normal text" },
  { id: "caption", ls: 1, sample: "Caption" },
];

/* ---------- pure insert-prop builder (node-checked) ----------
   preset insert: style from the resolved settings tiers, fill from the
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

export default function TextPanel({ addObject, setTextOpen, textStyles, brand }) {
  const insertPreset = (p) => { addObject("text", { name: TEXT_TIER_LABELS[p.id] || p.id, props: presetInsertProps(p, textStyles, brand) }); setTextOpen(false); };
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
    </div>
  );
}
