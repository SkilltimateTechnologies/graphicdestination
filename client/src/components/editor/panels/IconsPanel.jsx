import React, { useEffect, useMemo, useState } from "react";
import { ICONS, ICON_CATS, KIT_COLORS, frameOf } from "../../../engine/kits.js";
import { StageObject } from "../../StageObject.jsx";
import { C, inputStyle, chipStyle, sectionLabel } from "../model.js";

/* live thumbnail of a kit build — animated variants tick with playTime,
   static variants freeze on their (identical) still frame */
const KitThumb = React.memo(function KitThumb({ kit, variant, time }) {
  const clip = useMemo(() => kit.build({ variant }), [kit, variant]);
  const frame = useMemo(() => frameOf(clip), [clip]);
  const scale = Math.min(56 / frame.w, 56 / frame.h, 0.5);
  const t = variant === "static" ? 0 : time;
  return (
    <div style={{ width: 58, height: 58, borderRadius: 9, background: C.bg1, border: `1px solid ${C.line}`, overflow: "hidden", position: "relative", flex: "0 0 auto" }}>
      <div style={{ position: "absolute", left: 29 - frame.x * scale, top: 29 - frame.y * scale, width: frame.w * scale, height: frame.h * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: frame.w, height: frame.h, position: "relative" }}>
          <StageObject obj={clip} time={t} stage={{ w: 1280, h: 720 }} selected={false} interactive={false} />
        </div>
      </div>
    </div>
  );
});

export default function IconsPanel({ iconQ, setIconQ, iconCat, setIconCat, insertKitClip }) {
  const [variant, setVariant] = useState("animated"); /* "animated" | "static" */
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (variant === "static") return undefined; /* stills never tick */
    let raf, last = performance.now(), t = 0;
    const tick = (now) => { t += Math.min(100, now - last); last = now; setTime(t); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [variant]);
  const list = useMemo(() => {
    const q = iconQ.trim().toLowerCase();
    return ICONS.filter((k) =>
      (iconCat === "All" || k.category === iconCat) &&
      (!q || k.name.toLowerCase().includes(q) || k.tags.some((t) => t.includes(q))));
  }, [iconQ, iconCat]);
  const insert = (k, color) => insertKitClip(k, color ? { variant, color } : { variant });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={sectionLabel}>Icons · {ICONS.length} flat</span>
        <span style={{ fontSize: 9, color: C.dim }}>{variant === "animated" ? "looping motion" : "still art"}</span>
      </div>
      {/* Animated | Static segmented toggle */}
      <div style={{ display: "flex", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 2, marginBottom: 8, gap: 2 }}>
        {[["animated", "Animated"], ["static", "Static"]].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVariant(v)}
            style={{
              flex: 1, height: 24, borderRadius: 6, border: "none", cursor: "pointer",
              fontSize: 10.5, fontWeight: variant === v ? 700 : 500, letterSpacing: 0.3,
              background: variant === v ? C.amber : "transparent",
              color: variant === v ? "#1A1405" : C.dim,
              transition: "background .15s, color .15s",
            }}
          >{label}</button>
        ))}
      </div>
      <input value={iconQ} onChange={(e) => setIconQ(e.target.value)} placeholder="Search icons…" style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {["All", ...ICON_CATS].map((c) => (
          <button key={c} onClick={() => setIconCat(c)} style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10.5, borderColor: iconCat === c ? C.amber : C.line, color: iconCat === c ? C.amber : C.dim }}>{c}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map((k) => (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 10, background: C.bg2, border: `1px solid ${C.line}` }}>
            <KitThumb kit={k} variant={variant} time={time} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.name}</div>
              <div style={{ fontSize: 9, color: C.dim }}>{k.category}{variant === "animated" ? ` · ${k.recipe}` : " · still"}</div>
            </div>
            <button onClick={() => insert(k)} style={{ height: 24, padding: "0 10px", borderRadius: 7, border: "none", background: C.amber, color: "#1A1405", fontSize: 10.5, fontWeight: 700, cursor: "pointer", flex: "0 0 auto" }}>Add</button>
            <div style={{ display: "flex", gap: 3, flex: "0 0 auto" }}>
              {KIT_COLORS.map((col) => (
                <button key={col} onClick={() => insert(k, col)} title={`Insert tinted ${col}`} style={{ width: 13, height: 13, borderRadius: 4, background: col, border: `1px solid ${C.line}`, cursor: "pointer", padding: 0 }} />
              ))}
            </div>
          </div>
        ))}
        {!list.length && <div style={{ fontSize: 10.5, color: C.dim, textAlign: "center", padding: 12 }}>No icons match.</div>}
      </div>
      <div style={{ fontSize: 9.5, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
        Flat colored icons, Jitter-style motion grammar — {variant === "animated" ? "pop in, signature loop, whip out" : "identical art, zero animation tracks"}. Seeded-deterministic, structurally seamless, loops forever.
      </div>
    </div>
  );
}
