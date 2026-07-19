/* Emoji drawer (compact rail teaser) — shows a few featured Microsoft Fluent
   Emoji (3D) brought to life with the engine's deterministic in→hold→out
   motion grammar. Clicking a featured emoji, or the "Browse all" button, opens
   the full searchable library (EmojiLibrary modal) where a click inserts.

   Thumbnails are HOVER-PLAY: a representative HOLD frame (55% of the loop) with
   no timers; the shared 120 ms ticker plays the loop only while hovered. */
import React, { useMemo } from "react";
import { FEATURED_EMOJI, EMOJIS } from "../../../engine/emoji.js";
import { frameOf } from "../../../engine/kits.js";
import { StageObject } from "../../StageObject.jsx";
import { C, sectionLabel } from "../model.js";
import { useHoverPlay } from "../TemplateThumb.jsx";

const STILL = 0.55; /* representative hold frame — intro landed, exit not started */
const STAGE = { w: 1280, h: 720 };

/* live hover-play thumbnail of an emoji clip, center-cropped to `art` px */
export const EmojiThumb = React.memo(function EmojiThumb({ emoji, variant = "animated", art = 40 }) {
  const clip = useMemo(() => emoji.build({ variant }), [emoji, variant]);
  const frame = useMemo(() => frameOf(clip), [clip]);
  const hp = useHoverPlay({ dur: clip.props.dur || 3000, still: STILL });
  const s = Math.min(art / frame.w, art / frame.h);
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  return (
    <div {...hp.bind} data-thumb-still={Math.round((clip.props.dur || 3000) * STILL)}
      title={variant === "animated" ? "Hover to preview" : emoji.name}
      style={{ width: art, height: art, margin: "0 auto", borderRadius: 7, background: C.bg0, border: `1px solid ${C.line}`, overflow: "hidden", position: "relative", flex: "0 0 auto", pointerEvents: "none" }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: "absolute", left: 0, top: 0, transform: `translate(${art / 2 - s * cx}px, ${art / 2 - s * cy}px) scale(${s})`, transformOrigin: "0 0", pointerEvents: "none" }}>
        <StageObject obj={clip} time={hp.time} stage={STAGE} selected={false} interactive={false} />
      </div>
    </div>
  );
});

export default function EmojiPanel({ openLibrary }) {
  return (
    <div className="gd-panel" data-emoji-panel style={{ position: "absolute", left: 84, top: 12, width: 244, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={sectionLabel}>Emoji</span>
        <span style={{ fontSize: 9, color: C.dim }}>Fluent 3D · {EMOJIS.length}</span>
      </div>
      {/* featured teaser row — click any to open the full library */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 11 }}>
        {FEATURED_EMOJI.map((e) => (
          <div key={e.id} role="button" tabIndex={0} className="gd-btn gd-emoji-card" data-emoji-featured={e.id}
            title={`${e.name} — click to browse all emoji`}
            onClick={openLibrary}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openLibrary?.(); } }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 7, padding: 4, cursor: "pointer", aspectRatio: "1", overflow: "hidden" }}>
            <EmojiThumb emoji={e} art={40} />
          </div>
        ))}
      </div>
      <button className="gd-btn" data-emoji-browse onClick={openLibrary}
        style={{ width: "100%", height: 34, borderRadius: 8, border: "none", cursor: "pointer", background: C.amber, color: "#1A1405", fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
        Browse all {EMOJIS.length} emoji →
      </button>
      <div style={{ fontSize: 9.5, color: C.faint, marginTop: 9, lineHeight: 1.5 }}>
        Microsoft Fluent Emoji (3D), animated by the engine (pop · signature motion · whip). Inserts as one movable clip.
      </div>
    </div>
  );
}
