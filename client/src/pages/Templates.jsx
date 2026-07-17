import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { TEMPLATES } from "../templates/templates";

/* ============================================================
   TEMPLATES — gallery (design/design.md)
   Pure-CSS animated preview thumbnails (transform/opacity only —
   representations of each template, not live engine renders).
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
  @keyframes gdTplIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .gd-signout { transition: background 120ms ease-out, border-color 120ms ease-out; }
  .gd-signout:hover { background: ${T.hover}; }
  .gd-back { transition: color 120ms ease-out; }
  .gd-back:hover { color: ${T.text}; }
  .gd-use { transition: background 120ms ease-out; }
  .gd-use:hover:not(:disabled) { background: ${T.accentDim}; }
  .gd-tcard { transition: border-color 120ms ease-out; }
  .gd-tcard:hover { border-color: ${T.borderStrong}; }

  /* ---- Logo Reveal ---- */
  @keyframes tplLogoMark { 0% { transform: scale(0) rotate(-120deg); opacity: 0; } 14% { opacity: 1; } 30%, 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
  @keyframes tplLogoRing { 0% { transform: scale(0.55); opacity: 0.85; } 32%, 100% { transform: scale(1.25); opacity: 0; } }
  @keyframes tplLogoText { 0%, 22% { transform: translateY(10px); opacity: 0; } 42%, 100% { transform: translateY(0); opacity: 1; } }
  .tpl-logo-mark { animation: tplLogoMark 5s cubic-bezier(.34,1.56,.64,1) infinite; }
  .tpl-logo-ring { animation: tplLogoRing 5s ease-out infinite; }
  .tpl-logo-text { animation: tplLogoText 5s ease-out infinite; }

  /* ---- Quote Card ---- */
  @keyframes tplQuoteBar { 0% { transform: scaleX(0); opacity: 0; } 8% { opacity: 1; } 20%, 100% { transform: scaleX(1); opacity: 1; } }
  @keyframes tplQuoteLine { 0%, 12% { transform: translateY(9px); opacity: 0; } 30%, 100% { transform: translateY(0); opacity: 1; } }
  @keyframes tplQuoteLine2 { 0%, 24% { transform: translateY(9px); opacity: 0; } 42%, 100% { transform: translateY(0); opacity: 1; } }
  @keyframes tplQuoteAuthor { 0%, 44% { opacity: 0; } 60%, 100% { opacity: 1; } }
  .tpl-quote-bar { animation: tplQuoteBar 5s ease-out infinite; transform-origin: left; }
  .tpl-quote-line1 { animation: tplQuoteLine 5s ease-out infinite; }
  .tpl-quote-line2 { animation: tplQuoteLine2 5s ease-out infinite; }
  .tpl-quote-author { animation: tplQuoteAuthor 5s ease-out infinite; }

  /* ---- Lower Third ---- */
  @keyframes tplLtBar { 0% { transform: translateX(-115%); } 18%, 100% { transform: translateX(0); } }
  @keyframes tplLtText { 0%, 10% { transform: translateX(-26px); opacity: 0; } 26%, 100% { transform: translateX(0); opacity: 1; } }
  .tpl-lt-bar { animation: tplLtBar 5s cubic-bezier(.22,.61,.36,1) infinite; }
  .tpl-lt-text1 { animation: tplLtText 5s ease-out infinite; }
  .tpl-lt-text2 { animation: tplLtText 5s ease-out infinite; animation-delay: 0.25s; }

  /* ---- Countdown ---- */
  @keyframes tplCountNum { 0% { opacity: 0; transform: scale(0.82); } 3%, 17% { opacity: 1; transform: scale(1); } 20%, 100% { opacity: 0; transform: scale(1); } }
  @keyframes tplCountRing { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
  .tpl-count-num { animation: tplCountNum 5s linear infinite; }
  .tpl-count-ring { animation: tplCountRing 1s linear infinite; }

  /* ---- Subscribe CTA ---- */
  @keyframes tplSubPulse { 0%, 100% { transform: scale(1); } 8% { transform: scale(1.06); } 16% { transform: scale(1); } 46% { transform: scale(1.06); } 54% { transform: scale(1); } }
  @keyframes tplSubBell { 0%, 62%, 100% { transform: rotate(0deg); } 66% { transform: rotate(16deg); } 70% { transform: rotate(-12deg); } 74% { transform: rotate(8deg); } 78% { transform: rotate(0deg); } }
  .tpl-sub-btn { animation: tplSubPulse 5s ease-in-out infinite; }
  .tpl-sub-bell { animation: tplSubBell 5s ease-in-out infinite; transform-origin: 50% 0%; }

  /* ---- Promo Flash ---- */
  @keyframes tplFlashText { 0% { opacity: 0; transform: scale(1.12); } 6%, 88% { opacity: 1; transform: scale(1); } 92%, 94% { opacity: 0.25; } 96%, 100% { opacity: 1; transform: scale(1); } }
  @keyframes tplMorphA { 0%, 44% { opacity: 1; transform: rotate(0deg) scale(1); } 50%, 94% { opacity: 0; transform: rotate(90deg) scale(0.6); } 100% { opacity: 1; transform: rotate(180deg) scale(1); } }
  @keyframes tplMorphB { 0%, 44% { opacity: 0; transform: rotate(-90deg) scale(0.6); } 50%, 94% { opacity: 1; transform: rotate(0deg) scale(1); } 100% { opacity: 0; transform: rotate(90deg) scale(0.6); } }
  @keyframes tplConfetti { 0% { transform: translateY(-8px) rotate(0deg); opacity: 0; } 8% { opacity: 1; } 84% { opacity: 1; } 100% { transform: translateY(56px) rotate(260deg); opacity: 0; } }
  .tpl-flash-text { animation: tplFlashText 5s ease-out infinite; }
  .tpl-morph-a { animation: tplMorphA 4s ease-in-out infinite; }
  .tpl-morph-b { animation: tplMorphB 4s ease-in-out infinite; }
  .tpl-confetti { animation: tplConfetti 2.6s linear infinite; }
`;

/* ---- pure-CSS preview thumbnails (16:9) ---- */
function Preview({ id, accent }) {
  const stage = { position: "absolute", inset: 0, background: T.canvas, backgroundImage: "radial-gradient(rgba(233,236,243,0.05) 1px, transparent 1px)", backgroundSize: "24px 24px" };
  if (id === "logo-reveal") {
    return (
      <div style={stage}>
        <div className="tpl-logo-ring" style={{ position: "absolute", left: "50%", top: "42%", width: 64, height: 64, margin: "-32px 0 0 -32px", borderRadius: "50%", border: `2px solid ${accent}` }} />
        <div className="tpl-logo-mark" style={{ position: "absolute", left: "50%", top: "42%", width: 30, height: 30, margin: "-15px 0 0 -15px", background: accent, clipPath: "polygon(58% 0, 74% 0, 54% 42%, 82% 42%, 32% 100%, 42% 56%, 18% 56%)" }} />
        <div className="tpl-logo-text" style={{ position: "absolute", left: 0, right: 0, top: "68%", textAlign: "center", color: T.text, fontWeight: 700, fontSize: 12, letterSpacing: "0.28em" }}>ACME STUDIO</div>
      </div>
    );
  }
  if (id === "quote-card") {
    return (
      <div style={stage}>
        <div style={{ position: "absolute", left: "16%", top: "16%", color: accent, fontSize: 44, fontFamily: "Georgia, serif", opacity: 0.35, lineHeight: 1 }}>“</div>
        <div className="tpl-quote-bar" style={{ position: "absolute", left: "50%", top: "24%", width: 44, height: 3, marginLeft: -22, background: "#F5A524", borderRadius: 2 }} />
        <div className="tpl-quote-line1" style={{ position: "absolute", left: 0, right: 0, top: "36%", textAlign: "center", color: T.text, fontFamily: "Georgia, serif", fontSize: 15 }}>Design is intelligence</div>
        <div className="tpl-quote-line2" style={{ position: "absolute", left: 0, right: 0, top: "52%", textAlign: "center", color: T.text, fontFamily: "Georgia, serif", fontSize: 15 }}>made visible.</div>
        <div className="tpl-quote-author" style={{ position: "absolute", left: 0, right: 0, top: "72%", textAlign: "center", color: accent, fontSize: 8.5, letterSpacing: "0.22em", fontWeight: 700 }}>— ALINA WHEELER</div>
      </div>
    );
  }
  if (id === "lower-third") {
    return (
      <div style={stage}>
        <div className="tpl-lt-bar" style={{ position: "absolute", left: "8%", bottom: "16%", width: "62%", height: 34, background: "#0F1116", borderRadius: 6, display: "flex", alignItems: "center", overflow: "hidden" }}>
          <span style={{ width: 5, alignSelf: "stretch", background: "#F5A524", flexShrink: 0 }} />
          <span style={{ marginLeft: 12 }}>
            <span className="tpl-lt-text1" style={{ display: "block", color: T.text, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.08em" }}>JORDAN LEE</span>
            <span className="tpl-lt-text2" style={{ display: "block", color: "#F5A524", fontSize: 8, marginTop: 2 }}>Motion Designer</span>
          </span>
        </div>
      </div>
    );
  }
  if (id === "countdown") {
    return (
      <div style={stage}>
        <div style={{ position: "absolute", left: "50%", top: "44%", width: 74, height: 74, margin: "-37px 0 0 -37px" }}>
          <div className="tpl-count-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `conic-gradient(${accent} 0 25%, transparent 25% 100%)`, WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))", mask: "radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))" }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${accent}33` }} />
          {["5", "4", "3", "2", "1"].map((n, i) => (
            <span key={n} className="tpl-count-num" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.text, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 26, opacity: 0, animationDelay: `${-i}s` }}>{n}</span>
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: "76%", textAlign: "center", color: accent, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.3em" }}>GET READY</div>
      </div>
    );
  }
  if (id === "subscribe-cta") {
    return (
      <div style={stage}>
        <div className="tpl-sub-bell" style={{ position: "absolute", left: "50%", top: "16%", marginLeft: -11, fontSize: 20 }}>🔔</div>
        <div style={{ position: "absolute", left: "50%", top: "46%", width: 148, marginLeft: -74, textAlign: "center" }}>
          <div className="tpl-sub-btn" style={{ display: "inline-block", background: accent, borderRadius: 999, padding: "9px 22px", color: "#fff", fontWeight: 800, fontSize: 10.5, letterSpacing: "0.12em" }}>SUBSCRIBE</div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: "72%", textAlign: "center", color: T.dim, fontSize: 9 }}>New videos every week</div>
      </div>
    );
  }
  /* promo-flash */
  return (
    <div style={stage}>
      {[...Array(7)].map((_, i) => (
        <span key={i} className="tpl-confetti" style={{ position: "absolute", left: `${12 + i * 12}%`, top: "4%", width: 5, height: i % 2 ? 5 : 8, background: ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#C084FC"][i % 5], borderRadius: i % 2 ? "50%" : 1, animationDelay: `${i * 0.35}s` }} />
      ))}
      <div style={{ position: "absolute", right: "12%", top: "18%", width: 26, height: 26 }}>
        <div className="tpl-morph-a" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#FFB224" }} />
        <div className="tpl-morph-b" style={{ position: "absolute", inset: 0, borderRadius: 6, background: "#5B8CFF" }} />
      </div>
      <div className="tpl-flash-text" style={{ position: "absolute", left: 0, right: 0, top: "38%", textAlign: "center", color: T.text, fontWeight: 800, fontSize: 21, letterSpacing: "0.02em" }}>FLASH SALE</div>
      <div style={{ position: "absolute", left: "50%", top: "62%", transform: "translateX(-50%)", border: "1px solid #F5A524", color: "#F5A524", borderRadius: 999, padding: "3px 11px", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>-50% · TODAY ONLY</div>
    </div>
  );
}

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
              {/* CSS-animated preview thumbnail */}
              <div style={{ position: "relative", aspectRatio: "16 / 9", borderBottom: `1px solid ${T.border}`, overflow: "hidden" }}>
                <Preview id={t.id} accent={t.accent} />
              </div>
              <div style={{ padding: "16px 18px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: t.accent, flexShrink: 0 }} />
                  <span style={{ color: T.text, fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em" }}>{t.name}</span>
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
