/* UI elements drawer — 13 animated interface kits (engine/kits.js):
   iOS notification, squash-stretch toggle, FAB radial menu, loaders,
   glass card, pressable button, badge, avatar stack, search bar,
   slider, toast. Mirrors TemplatesPanel UX (search + category chips +
   card grid); every card carries a LIVE thumbnail rendered by the SAME
   <StageObject> the stage/export use, crop-zoomed via frameOf() and
   HOVER-PLAYED (R7a): static representative frame by default, the shared
   120 ms ticker animates only while hovered and mouse-leave resets to
   the still. Click a card to insert ONE locked kit object (movable /
   resizable / rotatable on canvas); click a color dot to insert with
   that accent color. */
import { memo, useMemo } from "react";
import { C, inputStyle, chipStyle, sectionLabel } from "../model";
import { StageObject } from "../../StageObject";
import { UI_ELEMENTS, UI_CATS, KIT_COLORS, frameOf } from "../../../engine/kits.js";
import { useHoverPlay } from "../TemplateThumb";

const THUMB_W = 100, THUMB_H = 74;
const STAGE = { w: 1280, h: 720 };

/* hover-play kit thumbnail: built once (memoized); static frame by default,
   the 120 ms ticker runs only while hovered, resets on leave */
const KitThumb = memo(function KitThumb({ kit }) {
  const built = useMemo(() => {
    try { const clip = kit.build(); return { clip, frame: frameOf(clip) }; }
    catch { return null; }
  }, [kit]);
  const hp = useHoverPlay({ dur: built?.clip?.props?.dur || 3600 });
  if (!built) {
    return (
      <div style={{ width: THUMB_W, height: THUMB_H, borderRadius: 6, border: `1px solid ${C.line}`, background: "#0B0D12", display: "flex", alignItems: "center", justifyContent: "center", color: C.amber, fontSize: 24, fontWeight: 800 }}>
        {(kit.name || "?").charAt(0)}
      </div>
    );
  }
  const { clip, frame } = built;
  const s = Math.min(THUMB_W / frame.w, THUMB_H / frame.h);
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  return (
    <div {...hp.bind} title="Hover to preview the loop" style={{ width: THUMB_W, height: THUMB_H, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", background: "#0B0D12", position: "relative", flexShrink: 0, boxSizing: "border-box" }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: "absolute", left: 0, top: 0, transform: `translate(${THUMB_W / 2 - s * cx}px, ${THUMB_H / 2 - s * cy}px) scale(${s})`, transformOrigin: "0 0", pointerEvents: "none" }}>
        <StageObject obj={clip} time={hp.time} stage={STAGE} selected={false} interactive={false} />
      </div>
    </div>
  );
});

export default function UIElementsPanel({ uiQ, setUiQ, uiCat, setUiCat, insertKitClip }) {
  const cats = ["All", ...UI_CATS];
  const q = uiQ.trim().toLowerCase();
  const list = UI_ELEMENTS.filter((k) =>
    (uiCat === "All" || k.category === uiCat) &&
    (!q || k.name.toLowerCase().includes(q) || k.tags.some((t) => t.includes(q))));
  return (
    <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 264, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <div style={{ ...sectionLabel, marginBottom: 9 }}>UI elements · {UI_ELEMENTS.length} animated · insert as locked object</div>
      <input autoFocus value={uiQ} onChange={(e) => setUiQ(e.target.value)} placeholder="Search UI elements…" style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {cats.map((c) => (
          <button key={c} className="gd-btn" onClick={() => setUiCat(c)}
            style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: uiCat === c ? C.amber : C.line, color: uiCat === c ? C.amber : C.dim }}>{c}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, maxHeight: 452, overflowY: "auto" }}>
        {list.map((k) => (
          <button key={k.id} className="gd-btn" title={`Insert "${k.name}" as a locked, movable kit object`} onClick={() => insertKitClip(k, {})}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, cursor: "pointer" }}>
            <KitThumb kit={k} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{k.name}</span>
            <span style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
              {KIT_COLORS.map((col) => (
                <span key={col} title={`Insert with ${col} accent`} onClick={() => insertKitClip(k, { accent: col })}
                  style={{ width: 11, height: 11, borderRadius: "50%", cursor: "pointer", background: col, border: "1.5px solid rgba(255,255,255,.22)", boxSizing: "border-box" }} />
              ))}
            </span>
          </button>
        ))}
        {!list.length && <div style={{ gridColumn: "1 / -1", color: C.faint, fontSize: 11, textAlign: "center", padding: "14px 0" }}>No UI elements match.</div>}
      </div>
      <div style={{ color: C.faint, fontSize: 9.5, marginTop: 8, lineHeight: 1.5 }}>Inserts as ONE locked object — drag to move, corner grips resize, rotate grip spins; loops seamlessly. Accent via the dots or the Inspector.</div>
    </div>
  );
}
