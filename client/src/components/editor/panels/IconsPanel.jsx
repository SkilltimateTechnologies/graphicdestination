/* icons drawer — 57 flat icons (20 emoji + reactions/objects/weather/media/
   commerce) with Jitter-style looping animations, listed EXACTLY like the
   ShapesPanel: a 4-up grid of square cards at the same size, art centered in
   every cell. R9w2 fixes:
   · the panel had lost its floating card shell (it rendered as a bare
     full-width div that pushed the stage off-screen) — back to the gd-panel
     shell every other drawer uses.
   · thumbnails were cropped to a corner (the frame's TOP-LEFT was pinned to
     the thumb center instead of the frame's CENTER) so the art looked blank;
     now the frame is center-cropped like the UI-elements panel.
   · the static frame is a representative HOLD frame (55% of the loop — the
     entrance has fully landed, the exit hasn't started) so no thumb ever
     renders the invisible t=0 frame; the shared 120 ms hover ticker plays
     the loop only while hovered and mouse-leave resets to the still.
   Click a card to insert with natural colors; the 6 hover dots along the
   card's bottom edge insert TINTED (same one-click tinted insert the list
   rows had). Animated/Static toggle, search and category chips on top. */
import React, { useMemo, useState } from "react";
import { ICONS, ICON_CATS, KIT_COLORS, frameOf } from "../../../engine/kits.js";
import { StageObject } from "../../StageObject.jsx";
import { C, inputStyle, chipStyle, sectionLabel } from "../model.js";
import { useHoverPlay } from "../TemplateThumb.jsx";

const STILL = 0.55; /* representative hold frame — intro landed, exit not started */
const STAGE = { w: 1280, h: 720 };
const ART = 36; /* art box inside the square card (ShapesPanel-size cells) */

/* live thumbnail of a kit build — HOVER-PLAY: a static representative HOLD
   frame by default (no timers); the shared 120 ms ticker animates it only
   while hovered and mouse-leave resets to the still. Static variants show
   the identical still art (their frame never changes). The content frame is
   CENTER-cropped (frameOf center lands on the thumb center). */
const KitThumb = React.memo(function KitThumb({ kit, variant }) {
  const clip = useMemo(() => kit.build({ variant }), [kit, variant]);
  const frame = useMemo(() => frameOf(clip), [clip]);
  const hp = useHoverPlay({ dur: clip.props.dur || 3200, still: STILL });
  const s = Math.min(ART / frame.w, ART / frame.h);
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  return (
    <div {...hp.bind} data-thumb-still={Math.round((clip.props.dur || 3200) * STILL)}
      title={variant === "animated" ? "Hover to preview the loop" : kit.name}
      style={{ width: ART, height: ART, margin: "0 auto", borderRadius: 7, background: C.bg0, border: `1px solid ${C.line}`, overflow: "hidden", position: "relative", flex: "0 0 auto", pointerEvents: "none" }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: "absolute", left: 0, top: 0, transform: `translate(${ART / 2 - s * cx}px, ${ART / 2 - s * cy}px) scale(${s})`, transformOrigin: "0 0", pointerEvents: "none" }}>
        <StageObject obj={clip} time={hp.time} stage={STAGE} selected={false} interactive={false} />
      </div>
    </div>
  );
});

export default function IconsPanel({ iconQ, setIconQ, iconCat, setIconCat, insertKitClip }) {
  const [variant, setVariant] = useState("animated"); /* "animated" | "static" */
  const list = useMemo(() => {
    const q = iconQ.trim().toLowerCase();
    return ICONS.filter((k) =>
      (iconCat === "All" || k.category === iconCat) &&
      (!q || k.name.toLowerCase().includes(q) || k.tags.some((t) => t.includes(q))));
  }, [iconQ, iconCat]);
  const insert = (k, color) => insertKitClip(k, color ? { variant, color } : { variant });
  return (
    <div className="gd-panel" data-icons-panel style={{ position: "absolute", left: 84, top: 12, width: 244, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <style>{`.gd-icon-card .gd-icon-tints{opacity:.55;transition:opacity .12s}.gd-icon-card:hover .gd-icon-tints,.gd-icon-card:focus-within .gd-icon-tints{opacity:1}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={sectionLabel}>Icons · {ICONS.length} animated</span>
        <span style={{ fontSize: 9, color: C.dim }}>{variant === "animated" ? "hover a thumb to play" : "still art"}</span>
      </div>
      {/* Animated | Static segmented toggle */}
      <div style={{ display: "flex", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 2, marginBottom: 8, gap: 2 }}>
        {[["animated", "Animated"], ["static", "Static"]].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            style={{
              flex: 1, height: 24, borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 10.5, fontWeight: variant === v ? 700 : 500, letterSpacing: 0.3,
              background: variant === v ? C.amber : "transparent",
              color: variant === v ? "#1A1405" : C.dim,
              transition: "background .15s, color .15s",
            }}
          >{label}</button>
        ))}
      </div>
      <input autoFocus value={iconQ} onChange={(e) => setIconQ(e.target.value)} placeholder="Search icons & emoji…" style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 9 }}>
        {["All", ...ICON_CATS].map((c) => (
          <button key={c} className="gd-btn" onClick={() => setIconCat(c)} style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: iconCat === c ? C.amber : C.line, color: iconCat === c ? C.amber : C.dim }}>{c}</button>
        ))}
      </div>
      {/* 4-up square cards — the same size + density as the ShapesPanel grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, maxHeight: 306, overflowY: "auto" }}>
        {list.map((k) => (
          <div key={k.id} role="button" tabIndex={0} className="gd-btn gd-icon-card" data-icon-card={k.id}
            title={`${k.name} — ${k.recipe}\nClick to add to the stage · hover to preview · bottom dots insert tinted`}
            onClick={() => insert(k, null)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); insert(k, null); } }}
            style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 6, padding: 3, cursor: "pointer", aspectRatio: "1", overflow: "hidden" }}>
            <KitThumb kit={k} variant={variant} />
            <div className="gd-icon-tints" style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", gap: 1.5, padding: "2px 2px 2.5px", background: "linear-gradient(transparent, rgba(10,12,16,.88) 45%)" }}>
              {KIT_COLORS.map((col) => (
                <button key={col} className="gd-btn" title={`Insert tinted ${col}`} onClick={(e) => { e.stopPropagation(); insert(k, col); }}
                  style={{ width: 6, height: 6, borderRadius: 2, background: col, border: `1px solid rgba(255,255,255,.35)`, cursor: "pointer", padding: 0, flexShrink: 0 }} />
              ))}
            </div>
          </div>
        ))}
        {!list.length && <div style={{ gridColumn: "1 / -1", fontSize: 10.5, color: C.dim, textAlign: "center", padding: 12 }}>No icons match.</div>}
      </div>
      <div style={{ fontSize: 9.5, color: C.faint, marginTop: 9, lineHeight: 1.5 }}>
        Every icon loops forever ({variant === "animated" ? "pop in · signature motion · whip out" : "identical still art"}). Inserts as ONE locked object — move/resize/rotate on canvas; variant + color in the Inspector.
      </div>
    </div>
  );
}
