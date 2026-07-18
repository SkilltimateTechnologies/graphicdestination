/* templates drawer — search + category filter over the gallery TEMPLATES;
   click inserts the template as one editable clip at the playhead.
   Follows the ShapesPanel (search) + MapsPanel (card list) patterns.
   Cards carry a LIVE-rendered thumbnail (TemplateThumb — the panel only
   mounts while open, so thumbs render lazily, once, memoized). */
import { C, inputStyle, chipStyle, sectionLabel } from "../model";
import { TEMPLATES } from "../../../templates/templates.js";
import TemplateThumb from "../TemplateThumb";

export default function TemplatesPanel({ tplQ, setTplQ, tplCat, setTplCat, insertTemplateClip }) {
  const cats = ["All", ...new Set(TEMPLATES.map((t) => t.category))];
  const q = tplQ.trim().toLowerCase();
  const list = TEMPLATES.filter((t) =>
    (tplCat === "All" || t.category === tplCat) &&
    (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)));
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 264, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 9 }}>Templates · insert as clip</div>
            <input autoFocus value={tplQ} onChange={(e) => setTplQ(e.target.value)} placeholder="Search templates…" style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {cats.map((c) => (
                <button key={c} className="gd-btn" onClick={() => setTplCat(c)}
                  style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: tplCat === c ? C.amber : C.line, color: tplCat === c ? C.amber : C.dim }}>{c}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 452, overflowY: "auto" }}>
              {list.map((t) => (
                <button key={t.id} className="gd-btn" title={`Insert "${t.name}" as a clip at the playhead`} onClick={() => insertTemplateClip(t)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ display: "flex", justifyContent: "center" }}><TemplateThumb tpl={t} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: t.accent, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                      <span style={{ ...chipStyle, padding: "1px 6px", fontSize: 9, flexShrink: 0 }}>{t.category}</span>
                    </span>
                    <span style={{ display: "block", fontSize: 10, color: C.faint, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</span>
                  </span>
                </button>
              ))}
              {!list.length && <div style={{ color: C.faint, fontSize: 11, textAlign: "center", padding: "14px 0" }}>No templates match.</div>}
            </div>
          </div>
  );
}
