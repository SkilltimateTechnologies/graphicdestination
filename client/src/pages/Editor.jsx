import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import GraphicDestinationMotion from "../components/GraphicDestinationMotion";
import ShareDialog from "../components/ShareDialog";

export default function Editor() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [proj, setProj] = useState(null); // { id, name, data, shareToken } once loaded
  const [loadErr, setLoadErr] = useState("");
  const [saveState, setSaveState] = useState("saved"); // "saved" | "dirty" | "saving" | "error"
  const [shareOpen, setShareOpen] = useState(false);
  const [shared, setShared] = useState(false); // whether a public link is live
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
    setShared(false);
    lastSavedRef.current = null;
    pendingRef.current = null;
    skipFirstRef.current = true;
    api.getProject(id)
      .then((p) => { if (alive) { setProj(p); setShared(!!p.shareToken); } })
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

  /* after any dialog action, re-read the project so the Shared pill matches
     the persisted state (the dialog itself stays authoritative while open) */
  const closeShare = useCallback(() => {
    setShareOpen(false);
    if (id) api.getProject(id).then((p) => setShared(!!p.shareToken)).catch(() => {});
  }, [id]);

  const status =
    saveState === "saving" ? { text: "Saving…", color: "#939BAD" }
    : saveState === "dirty" ? { text: "Unsaved changes", color: "#F5A524" }
    : saveState === "error" ? { text: "Couldn't save — will retry on next change", color: "#E5636A" }
    : { text: "Saved", color: "#3FB68B" };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0A0C10" }}>
      <style>{`
        .gd-signout { transition: background 120ms ease-out, border-color 120ms ease-out; }
        .gd-signout:hover { background: #1E2330; }
        .gd-back { transition: color 120ms ease-out; }
        .gd-back:hover { color: #E9ECF3; }
        .gd-save { transition: background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out, opacity 120ms ease-out; }
        .gd-save-active:hover:not(:disabled) { background: #B87A18 !important; }
        .gd-save:disabled { cursor: default; }
        .gd-sharedpill { transition: background 120ms ease-out, border-color 120ms ease-out; }
        .gd-sharedpill:hover { background: rgba(245,165,36,0.2); border-color: #F5A524; }
      `}</style>
      <div style={barStyle}>
        {/* left — back + brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link to="/dashboard" className="gd-back" style={{ color: "#939BAD", textDecoration: "none", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>← Dashboard</Link>
          <span style={{ width: 1, height: 16, background: "#2E3546", flexShrink: 0 }} />
          <span style={{ width: 20, height: 20, borderRadius: 8, background: "#F5A524", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
          </span>
          <span style={{ color: "#E9ECF3", fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>Zwoosh</span>
        </div>
        {/* center — project name + save status + shared pill */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 0, fontSize: 12.5 }}>
          {id && proj && <span style={{ color: "#E9ECF3", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{proj.name}</span>}
          {id && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: status.color, fontSize: 11.5, whiteSpace: "nowrap" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: status.color, flexShrink: 0 }} />
              {status.text}
            </span>
          )}
          {id && shared && (
            <button onClick={() => setShareOpen(true)} title="A public link is live — click to manage" className="gd-sharedpill" style={sharedPill}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 7 7 5M4.2 6.6 2.9 7.9a1.9 1.9 0 0 1-2.7-2.7l2.6-2.6a1.9 1.9 0 0 1 2.7 0M7.8 5.4l1.3-1.3a1.9 1.9 0 0 1 2.7 2.7L9.2 9.4a1.9 1.9 0 0 1-2.7 0" />
              </svg>
              Shared
            </button>
          )}
        </div>
        {/* right — share + save + user + sign out */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          {id && (
            <button onClick={() => setShareOpen(true)} className="gd-signout" style={signoutBtn}>
              Share
            </button>
          )}
          {id && (
            <button
              onClick={saveNow}
              disabled={saveState !== "dirty" && saveState !== "error"}
              className={saveState === "dirty" ? "gd-save gd-save-active" : "gd-save"}
              style={{ ...saveBtn, ...saveBtnState[saveState] }}
              title={saveState === "dirty" ? "Save your changes" : saveState === "saved" ? "Everything is saved" : saveState === "error" ? "Save failed — click to retry" : "Saving"}
            >
              {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Save" : saveState === "error" ? "Retry save" : "Saved ✓"}
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#939BAD", fontSize: 12.5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3FB68B", boxShadow: "0 0 6px rgba(63,182,139,0.7)", flexShrink: 0 }} />
            <span style={{ color: "#E9ECF3", fontWeight: 600 }}>{user?.username}</span>
          </div>
          <button onClick={doLogout} className="gd-signout" style={signoutBtn}>Sign out</button>
        </div>
      </div>
      {id && proj && <ShareDialog open={shareOpen} onClose={closeShare} projectId={id} projectName={proj.name} />}
      <div style={{ flex: 1, minHeight: 0 }}>
        {!id ? (
          <GraphicDestinationMotion />
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
          <GraphicDestinationMotion key={proj.id} initialProject={proj.data} onChange={onEngineChange} />
        )}
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
const saveBtn = {
  borderRadius: 6, border: "none",
  padding: "5px 16px", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
};
/* per-state look: dirty = accent call-to-action; saving = muted; saved = calm
   success tint; error = danger (clickable retry) */
const saveBtnState = {
  dirty: { background: "#F5A524", color: "#1A1405", cursor: "pointer" },
  saving: { background: "#2A2415", color: "#939BAD" },
  saved: { background: "rgba(63,182,139,0.12)", color: "#3FB68B", border: "1px solid rgba(63,182,139,0.35)" },
  error: { background: "#E5636A", color: "#FFFFFF", cursor: "pointer" },
};
const sharedPill = {
  display: "flex", alignItems: "center", gap: 5, background: "rgba(245,165,36,0.12)",
  border: "1px solid rgba(245,165,36,0.45)", color: "#F5A524", borderRadius: 999,
  padding: "3px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
};
