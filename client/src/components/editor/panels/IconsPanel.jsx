/* Icons drawer — 42 stroke-icon clips across 7 categories (engine/kits.js).
   Mirrors TemplatesPanel UX (search + category chips + card grid) but every
   card carries a LIVE animated thumbnail: the kit's own clip rendered by the
   SAME <StageObject> the stage/export use, driven by a shared 120 ms ticker
   (BackgroundsPanel pattern), crop-zoomed onto the artwork via frameOf().
   Click a card to insert the icon as a seamlessly-looping clip at the
   playhead; click a color dot to insert with that stroke color instead
   (kit.build({ color }) — fully recolorable afterwards in the Inspector). */
import { memo, useEffect, useMemo, useState } from "react";
import { C, inputStyle, chipStyle, sectionLabel } from "../model";
import { StageObject } from "../../StageObject";
import { ICONS, ICON_CATS, KIT_COLORS, frameOf } from "../../../engine/kits.js";

const THUMB_W = 100, THUMB_H = 74;
const STAGE = { w: 1280, h: 720 };

/* one shared ticker for the whole panel — every card animates off the
   same interval (preview-only wall-clock; the engine stays pure f(time)) */
function usePreviewTime() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setT((v) => (v + 120) % 9600), 120);
    return () => clearInterval(iv);
  }, []);
  return t;
}

/* live-rendered kit thumbnail: built once (memoized), re-timed per tick,
   crop-zoomed so the artwork fills the card (frameOf content bounds) */
const KitThumb = memo(function KitThumb({ kit, time }) {
  const built = useMemo(() => {
    try { const clip = kit.build(); return { clip, frame: frameOf(clip) }; }
    catch { return null; }
  }, [kit]);
  if (!built) {
    return (
      <div style={{ width: THUMB_W, height: THUMB_H, borderRadius: 6, border: `1px solid ${C.line}`, background: "#0B0D12", display: "flex", alignItems: "center", justifyContent: "center", color: C.amber, fontSize: 24, fontWeight: 800 }}>
        {(kit.name || "?").charAt(0)}
      </div>
    );
  }
  const { clip, frame } = built;
  const dur = clip.props.dur || 3200;
  const s = Math.min(THUMB_W / frame.w, THUMB_H / frame.h);
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  return (
    <div style={{ width: THUMB_W, height: THUMB_H, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", background: "#0B0D12", position: "relative", pointerEvents: "none", flexShrink: 0, boxSizing: "border-box" }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: "absolute", left: 0, top: 0, transform: `translate(${THUMB_W / 2 - s * cx}px, ${THUMB_H / 2 - s * cy}px) scale(${s})`, transformOrigin: "0 0" }}>
        <StageObject obj={clip} time={time % dur} stage={STAGE} selected={false} interactive={false} />
      </div>
    </div>
  );
});

export default function IconsPanel({ iconQ, setIconQ, iconCat, setIconCat, insertKitClip }) {
  const time = usePreviewTime();
  const cats = ["All", ...ICON_CATS];
  const q = iconQ.trim().toLowerCase();
  const list = ICONS.filter((k) =>
    (iconCat === "All" || k.category === iconCat) &&
    (!q || k.name.toLowerCase().includes(q) || k.tags.some((t) => t.includes(q))));
  return (
    <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 264, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <div style={{ ...sectionLabel, marginBottom: 9 }}>Icons · {ICONS.length} animated · insert as clip</div>
      <input autoFocus value={iconQ} onChange={(e) => setIconQ(e.target.value)} placeholder="Search icons…" style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {cats.map((c) => (
          <button key={c} className="gd-btn" onClick={() => setIconCat(c)}
            style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: iconCat === c ? C.amber : C.line, color: iconCat === c ? C.amber : C.dim }}>{c}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, maxHeight: 452, overflowY: "auto" }}>
        {list.map((k) => (
          <button key={k.id} className="gd-btn" title={`Insert "${k.name}" as a looping clip at the playhead`} onClick={() => insertKitClip(k, {})}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, cursor: "pointer" }}>
            <KitThumb kit={k} time={time} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{k.name}</span>
            <span style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
              {KIT_COLORS.map((col) => (
                <span key={col} title={`Insert in ${col}`} onClick={() => insertKitClip(k, { color: col })}
                  style={{ width: 11, height: 11, borderRadius: "50%", cursor: "pointer", background: col, border: "1.5px solid rgba(255,255,255,.22)", boxSizing: "border-box" }} />
              ))}
            </span>
          </button>
        ))}
        {!list.length && <div style={{ gridColumn: "1 / -1", color: C.faint, fontSize: 11, textAlign: "center", padding: "14px 0" }}>No icons match.</div>}
      </div>
      <div style={{ color: C.faint, fontSize: 9.5, marginTop: 8, lineHeight: 1.5 }}>Inserts as an editable clip at the playhead — loops seamlessly; recolor via the dots or the Inspector.</div>
    </div>
  );
}
