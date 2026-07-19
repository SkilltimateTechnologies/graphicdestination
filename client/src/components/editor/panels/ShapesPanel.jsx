/* shapes folder with search — every card carries a MORPH BADGE (R9w2): the
   little "A→B" chip in the corner tells users up-front that every shape can
   morph into any other shape over time (Inspector ▸ Morph writes the shape
   keyframes; the timeline shows the ◆). Click inserts the shape. */
import { C, inputStyle } from "../model";
import { SHAPE_IDS, SHAPE_DEFS, ptsToStr } from "../../../engine/shapes.js";

/* tiny "morphs" badge: one glyph dissolving into another with an arrow —
   the universal indicator that this shape can morph A→B */
export function MorphBadge({ glyph = "star", corner = true }) {
  return (
    <span data-morph-badge title="Morphable — turn this shape into any other over time (Inspector ▸ Morph)"
      style={{ ...(corner ? { position: "absolute", right: 3, top: 3 } : { position: "relative", flexShrink: 0 }), display: "inline-flex", alignItems: "center", gap: 1.5, background: "rgba(10,12,16,.78)", border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 3px", lineHeight: 0, pointerEvents: "none" }}>
      <svg width="9" height="9" viewBox="-6 -6 112 112"><polygon points={ptsToStr(SHAPE_DEFS.ellipse.pts)} fill={C.dim} /></svg>
      <svg width="7" height="7" viewBox="0 0 10 10"><path d="M1 5h6M5.2 2.2 8 5l-2.8 2.8" fill="none" stroke={C.amber} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <svg width="9" height="9" viewBox="-6 -6 112 112"><polygon points={ptsToStr(SHAPE_DEFS[glyph].pts)} fill={C.amber} /></svg>
    </span>
  );
}

export default function ShapesPanel({ shapeQ, setShapeQ, addObject }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <input autoFocus value={shapeQ} onChange={(e) => setShapeQ(e.target.value)} placeholder="Search shapes…" style={{ ...inputStyle, marginBottom: 7 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8, color: C.faint, fontSize: 9.5, lineHeight: 1.4 }}>
              <MorphBadge corner={false} />
              <span>Every shape <b style={{ color: C.amber }}>morphs A→B</b> — add one, then pick a target in Inspector ▸ Morph</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, maxHeight: 210, overflowY: "auto" }}>
              {SHAPE_IDS.filter((sid) => SHAPE_DEFS[sid].name.toLowerCase().includes(shapeQ.toLowerCase())).map((sid) => (
                <button key={sid} className="gd-btn" title={SHAPE_DEFS[sid].name} onClick={() => addObject("shape", { shape: sid })}
                  style={{ position: "relative", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 6, padding: 7, cursor: "pointer", aspectRatio: "1" }}>
                  <svg width="100%" height="100%" viewBox="-6 -6 112 112"><polygon points={ptsToStr(SHAPE_DEFS[sid].pts)} fill={C.dim} /></svg>
                  <MorphBadge glyph="star" />
                </button>
              ))}
            </div>
          </div>
  );
}
