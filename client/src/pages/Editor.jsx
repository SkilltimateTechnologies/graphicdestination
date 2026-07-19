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

  /* R10 shell layout: the old 44px shell header (project title + "←
     Dashboard" link + user/Sign-out strip) is GONE. The editor now fills the
     whole 100vh column under its own slim 40px top row (inside GDM): brand
     left, BrandSwitcher + avatar menu right — the avatar menu carries
     Dashboard / Profile / Settings / Logout, with Logout wired to the real
     AuthContext logout below. The root stays overflow:hidden so nothing on
     this page scrolls; the timeline docks at the bottom of the viewport. */
  const shellMenu = {
    user,
    onDashboard: () => navigate("/dashboard"),
    onProfile: () => navigate("/dashboard"),
    onSettings: () => navigate("/settings"),
    onLogout: doLogout,
  };
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0A0C10", overflow: "hidden" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {!id ? (
          <GraphicDestinationMotion {...shellMenu} />
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
          <GraphicDestinationMotion key={proj.id} initialProject={proj.data} onChange={onEngineChange} saveState={saveState} onSaveNow={saveNow} {...shellMenu} />
        )}
      </div>
    </div>
  );
}
