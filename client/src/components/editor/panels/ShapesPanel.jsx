/* shapes folder with search — extracted VERBATIM from GraphicDestinationMotion.jsx */
import { C, inputStyle } from "../model";
import { SHAPE_IDS, SHAPE_DEFS, ptsToStr } from "../../../engine/shapes.js";

export default function ShapesPanel({ shapeQ, setShapeQ, addObject }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <input autoFocus value={shapeQ} onChange={(e) => setShapeQ(e.target.value)} placeholder="Search shapes…" style={{ ...inputStyle, marginBottom: 9 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, maxHeight: 210, overflowY: "auto" }}>
              {SHAPE_IDS.filter((sid) => SHAPE_DEFS[sid].name.toLowerCase().includes(shapeQ.toLowerCase())).map((sid) => (
                <button key={sid} className="gd-btn" title={SHAPE_DEFS[sid].name} onClick={() => addObject("shape", { shape: sid })}
                  style={{ background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 6, padding: 7, cursor: "pointer", aspectRatio: "1" }}>
                  <svg width="100%" height="100%" viewBox="-6 -6 112 112"><polygon points={ptsToStr(SHAPE_DEFS[sid].pts)} fill={C.dim} /></svg>
                </button>
              ))}
            </div>
          </div>
  );
}
