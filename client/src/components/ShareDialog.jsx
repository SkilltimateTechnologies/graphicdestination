/**
 * ShareDialog.jsx — public share-link modal for Zwoosh.
 *
 * Per design/design.md modal pattern (mirrors ExportDialog): 480px raised
 * card on a dimmed overlay, radius 10, 160ms ease-out enter, Esc/overlay to
 * close. Two states:
 *   · link OFF — one-line explanation + accent "Create share link"
 *   · link ON  — read-only link field + Copy button (✓ flash), plus a
 *     danger-ghost "Disable link" that revokes the token (public URL 404s)
 *
 * Self-contained: on open it re-reads the project (owner route) so the dialog
 * always reflects the persisted state, even if another tab changed it.
 *
 * Props: { open, onClose, projectId, projectName }
 */

import { useEffect, useState } from "react";
import { api } from "../api";

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  success: "#3FB68B", danger: "#E5636A", info: "#5B8DEF",
};

export default function ShareDialog({ open, onClose, projectId, projectName }) {
  const [loading, setLoading] = useState(true); // reading current share state
  const [token, setToken] = useState(null);     // null = link disabled
  const [busy, setBusy] = useState(false);      // create/disable in flight
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  /* load persisted share state each time the dialog opens */
  useEffect(() => {
    if (!open || !projectId) return undefined;
    let live = true;
    setLoading(true); setError(""); setCopied(false); setBusy(false);
    api.getProject(projectId)
      .then((p) => { if (live) setToken(p.shareToken || null); })
      .catch((err) => { if (live) setError(err?.message || "Couldn't load the share state."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, projectId]);

  /* Esc closes (unless an action is in flight) */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const link = token ? `${window.location.origin}/p/${token}` : "";

  const create = async () => {
    setBusy(true); setError("");
    try {
      const res = await api.enableShare(projectId);
      setToken(res.shareToken);
    } catch (err) {
      setError(err?.message || "Couldn't create the link — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true); setError("");
    try {
      await api.disableShare(projectId);
      setToken(null); setCopied(false);
    } catch (err) {
      setError(err?.message || "Couldn't disable the link — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard API unavailable (permissions, non-secure context) — fall back
         to the hidden-textarea trick, same as the editor's copyProject */
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); } catch { setCopied(false); }
      document.body.removeChild(ta);
    }
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      onPointerDown={() => { if (!busy) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "rgba(10,12,16,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', system-ui, sans-serif", color: T.text,
      }}
    >
      <style>{`
        @keyframes gdShareIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .gd-share-copy { transition: background 120ms ease-out; }
        .gd-share-copy:hover:not(:disabled) { background: ${T.accentDim}; }
        .gd-share-ghost { transition: background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out; }
        .gd-share-ghost:hover:not(:disabled) { background: ${T.hover}; }
        .gd-share-danger:hover:not(:disabled) { border-color: ${T.danger}; color: ${T.danger}; background: rgba(229,99,106,0.08); }
        .gd-share-field:focus { outline: 2px solid rgba(245,165,36,0.45); outline-offset: 2px; }
      `}</style>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: "94vw", background: T.raised, border: `1px solid ${T.border}`,
          borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: 20,
          animation: "gdShareIn 160ms ease-out",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>Share this project</div>
          <button
            onClick={() => { if (!busy) onClose?.(); }}
            title="Close"
            style={{
              marginLeft: "auto", background: "none", border: "none", color: busy ? T.faint : T.dim,
              cursor: busy ? "not-allowed" : "pointer", fontSize: 16, lineHeight: 1, padding: 2,
            }}
          >✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {projectName || "Untitled project"}
        </div>

        {loading ? (
          <div style={{ padding: "18px 0", color: T.dim, fontSize: 12.5 }}>Loading share state…</div>
        ) : token ? (
          <>
            <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.55, marginBottom: 12 }}>
              Anyone with this link can watch the latest saved version — no account needed.
            </div>
            {/* read-only link field + copy */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                className="gd-share-field"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                style={{
                  flex: 1, minWidth: 0, background: T.panel, border: `1px solid ${T.borderStrong}`, borderRadius: 6,
                  color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: "8px 10px",
                }}
              />
              <button
                className="gd-share-copy"
                onClick={copy}
                style={{
                  background: copied ? T.success : T.accent, color: copied ? "#06281C" : "#1A1405", border: "none",
                  borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", whiteSpace: "nowrap", minWidth: 74,
                }}
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                className="gd-share-ghost gd-share-danger"
                onClick={disable}
                disabled={busy}
                style={{
                  background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.dim, borderRadius: 6,
                  padding: "7px 13px", fontSize: 12, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}
              >
                {busy ? "Disabling…" : "Disable link"}
              </button>
              <span style={{ fontSize: 11, color: T.faint, lineHeight: 1.4 }}>Disabling revokes the link immediately — the URL stops working for everyone.</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.55, marginBottom: 16 }}>
              Create a public link to this project. Anyone with the link can watch the animation in a clean player —
              no account, no editing. You can disable it at any time.
            </div>
            <button
              className="gd-share-copy"
              onClick={create}
              disabled={busy}
              style={{
                width: "100%", background: T.accent, color: "#1A1405", border: "none", borderRadius: 6,
                padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Creating link…" : "Create share link"}
            </button>
          </>
        )}

        {error && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: T.danger, lineHeight: 1.45 }}>{error}</div>
        )}
      </div>
    </div>
  );
}
