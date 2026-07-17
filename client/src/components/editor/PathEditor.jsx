/* ============================================================
   PATH EDITOR OVERLAY — extracted VERBATIM from GraphicDestinationMotion.jsx
   ============================================================ */
import { pathSamples } from "../../engine/shapes.js";

export function PathEditor({ obj, onPtDown, patchPath, locked }) {
  const path = obj.props.path;
  const sp = pathSamples(path);
  const d = sp.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none", zIndex: 60 }}>
      <path d={d} fill="none" stroke="#6EE7B7" strokeOpacity={0.35} strokeWidth={5} />
      <path d={d} fill="none" stroke="#6EE7B7" strokeWidth={1.5} strokeDasharray="6 6" />
      {!locked && path.pts.map((p, i) => (
        <g key={i} style={{ pointerEvents: "auto" }}>
          <circle cx={p[0]} cy={p[1]} r={13} fill="transparent" style={{ cursor: "grab" }}
            onPointerDown={(e) => { e.stopPropagation(); onPtDown(e, obj.id, i); }}
            onDoubleClick={() => path.pts.length > 2 && patchPath(obj.id, (pp) => ({ ...pp, pts: pp.pts.filter((_, j) => j !== i) }))} />
          <circle cx={p[0]} cy={p[1]} r={6.5} fill="#0A0C10" stroke="#6EE7B7" strokeWidth={2.5} style={{ pointerEvents: "none" }} />
        </g>
      ))}
      {!locked && path.pts.slice(0, -1).map((p, i) => {
        const q = path.pts[i + 1];
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        return (
          <g key={"m" + i} style={{ pointerEvents: "auto", cursor: "copy" }}
            onPointerDown={(e) => { e.stopPropagation(); patchPath(obj.id, (pp) => { const pts = [...pp.pts]; pts.splice(i + 1, 0, [Math.round(mx), Math.round(my)]); return { ...pp, pts }; }); }}>
            <circle cx={mx} cy={my} r={8} fill="#10131A" stroke="#6EE7B7" strokeWidth={1.5} strokeOpacity={0.7} />
            <text x={mx} y={my + 3.5} textAnchor="middle" fill="#6EE7B7" fontSize={11} fontWeight={700} style={{ pointerEvents: "none" }}>+</text>
          </g>
        );
      })}
    </svg>
  );
}
