/* ============================================================
   TOP BAR (R10) — one SLIM 40px row replaces the old 44px top bar AND
   the editor shell header: BrandMark logo + "Zwoosh" wordmark on the
   left, the BrandSwitcher kept beside the right end, and the account
   avatar menu at the right end with Dashboard / Profile / Settings /
   Logout (logout really logs out via AuthContext — the Editor shell
   wires the handlers; standalone renders stub-disabled items).
   The old breadcrumb (Main › clip…) moved INTO the timeline transport
   bar beside the Animate toggle; the stage-size preset lives in the
   Inspector's Stage card. The shell header (project title + "←
   Dashboard" link + Sign out) is gone — Dashboard is an avatar item.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { C } from "./model";

/* ---------- brand mark (R10: moved from the timeline brand bar into the
   slim top row) — the Zwoosh logo + wordmark. ---------- */
export function BrandMark() {
  return (
    <span className="gd-brandmark" style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
      <span style={{ width: 18, height: 18, borderRadius: 7, background: C.amber, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="9" height="9" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
      </span>
      <span style={{ color: C.txt, fontWeight: 800, fontSize: 12.5, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>Zwoosh</span>
    </span>
  );
}

/* circular avatar + dropdown account menu. Shows the user's initial;
   Dashboard / Profile / Settings / Logout menu items (R10: Dashboard
   moved here from the shell header's "← Dashboard" link). Handlers are
   optional — without them the items render disabled (standalone demo /
   test harnesses). */
export function AvatarMenu({ user, onDashboard, onProfile, onSettings, onLogout }) {
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
          {item("Dashboard", onDashboard, "gd-avatar-dashboard")}
          {item("Profile", onProfile)}
          {item("Settings", onSettings, "gd-avatar-settings")}
          {item("Logout", onLogout, "gd-avatar-logout")}
        </div>
      )}
    </div>
  );
}

/* three little palette dots — the compact brand marker the old Brand
   button showed (kit dots fall back to the text color for the third) */
function PaletteDots({ colors, size = 8 }) {
  return (
    <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
      {(colors || []).slice(0, 3).map((c, i) => <span key={i} style={{ width: size, height: size, borderRadius: 2, background: c }} />)}
    </span>
  );
}

/* Brand switcher (R9w3) — compact dropdown of the user's SAVED brand kits
   (settings page). Selecting one calls onApplyKit(kit); "Manage brand
   kits…" calls onManage (→ /settings). Without kits the menu explains the
   flow and still offers the manage jump. defaultOpen only exists so the
   node SSR checks can render the open menu. */
export function BrandSwitcher({ brand, kits = [], onApplyKit, onManage, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  const list = Array.isArray(kits) ? kits : [];
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button className="gd-btn gd-brandswitch" aria-label="Brand kit switcher" aria-haspopup="menu" aria-expanded={open}
        title={`Brand: ${brand.name} — switch brand kit`}
        onClick={() => setOpen((v) => !v)}
        style={{ background: open ? C.bg3 : C.bg2, border: `1px solid ${open ? C.lineStrong : C.line}`, color: C.txt, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 7, fontSize: 12, maxWidth: 190 }}>
        <PaletteDots colors={brand.colors} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brand.name}</span>
        <span style={{ color: C.faint, fontSize: 9, transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}>▾</span>
      </button>
      {open && (
        <div role="menu" className="gd-brandswitch-menu"
          style={{ position: "absolute", top: 36, right: 0, minWidth: 224, maxWidth: 280, background: C.bg2, border: `1px solid ${C.lineStrong}`, borderRadius: 10, padding: 6, zIndex: 80, boxShadow: "0 10px 28px rgba(0,0,0,.5)" }}>
          <div style={{ padding: "5px 10px 7px", color: C.faint, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em" }}>BRAND KITS</div>
          {list.length === 0 && (
            <div data-empty="kits" style={{ padding: "4px 10px 9px", color: C.faint, fontSize: 11, lineHeight: 1.5 }}>
              No saved brand kits yet — create them in Settings, then switch between them here.
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {list.map((k) => {
              const active = brand && brand.id === `kit-${k.id}`;
              return (
                <button key={k.id} role="menuitem" data-kit={k.id} onClick={() => { setOpen(false); if (onApplyKit) onApplyKit(k); }}
                  className="gd-btn gd-kit-item" title={`Apply ${k.name} — palette + fonts`}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: 9, background: "transparent", border: "none", color: C.txt, borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12, textAlign: "left" }}>
                  <PaletteDots colors={[k.primary, k.accent, k.textColor]} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
                  <span style={{ color: C.faint, fontSize: 10, fontWeight: 500 }}>{k.headingFont}</span>
                  {active && <span data-active-kit style={{ color: C.amber, fontSize: 11, fontWeight: 800 }}>✓</span>}
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 5, paddingTop: 5 }}>
            <button role="menuitem" className="gd-btn gd-kit-manage" onClick={() => { setOpen(false); if (onManage) onManage(); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.dim, borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
              Manage brand kits…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* R10 slim top row: BrandMark + wordmark left · BrandSwitcher kept ·
   avatar account menu at the right end. 40px tall. */
export default function TopBar({ brand, brandKits, onApplyKit, onManageBrand, user, onDashboard, onProfile, onSettings, onLogout }) {
  return (
      <div className="gd-topbar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", height: 40, background: C.bg1, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <BrandMark />
        <div style={{ flex: 1 }} />
        <BrandSwitcher brand={brand} kits={brandKits} onApplyKit={onApplyKit} onManage={onManageBrand} />
        <AvatarMenu user={user} onDashboard={onDashboard} onProfile={onProfile} onSettings={onSettings} onLogout={onLogout} />
      </div>
  );
}
