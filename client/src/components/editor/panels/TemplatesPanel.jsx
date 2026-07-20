/* templates drawer — search + category filter over the MERGED gallery:
   built-ins (templates.js baseline) overlaid with the template STORE
   (GET /api/templates): scope "global" (admin — a row whose slug matches a
   built-in id OVERRIDES it, badge "Global") and personal rows (badge
   "Mine"). Every card inserts as one editable GROUP-STYLE clip at the
   playhead (R7a: content-sized, stage-centered, movable/resizable/
   rotatable, double-click to open). Cards carry a LIVE-rendered thumbnail
   (TemplateThumb) that plays ONLY while hovered. */
import { useEffect, useMemo, useState } from "react";
import { C, inputStyle, chipStyle, sectionLabel } from "../model";
import { TEMPLATES, mergeTemplates } from "../../../templates/templates.js";
import TemplateThumb from "../TemplateThumb";

export default function TemplatesPanel({ tplQ, setTplQ, tplCat, setTplCat, insertTemplateClip, storeReloadKey = 0, saveCurrentAsTemplate, isAdmin = false }) {
  const [store, setStore] = useState(null); /* null = not loaded (demo shell without a session → built-ins only) */
  const [saveName, setSaveName] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/templates", { credentials: "same-origin" });
        if (!r.ok) return; /* 401 demo / offline — built-in gallery still works */
        const rows = await r.json();
        if (!dead) setStore(Array.isArray(rows) ? rows : []);
      } catch { /* offline — built-ins only */ }
    })();
    return () => { dead = true; };
  }, [storeReloadKey]);

  const list0 = useMemo(() => mergeTemplates(store || []), [store]);
  const cats = useMemo(() => ["All", ...new Set(list0.map((t) => t.category))], [list0]);
  const q = tplQ.trim().toLowerCase();
  const list = list0.filter((t) =>
    (tplCat === "All" || t.category === tplCat) &&
    (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)));
  const badgeOf = (t) => (t.scope === "global" ? "Global" : t.scope === "user" ? "Mine" : null);

  const doSave = async () => {
    if (!saveName.trim() || saveBusy) return;
    setSaveBusy(true); setSaveMsg("");
    try {
      await saveCurrentAsTemplate(saveName.trim());
      setSaveMsg(`Saved to ${isAdmin ? "the global library (everyone can use it)" : "your personal library"}.`);
      setSaveName("");
    } catch (e) { setSaveMsg(`Couldn't save — ${e.message}`); }
    setSaveBusy(false);
  };

  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 264, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 9 }}>Templates · insert as movable group</div>
            <input autoFocus value={tplQ} onChange={(e) => setTplQ(e.target.value)} placeholder="Search templates…" style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {cats.map((c) => (
                <button key={c} className="gd-btn" onClick={() => setTplCat(c)}
                  style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: tplCat === c ? C.amber : C.line, color: tplCat === c ? C.amber : C.dim }}>{c}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 452, overflowY: "auto" }}>
              {list.map((t) => {
                const badge = badgeOf(t);
                return (
                <button key={t.scope + ":" + t.id} className="gd-btn" title={`Insert "${t.name}" as a movable group at the playhead`} onClick={() => insertTemplateClip(t)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ display: "flex", justifyContent: "center" }}><TemplateThumb tpl={t} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: t.accent, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                      <span style={{ ...chipStyle, padding: "1px 6px", fontSize: 9, flexShrink: 0 }}>{t.category}</span>
                      {badge && <span data-tpl-badge={badge} style={{ ...chipStyle, padding: "1px 6px", fontSize: 9, flexShrink: 0, borderColor: C.amber, color: C.amber }}>{badge}</span>}
                    </span>
                    <span style={{ display: "block", fontSize: 10, color: C.faint, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</span>
                  </span>
                </button>
                );
              })}
              {!list.length && <div style={{ color: C.faint, fontSize: 11, textAlign: "center", padding: "14px 0" }}>No templates match.</div>}
            </div>
            {saveCurrentAsTemplate && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                <div style={{ ...sectionLabel, marginBottom: 6 }}>Save current as template</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Template name…"
                    onKeyDown={(e) => { if (e.key === "Enter") doSave(); }}
                    style={{ ...inputStyle, flex: 1, marginBottom: 0, padding: "5px 8px", fontSize: 11.5 }} />
                  <button className="gd-btn" data-save-template disabled={saveBusy || !saveName.trim()} onClick={doSave}
                    title={isAdmin ? "Save to the GLOBAL library — visible to everyone" : "Save to your personal library"}
                    style={{ ...chipStyle, cursor: saveName.trim() ? "pointer" : "default", borderColor: C.amber, color: C.amber, padding: "5px 10px", fontSize: 11, opacity: saveName.trim() ? 1 : 0.55 }}>Save</button>
                </div>
                {saveMsg && <div data-save-template-msg style={{ fontSize: 9.5, color: saveMsg.startsWith("Couldn't") ? C.danger : C.dim, marginTop: 5, lineHeight: 1.5 }}>{saveMsg}</div>}
              </div>
            )}
          </div>
  );
}
