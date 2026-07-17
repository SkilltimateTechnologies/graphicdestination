import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

/* ============================================================
   AUTH — combined Sign in / Create account (design/design.md)
   400px card on bg-canvas, subtle amber radial vignette.
   ============================================================ */

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  danger: "#E5636A",
};

const CSS = `
  @keyframes gdAuthIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes gdSpin { to { transform: rotate(360deg); } }
  .gd-auth-input { transition: border-color 120ms ease-out, background 120ms ease-out; }
  .gd-auth-input:hover { border-color: ${T.borderStrong}; }
  .gd-auth-input:focus { border-color: ${T.accent}; outline: none; }
  .gd-auth-seg { transition: background 120ms ease-out, color 120ms ease-out; }
  .gd-auth-submit { transition: background 120ms ease-out; }
  .gd-auth-submit:hover:not(:disabled) { background: ${T.accentDim}; }
  .gd-auth-spinner { width: 13px; height: 13px; border-radius: 50%; border: 2px solid rgba(26,20,5,0.35); border-top-color: #1A1405; animation: gdSpin 700ms linear infinite; flex-shrink: 0; }
`;

export default function Login() {
  const { login, signup, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState({}); // { username?, password?, confirm? }
  const [hint, setHint] = useState(null);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    /* first-run admin hint — hides gracefully when the endpoint is gone (404) or errors */
    api.adminHint().then((h) => setHint(h.active ? h : null)).catch(() => {});
  }, []);

  const signingUp = mode === "signup";

  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setErr("");
    setFieldErr({});
    setConfirm("");
  };

  const validate = () => {
    const fe = {};
    if (!username.trim()) fe.username = "Username is required.";
    if (signingUp) {
      if (password.length < 8) fe.password = "Password must be at least 8 characters.";
      if (confirm !== password) fe.confirm = "Passwords do not match.";
    } else if (!password) {
      fe.password = "Password is required.";
    }
    setFieldErr(fe);
    return Object.keys(fe).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!validate()) return;
    setBusy(true);
    try {
      if (signingUp) await signup(username.trim(), password);
      else await login(username.trim(), password);
      navigate("/dashboard");
    } catch (err) {
      if (err.status === 409) setErr("Username is taken.");
      else setErr(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const fillAdmin = () => {
    if (!hint) return;
    switchMode("signin");
    setUsername(hint.username);
    setPassword(hint.password);
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.canvas, color: T.text, fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24,
      backgroundImage: "radial-gradient(ellipse 55% 42% at 50% 40%, rgba(245,165,36,0.055), transparent 70%)",
    }}>
      <style>{CSS}</style>

      {/* brand mark */}
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", marginBottom: 26 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
        </span>
        <span style={{ color: T.text, fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em" }}>GraphicDestination</span>
        <span style={{ color: T.accent, background: T.accentSoft, border: "1px solid rgba(245,165,36,0.28)", borderRadius: 5, padding: "2px 7px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Motion</span>
      </Link>

      <form onSubmit={submit} noValidate style={{ width: 400, maxWidth: "100%", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: "26px 26px 24px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", animation: "gdAuthIn 160ms ease-out" }}>
        {/* segmented toggle */}
        <div style={{ display: "flex", background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: 3, marginBottom: 20 }}>
          {[["signin", "Sign in"], ["signup", "Create account"]].map(([m, label]) => (
            <button key={m} type="button" onClick={() => switchMode(m)} className="gd-auth-seg"
              style={{
                flex: 1, border: "none", borderRadius: 6, padding: "7px 0", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
                background: mode === m ? T.hover : "transparent", color: mode === m ? T.text : T.dim,
              }}>{label}</button>
          ))}
        </div>

        {hint && (
          <div style={{ background: T.accentSoft, border: "1px solid rgba(245,165,36,0.32)", borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
            <div style={{ color: T.accent, fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>First-run admin account</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, fontSize: 12.5 }}>
              <span style={{ color: T.dim }}>Username</span><code style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace", background: T.raised, padding: "2px 7px", borderRadius: 5, fontSize: 11.5 }}>{hint.username}</code>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              <span style={{ color: T.dim }}>Password</span><code style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace", background: T.raised, padding: "2px 7px", borderRadius: 5, fontSize: 11.5 }}>{hint.password}</code>
            </div>
            <button type="button" onClick={fillAdmin} style={{ marginTop: 9, width: "100%", background: T.raised, border: "1px solid rgba(245,165,36,0.32)", color: T.accent, borderRadius: 6, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Fill these in</button>
            <div style={{ color: T.dim, fontSize: 10.5, lineHeight: 1.5, marginTop: 8 }}>This banner disappears permanently once you change the password. Do this before deploying for real use.</div>
          </div>
        )}

        <label htmlFor="gd-user" style={labelStyle}>Username</label>
        <input id="gd-user" value={username} onChange={(e) => setUsername(e.target.value)} className="gd-auth-input" style={inputStyle} autoFocus autoComplete="username" />
        {fieldErr.username && <div style={fieldErrStyle}>{fieldErr.username}</div>}

        <label htmlFor="gd-pass" style={{ ...labelStyle, marginTop: 14 }}>Password</label>
        <input id="gd-pass" value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="gd-auth-input" style={inputStyle} autoComplete={signingUp ? "new-password" : "current-password"} />
        {fieldErr.password && <div style={fieldErrStyle}>{fieldErr.password}</div>}

        {signingUp && (
          <>
            <label htmlFor="gd-confirm" style={{ ...labelStyle, marginTop: 14 }}>Confirm password</label>
            <input id="gd-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" className="gd-auth-input" style={inputStyle} autoComplete="new-password" />
            {fieldErr.confirm && <div style={fieldErrStyle}>{fieldErr.confirm}</div>}
          </>
        )}

        {err && (
          <div style={{ background: "rgba(229,99,106,0.08)", border: "1px solid rgba(229,99,106,0.35)", color: T.danger, borderRadius: 6, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5, marginTop: 16 }}>{err}</div>
        )}

        <button type="submit" disabled={busy} className="gd-auth-submit"
          style={{
            width: "100%", marginTop: 20, background: T.accent, color: "#1A1405", border: "none", borderRadius: 6,
            padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
            opacity: busy ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          {busy && <span className="gd-auth-spinner" />}
          {busy ? (signingUp ? "Creating account…" : "Signing in…") : (signingUp ? "Create account" : "Sign in")}
        </button>

        <div style={{ color: T.faint, fontSize: 11.5, lineHeight: 1.6, textAlign: "center", marginTop: 16 }}>
          {signingUp ? "Your account signs in immediately after creation." : "New here? Switch to Create account above."}
        </div>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 };
const inputStyle = { width: "100%", background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const fieldErrStyle = { color: "#E5636A", fontSize: 11.5, marginTop: 5, lineHeight: 1.4 };
