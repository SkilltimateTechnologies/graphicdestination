import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { FONTS } from "../components/editor/model.js";
import {
  TEXT_TIERS, TEXT_TIER_LABELS, DEFAULT_TEXT_STYLES, DEFAULT_KIT_COLORS,
  normalizeSettings, normalizeKit, defaultStageBg, useUserSettings,
} from "../lib/settings.js";

/* ============================================================
   SETTINGS — per-user brand kits, text styles and default stage
   background (R9w3). Reads/writes GET/PUT /api/settings through
   lib/settings.js; the same document drives the editor's brand
   switcher, the Text panel presets and new-project stage bg.
   ============================================================ */

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  danger: "#E5636A", success: "#3FB68B",
};

const CSS = `
  @keyframes gdSetIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .gd-set { animation: gdSetIn 160ms ease-out; }
  .gd-ghost { transition: background 120ms ease-out, border-color 120ms ease-out; }
  .gd-ghost:hover { background: ${T.hover}; }
  .gd-save { transition: background 120ms ease-out; }
  .gd-save:hover:not(:disabled) { background: ${T.accentDim}; }
  .gd-kit-card { transition: border-color 120ms ease-out; }
  .gd-kit-card:hover { border-color: ${T.accent}; }
  .gd-danger { transition: background 120ms ease-out; }
  .gd-danger:hover { background: rgba(229,99,106,0.12); }
  select, input[type="text"], input[type="number"] { background: ${T.raised}; border: 1px solid ${T.border}; color: ${T.text}; border-radius: 6px; padding: 6px 9px; font-size: 12px; outline: none; font-family: inherit; }
  input[type="color"] { border: none; background: none; width: 30px; height: 30px; padding: 0; cursor: pointer; }
  input[type="color"]::-webkit-color-swatch { border: 1px solid ${T.border}; border-radius: 6px; }
`;

const sectionLabel = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint };
const card = { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 };
const btn = { background: T.raised, border: `1px solid ${T.border}`, color: T.text, borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" };
const WEIGHTS = [400, 500, 600, 700, 800];
const PREVIEW_TEXT = "The quick brown fox jumps";

function newKit(n) {
  return normalizeKit({
    id: `k${Date.now().toString(36)}`,
    name: `Brand kit ${n}`,
    ...DEFAULT_KIT_COLORS,
    headingFont: DEFAULT_TEXT_STYLES.heading.fontFamily,
    bodyFont: DEFAULT_TEXT_STYLES.body.fontFamily,
  });
}

/* small logo chip: upload (≤100 KB data URL) + clear */
function LogoPicker({ kit, onChange }) {
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 100 * 1024) { setErr("Logo must be 100 KB or smaller."); return; }
    const rd = new FileReader();
    rd.onload = () => { setErr(""); onChange({ ...kit, logo: String(rd.result || "") }); };
    rd.onerror = () => setErr("Couldn't read that file.");
    rd.readAsDataURL(f);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={pick} />
      {kit.logo
        ? <img src={kit.logo} alt="" style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 7, background: T.canvas, border: `1px solid ${T.border}` }} />
        : <span style={{ width: 34, height: 34, borderRadius: 7, border: `1px dashed ${T.borderStrong}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.faint, fontSize: 15 }}>+</span>}
      <button className="gd-ghost" style={btn} onClick={() => fileRef.current && fileRef.current.click()}>{kit.logo ? "Replace logo" : "Upload logo"}</button>
      {kit.logo && <button className="gd-ghost" style={{ ...btn, color: T.dim }} onClick={() => onChange({ ...kit, logo: "" })}>Remove</button>}
      {err && <span style={{ color: T.danger, fontSize: 11 }}>{err}</span>}
      <span style={{ color: T.faint, fontSize: 10.5 }}>optional · ≤100 KB</span>
    </div>
  );
}

function KitEditor({ kit, onChange, onSave, onCancel }) {
  const set = (patch) => onChange({ ...kit, ...patch });
  const colorRow = (label, key) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.dim }}>
      <input type="color" value={kit[key]} onChange={(e) => set({ [key]: e.target.value })} aria-label={label} />
      <span style={{ width: 74 }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: T.faint }}>{kit[key]}</span>
    </label>
  );
  const fontRow = (label, key) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.dim }}>
      <span style={{ width: 104 }}>{label}</span>
      <select value={kit[key]} onChange={(e) => set({ [key]: e.target.value })} aria-label={label} style={{ flex: 1 }}>
        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
    </label>
  );
  return (
    <div className="gd-set" style={{ background: T.raised, border: `1px solid ${T.borderStrong}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ ...sectionLabel }}>Kit name</span>
        <input type="text" value={kit.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label="Kit name" style={{ flex: 1, fontWeight: 600 }} />
      </div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
        {colorRow("Primary", "primary")}
        {colorRow("Accent", "accent")}
        {colorRow("Text color", "textColor")}
      </div>
      {fontRow("Heading font", "headingFont")}
      {fontRow("Body font", "bodyFont")}
      <LogoPicker kit={kit} onChange={onChange} />
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <button className="gd-save" onClick={onSave} disabled={!kit.name.trim()}
          style={{ ...btn, background: T.accent, border: "none", color: "#1A1405", fontWeight: 700, opacity: kit.name.trim() ? 1 : 0.5 }}>
          Save kit
        </button>
        <button className="gd-ghost" style={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { settings, save, remote } = useUserSettings();

  const [doc, setDoc] = useState(() => normalizeSettings(settings));
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState(""); // "" | "saving" | "saved" | "local" | "error"
  const [saveErr, setSaveErr] = useState("");
  const [editing, setEditing] = useState(null); // kit being edited (null = closed)

  /* adopt the server document as long as the user hasn't started editing */
  useEffect(() => {
    if (!dirtyRef.current) setDoc(normalizeSettings(settings));
  }, [settings]);

  const update = (patch) => {
    dirtyRef.current = true;
    setDirty(true);
    setSaveState("");
    setDoc((d) => ({ ...d, ...patch }));
  };

  /* ---------- brand kits CRUD ---------- */
  const saveKit = () => {
    if (!editing || !editing.name.trim()) return;
    const kit = normalizeKit(editing);
    const exists = doc.brandKits.some((k) => k.id === kit.id);
    update({ brandKits: exists ? doc.brandKits.map((k) => (k.id === kit.id ? kit : k)) : [...doc.brandKits, kit] });
    setEditing(null);
  };
  const deleteKit = (id) => {
    if (!window.confirm("Delete this brand kit? Projects that already applied it keep their copy.")) return;
    update({ brandKits: doc.brandKits.filter((k) => k.id !== id) });
    if (editing && editing.id === id) setEditing(null);
  };

  /* ---------- save ---------- */
  const doSave = async () => {
    setSaveState("saving");
    setSaveErr("");
    const result = await save(doc);
    dirtyRef.current = false;
    setDirty(false);
    if (result.ok) setSaveState("saved");
    else {
      setSaveState("local");
      setSaveErr(result.error || "Saved locally only.");
    }
  };

  const doLogout = async () => { await logout(); navigate("/login"); };
  const tiers = useMemo(() => TEXT_TIERS.map((id) => ({ id, label: TEXT_TIER_LABELS[id] })), []);
  const setTier = (tier, patch) => update({ textStyles: { ...doc.textStyles, [tier]: { ...((doc.textStyles || {})[tier] || DEFAULT_TEXT_STYLES[tier]), ...patch } } });
  const bgSelected = doc.defaultBg; // null = none selected → new projects start black

  return (
    <div style={{ minHeight: "100vh", background: T.canvas, color: T.text, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13 }}>
      <style>{CSS}</style>
      {/* header — same 44px bar as the dashboard */}
      <div style={{ height: 44, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "0 14px", background: T.panel, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link to="/dashboard" style={{ color: T.dim, textDecoration: "none", fontSize: 12.5, fontWeight: 600 }}>← Dashboard</Link>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Settings</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          <span style={{ color: T.text, fontWeight: 600, fontSize: 12.5 }}>{user && user.username}</span>
          <button onClick={doLogout} className="gd-ghost" style={{ ...btn, background: "transparent" }}>Sign out</button>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 18px 90px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* ============ BRAND KITS ============ */}
        <section style={card} data-section="brand-kits">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <span style={sectionLabel}>Brand kits</span>
            <button className="gd-ghost" style={{ ...btn, marginLeft: "auto" }} onClick={() => setEditing(newKit(doc.brandKits.length + 1))} data-action="new-kit">+ New kit</button>
          </div>
          <p style={{ color: T.faint, fontSize: 11.5, lineHeight: 1.55, margin: "0 0 14px" }}>
            Saved palettes + fonts. Apply one inside the editor from the <strong style={{ color: T.dim }}>brand switcher</strong> in the top bar — its palette becomes the app swatches and new text uses its fonts.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {doc.brandKits.length === 0 && !editing && (
              <div style={{ color: T.faint, fontSize: 12, border: `1px dashed ${T.borderStrong}`, borderRadius: 9, padding: "14px 12px", textAlign: "center" }} data-empty="kits">
                No brand kits yet — create one and it appears in the editor's brand switcher.
              </div>
            )}
            {doc.brandKits.map((k) => (
              <div key={k.id} className="gd-kit-card" data-kit={k.id} style={{ display: "flex", alignItems: "center", gap: 12, background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px" }}>
                {k.logo
                  ? <img src={k.logo} alt="" style={{ width: 30, height: 30, objectFit: "contain", borderRadius: 7, background: T.canvas, border: `1px solid ${T.border}`, flexShrink: 0 }} />
                  : null}
                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {[k.primary, k.accent, k.textColor].map((c, i) => <span key={i} title={c} style={{ width: 14, height: 14, borderRadius: 4, background: c, border: `1px solid ${T.borderStrong}` }} />)}
                </span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</div>
                  <div style={{ color: T.faint, fontSize: 10.5 }}>{k.headingFont} · {k.bodyFont}</div>
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="gd-ghost" style={{ ...btn, padding: "5px 11px" }} onClick={() => setEditing({ ...k })} data-action="edit-kit">Edit</button>
                  <button className="gd-danger" style={{ ...btn, padding: "5px 11px", color: T.danger }} onClick={() => deleteKit(k.id)} data-action="delete-kit">Delete</button>
                </span>
              </div>
            ))}
            {editing && <KitEditor kit={editing} onChange={setEditing} onSave={saveKit} onCancel={() => setEditing(null)} />}
          </div>
        </section>

        {/* ============ TEXT STYLES ============ */}
        <section style={card} data-section="text-styles">
          <span style={sectionLabel}>Text styles</span>
          <p style={{ color: T.faint, fontSize: 11.5, lineHeight: 1.55, margin: "6px 0 14px" }}>
            What headings and normal text should look like — the editor's Text panel presets (Heading / Subheading / Normal / Caption) insert with these fonts and sizes.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tiers.map(({ id, label }) => {
              const tier = (doc.textStyles && doc.textStyles[id]) || DEFAULT_TEXT_STYLES[id];
              return (
                <div key={id} data-tier={id} style={{ display: "grid", gridTemplateColumns: "86px 1fr 74px 92px", gap: 8, alignItems: "center", background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px" }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{label}</span>
                  <select value={tier.fontFamily} onChange={(e) => setTier(id, { fontFamily: e.target.value })} aria-label={`${label} font`}>
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, color: T.faint, fontSize: 11 }}>
                    <input type="number" min={6} max={400} value={tier.fontSize} onChange={(e) => setTier(id, { fontSize: Number(e.target.value) })} aria-label={`${label} size`} style={{ width: 52 }} />
                    px
                  </label>
                  <select value={tier.fontWeight} onChange={(e) => setTier(id, { fontWeight: Number(e.target.value) })} aria-label={`${label} weight`}>
                    {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <div style={{ gridColumn: "1 / -1", color: T.dim, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontFamily: `'${tier.fontFamily}'`, fontWeight: tier.fontWeight, fontSize: Math.min(34, Math.max(13, tier.fontSize * 0.45)), lineHeight: 1.3 }} data-tier-preview={id}>
                    {PREVIEW_TEXT}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ============ DEFAULT BACKGROUND ============ */}
        <section style={card} data-section="default-bg">
          <span style={sectionLabel}>Default background</span>
          <p style={{ color: T.faint, fontSize: 11.5, lineHeight: 1.55, margin: "6px 0 14px" }}>
            New projects start with this stage background. If none is selected it will be black.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ width: 54, height: 38, borderRadius: 8, background: defaultStageBg(doc), border: `1px solid ${T.borderStrong}`, display: "inline-block" }} data-bg-preview />
            <input type="color" value={bgSelected || "#000000"} onChange={(e) => update({ defaultBg: e.target.value })} aria-label="Default background color" />
            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11.5, color: T.dim }}>{defaultStageBg(doc)}</span>
            {bgSelected
              ? <button className="gd-ghost" style={btn} onClick={() => update({ defaultBg: null })} data-action="clear-bg">Clear (use black)</button>
              : <span style={{ color: T.faint, fontSize: 11.5 }} data-bg-none>none selected — new projects start black</span>}
          </div>
        </section>

        {/* ============ SAVE BAR ============ */}
        <div style={{ position: "sticky", bottom: 14, display: "flex", alignItems: "center", gap: 12, background: T.panel, border: `1px solid ${T.borderStrong}`, borderRadius: 12, padding: "12px 16px", boxShadow: "0 10px 28px rgba(0,0,0,.45)" }}>
          <button className="gd-save" onClick={doSave} disabled={!dirty || saveState === "saving"} data-action="save-settings"
            style={{ ...btn, background: T.accent, border: "none", color: "#1A1405", fontWeight: 700, padding: "8px 18px", opacity: dirty && saveState !== "saving" ? 1 : 0.55 }}>
            {saveState === "saving" ? "Saving…" : "Save settings"}
          </button>
          {saveState === "saved" && <span style={{ color: T.success, fontSize: 12, fontWeight: 600 }} data-save-state="saved">Saved{remote === false ? " locally — will sync when you're signed in" : " to your account"}</span>}
          {saveState === "local" && <span style={{ color: T.danger, fontSize: 12 }} data-save-state="local">Saved locally only — {saveErr}</span>}
          {!dirty && !saveState && <span style={{ color: T.faint, fontSize: 11.5 }}>Brand kits, text styles and the default background apply across the editor.</span>}
        </div>
      </div>
    </div>
  );
}
