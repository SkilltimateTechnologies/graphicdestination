/* charts drawer — 7 chart types as separate insertables. The type is chosen
   HERE at insert time (the inspector no longer switches it): click runs the
   normal addObject("chart") path and patches chartType via over.props.
   Mirrors the MapsPanel rows + close-on-insert behavior. */
import { C, sectionLabel } from "../model";

const IC = "#939BAD"; /* C.dim — icon ink */
const CHART_DEFS = [
  { id: "bar", name: "Bars", hint: "Vertical, staggered in",
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="4" y="12" width="5" height="10" rx="1.5" fill={IC} /><rect x="11" y="5" width="5" height="17" rx="1.5" fill={IC} /><rect x="18" y="9" width="5" height="13" rx="1.5" fill={IC} /></svg> },
  { id: "line", name: "Line", hint: "Draws on left → right",
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><polyline points="4,19 10,11 15,15 22,6" fill="none" stroke={IC} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="11" r="2" fill={IC} /><circle cx="15" cy="15" r="2" fill={IC} /></svg> },
  { id: "donut", name: "Donut", hint: "Sweeps around the dial",
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="8.5" fill="none" stroke={IC} strokeWidth="5" strokeDasharray="40 14" strokeLinecap="round" transform="rotate(-90 13 13)" /></svg> },
  { id: "pie", name: "Pie", hint: "Filled slices + % labels",
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="9" fill="none" stroke={IC} strokeWidth="2" /><path d="M13 13 L13 4 A9 9 0 0 1 21.4 17.5 Z" fill={IC} /></svg> },
  { id: "area", name: "Area", hint: "Line with a filled body",
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><path d="M4 19 L10 11 L15 15 L22 6 L22 22 L4 22 Z" fill={IC} fillOpacity="0.45" /><polyline points="4,19 10,11 15,15 22,6" fill="none" stroke={IC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { id: "hbar", name: "H-Bars", hint: "Horizontal, row labels",
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="4" y="4.5" width="13" height="5" rx="1.5" fill={IC} /><rect x="4" y="11" width="18" height="5" rx="1.5" fill={IC} /><rect x="4" y="17.5" width="9" height="5" rx="1.5" fill={IC} /></svg> },
  { id: "gauge", name: "Gauge", hint: "0–100 radial meter", props: { dataStr: "Progress, 68" },
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><path d="M5 19 A9.5 9.5 0 0 1 21 19" fill="none" stroke={IC} strokeWidth="3" strokeLinecap="round" /><path d="M13 19 L17.5 12.5" stroke={IC} strokeWidth="2.2" strokeLinecap="round" /><circle cx="13" cy="19" r="2" fill={IC} /></svg> },
];

export default function ChartsPanel({ addObject, setChartsOpen }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Charts</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 380, overflowY: "auto" }}>
              {CHART_DEFS.map((c) => (
                <button key={c.id} className="gd-btn" onClick={() => { addObject("chart", { name: c.name, props: { chartType: c.id, ...c.props } }); setChartsOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ flexShrink: 0, display: "flex" }}>{c.icon}</span>
                  <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>{c.name}</div><div style={{ fontSize: 10, color: C.faint }}>{c.hint}</div></span>
                </button>
              ))}
            </div>
          </div>
  );
}
