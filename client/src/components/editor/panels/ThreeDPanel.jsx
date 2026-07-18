/* 3D drawer — four fake-3D (2.5D) widgets built from plain 2D primitives
   (NO Three.js/WebGL). Every widget inserts as ONE editable clip at the
   comp start (double-click it to open the timeline and edit its parts),
   through the same addObject("clip", …) path as every other insert.
   Widget specs come from the pure engine (engine/threed.js); glyphs are
   18×18 stroke icons in the design system's 1.5px style. Mirrors the
   ConfettiPanel close-on-insert behavior. */
import { C, sectionLabel } from "../model";
import { THREED_WIDGETS, buildThreedWidget } from "../../../engine/threed.js";

/* tiny 18×18 glyphs, one per widget id */
function Glyph({ id }) {
  const s = { fill: "none", stroke: C.dim, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (id) {
    case "photoStack": /* stacked photo layers */
      return (<svg width="18" height="18" viewBox="0 0 18 18"><rect x="4.5" y="4.5" width="10" height="10" rx="1.5" {...s} /><path d="M7 4.5V3.6a1.1 1.1 0 0 1 1.1-1.1h5.3a1.1 1.1 0 0 1 1.1 1.1v5.3a1.1 1.1 0 0 1-1.1 1.1h-.9" {...s} /><circle cx="7.7" cy="7.6" r="1.1" {...s} /><path d="M4.5 12.6l3-3 2.2 2.2 2-2 2.8 2.8" {...s} /></svg>);
    case "tiltCard": /* tilted card + shadow */
      return (<svg width="18" height="18" viewBox="0 0 18 18"><g transform="rotate(-8 9 8.5)"><rect x="3.2" y="4" width="11.6" height="8.6" rx="1.6" {...s} /><path d="M5.6 7h4.4M5.6 9.6h2.8" {...s} /></g><ellipse cx="9" cy="15.4" rx="5.4" ry="1.1" {...s} strokeOpacity="0.55" /></svg>);
    case "isoCube": /* isometric cube: hexagon split in 3 rhombi */
      return (<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1.8l6.2 3.6v7.2L9 16.2l-6.2-3.6V5.4z" {...s} /><path d="M9 9V16.2M9 9L2.8 5.4M9 9l6.2-3.6" {...s} /></svg>);
    case "extrudeText": /* T with stepped extrusion */
      return (<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3.5 4.5h8M7.5 4.5v8" {...s} /><path d="M6.5 14.5h6M12.5 14.5V7l-2.5-2.5" {...s} strokeOpacity="0.55" /><path d="M8.5 16h6M14.5 16V8.5L12 6" {...s} strokeOpacity="0.3" /></svg>);
    default:
      return null;
  }
}

export default function ThreeDPanel({ addObject, setThreeDOpen, mkId, stage, ctxDur }) {
  /* insert via the standard clip path: buildThreedWidget ships the full
     { name, children, props } spec — children get fresh editor ids from
     the app's own uid factory (mkId), the clip spans the whole comp. */
  const insert = (w) => {
    addObject("clip", buildThreedWidget(w.id, { uid: mkId, stage, accent: C.amber, dur: ctxDur }));
    setThreeDOpen(false);
  };
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 264, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>3D · fake-3D widgets — insert as editable clips</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {THREED_WIDGETS.map((w) => (
                <button key={w.id} className="gd-btn" title={`Add ${w.name} — double-click the clip on stage to edit its parts`} onClick={() => insert(w)}
                  style={{ display: "flex", alignItems: "center", gap: 9, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 9px", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 6, background: C.bg2, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Glyph id={w.id} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: C.txt }}>{w.name}</span>
                    <span style={{ display: "block", fontSize: 9.5, color: C.faint, lineHeight: 1.4, marginTop: 2 }}>{w.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
            <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginTop: 9 }}>No WebGL — every widget is layered 2D layers you can re-time, recolor and keyframe. Photo Depth Stack is pre-wired for camera parallax (Depth).</div>
          </div>
  );
}
