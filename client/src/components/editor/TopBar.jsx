/* ============================================================
   TOP BAR — brand, breadcrumbs, stage preset, save/export.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { C, STAGE_PRESETS } from "./model";

export default function TopBar({ name, setName, exitToDepth, inClip, ctx, stage, applyStagePreset, stageIsPreset, brand, setBrandOpen, setIoOpen, setImportErr, setExportOpen }) {
  return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 44, background: C.bg1, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 15, letterSpacing: 0.4, whiteSpace: "nowrap" }}>
          Graphic<span style={{ color: C.amber }}>Destination</span>
          <span style={{ color: C.faint, fontWeight: 500, marginLeft: 8, fontSize: 12 }}>MOTION · v0.5</span>
        </div>
        <input className="gd-name-input" value={name} onChange={(e) => setName(e.target.value)} title="Project name" aria-label="Project name" style={{ width: 150 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, overflow: "hidden" }}>
          <button className="gd-btn" onClick={() => exitToDepth(0)} style={{ background: !inClip ? C.bg3 : "transparent", border: "none", color: !inClip ? C.txt : C.dim, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Main</button>
          {ctx.names.map((nm, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: C.faint }}>▸</span>
              <button className="gd-btn" onClick={() => exitToDepth(i + 1)} style={{ background: i === ctx.names.length - 1 ? C.bg3 : "transparent", border: "none", color: i === ctx.names.length - 1 ? C.amber : C.dim, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{nm}</button>
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select value={`${stage.w}x${stage.h}`} onChange={(e) => applyStagePreset(e.target.value)} title="Stage size preset" aria-label="Stage size preset" style={{ width: 142 }}>
          {!stageIsPreset && <option value={`${stage.w}x${stage.h}`}>Custom</option>}
          {STAGE_PRESETS.map((p) => <option key={p.id} value={`${p.w}x${p.h}`}>{p.name}</option>)}
        </select>
        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.faint, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{stage.w}×{stage.h}</span>
        <button className="gd-btn" onClick={() => setBrandOpen(true)} style={{ background: C.bg2, border: `1px solid ${C.line}`, color: C.txt, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ display: "flex", gap: 2 }}>{brand.colors.slice(0, 3).map((c, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: c }} />)}</span>
          Brand
        </button>
        <button className="gd-btn" onClick={() => { setIoOpen(true); setImportErr(""); }} style={{ background: C.bg2, border: `1px solid ${C.line}`, color: C.txt, borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>Save / Load</button>
        <button className="gd-btn-accent" onClick={() => setExportOpen(true)} title="Export video — WebM in-browser, MP4 server render" style={{ background: C.amber, color: "#1A1405", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 1.5v6.2M3.7 5.6 6 7.9l2.3-2.3M1.8 9.2v.9a.9.9 0 0 0 .9.9h6.6a.9.9 0 0 0 .9-.9v-.9" /></svg>
          Export
        </button>
      </div>
  );
}
