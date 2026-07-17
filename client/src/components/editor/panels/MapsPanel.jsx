/* maps drawer — extracted VERBATIM from GraphicDestinationMotion.jsx */
import { C, sectionLabel } from "../model";
import { ringsToPath, MAPS } from "../../../engine/maps.js";

export default function MapsPanel({ addObject, setMapsOpen }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Maps</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <button className="gd-btn" onClick={() => { addObject("map"); setMapsOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                <svg width="26" height="26" viewBox="0 0 100 102" style={{ flexShrink: 0 }}><path d={ringsToPath(MAPS.IND.rings)} fill="none" stroke={C.amber} strokeWidth="6" /></svg>
                <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>Country Map</div><div style={{ fontSize: 10, color: C.faint }}>One real country outline · border FX</div></span>
              </button>
              <button className="gd-btn" onClick={() => { addObject("world"); setMapsOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${C.amber}`, position: "relative", flexShrink: 0 }}><div style={{ position: "absolute", inset: "4px 9px", borderLeft: `1.5px solid ${C.amber}`, borderRight: `1.5px solid ${C.amber}`, borderRadius: "50%" }} /></div>
                <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>World Map</div><div style={{ fontSize: 10, color: C.faint }}>177 countries · timed reveals + auto-zoom</div></span>
              </button>
              <button className="gd-btn" onClick={() => { addObject("continent"); setMapsOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                <svg width="26" height="26" viewBox="0 0 100 100" style={{ flexShrink: 0 }}><circle cx="50" cy="50" r="42" fill="none" stroke={C.amber} strokeWidth="6" strokeDasharray="16 10" /></svg>
                <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>Continent Map</div><div style={{ fontSize: 10, color: C.faint }}>All countries in a region · same border FX</div></span>
              </button>
            </div>
          </div>
  );
}
