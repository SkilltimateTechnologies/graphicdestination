/* numbers drawer — the 3 counter modes as separate insertables. The mode is
   chosen HERE at insert time: click runs the normal addObject("number") path
   and patches mode (+ sensible defaults) via over.props. Countdown expands a
   style picker first — the 5 countdown visual styles (engine/fx.js CD_STYLES,
   tiny inline-SVG glyphs) — and inserts with mode:countdown + cdStyle set.
   Odometer pre-sets the slot-roll mode. Mirrors the ChartsPanel rows +
   close-on-insert behavior. */
import { useState } from "react";
import { C, sectionLabel } from "../model";
import { CD_STYLES } from "../../../engine/fx.js";

const IC = "#939BAD"; /* C.dim — icon ink */
const NUM_MODE_DEFS = [
  { id: "countup", name: "Count Up", hint: "0 → 100", props: { mode: "countup" },
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="4" y="14" width="5" height="8" rx="1.5" fill={IC} /><rect x="11" y="9" width="5" height="13" rx="1.5" fill={IC} /><rect x="18" y="4" width="5" height="18" rx="1.5" fill={IC} /></svg> },
  { id: "countdown", name: "Countdown", hint: "10 → 0 · 5 styles", props: { mode: "countdown", style: "count", from: 0, to: 10 },
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="4" y="4" width="5" height="18" rx="1.5" fill={IC} /><rect x="11" y="9" width="5" height="13" rx="1.5" fill={IC} /><rect x="18" y="14" width="5" height="8" rx="1.5" fill={IC} /></svg> },
  { id: "odometer", name: "Odometer", hint: "Slot roll", props: { mode: "odometer" },
    icon: <svg width="26" height="26" viewBox="0 0 26 26"><rect x="3" y="5" width="6" height="16" rx="2" fill="none" stroke={IC} strokeWidth="1.6" /><rect x="10" y="5" width="6" height="16" rx="2" fill="none" stroke={IC} strokeWidth="1.6" /><rect x="17" y="5" width="6" height="16" rx="2" fill="none" stroke={IC} strokeWidth="1.6" /><text x="6" y="16.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={IC} fontFamily="'JetBrains Mono'">3</text><text x="13" y="16.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={IC} fontFamily="'JetBrains Mono'">1</text><text x="20" y="16.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={IC} fontFamily="'JetBrains Mono'">4</text></svg> },
];

/* tiny inline-SVG glyphs for the 5 countdown styles (CD_STYLES order) */
const CD_GLYPHS = {
  digits: <svg width="30" height="22" viewBox="0 0 30 22"><text x="15" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill={IC} fontFamily="'JetBrains Mono'">42</text></svg>,
  flip: <svg width="30" height="22" viewBox="0 0 30 22"><rect x="3" y="2" width="24" height="18" rx="3" fill="none" stroke={IC} strokeWidth="1.6" /><line x1="3.8" y1="11" x2="26.2" y2="11" stroke={IC} strokeWidth="1.4" /><text x="15" y="9.4" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={IC} fontFamily="'JetBrains Mono'">4</text><text x="15" y="18.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={IC} fontFamily="'JetBrains Mono'">3</text></svg>,
  ring: <svg width="30" height="22" viewBox="0 0 30 22"><circle cx="15" cy="11" r="7.6" fill="none" stroke={IC} strokeOpacity="0.3" strokeWidth="2.6" /><path d="M15 3.4 A7.6 7.6 0 0 1 22.4 12.5" fill="none" stroke={IC} strokeWidth="2.6" strokeLinecap="round" /></svg>,
  bar: <svg width="30" height="22" viewBox="0 0 30 22"><text x="15" y="10" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={IC} fontFamily="'JetBrains Mono'">7</text><rect x="3" y="14.5" width="24" height="5" rx="2.5" fill="none" stroke={IC} strokeOpacity="0.5" strokeWidth="1.3" /><rect x="4.3" y="15.8" width="13" height="2.4" rx="1.2" fill={IC} /></svg>,
  boxed: <svg width="30" height="22" viewBox="0 0 30 22"><rect x="2" y="4" width="8" height="14" rx="1.6" fill="none" stroke={IC} strokeWidth="1.5" /><rect x="11" y="4" width="8" height="14" rx="1.6" fill="none" stroke={IC} strokeWidth="1.5" /><rect x="20" y="4" width="8" height="14" rx="1.6" fill="none" stroke={IC} strokeWidth="1.5" /><text x="6" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={IC} fontFamily="'JetBrains Mono'">0</text><text x="15" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={IC} fontFamily="'JetBrains Mono'">4</text><text x="24" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={IC} fontFamily="'JetBrains Mono'">2</text></svg>,
};

export default function NumberPanel({ addObject, setNumbersOpen }) {
  const [cdOpen, setCdOpen] = useState(false);
  const insert = (m, extra = {}) => { addObject("number", { name: m.name, props: { ...m.props, ...extra } }); setNumbersOpen(false); };
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Numbers</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {NUM_MODE_DEFS.map((m) => (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <button className="gd-btn" onClick={() => (m.id === "countdown" ? setCdOpen((o) => !o) : insert(m))}
                    style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg1, border: `1px solid ${m.id === "countdown" && cdOpen ? C.amber : C.line}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ flexShrink: 0, display: "flex" }}>{m.icon}</span>
                    <span style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>{m.name}</div><div style={{ fontSize: 10, color: C.faint }}>{m.hint}</div></span>
                    {m.id === "countdown" && <span style={{ color: cdOpen ? C.amber : C.faint, fontSize: 10, transform: cdOpen ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>▶</span>}
                  </button>
                  {m.id === "countdown" && cdOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "2px 0 2px 6px" }}>
                      {CD_STYLES.map((s) => (
                        <button key={s.id} className="gd-btn" title={`Insert a countdown layer — ${s.name} style`} onClick={() => insert(m, { cdStyle: s.id })}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 4px 6px", cursor: "pointer" }}>
                          <span style={{ display: "flex" }}>{CD_GLYPHS[s.id]}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: C.dim }}>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginTop: 10 }}>
              Formats (compact · currency · % · mm:ss) and style presets live in the Inspector once the layer is added.
            </div>
          </div>
  );
}
