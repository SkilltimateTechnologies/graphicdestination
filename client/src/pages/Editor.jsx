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
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0F1116" }}>
      <div style={barStyle}>
        <span style={{ color: "#8B93A7" }}>Signed in as <b style={{ color: "#E9EBF2" }}>{user?.username}</b></span>
        <button onClick={doLogout} style={logoutBtn}>Sign out</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphicDestinationMotion />
      </div>
    </div>
  );
}

const barStyle = {
  height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14,
  padding: "0 16px", background: "#0B0D11", borderBottom: "1px solid #1C2029", fontSize: 12.5, fontFamily: "Inter, system-ui, sans-serif",
};
const logoutBtn = {
  background: "#1C2029", border: "1px solid #2B3140", color: "#E9EBF2", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
