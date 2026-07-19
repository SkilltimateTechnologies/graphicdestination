/* ============================================================
   TOP BAR — breadcrumbs, stage preset, brand switcher, account avatar.
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
   R9w3: the Brand button + modal are GONE (user request — brand settings
   live on the /settings page now). In their place a compact BRAND
   SWITCHER dropdown lists the user's saved brand kits; picking one
   applies it to the current project through the same mechanism the old
   dialog used (its palette becomes the app swatches, new text layers use
   its fonts), and "Manage brand kits…" jumps to /settings.
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

export default function TopBar({ exitToDepth, inClip, ctx, stage, applyStagePreset, stageIsPreset, brand, brandKits, onApplyKit, onManageBrand, user, onProfile, onLogout }) {
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
        {/* R9w3: brand switcher replaces the old Brand button/modal — the
            user's saved kits apply straight to the current project. */}
        <BrandSwitcher brand={brand} kits={brandKits} onApplyKit={onApplyKit} onManage={onManageBrand} />
        {/* account avatar (R9w1) — sits where Export used to be; Export moved
            to the timeline transport bar beside Save. */}
        <AvatarMenu user={user} onProfile={onProfile} onLogout={onLogout} />
      </div>
  );
}
