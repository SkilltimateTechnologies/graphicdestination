/* Emoji drawer — featured Microsoft Fluent Emoji (3D) teaser with a right-side
   arrow (→) that swaps the panel IN PLACE to the full searchable library (no
   modal): search, sub-category chips and every emoji as
   a hover-play card. Clicking ANY emoji (featured or library card) inserts it
   as a plain 100×100 IMAGE — it resizes like any image (8-way grips).

   Thumbnails are HOVER-PLAY: a representative HOLD frame (55% of the loop) with
   no timers; the shared 120 ms ticker plays the loop only while hovered. */
import React, { useMemo, useState } from "react";
import { FEATURED_EMOJI, POPULAR_EMOJI, EMOJIS, EMOJI_CATS } from "../../../engine/emoji.js";
import { frameOf } from "../../../engine/kits.js";
import { StageObject } from "../../StageObject.jsx";
import { C, sectionLabel, inputStyle, chipStyle } from "../model.js";
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

export default function EmojiPanel({ insertEmoji, startBrowsing = false }) {
  const [browsing, setBrowsing] = useState(startBrowsing); /* teaser ⇆ full library, inline */
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  /* no Animated/Static toggle: every insert is a plain static image (thumbs
     still hover-play the engine loop as a preview — insertion is still-only) */

  const CAP = 60; /* never mount more than this many image thumbnails at once */
  const { list, popular, truncated } = useMemo(() => {
    const s = q.trim().toLowerCase();
    /* DEFAULT view (no search, All): just the popular set — keeps the panel
       fast instead of rendering all 169. Search / a category reveals the rest,
       still capped so we never flood the DOM with image thumbnails. */
    if (!s && cat === "All") return { list: POPULAR_EMOJI, popular: true, truncated: false };
    const full = EMOJIS.filter((e) =>
      (cat === "All" || e.category === cat) &&
      (!s || e.name.toLowerCase().includes(s) || e.tags.some((t) => t.includes(s))));
    return { list: full.slice(0, CAP), popular: false, truncated: full.length > CAP };
  }, [q, cat]);

  const pick = (e) => insertEmoji?.(e);

  return (
    <div className="gd-panel" data-emoji-panel style={{ position: "absolute", left: 84, top: 12, width: browsing ? 292 : 244, maxHeight: "calc(100% - 24px)", display: "flex", flexDirection: "column", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ ...sectionLabel, display: "flex", alignItems: "center", gap: 7 }}>
          {browsing && (
            <button className="gd-btn" data-emoji-back onClick={() => setBrowsing(false)} title="Back to featured"
              style={{ width: 20, height: 20, borderRadius: 5, border: `1px solid ${C.line}`, background: C.bg1, color: C.dim, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>←</button>
          )}
          Emoji
        </span>
        <span style={{ fontSize: 9, color: C.dim }}>Fluent 3D · {EMOJIS.length}</span>
      </div>

      {!browsing ? (
        <>
          {/* featured teaser row — click inserts directly; → browses all inline */}
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, flex: 1 }}>
              {FEATURED_EMOJI.map((e) => (
                <div key={e.id} role="button" tabIndex={0} className="gd-btn gd-emoji-card" data-emoji-featured={e.id}
                  title={`${e.name} — click to insert`}
                  onClick={() => pick(e)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(e); } }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 7, padding: 4, cursor: "pointer", aspectRatio: "1", overflow: "hidden" }}>
                  <EmojiThumb emoji={e} art={40} />
                </div>
              ))}
            </div>
            <button className="gd-btn" data-emoji-browse onClick={() => setBrowsing(true)} title={`Browse all ${EMOJIS.length} emoji`}
              style={{ width: 26, borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg1, color: C.amber, cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
          </div>
          <div style={{ fontSize: 9.5, color: C.faint, marginTop: 9, lineHeight: 1.5 }}>
            Microsoft Fluent Emoji (3D). Inserts as a plain 100×100 image — move, resize and rotate it like anything else.
          </div>
        </>
      ) : (
        <>
          {/* full library — inline in this same panel (no modal) */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji…" style={{ ...inputStyle, flex: 1, marginBottom: 0, padding: "5px 8px", fontSize: 11.5 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 9 }}>
            {["All", ...EMOJI_CATS].map((c) => (
              <button key={c} className="gd-btn" onClick={() => setCat(c)}
                style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10, borderColor: cat === c ? C.amber : C.line, color: cat === c ? C.amber : C.dim }}>{c}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(58px, 1fr))", gap: 7, overflowY: "auto", paddingRight: 3 }}>
            {list.map((e) => (
              <div key={e.id} role="button" tabIndex={0} className="gd-btn gd-emoji-card" data-emoji-card={e.id}
                title={`${e.name} — ${e.recipe}`}
                onClick={() => pick(e)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(e); } }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 3px 5px", cursor: "pointer", overflow: "hidden" }}>
                <EmojiThumb emoji={e} art={38} />
                <span style={{ fontSize: 8, color: C.dim, textAlign: "center", lineHeight: 1.15, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{e.name}</span>
              </div>
            ))}
            {!list.length && <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.dim, textAlign: "center", padding: 20 }}>No emoji match “{q}”.</div>}
            {popular && <div style={{ gridColumn: "1 / -1", fontSize: 9.5, color: C.faint, textAlign: "center", padding: "4px 0 2px" }}>Popular · search or pick a category for all {EMOJIS.length}</div>}
            {truncated && <div style={{ gridColumn: "1 / -1", fontSize: 9.5, color: C.faint, textAlign: "center", padding: "4px 0 2px" }}>Showing first {CAP} — refine your search</div>}
          </div>
        </>
      )}
    </div>
  );
}
