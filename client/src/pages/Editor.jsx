import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import GraphicDestinationMotion from "../components/GraphicDestinationMotion";

export default function Editor() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0A0C10" }}>
      <style>{`
        .gd-signout { transition: background 120ms ease-out, border-color 120ms ease-out; }
        .gd-signout:hover { background: #1E2330; }
      `}</style>
      <div style={barStyle}>
        {/* left — brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 20, height: 20, borderRadius: 8, background: "#F5A524", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
          </span>
          <span style={{ color: "#E9ECF3", fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>GD Motion</span>
        </div>
        {/* center — current user */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#939BAD", fontSize: 12.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3FB68B", boxShadow: "0 0 6px rgba(63,182,139,0.7)", flexShrink: 0 }} />
          <span style={{ color: "#E9ECF3", fontWeight: 600 }}>{user?.username}</span>
        </div>
        {/* right — sign out */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={doLogout} className="gd-signout" style={signoutBtn}>Sign out</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphicDestinationMotion />
      </div>
    </div>
  );
}

const barStyle = {
  height: 44, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
  padding: "0 14px", background: "#10131A", borderBottom: "1px solid #232936",
  fontFamily: "'Inter', system-ui, sans-serif",
};
const signoutBtn = {
  background: "transparent", border: "1px solid #2E3546", color: "#E9ECF3", borderRadius: 6,
  padding: "5px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
