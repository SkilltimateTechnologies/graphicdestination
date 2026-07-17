/* ============================================================
   MODALS + CONTEXT MENU — segment easing / layer menu, brand
   profiles, save-load. Extracted VERBATIM from
   GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { C, PROP_LABEL, FONTS, chipStyle, inputStyle, sectionLabel } from "./model";
import { MenuBtn, Row } from "./ui";
import { EASE, EASE_LABEL } from "../../engine/easing.js";

export function ContextMenu({ menu, setMenu, setSegmentEase, groupSelection, enterClip, ungroupClip, copySelection, pasteClipboard, clipCount, duplicateSelected, toggleHide, toggleLock, removeSelected, fmt }) {
  return (
        <div className="gd-panel" onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 250), top: Math.min(menu.y, window.innerHeight - 260), width: 236, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, zIndex: 200, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
          {menu.kind === "segment" && (
            <>
              <div style={{ ...sectionLabel, marginBottom: 7 }}>SEGMENT EASING</div>
              {menu.locked && <div style={{ color: C.amber, fontSize: 11 }}>Layer is locked.</div>}
              {!menu.locked && menu.segs.length === 0 && <div style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5 }}>No keyframe segment under the cursor — right-click between two ◆ of the same property.</div>}
              {!menu.locked && menu.segs.map((sg, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.txt, marginBottom: 5 }}>{PROP_LABEL[sg.prop]} <span style={{ color: C.faint, fontWeight: 500 }}>{fmt(sg.a.t)} → {fmt(sg.b.t)}</span></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {Object.keys(EASE).map((e) => (
                      <button key={e} className="gd-btn" onClick={() => { setSegmentEase(menu.objId, sg.prop, sg.a.t, e); setMenu(null); }}
                        style={{ ...chipStyle, cursor: "pointer", padding: "3px 8px", fontSize: 10.5, borderColor: sg.a.ease === e ? C.amber : C.line, color: sg.a.ease === e ? C.amber : C.dim }}>{EASE_LABEL[e]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
          {menu.kind === "layer" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {menu.multi && <MenuBtn onClick={() => { groupSelection(); setMenu(null); }}>▣ Group into clip</MenuBtn>}
              {menu.isClip && <MenuBtn onClick={() => { enterClip(menu.objId); setMenu(null); }}>▶ Open clip timeline</MenuBtn>}
              {menu.isClip && <MenuBtn onClick={() => { ungroupClip(menu.objId); setMenu(null); }}>⛓ Ungroup</MenuBtn>}
              <MenuBtn onClick={() => { copySelection(); setMenu(null); }}>⧉ Copy (⌘C)</MenuBtn>
              {clipCount > 0 && <MenuBtn onClick={() => { pasteClipboard(); setMenu(null); }}>📋 Paste (⌘V)</MenuBtn>}
              <MenuBtn onClick={() => { duplicateSelected(); setMenu(null); }}>⧉ Duplicate (⌘D)</MenuBtn>
              <MenuBtn onClick={() => { toggleHide(menu.objId); setMenu(null); }}>{menu.hidden ? "◉ Show" : "⊘ Hide"}</MenuBtn>
              <MenuBtn onClick={() => { toggleLock(menu.objId); setMenu(null); }}>{menu.locked ? "🔓 Unlock" : "🔒 Lock (timeline + stage)"}</MenuBtn>
              <MenuBtn danger onClick={() => { removeSelected(); setMenu(null); }}>✕ Delete</MenuBtn>
            </div>
          )}
        </div>
  );
}

export function BrandModal({ setBrandOpen, brands, brandId, setBrandId, setBrands, brand }) {
  return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,12,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onPointerDown={() => setBrandOpen(false)}>
          <div className="gd-panel" onPointerDown={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 15 }}>Brand profiles</div>
              <button onClick={() => setBrandOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {brands.map((b) => (
                <button key={b.id} className="gd-btn" onClick={() => setBrandId(b.id)}
                  style={{ ...chipStyle, cursor: "pointer", borderColor: b.id === brandId ? C.amber : C.line, color: b.id === brandId ? C.amber : C.dim }}>{b.name}</button>
              ))}
              <button className="gd-btn" onClick={() => { const nb = { id: "b" + Date.now(), name: "New brand", colors: ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#F9F9F9"], headFont: "Space Grotesk", bodyFont: "Inter" }; setBrands([...brands, nb]); setBrandId(nb.id); }}
                style={{ ...chipStyle, cursor: "pointer" }}>＋ New</button>
            </div>
            <Row label="Name"><input value={brand.name} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, name: e.target.value } : b)))} style={inputStyle} /></Row>
            <Row label="Palette">
              <div style={{ display: "flex", gap: 5 }}>
                {brand.colors.map((c, i) => (
                  <input key={i} type="color" value={c} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, colors: b.colors.map((cc, j) => (j === i ? e.target.value : cc)) } : b)))} />
                ))}
              </div>
            </Row>
            <Row label="Head font"><select value={brand.headFont} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, headFont: e.target.value } : b)))}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Row>
            <Row label="Body font"><select value={brand.bodyFont} onChange={(e) => setBrands(brands.map((b) => (b.id === brandId ? { ...b, bodyFont: e.target.value } : b)))}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Row>
            <div style={{ color: C.faint, fontSize: 11, lineHeight: 1.55, marginTop: 8 }}>The active brand's palette becomes the swatches across the app, and new text layers use its heading font. Brands are saved inside the project JSON.</div>
          </div>
        </div>
  );
}

export function IOModal({ setIoOpen, copyProject, ioCopied, importText, setImportText, importErr, importProject }) {
  return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,12,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onPointerDown={() => setIoOpen(false)}>
          <div className="gd-panel" onPointerDown={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 15 }}>Save / Load project</div>
              <button onClick={() => setIoOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.55, marginBottom: 12 }}>This preview sandbox blocks file downloads, so projects travel as JSON — copy to save, paste to load. Clips, brands, paths and stage size included.</div>
            <button className="gd-btn" onClick={copyProject}
              style={{ background: ioCopied ? "rgba(63,182,139,0.12)" : C.amber, color: ioCopied ? "#3FB68B" : "#1a1405", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: 700, marginBottom: 14 }}>
              {ioCopied ? "✓ Copied to clipboard" : "Copy project JSON"}
            </button>
            <div style={{ ...sectionLabel, marginBottom: 6 }}>LOAD — paste a composition</div>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"app":"graphic-destination-motion", ...}'
              style={{ ...inputStyle, height: 88, resize: "none", fontFamily: "'JetBrains Mono'", fontSize: 10.5 }} />
            {importErr && <div style={{ color: C.danger, fontSize: 11, marginTop: 6 }}>{importErr}</div>}
            <button className="gd-btn" onClick={importProject} disabled={!importText.trim()}
              style={{ background: C.bg2, border: `1px solid ${C.line}`, color: importText.trim() ? C.txt : C.faint, borderRadius: 6, padding: "8px 16px", cursor: importText.trim() ? "pointer" : "default", fontWeight: 700, marginTop: 8 }}>
              Load project
            </button>
          </div>
        </div>
  );
}
