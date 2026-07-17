import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hint, setHint] = useState(null);

  useEffect(() => {
    if (user) navigate("/editor", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api.adminHint().then((h) => setHint(h.active ? h : null)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(username, password);
      navigate("/editor");
    } catch (err) {
      setErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fillAdmin = () => {
    if (!hint) return;
    setUsername(hint.username);
    setPassword(hint.password);
  };

  return (
    <div style={s.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <Link to="/" style={s.back}>← Graphic<span style={{ color: "#FFB224" }}>Destination</span></Link>

      <form onSubmit={submit} style={s.card}>
        <h1 style={s.h1}>Sign in</h1>

        {hint && (
          <div style={s.hintBox}>
            <div style={s.hintTitle}>⚠ First-run admin account</div>
            <div style={s.hintRow}><span style={s.hintLabel}>Username</span><code style={s.hintVal}>{hint.username}</code></div>
            <div style={s.hintRow}><span style={s.hintLabel}>Password</span><code style={s.hintVal}>{hint.password}</code></div>
            <button type="button" onClick={fillAdmin} style={s.hintFill}>Fill these in</button>
            <div style={s.hintNote}>This banner disappears permanently once you change the password. Do this before deploying for real use.</div>
          </div>
        )}

        <label style={s.label}>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={s.input} autoFocus autoComplete="username" />

        <label style={s.label}>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" style={s.input} autoComplete="current-password" />

        {err && <div style={s.err}>{err}</div>}

        <button type="submit" disabled={busy} style={{ ...s.submit, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0F1116", color: "#E9EBF2", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 },
  back: { position: "absolute", top: 24, left: 32, color: "#8B93A7", fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, textDecoration: "none" },
  card: { width: 360, background: "#151820", border: "1px solid #2B3140", borderRadius: 16, padding: "30px 28px" },
  h1: { fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, margin: "0 0 20px" },
  label: { display: "block", fontSize: 11.5, fontWeight: 700, color: "#8B93A7", letterSpacing: 0.5, marginBottom: 6, marginTop: 14, textTransform: "uppercase" },
  input: { width: "100%", background: "#1C2029", border: "1px solid #2B3140", borderRadius: 8, color: "#E9EBF2", padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" },
  err: { color: "#FF6B6B", fontSize: 12.5, marginTop: 12 },
  submit: { width: "100%", marginTop: 22, background: "#FFB224", color: "#1a1405", border: "none", borderRadius: 9, padding: "12px 0", fontWeight: 700, fontSize: 14.5, cursor: "pointer" },
  hintBox: { background: "#2a2110", border: "1px solid #FFB22466", borderRadius: 10, padding: "12px 14px", marginBottom: 8 },
  hintTitle: { color: "#FFB224", fontWeight: 700, fontSize: 12, marginBottom: 8 },
  hintRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, fontSize: 12.5 },
  hintLabel: { color: "#8B93A7" },
  hintVal: { color: "#E9EBF2", fontFamily: "monospace", background: "#151820", padding: "2px 7px", borderRadius: 5 },
  hintFill: { marginTop: 8, width: "100%", background: "#1C2029", border: "1px solid #FFB22455", color: "#FFB224", borderRadius: 7, padding: "6px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  hintNote: { color: "#8B93A7", fontSize: 10.5, lineHeight: 1.5, marginTop: 8 },
};
