/* ============================================================
   UI PIECES — small shared inspector/rail/timeline widgets.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { useState } from "react";
import { C, PROP_LABEL, FONTS, kfAt, inputStyle, chipStyle, navBtn, sectionLabel } from "./model";
import { colorAt, valueAt } from "../../engine/keyframes.js";
import { EASE } from "../../engine/easing.js";
import { WORLD, WORLD_LIST, worldZoomWindow } from "../../engine/maps.js";

export function Card({ title, hint, children }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "11px 12px", marginBottom: 10 }}>
      <div style={{ ...sectionLabel, marginBottom: 9 }}>
        {title} {hint && <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: C.faint }}>· {hint}</span>}
      </div>
      {children}
    </div>
  );
}
export function ChipRow({ label, options, value, onChange, wrap }) {
  return (
    <div style={{ display: "flex", alignItems: wrap ? "flex-start" : "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 11, fontWeight: 600, flexShrink: 0, paddingTop: wrap ? 4 : 0 }}>{label}</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map(([v, nm]) => (
          <button key={String(v)} className="gd-btn" onClick={() => onChange(v)}
            style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: value === v ? C.amber : C.line, color: value === v ? C.amber : C.dim }}>{nm}</button>
        ))}
      </div>
    </div>
  );
}
export function ColorKfRow({ label, obj, time, sw, onEdit, onKf }) {
  const track = obj.tracks.fill || [];
  const cur = colorAt(obj, "fill", time);
  const has = !!kfAt(track, Math.round(time / 10) * 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
      <button onClick={() => onKf(has, cur)} title={has ? "Remove color keyframe" : "Add color keyframe (shown as ● on the timeline)"}
        style={{ width: 18, height: 18, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: has ? cur : "transparent", border: `1.5px solid ${track.length ? C.amber : C.faint}`, display: "block" }} />
      </button>
      <span style={{ width: 44, color: C.dim, fontSize: 11, fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {sw.map((c) => <div key={c} onClick={() => onEdit(c)} style={{ width: 16, height: 16, borderRadius: 5, background: c, cursor: "pointer", border: cur.toLowerCase() === c.toLowerCase() ? `2px solid ${C.txt}` : `1px solid ${C.line}` }} />)}
        <input type="color" value={cur.slice(0, 7)} onChange={(e) => onEdit(e.target.value)} />
      </div>
    </div>
  );
}
export function PropRow({ obj, prop, time, stage, onEdit, onKfToggle, onNav, cfgMap, label, readOnly }) {
  const v = valueAt(obj, prop, time);
  const track = obj.tracks[prop] || [];
  const has = !!kfAt(track, Math.round(time / 10) * 10);
  /* cfgMap lets non-object pseudo-tracks (the scene camera) supply their own
     slider ranges/labels — object props keep the classic ranges. */
  const cfg = (cfgMap || { x: [0, stage.w, 1], y: [0, stage.h, 1], prog: [0, 1, 0.005], focus: [0, 1, 0.005], scale: [0, 3, 0.01], rotation: [-360, 360, 1], opacity: [0, 1, 0.01] })[prop];
  const valStr = prop === "opacity" || prop === "scale" || prop === "prog" || prop === "zoom" ? v.toFixed(2) : Math.round(v);
  const kfBtn = (
    <button onClick={() => onKfToggle(has, v)} title={has ? "Remove keyframe" : "Add keyframe at playhead"}
      style={{ width: 17, height: 17, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ width: 9, height: 9, transform: "rotate(45deg)", background: has ? C.amber : "transparent", border: `1.5px solid ${track.length ? C.amber : C.faint}`, display: "block", borderRadius: 1.5 }} />
    </button>
  );
  const nav = track.length > 0 ? (
    <span style={{ display: "flex", gap: 0 }}>
      <button onClick={() => onNav(-1)} title="Previous keyframe" style={navBtn}>‹</button>
      <button onClick={() => onNav(1)} title="Next keyframe" style={navBtn}>›</button>
    </span>
  ) : <span style={{ width: 26 }} />;
  /* ◆-only transform rows: canvas grips are the spatial editor — the row shows
     the live value read-only, keyframes are set/jumped with ◆ and ‹ › only. */
  if (readOnly) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 56, color: C.dim, fontSize: 10.5, fontWeight: 600, flexShrink: 0 }}>{label || PROP_LABEL[prop]}</span>
        <span style={{ flex: 1, fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontVariantNumeric: "tabular-nums", color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valStr}</span>
        {nav}
        {kfBtn}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
      {kfBtn}
      {nav}
      <span style={{ width: 56, color: C.dim, fontSize: 10.5, fontWeight: 600 }}>{label || PROP_LABEL[prop]}</span>
      <input type="range" min={cfg[0]} max={cfg[1]} step={cfg[2]} value={v} onChange={(e) => onEdit(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 38, textAlign: "right", fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{valStr}</span>
    </div>
  );
}
export function FontControls({ P, onChange, showSpacing, brand }) {
  return (
    <>
      <Row label="Font">
        <div style={{ display: "flex", gap: 5 }}>
          <select value={P.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} style={{ fontFamily: `'${P.fontFamily}'` }}>
            {FONTS.map((f) => <option key={f} style={{ fontFamily: `'${f}'` }}>{f}</option>)}
          </select>
          <button className="gd-btn" title={`Use brand font (${brand.headFont})`} onClick={() => onChange({ fontFamily: brand.headFont })} style={{ ...chipStyle, cursor: "pointer", flexShrink: 0 }}>Brand</button>
        </div>
      </Row>
      <ChipRow label="Weight" options={[[400, "Reg"], [600, "Semi"], [700, "Bold"], [800, "Heavy"]]} value={P.fontWeight} onChange={(v) => onChange({ fontWeight: v })} />
      <SliderRow label="Size" min={12} max={220} value={P.fontSize} onChange={(v) => onChange({ fontSize: v })} />
      {showSpacing && <SliderRow label="Spacing" min={-2} max={24} step={0.5} value={P.ls} onChange={(v) => onChange({ ls: v })} />}
      {showSpacing && <ChipRow label="Case" options={[[false, "As typed"], [true, "UPPERCASE"]]} value={P.upper} onChange={(v) => onChange({ upper: v })} />}
    </>
  );
}
export function WorldPicker({ hi, onAdd, onRetime, onRemove, onSetOut, onClearOut, onSetZoomIn, onClearZoomIn, onSetZoomOut, onClearZoomOut, onToggleZoom, zoomHoldMs, scopeCodes }) {
  const [q, setQ] = useState("");
  const selected = hi.map((h) => h.cc);
  const pool = scopeCodes ? WORLD_LIST.filter((c) => scopeCodes.includes(c.cc)) : WORLD_LIST;
  const matches = q.trim() ? pool.filter((c) => c.n.toLowerCase().includes(q.toLowerCase()) && !selected.includes(c.cc)).slice(0, 12) : [];
  return (
    <div style={{ marginBottom: 9 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={scopeCodes ? "Search this region…" : "Search a country — it appears at the playhead…"} style={{ ...inputStyle, marginBottom: 6 }} />
      {matches.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {matches.map((c) => (
            <button key={c.cc} className="gd-btn" onClick={() => { onAdd(c.cc); setQ(""); }} style={{ ...chipStyle, cursor: "pointer" }}>{c.n}</button>
          ))}
        </div>
      )}
      {hi.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hi.map((h) => {
            const zw = worldZoomWindow(h, { zoomHoldMs });
            const zoomOn = h.zoom !== false;
            return (
              <div key={h.cc} style={{ background: "#171B24", border: "1px solid #232936", borderRadius: 8, padding: "8px 9px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: "#F5A524", flex: 1 }}>{WORLD[h.cc]?.n || h.cc}</span>
                  <span onClick={() => onToggleZoom(h.cc)} title={zoomOn ? "Camera pushes in for this country — click to disable" : "Camera ignores this country — click to enable"}
                    style={{ ...chipStyle, cursor: "pointer", fontSize: 10, borderColor: zoomOn ? "#5B8DEF" : "#232936", color: zoomOn ? "#5B8DEF" : "#5D667A" }}>{zoomOn ? "🔍 zoom on" : "🔍 zoom off"}</span>
                  <span onClick={() => onRemove(h.cc)} title="Remove country" style={{ cursor: "pointer", color: "#E5636A", fontWeight: 800, fontSize: 13 }}>✕</span>
                </div>
                {/* 4 independent points, each: label • time • click-to-retime, click-to-set when unset */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  <PointBtn label="Appears" time={h.t} onClick={() => onRetime(h.cc)} color="#F5A524" />
                  <PointBtn label="Hides" time={h.out} auto={h.out == null} onClick={() => onSetOut(h.cc)} onClear={h.out != null ? () => onClearOut(h.cc) : null} color="#E5636A" placeholder="never" />
                  {zoomOn && <PointBtn label="Zoom in" time={zw.zin} auto={zw.zinAuto} onClick={() => onSetZoomIn(h.cc)} onClear={!zw.zinAuto ? () => onClearZoomIn(h.cc) : null} color="#5B8DEF" />}
                  {zoomOn && <PointBtn label="Zoom out" time={zw.zout} auto={zw.zoutAuto} onClick={() => onSetZoomOut(h.cc)} onClear={!zw.zoutAuto ? () => onClearZoomOut(h.cc) : null} color="#5B8DEF" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ color: "#5D667A", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>Timeline markers: ■ filled = appear, ◻ hollow = hide, ▶/◀ blue triangles = zoom in/out (faint = auto, solid = set by you). Drag any of them, or click a point above to set it at the playhead.</div>
    </div>
  );
}
export function PointBtn({ label, time, auto, onClick, onClear, color, placeholder }) {
  return (
    <div onClick={onClick} title={time == null ? `Set ${label.toLowerCase()} at the playhead` : `Click to re-time to the playhead`}
      style={{ cursor: "pointer", background: "#10131A", border: `1px solid ${time != null && !auto ? color : "#232936"}`, borderRadius: 6, padding: "4px 7px" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#5D667A", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono'", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: time == null ? "#5D667A" : auto ? "#939BAD" : color }}>
          {time == null ? (placeholder || "+ set") : fmtMs(time)}{auto && time != null ? " · auto" : ""}
        </span>
        {onClear && <span onClick={(e) => { e.stopPropagation(); onClear(); }} title="Clear — back to auto" style={{ marginLeft: "auto", color: "#5D667A", fontSize: 10, fontWeight: 800 }}>∅</span>}
      </div>
    </div>
  );
}
export function fmtMs(ms) { return `${Math.floor(ms / 1000)}:${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`; }
export function MenuBtn({ children, onClick, danger }) {
  return <button className="gd-btn" onClick={onClick} style={{ background: "transparent", border: "none", color: danger ? C.danger : C.txt, borderRadius: 7, padding: "7px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12, textAlign: "left" }}>{children}</button>;
}
/* music note — 1.5px stroke, matches the design system's minimal icon style */
export function NoteIcon({ size = 18, color = C.dim }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18.25V5.5l10-2v12.75" />
      <circle cx="6.75" cy="18.25" r="2.25" />
      <circle cx="16.75" cy="16.25" r="2.25" />
    </svg>
  );
}
/* scene camera — frame corners + center dot, same 1.5px stroke style */
export function CamIcon({ size = 18, color = C.dim }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
/* lock toggle — clearly different glyphs for the two states:
   OPEN padlock (unlocked, dim: shackle swung open on the right) vs
   CLOSED padlock (locked, amber: shackle fully closed + keyhole dot). */
export function LockIcon({ locked, size = 13, color }) {
  const col = color || (locked ? C.amber : C.faint);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" fill={locked ? col : "none"} fillOpacity={locked ? 0.22 : 0} />
      {locked
        ? <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        : <path d="M8 10.5V7.5a4 4 0 0 1 7.9-1" />}
      {locked && <circle cx="12" cy="15.2" r="1.3" fill={col} stroke="none" />}
    </svg>
  );
}
export function MiniBtn({ children, onClick, title, danger }) {
  return <button title={title} onClick={onClick} style={{ width: 16, height: 16, background: "none", border: "none", color: danger ? C.danger : C.faint, cursor: "pointer", fontSize: 9, padding: 0, lineHeight: 1 }}>{children}</button>;
}
export function RailBtn({ label, glyph, onClick, active }) {
  return (
    <button className="gd-btn" onClick={onClick}
      style={{ width: 56, height: 50, background: active ? C.bg3 : C.bg2, border: `1px solid ${active ? C.amber : C.line}`, borderRadius: 6, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0 }}>
      {glyph}
      <span style={{ fontSize: 9, color: active ? C.amber : C.dim, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
export function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
export function SliderRow({ label, min, max, step = 1, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: "right", fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{step < 1 ? (+value).toFixed(step < 0.1 ? 2 : 1) : Math.round(value)}</span>
    </div>
  );
}
export function EaseCurve({ ease }) {
  const fn = EASE[ease] || EASE.linear;
  const pts = Array.from({ length: 41 }, (_, i) => { const u = i / 40; return `${8 + u * 104},${52 - fn(u) * 44}`; }).join(" ");
  return (
    <svg width="120" height="60" style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, display: "block" }}>
      <line x1="8" y1="52" x2="112" y2="52" stroke={C.line} />
      <line x1="8" y1="8" x2="112" y2="8" stroke={C.line} strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke={C.amber} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
