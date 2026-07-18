/* Backgrounds drawer — 11 animated, seamlessly-looping backdrop layers.
   Every card shows a LIVE animated thumbnail: the SAME StageObject/backdrop
   render the stage and the export use (engine/backdrops.js), driven by a
   shared 120ms ticker at 112×63. Click a card to insert with the default
   theme (Amber Dusk); click a theme dot on the card to insert with that
   theme instead. The theme rows below recolor the currently selected
   backdrop layer. When the selected backdrop is the PROCEDURAL flagship,
   an extra section exposes its recipe: 3 gradient stop colors (palette
   slots PROCEDURAL_STOPS) + the column count (3–8). Inserts land at the
   BOTTOM of the layer stack (addBackdrop in GraphicDestinationMotion.jsx). */
import { useEffect, useState } from "react";
import { C, sectionLabel } from "../model";
import { StageObject } from "../../StageObject";
import { BACKDROP_VARIANTS, BACKDROP_THEMES, DEFAULT_BACKDROP_THEME, BACKDROP_COLUMNS_MIN, BACKDROP_COLUMNS_MAX, PROCEDURAL_STOPS, backdropDefaults, clampColumns } from "../../../engine/backdrops.js";

const THUMB_W = 112, THUMB_H = 63;

/* one shared ticker for the whole panel — every card animates off the
   same interval (preview-only wall-clock; the engine stays pure f(time)) */
function usePreviewTime() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setT((v) => (v + 120) % 8000), 120);
    return () => clearInterval(iv);
  }, []);
  return t;
}

function Thumb({ variant, themeId, time }) {
  const obj = {
    id: `bdthumb-${variant}-${themeId}`, type: "backdrop", name: "thumb", tracks: {}, locked: false, hidden: false,
    props: { x: THUMB_W / 2, y: THUMB_H / 2, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", w: THUMB_W, h: THUMB_H, inT: 0, outT: null, path: null, prog: 0, ...backdropDefaults(variant, themeId) },
  };
  return <StageObject obj={obj} time={time} stage={{ w: THUMB_W, h: THUMB_H }} selected={false} interactive={false} />;
}

/* 5-dot theme picker on each card — hover previews the theme in the card
   thumbnail, click inserts the variant with that theme */
function ThemeDots({ activeId, onPick, onHover }) {
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
      {BACKDROP_THEMES.map((t) => (
        <span key={t.id} title={`Insert with ${t.name}`}
          onClick={(e) => { e.stopPropagation(); onPick(t.id); }}
          onPointerEnter={() => onHover(t.id)} onPointerLeave={() => onHover(null)}
          style={{ width: 12, height: 12, borderRadius: "50%", cursor: "pointer", flexShrink: 0, background: `linear-gradient(135deg, ${t.colors[1]}, ${t.colors[2]} 55%, ${t.colors[3]})`, border: `1.5px solid ${activeId === t.id ? C.amber : "rgba(255,255,255,.18)"}`, boxSizing: "border-box" }} />
      ))}
    </div>
  );
}

/* procedural flagship recipe controls — 3 gradient stop colors (the
   palette slots the column gradient reads, top → bottom) + column count */
function ProceduralSection({ selBd, patchProps }) {
  const labels = ["Top stop", "Mid stop", "Bottom stop"];
  const colors = selBd.props.colors || [];
  const setStop = (slot, value) => {
    const next = [...colors];
    next[slot] = value;
    patchProps(selBd.id, { colors: next });
  };
  const cols = clampColumns(selBd.props.columns);
  return (
    <>
      <div style={{ ...sectionLabel, margin: "12px 0 7px" }}>Procedural recipe · “{selBd.name}”</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {PROCEDURAL_STOPS.map((slot, i) => (
          <div key={slot} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="color" value={colors[slot] || "#000000"} onChange={(e) => setStop(slot, e.target.value)} title={`${labels[i]} — recolors every column`} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: C.dim }}>{labels[i]}</span>
            <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono'", fontSize: 10, color: C.faint }}>{(colors[slot] || "").toUpperCase()}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: C.dim }}>Columns</span>
          <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
            {Array.from({ length: BACKDROP_COLUMNS_MAX - BACKDROP_COLUMNS_MIN + 1 }, (_, k) => BACKDROP_COLUMNS_MIN + k).map((n) => (
              <button key={n} className="gd-btn" title={`${n} columns`} onClick={() => patchProps(selBd.id, { columns: n })}
                style={{ width: 22, height: 20, fontSize: 10, fontFamily: "'JetBrains Mono'", background: C.bg1, border: `1px solid ${cols === n ? C.amber : C.line}`, borderRadius: 5, color: cols === n ? C.amber : C.dim, cursor: "pointer" }}>{n}</button>
            ))}
          </div>
        </div>
        <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5 }}>Columns scroll on per-column smooth noise, alternating direction — the Jitter-style procedural gradient.</div>
      </div>
    </>
  );
}

export default function BackgroundsPanel({ addBackdrop, sel, patchProps }) {
  const [hoverTheme, setHoverTheme] = useState(null); /* per-panel dot hover → thumb preview */
  const time = usePreviewTime();
  const selBd = sel && sel.type === "backdrop" ? sel : null;
  return (
    <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 268, maxHeight: "calc(100% - 24px)", overflowY: "auto", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
      <div style={{ ...sectionLabel, marginBottom: 4 }}>Backgrounds · animated, loops seamlessly</div>
      <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginBottom: 10 }}>Click a card to insert behind everything (bottom of the stack). Dots insert with a theme.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {BACKDROP_VARIANTS.map((v) => {
          const previewTheme = hoverTheme || DEFAULT_BACKDROP_THEME;
          return (
            <button key={v.id} className="gd-btn" title={`${v.name} — ${v.blurb}. Click to insert (Amber Dusk).`}
              onClick={() => addBackdrop(v.id, DEFAULT_BACKDROP_THEME)}
              style={{ background: C.bg1, border: `1px solid ${selBd?.props.variant === v.id ? C.amber : C.line}`, borderRadius: 8, padding: 5, cursor: "pointer", textAlign: "left" }}>
              <span style={{ display: "block", position: "relative", width: THUMB_W, height: THUMB_H, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, pointerEvents: "none", background: "#0A0C10" }}>
                <Thumb variant={v.id} themeId={previewTheme} time={time} />
              </span>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.txt, marginTop: 5 }}>{v.name}</span>
              <ThemeDots activeId={selBd?.props.variant === v.id ? selBd.props.theme : null} onPick={(tid) => addBackdrop(v.id, tid)} onHover={setHoverTheme} />
            </button>
          );
        })}
      </div>
      {selBd?.props.variant === "procedural" && <ProceduralSection selBd={selBd} patchProps={patchProps} />}
      <div style={{ ...sectionLabel, margin: "12px 0 7px" }}>Themes {selBd ? `· recolor “${selBd.name}”` : ""}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {BACKDROP_THEMES.map((t) => {
          const on = selBd?.props.theme === t.id;
          return (
            <button key={t.id} className="gd-btn" title={selBd ? `Apply ${t.name} to the selected backdrop` : `Insert a backdrop, then recolor it here (${t.name})`}
              onClick={() => { if (selBd) patchProps(selBd.id, { theme: t.id, colors: [...t.colors] }); }}
              style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg1, border: `1px solid ${on ? C.amber : C.line}`, borderRadius: 7, padding: "5px 8px", cursor: selBd ? "pointer" : "default", opacity: selBd ? 1 : 0.75, textAlign: "left" }}>
              <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {t.colors.map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 4, background: c, border: "1px solid rgba(255,255,255,.14)" }} />)}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: on ? C.amber : C.dim }}>{t.name}{t.id === DEFAULT_BACKDROP_THEME ? " · default" : ""}</span>
            </button>
          );
        })}
      </div>
      <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginTop: 9 }}>Pure timeline-driven motion (speed × loop length in the Inspector) — exported videos loop cleanly with no jump.</div>
    </div>
  );
}
