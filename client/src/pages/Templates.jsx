import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { TEMPLATES } from "../templates/templates";
import { FONT_IMPORT } from "../engine/fx.js";
import TemplateThumb from "../components/editor/TemplateThumb";

/* ============================================================
   TEMPLATES — gallery (design/design.md)
   Live-rendered preview thumbnails (TemplateThumb — the template's
   representative frame drawn by the app's own StageObject renderer,
   one static frame, no animation loop).
   "Use template" creates a cloud project and opens its editor.
   ============================================================ */

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  success: "#3FB68B",
};

const CSS = `
  @import url('${FONT_IMPORT}'); /* live thumbs render with the engine fonts */
  @keyframes gdTplIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .gd-signout { transition: background 120ms ease-out, border-color 120ms ease-out; }
  .gd-signout:hover { background: ${T.hover}; }
  .gd-back { transition: color 120ms ease-out; }
  .gd-back:hover { color: ${T.text}; }
  .gd-use { transition: background 120ms ease-out; }
  .gd-use:hover:not(:disabled) { background: ${T.accentDim}; }
  .gd-tcard { transition: border-color 120ms ease-out; }
  .gd-tcard:hover { border-color: ${T.borderStrong}; }
`;

export default function Templates() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  const doLogout = async () => { await logout(); navigate("/login"); };

  const useTemplate = async (t) => {
    setBusyId(t.id);
    setErr("");
    try {
      const { id } = await api.createProject(t.name, t.buildProject());
      navigate(`/editor/${id}`);
    } catch (e) {
      setErr(e.message || "Couldn't create a project from that template.");
      setBusyId(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: T.canvas, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{CSS}</style>

      {/* ============ TOP BAR ============ */}
      <div style={{ height: 44, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 14px", background: T.panel, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/dashboard" className="gd-back" style={{ color: T.dim, textDecoration: "none", fontSize: 12.5, fontWeight: 600 }}>← Dashboard</Link>
          <span style={{ width: 1, height: 16, background: T.borderStrong }} />
          <span style={{ width: 20, height: 20, borderRadius: 8, background: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
          </span>
          <span style={{ color: T.text, fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em" }}>Zwoosh</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.dim, fontSize: 12.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.success, boxShadow: "0 0 6px rgba(63,182,139,0.7)", flexShrink: 0 }} />
          <span style={{ color: T.text, fontWeight: 600 }}>{user?.username}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={doLogout} className="gd-signout" style={{ background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.text, borderRadius: 6, padding: "5px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
        </div>
      </div>

      {/* ============ CONTENT ============ */}
      <div style={{ flex: 1, maxWidth: 1120, width: "100%", margin: "0 auto", padding: "44px 24px 80px", boxSizing: "border-box", animation: "gdTplIn 160ms ease-out" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: T.text, margin: "0 0 7px" }}>Templates</h1>
        <div style={{ color: T.dim, fontSize: 13, marginBottom: 26 }}>Six starter compositions, 1280×720 · 5 seconds. Yours to remix — every layer is editable.</div>

        {err && (
          <div style={{ background: "rgba(229,99,106,0.08)", border: "1px solid rgba(229,99,106,0.35)", color: "#E5636A", borderRadius: 6, padding: "9px 12px", fontSize: 12.5, marginBottom: 18 }}>{err}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {TEMPLATES.map((t) => (
            <div key={t.id} className="gd-tcard" style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* live-rendered preview thumbnail (static frame via StageObject) */}
              <div style={{ position: "relative", aspectRatio: "16 / 9", borderBottom: `1px solid ${T.border}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#101218" }}>
                <TemplateThumb tpl={t} w={344} h={194} />
              </div>
              <div style={{ padding: "16px 18px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: t.accent, flexShrink: 0 }} />
                  <span style={{ color: T.text, fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em" }}>{t.name}</span>
                  <span style={{ marginLeft: "auto", color: t.accent, border: `1px solid ${t.accent}44`, background: `${t.accent}14`, borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{t.category}</span>
                </div>
                <div style={{ color: T.dim, fontSize: 12.5, lineHeight: 1.55, flex: 1 }}>{t.description}</div>
                <button onClick={() => useTemplate(t)} disabled={busyId !== null} className="gd-use"
                  style={{ marginTop: 6, alignSelf: "flex-start", background: T.accent, color: "#1A1405", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: busyId ? "default" : "pointer", fontFamily: "inherit", opacity: busyId && busyId !== t.id ? 0.5 : 1 }}>
                  {busyId === t.id ? "Creating…" : "Use template"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
