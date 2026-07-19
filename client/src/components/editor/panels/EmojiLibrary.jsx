/* Emoji library — the full searchable overlay opened from the compact
   EmojiPanel. All 169 Fluent 3D "Smileys & Emotion" emoji in a big grid with
   search, sub-category chips and an Animated/Static toggle. Clicking a card
   inserts the emoji as one movable clip and closes the modal.

   Overlay conventions match ExportDialog: fixed inset, backdrop click + Escape
   to close, high z-index. */
import React, { useEffect, useMemo, useState } from "react";
import { EMOJIS, EMOJI_CATS } from "../../../engine/emoji.js";
import { C, inputStyle, chipStyle } from "../model.js";
import { EmojiThumb } from "./EmojiPanel.jsx";

export default function EmojiLibrary({ open, onClose, insertEmojiClip }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [variant, setVariant] = useState("animated");

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return EMOJIS.filter((e) =>
      (cat === "All" || e.category === cat) &&
      (!s || e.name.toLowerCase().includes(s) || e.tags.some((t) => t.includes(s))));
  }, [q, cat]);

  if (!open) return null;
  const pick = (e) => { insertEmojiClip(e, { variant }); onClose?.(); };

  return (
    <div onPointerDown={() => onClose?.()}
      style={{ position: "fixed", inset: 0, zIndex: 320, background: "rgba(10,12,16,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Emoji library"
        style={{ width: "min(760px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: 18 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.txt }}>Emoji library</div>
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 2 }}>Microsoft Fluent Emoji (3D) · {EMOJIS.length} · click to add</div>
          </div>
          <button className="gd-btn" onClick={() => onClose?.()} title="Close (Esc)"
            style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.line}`, background: C.bg1, color: C.dim, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        {/* controls */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji…" style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
          <div style={{ display: "flex", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 2, gap: 2 }}>
            {[["animated", "Animated"], ["static", "Static"]].map(([v, label]) => (
              <button key={v} onClick={() => setVariant(v)}
                style={{ padding: "0 12px", height: 26, borderRadius: 6, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: variant === v ? 700 : 500, background: variant === v ? C.amber : "transparent", color: variant === v ? "#1A1405" : C.dim }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
          {["All", ...EMOJI_CATS].map((c) => (
            <button key={c} className="gd-btn" onClick={() => setCat(c)}
              style={{ ...chipStyle, cursor: "pointer", padding: "4px 11px", fontSize: 11, borderColor: cat === c ? C.amber : C.line, color: cat === c ? C.amber : C.dim }}>{c}</button>
          ))}
        </div>
        {/* grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(66px, 1fr))", gap: 9, overflowY: "auto", paddingRight: 4 }}>
          {list.map((e) => (
            <div key={e.id} role="button" tabIndex={0} className="gd-btn gd-emoji-card" data-emoji-card={e.id}
              title={`${e.name} — ${e.recipe}`}
              onClick={() => pick(e)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(e); } }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 4px 6px", cursor: "pointer", overflow: "hidden" }}>
              <EmojiThumb emoji={e} variant={variant} art={44} />
              <span style={{ fontSize: 8.5, color: C.dim, textAlign: "center", lineHeight: 1.15, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{e.name}</span>
            </div>
          ))}
          {!list.length && <div style={{ gridColumn: "1 / -1", fontSize: 12, color: C.dim, textAlign: "center", padding: 24 }}>No emoji match “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}
