/* confetti drawer — pick one of the 8 emission styles; inserts at stage
   center, bursting at the playhead (addObject's confetti path). Mirrors the
   MapsPanel close-on-insert behavior. */
import { C, sectionLabel } from "../model";
import { CONFETTI_STYLES } from "../../../engine/fx.js";

export default function ConfettiPanel({ addObject, setConfettiOpen }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Confetti · bursts at the playhead</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 7 }}>
              {CONFETTI_STYLES.map((s) => (
                <button key={s.id} className="gd-btn" title={`Add ${s.name} confetti at stage center`} onClick={() => { addObject("confetti", { name: `Confetti · ${s.name}`, props: { style: s.id } }); setConfettiOpen(false); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "11px 6px 9px", cursor: "pointer" }}>
                  <span style={{ fontSize: 17, lineHeight: 1, color: C.amber }}>{s.glyph}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: C.txt }}>{s.name}</span>
                </button>
              ))}
            </div>
          </div>
  );
}
