import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { blankProject } from "../templates/templates";

/* ============================================================
   DASHBOARD — "Your projects" (design/design.md)
   Top bar (44px) + responsive project card grid, per-card menu,
   inline rename, duplicate, delete confirm, skeletons, empty state.
   ============================================================ */

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  danger: "#E5636A", success: "#3FB68B",
};

const CSS = `
  @keyframes gdDashIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes gdPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  .gd-signout { transition: background 120ms ease-out, border-color 120ms ease-out; }
  .gd-signout:hover { background: ${T.hover}; }
  .gd-new { transition: background 120ms ease-out; }
  .gd-new:hover:not(:disabled) { background: ${T.accentDim}; }
  .gd-ghost { transition: background 120ms ease-out, border-color 120ms ease-out; }
  .gd-ghost:hover { background: ${T.hover}; }
  .gd-card { transition: border-color 120ms ease-out; }
  .gd-card:hover { border-color: ${T.accent}; }
  .gd-menu-item { transition: background 120ms ease-out; }
  .gd-menu-item:hover:not(:disabled) { background: ${T.hover}; }
  .gd-skel { animation: gdPulse 1.6s ease-in-out infinite; }
`;

/* SQLite "YYYY-MM-DD HH:MM:SS" is UTC — normalize before parsing */
function parseTs(ts) {
  if (!ts) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(ts) ? ts.replace(" ", "T") + "Z" : ts);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatUpdated(ts) {
  const d = parseTs(ts);
  if (!d) return "—";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function BrandMark() {
  return (
    <Link to="/dashboard" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
      <span style={{ width: 20, height: 20, borderRadius: 8, background: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
      </span>
      <span style={{ color: T.text, fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>GD Motion</span>
    </Link>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null); // null = loading
  const [listErr, setListErr] = useState("");
  const [menuId, setMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [deleting, setDeleting] = useState(null); // project object pending confirm
  const [busy, setBusy] = useState(false); // card-level action in flight
  const [creating, setCreating] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const renameRef = useRef(null);

  const load = useCallback(() => {
    setListErr("");
    api.listProjects()
      .then((rows) => setProjects(Array.isArray(rows) ? rows : []))
      .catch((err) => { setProjects([]); setListErr(err.message || "Couldn't load projects."); });
  }, []);
  useEffect(() => { load(); }, [load]);

  /* close the open card menu on outside click / Escape */
  useEffect(() => {
    if (menuId === null) return undefined;
    const close = () => setMenuId(null);
    const key = (e) => { if (e.key === "Escape") setMenuId(null); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", key); };
  }, [menuId]);

  useEffect(() => { if (renamingId !== null) renameRef.current?.focus(); }, [renamingId]);

  const doLogout = async () => { await logout(); navigate("/login"); };

  const createNew = async () => {
    setCreating(true);
    setActionErr("");
    try {
      const { id } = await api.createProject("Untitled project", blankProject());
      navigate(`/editor/${id}`);
    } catch (err) {
      setActionErr(err.message || "Couldn't create the project.");
      setCreating(false);
    }
  };

  const startRename = (p) => { setMenuId(null); setRenamingId(p.id); setRenameVal(p.name); };
  const commitRename = async () => {
    const name = renameVal.trim();
    const id = renamingId;
    setRenamingId(null);
    if (!name || !projects.find((p) => p.id === id) || projects.find((p) => p.id === id).name === name) return;
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));
    try { await api.updateProject(id, { name }); }
    catch (err) { setActionErr(err.message || "Rename failed."); load(); }
  };

  const duplicate = async (p) => {
    setMenuId(null);
    setBusy(true);
    setActionErr("");
    try {
      const full = await api.getProject(p.id);
      await api.createProject(`${p.name} copy`, full.data);
      load();
    } catch (err) { setActionErr(err.message || "Couldn't duplicate the project."); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setActionErr("");
    try {
      await api.deleteProject(deleting.id);
      setProjects((ps) => (ps || []).filter((p) => p.id !== deleting.id));
      setDeleting(null);
    } catch (err) { setActionErr(err.message || "Couldn't delete the project."); }
    finally { setBusy(false); }
  };

  const openProject = (id) => navigate(`/editor/${id}`);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: T.canvas, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{CSS}</style>

      {/* ============ TOP BAR (same 44px bar as the editor) ============ */}
      <div style={{ height: 44, flexShrink: 0, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 14px", background: T.panel, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center" }}><BrandMark /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.dim, fontSize: 12.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.success, boxShadow: "0 0 6px rgba(63,182,139,0.7)", flexShrink: 0 }} />
          <span style={{ color: T.text, fontWeight: 600 }}>{user?.username}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={doLogout} className="gd-signout" style={{ background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.text, borderRadius: 6, padding: "5px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
        </div>
      </div>

      {/* ============ CONTENT ============ */}
      <div style={{ flex: 1, maxWidth: 1120, width: "100%", margin: "0 auto", padding: "44px 24px 80px", boxSizing: "border-box", animation: "gdDashIn 160ms ease-out" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 26 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: T.text, margin: "0 0 7px" }}>Your projects</h1>
            <div style={{ color: T.dim, fontSize: 13 }}>
              {projects === null ? "Loading…" : projects.length === 0 ? "Nothing here yet" : `${projects.length} project${projects.length === 1 ? "" : "s"} · autosaves as you edit`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/templates" className="gd-ghost" style={{ background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.text, borderRadius: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Browse templates</Link>
            <button onClick={createNew} disabled={creating} className="gd-new" style={{ background: T.accent, color: "#1A1405", border: "none", borderRadius: 6, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: creating ? "default" : "pointer", fontFamily: "inherit", opacity: creating ? 0.75 : 1 }}>
              {creating ? "Creating…" : "New project"}
            </button>
          </div>
        </div>

        {actionErr && (
          <div style={{ background: "rgba(229,99,106,0.08)", border: "1px solid rgba(229,99,106,0.35)", color: T.danger, borderRadius: 6, padding: "9px 12px", fontSize: 12.5, marginBottom: 18 }}>{actionErr}</div>
        )}
        {listErr && (
          <div style={{ background: "rgba(229,99,106,0.08)", border: "1px solid rgba(229,99,106,0.35)", color: T.danger, borderRadius: 6, padding: "9px 12px", fontSize: 12.5, marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{listErr}</span>
            <button onClick={load} className="gd-ghost" style={{ background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.text, borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Retry</button>
          </div>
        )}

        {/* ============ GRID ============ */}
        {projects === null ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="gd-skel" style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: "18px 18px 16px", height: 96, boxSizing: "border-box" }}>
                <div style={{ width: "62%", height: 12, borderRadius: 4, background: T.hover, marginBottom: 12 }} />
                <div style={{ width: "38%", height: 9, borderRadius: 4, background: T.hover }} />
              </div>
            ))}
          </div>
        ) : projects.length === 0 && !listErr ? (
          /* ============ EMPTY STATE ============ */
          <div style={{ border: `1px dashed ${T.borderStrong}`, borderRadius: 10, padding: "72px 24px", textAlign: "center", background: T.panel }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: T.accentSoft, border: "1px solid rgba(245,165,36,0.28)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.accent, marginBottom: 18 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M10 9.5v5c0 .6.65.95 1.15.63l4-2.5c.44-.27.44-.98 0-1.26l-4-2.5c-.5-.32-1.15.03-1.15.63z" /></svg>
            </div>
            <div style={{ color: T.text, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", marginBottom: 8 }}>No projects yet</div>
            <div style={{ color: T.dim, fontSize: 13.5, lineHeight: 1.6, maxWidth: 380, margin: "0 auto 22px" }}>Start from a blank canvas, or pick a template and make it yours — everything autosaves to your account.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={createNew} disabled={creating} className="gd-new" style={{ background: T.accent, color: "#1A1405", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: creating ? "default" : "pointer", fontFamily: "inherit", opacity: creating ? 0.75 : 1 }}>
                {creating ? "Creating…" : "Create your first project"}
              </button>
              <Link to="/templates" className="gd-ghost" style={{ background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.text, borderRadius: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Browse templates</Link>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {projects.map((p) => (
              <div key={p.id} className="gd-card" onClick={() => renamingId !== p.id && openProject(p.id)}
                style={{ position: "relative", background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: "18px 18px 16px", cursor: "pointer" }}>
                {/* name / inline rename */}
                {renamingId === p.id ? (
                  <input
                    ref={renameRef}
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Project name"
                    style={{ width: "100%", background: T.panel, border: `1px solid ${T.accent}`, borderRadius: 6, color: T.text, padding: "5px 9px", fontSize: 14.5, fontWeight: 700, outline: "none", boxSizing: "border-box", fontFamily: "inherit", letterSpacing: "-0.01em" }}
                  />
                ) : (
                  <div style={{ color: T.text, fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.01em", paddingRight: 30, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</div>
                )}
                <div style={{ color: T.faint, fontSize: 11.5, marginTop: 9, fontVariantNumeric: "tabular-nums" }}>
                  Edited {formatUpdated(p.updated_at || p.updatedAt)}
                </div>

                {/* card menu */}
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id); }}
                  aria-label={`Options for ${p.name}`}
                  className="gd-menu-item"
                  style={{ position: "absolute", top: 12, right: 12, width: 26, height: 26, background: "transparent", border: "none", borderRadius: 6, color: T.dim, cursor: "pointer", fontSize: 15, lineHeight: 1, letterSpacing: 1, fontFamily: "inherit" }}
                >···</button>
                {menuId === p.id && (
                  <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
                    style={{ position: "absolute", top: 42, right: 12, zIndex: 30, width: 148, background: T.panel, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", animation: "gdDashIn 160ms ease-out" }}>
                    {[
                      ["Open", () => openProject(p.id)],
                      ["Rename", () => startRename(p)],
                      ["Duplicate", () => duplicate(p)],
                    ].map(([label, fn]) => (
                      <button key={label} onClick={fn} disabled={busy} className="gd-menu-item"
                        style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 6, color: T.text, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
                    ))}
                    <div style={{ height: 1, background: T.border, margin: "4px 6px" }} />
                    <button onClick={() => { setMenuId(null); setDeleting(p); }} disabled={busy} className="gd-menu-item"
                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 6, color: T.danger, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ DELETE CONFIRM MODAL ============ */}
      {deleting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,12,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onPointerDown={() => !busy && setDeleting(null)}>
          <div onPointerDown={(e) => e.stopPropagation()} style={{ width: 400, maxWidth: "100%", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: "22px 22px 20px", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", animation: "gdDashIn 160ms ease-out" }}>
            <div style={{ color: T.text, fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", marginBottom: 9 }}>Delete “{deleting.name}”?</div>
            <div style={{ color: T.dim, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>This removes the project and its saved composition from your account. There&rsquo;s no undo.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleting(null)} disabled={busy} className="gd-ghost" style={{ background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.text, borderRadius: 6, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={confirmDelete} disabled={busy} style={{ background: T.danger, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.75 : 1 }}>
                {busy ? "Deleting…" : "Delete project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
