/* Icons drawer — the admin-managed SVG icon library (GET /api/svg-icons,
   sanitized server-side before store). Search + category chips + a grid of
   cards; thumbs render as data-URI <img> (structurally inert — no inline-DOM
   surface). A click inserts the icon as a plain image layer at the standard
   insert size (8-way resize, export-safe — see engine/svgIcon.js). The list
   loads when the panel opens; failures render as a quiet empty state (demo
   shell without a session → sign-in hint). */
import React, { useEffect, useMemo, useState } from "react";
import { C, sectionLabel, inputStyle, chipStyle } from "../model.js";
import { svgDataUri } from "../../../engine/svgIcon.js";

const ART = 30;

function IconThumb({ icon }) {
  /* rendered as a data-URI <img> — structurally inert (no inline-DOM surface,
     so the thumb never depends on the sanitizer alone), same path the insert
     and the canvas/export rasterizer use */
  const src = useMemo(() => svgDataUri(icon.svg), [icon.svg]);
  return (
    <div style={{ width: ART, height: ART, margin: "0 auto", borderRadius: 7, background: C.bg0, border: `1px solid ${C.line}`, overflow: "hidden", padding: 5, boxSizing: "border-box", pointerEvents: "none" }}>
      <img src={src} alt={icon.name} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

export default function IconsPanel({ insertSvgIcon }) {
  const [icons, setIcons] = useState(null); /* null = loading */
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await fetch("/api/svg-icons", { credentials: "same-origin" });
        if (r.status === 401) { if (!dead) setErr("Sign in to load the icon library"); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = await r.json();
        if (!dead) setIcons(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!dead) setErr(`Couldn't load icons — ${e.message}`);
      }
    })();
    return () => { dead = true; };
  }, []);

  const cats = useMemo(() => [...new Set((icons || []).map((i) => i.category || "Icons"))], [icons]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (icons || []).filter((i) =>
      (cat === "All" || (i.category || "Icons") === cat) &&
      (!s || i.name.toLowerCase().includes(s) || (i.tags || []).some((t) => t.toLowerCase().includes(s))));
  }, [icons, q, cat]);

  return (
    <div className="gd-panel" data-icons-panel style={{ position: "absolute", left: 84, top: 12, width: 268, maxHeight: "calc(100% - 24px)", display: "flex", flexDirection: "column", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={sectionLabel}>Icons</span>
        <span style={{ fontSize: 9, color: C.dim }}>{icons ? `${icons.length} · admin library` : "loading…"}</span>
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons…" style={{ ...inputStyle, marginBottom: 8, padding: "5px 8px", fontSize: 11.5 }} />
      {cats.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 9 }}>
          {["All", ...cats].map((c) => (
            <button key={c} className="gd-btn" onClick={() => setCat(c)}
              style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10, borderColor: cat === c ? C.amber : C.line, color: cat === c ? C.amber : C.dim }}>{c}</button>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(58px, 1fr))", gap: 7, overflowY: "auto", paddingRight: 3 }}>
        {list.map((icon) => (
          <div key={icon.id} role="button" tabIndex={0} className="gd-btn" data-svg-icon-card={icon.id}
            title={`${icon.name} — click to insert`}
            onClick={() => insertSvgIcon?.(icon)}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); insertSvgIcon?.(icon); } }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 3px 5px", cursor: "pointer", overflow: "hidden" }}>
            <IconThumb icon={icon} />
            <span style={{ fontSize: 8, color: C.dim, textAlign: "center", lineHeight: 1.15, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{icon.name}</span>
          </div>
        ))}
        {icons && !list.length && <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.dim, textAlign: "center", padding: 20 }}>No icons match “{q}”.</div>}
        {icons && icons.length === 0 && <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.dim, textAlign: "center", padding: 20, lineHeight: 1.6 }}>The icon library is empty — an admin can add SVG icons from the backend.</div>}
        {err && <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.dim, textAlign: "center", padding: 20 }}>{err}</div>}
      </div>
    </div>
  );
}
