/* ============================================================
   TOP BAR — breadcrumbs, stage preset, brand, account avatar.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   R8w1 purge (user request): the logo + duplicate project title (both
   already live in the editor shell header), the "saved" text, the
   save/load buttons (saving moved to the timeline transport bar), the
   share button (collaboration comes later) and the auto-keyframe toggle
   are all gone from here.
   R9w1: Export moved beside the Save control in the timeline transport
   bar; in its place the top bar ends with a circular AVATAR button that
   opens an account menu (Profile / Logout). The Editor shell wires real
   handlers (logout actually logs out via AuthContext); standalone renders
   the items as disabled stubs.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { C, STAGE_PRESETS } from "./model";

/* circular avatar + dropdown account menu. Shows the user's initial;
   Profile / Logout menu items. Handlers are optional — without them the
   items render disabled (standalone demo / test harnesses). */
export function AvatarMenu({ user, onProfile, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  /* close on any outside pointerdown or Escape */
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  const name = (user && user.username) || "";
  const initial = (name.trim().charAt(0) || "Z").toUpperCase();
  const item = (label, handler, cls) => (
    <button role="menuitem" disabled={!handler} onClick={() => { setOpen(false); if (handler) handler(); }}
      className={`gd-btn gd-avatar-item ${cls || ""}`}
      title={handler ? undefined : `${label} — sign in first`}
      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: handler ? C.txt : C.faint, borderRadius: 6, padding: "7px 10px", cursor: handler ? "pointer" : "default", fontWeight: 600, fontSize: 12 }}>
      {label}
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button className="gd-avatar" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open}
        title={name ? `${name} — account` : "Account"}
        onClick={() => setOpen((v) => !v)}
        style={{ width: 28, height: 28, borderRadius: "50%", background: open ? C.amberDim : C.amber, color: "#1A1405", border: `2px solid ${open ? C.txt : "transparent"}`, cursor: "pointer", fontWeight: 800, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", boxSizing: "border-box" }}>
        {initial}
      </button>
      {open && (
        <div role="menu" className="gd-avatar-menu"
          style={{ position: "absolute", top: 34, right: 0, minWidth: 168, background: C.bg2, border: `1px solid ${C.lineStrong}`, borderRadius: 10, padding: 6, zIndex: 80, boxShadow: "0 10px 28px rgba(0,0,0,.5)" }}>
          <div style={{ padding: "6px 10px 8px", borderBottom: `1px solid ${C.line}`, marginBottom: 5, color: C.dim, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 210 }}>
            {name ? `Signed in as ${name}` : "Not signed in"}
          </div>
          {item("Profile", onProfile)}
          {item("Logout", onLogout, "gd-avatar-logout")}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ exitToDepth, inClip, ctx, stage, applyStagePreset, stageIsPreset, brand, setBrandOpen, user, onProfile, onLogout }) {
  return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 44, background: C.bg1, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
          <button className="gd-btn" onClick={() => exitToDepth(0)} style={{ background: !inClip ? C.bg3 : "transparent", border: "none", color: !inClip ? C.txt : C.dim, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Main</button>
          {ctx.names.map((nm, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: C.faint }}>▸</span>
              <button className="gd-btn" onClick={() => exitToDepth(i + 1)} style={{ background: i === ctx.names.length - 1 ? C.bg3 : "transparent", border: "none", color: i === ctx.names.length - 1 ? C.amber : C.dim, borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{nm}</button>
            </span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select value={`${stage.w}x${stage.h}`} onChange={(e) => applyStagePreset(e.target.value)} title="Stage size preset" aria-label="Stage size preset" style={{ width: 142 }}>
          {!stageIsPreset && <option value={`${stage.w}x${stage.h}`}>Custom</option>}
          {STAGE_PRESETS.map((p) => <option key={p.id} value={`${p.w}x${p.h}`}>{p.name}</option>)}
        </select>
        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.faint, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{stage.w}×{stage.h}</span>
        <button className="gd-btn" onClick={() => setBrandOpen(true)} style={{ background: C.bg2, border: `1px solid ${C.line}`, color: C.txt, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ display: "flex", gap: 2 }}>{brand.colors.slice(0, 3).map((c, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 2, background: c }} />)}</span>
          Brand
        </button>
        {/* account avatar (R9w1) — sits where Export used to be; Export moved
            to the timeline transport bar beside Save. */}
        <AvatarMenu user={user} onProfile={onProfile} onLogout={onLogout} />
      </div>
  );
}
