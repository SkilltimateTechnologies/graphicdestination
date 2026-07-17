/* numbers drawer — the 3 counter modes as separate insertables. The mode is
   chosen HERE at insert time: click runs the normal addObject("number") path
   and patches mode (+ sensible defaults) via over.props. Countdown pairs the
   plain-text digits with a 10 → 0 setup (From 0 / To 10, played end → start);
   Odometer pre-sets the slot-roll mode. Mirrors the ChartsPanel rows +
   close-on-insert behavior. */
import { C, sectionLabel } from "../model";

const IC = "#939BAD"; /* C.dim — icon ink */
const NUM_MODE_DEFS = [
  { id: "countup", name: "Count Up", hint: "0 → 100", props: { mode: "countup" },
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="4" y="14" width="5" height="8" rx="1.5" fill={IC} /><rect x="11" y="9" width="5" height="13" rx="1.5" fill={IC} /><rect x="18" y="4" width="5" height="18" rx="1.5" fill={IC} /></svg> },
  { id: "countdown", name: "Countdown", hint: "10 → 0", props: { mode: "countdown", style: "count", from: 0, to: 10 },
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="4" y="4" width="5" height="18" rx="1.5" fill={IC} /><rect x="11" y="9" width="5" height="13" rx="1.5" fill={IC} /><rect x="18" y="14" width="5" height="8" rx="1.5" fill={IC} /></svg> },
  { id: "odometer", name: "Odometer", hint: "Slot roll", props: { mode: "odometer" },
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="3" y="5" width="6" height="16" rx="2" fill="none" stroke={IC} strokeWidth="1.6" /><rect x="10" y="5" width="6" height="16" rx="2" fill="none" stroke={IC} strokeWidth="1.6" /><rect x="17" y="5" width="6" height="16" rx="2" fill="none" stroke={IC} strokeWidth="1.6" /><text x="6" y="16.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={IC} fontFamily="'JetBrains Mono'">3</text><text x="13" y="16.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={IC} fontFamily="'JetBrains Mono'">1</text><text x="20" y="16.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={IC} fontFamily="'JetBrains Mono'">4</text></svg> },
];

export default function NumberPanel({ addObject, setNumbersOpen }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Numbers</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {NUM_MODE_DEFS.map((m) => (
                <button key={m.id} className="gd-btn" onClick={() => { addObject("number", { name: m.name, props: m.props }); setNumbersOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ flexShrink: 0, display: "flex" }}>{m.icon}</span>
                  <span><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>{m.name}</div><div style={{ fontSize: 10, color: C.faint }}>{m.hint}</div></span>
                </button>
              ))}
            </div>
            <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginTop: 10 }}>
              Formats (compact · currency · % · mm:ss) and style presets live in the Inspector once the layer is added.
            </div>
          </div>
  );
}
