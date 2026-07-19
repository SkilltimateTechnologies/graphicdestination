import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import GraphicDestinationMotion from "../components/GraphicDestinationMotion";

export default function Editor() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [proj, setProj] = useState(null); // { id, name, data, shareToken } once loaded
  const [loadErr, setLoadErr] = useState("");
  const [saveState, setSaveState] = useState("saved"); // "saved" | "dirty" | "saving" | "error"
  const lastSavedRef = useRef(null);   // engine-serialized JSON last known to be on the server
  const skipFirstRef = useRef(false);  // swallow the engine's first onChange (echo of the loaded project)
  const timerRef = useRef(null);
  const pendingRef = useRef(null);

  /* load the project when editing an existing one */
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    setProj(null);
    setLoadErr("");
    setSaveState("saved");
    lastSavedRef.current = null;
    pendingRef.current = null;
    skipFirstRef.current = true;
    api.getProject(id)
      .then((p) => { if (alive) setProj(p); })
      .catch((err) => { if (alive) setLoadErr(err.status === 404 ? "Project not found." : err.message || "Couldn't load that project."); });
    return () => { alive = false; };
  }, [id]);

  const save = useCallback(
    async (json) => {
      if (!id || !json) return;
      setSaveState("saving");
      try {
        await api.updateProject(id, { data: JSON.parse(json) });
        lastSavedRef.current = json;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [id]
  );

  /* autosave — debounced 2s after the last change */
  const onEngineChange = useCallback(
    (json) => {
      if (!id) return;
      if (skipFirstRef.current) { skipFirstRef.current = false; lastSavedRef.current = json; return; }
      if (json === lastSavedRef.current) return;
      pendingRef.current = json;
      setSaveState("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next && next !== lastSavedRef.current) save(next);
      }, 2000);
    },
    [id, save]
  );

  const saveNow = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const json = pendingRef.current;
    pendingRef.current = null;
    if (json && json !== lastSavedRef.current) save(json);
  }, [save]);

  /* best-effort flush when leaving the editor with unsaved changes */
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (id && pendingRef.current && pendingRef.current !== lastSavedRef.current) {
        api.updateProject(id, { data: JSON.parse(pendingRef.current) }).catch(() => {});
      }
    },
    [id]
  );

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  /* R8w1 shell layout: the root is a fixed 100vh column with overflow hidden,
     so NOTHING on this page scrolls — the header can never be scrolled away
     (and it is sticky as a belt-and-braces fallback), and the editor below
     docks its timeline at the bottom of the viewport. The top bar was purged
     per the user request: no Share button (collaboration later), no Save
     button + "saved" text here (the save control + save-state indicator moved
     into the timeline transport bar via saveState/onSaveNow below). */
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0A0C10", overflow: "hidden" }}>
      <style>{`
        .gd-signout { transition: background 120ms ease-out, border-color 120ms ease-out; }
        .gd-signout:hover { background: #1E2330; }
        .gd-back { transition: color 120ms ease-out; }
        .gd-back:hover { color: #E9ECF3; }
      `}</style>
      <div style={barStyle}>
        {/* left — back (R9w1: the Zwoosh logo/wordmark moved to the slim
            brand bar directly above the timeline, inside the editor) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link to="/dashboard" className="gd-back" style={{ color: "#939BAD", textDecoration: "none", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>← Dashboard</Link>
        </div>
        {/* center — project name (the single place the title is shown) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 0, fontSize: 12.5 }}>
          {id && proj && <span style={{ color: "#E9ECF3", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{proj.name}</span>}
        </div>
        {/* right — user + sign out (Share/Save removed: collaboration later,
            saving lives in the timeline bar) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#939BAD", fontSize: 12.5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3FB68B", boxShadow: "0 0 6px rgba(63,182,139,0.7)", flexShrink: 0 }} />
            <span style={{ color: "#E9ECF3", fontWeight: 600 }}>{user?.username}</span>
          </div>
          <button onClick={doLogout} className="gd-signout" style={signoutBtn}>Sign out</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {!id ? (
          <GraphicDestinationMotion user={user} onLogout={doLogout} onProfile={() => navigate("/dashboard")} />
        ) : loadErr ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div style={{ color: "#E5636A", fontSize: 14, fontWeight: 600 }}>{loadErr}</div>
            <Link to="/dashboard" style={{ color: "#F5A524", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>← Back to your projects</Link>
          </div>
        ) : !proj ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#939BAD", fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "0.01em" }}>
            Loading project…
          </div>
        ) : (
          <GraphicDestinationMotion key={proj.id} initialProject={proj.data} onChange={onEngineChange} saveState={saveState} onSaveNow={saveNow} user={user} onLogout={doLogout} onProfile={() => navigate("/dashboard")} />
        )}
      </div>
    </div>
  );
}

/* sticky + zIndex: even if a future layout change re-introduces page scroll,
   the header stays pinned to the top of the viewport */
const barStyle = {
  height: 44, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
  padding: "0 14px", background: "#10131A", borderBottom: "1px solid #232936",
  fontFamily: "'Inter', system-ui, sans-serif",
  position: "sticky", top: 0, zIndex: 50,
};
const signoutBtn = {
  background: "transparent", border: "1px solid #2E3546", color: "#E9ECF3", borderRadius: 6,
  padding: "5px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
