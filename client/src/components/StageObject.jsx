/* ============================================================
   STAGE OBJECT (recursive renderer) + map effect helpers.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2);
   GraphicDestinationMotion.jsx re-exports StageObject from here.
   ============================================================ */
import { C } from "./editor/model";
import { LockIcon } from "./editor/ui";
import { EASE, clamp01 } from "../engine/easing.js";
import { ptsToStr, pathSamples, pointOnPath, morphPtsAt } from "../engine/shapes.js";
import { valueAt, colorAt, lerpColor, clipLocalTime, clipTransition } from "../engine/keyframes.js";
import { cameraTransform, camTransformCss } from "../engine/camera.js";
import { blurCss, blendCss } from "../engine/filters.js";
import { MAPS, WORLD_H, CONTINENTS, WORLD_EXT, ringsToPath, arcPath, mapBox, WORLD_D, normHi } from "../engine/maps.js";
import { CONFETTI_STYLES, confettiStyleOf, confettiLife, confettiParticles, charFx, numberValue, numberColumns, formatNumber, contrastOn, chartModel, highlightFlick, worldCameraAt, cdStyleOf, countdownFraction, counterStyleOf, counterModel } from "../engine/fx.js";
import { backdropModel } from "../engine/backdrops.js";

/* ---------- on-canvas selection handles (direct manipulation) ----------
   Rendered inside the SAME transformed wrapper as the selection outline, so they
   track position/rotation/scale for free. `u = 1/stageScale` counter-scales them
   so grips stay ~8px on screen at any zoom. Base-prop edits only (w/h, the map
   types' `w`, fontSize for text/number, rotation) — keyframe tracks untouched. */
const RESIZE_CURSORS = ["ew", "nwse", "ns", "nesw"]; /* indexed by drag-axis angle: 0°, 45°, 90°, 135° (mod 180°) */
const resizeCursor = (axis, rot) => RESIZE_CURSORS[Math.round(((((axis + rot) % 180) + 180) % 180) / 45) % 4] + "-resize";
const HANDLE_DEFS = [ /* [id, left, top, drag-axis°] — corners + edge midpoints */
  ["nw", "0%", "0%", 45], ["n", "50%", "0%", 90], ["ne", "100%", "0%", 135], ["e", "100%", "50%", 0],
  ["se", "100%", "100%", 45], ["s", "50%", "100%", 90], ["sw", "0%", "100%", 135], ["w", "0%", "50%", 0],
];
const CLIP_CORNER_DEFS = [ /* clip scale grips — corner grips only (uniform scale, no Shift) */
  ["nw", "0%", "0%", 45], ["ne", "100%", "0%", 135], ["se", "100%", "100%", 45], ["sw", "0%", "100%", 135],
];
const ROTATE_OFFSET = 22; /* screen px the rotation grip floats above top-center */

/* stroke-only arc (maps.js arcPath closes to the center for pie wedges —
   gauges need the open arc). Angles in degrees, 0° = +x, positive = clockwise. */
function arcStrokeD(cx, cy, r, a0, a1) {
  const rad = (a) => (a * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  const laf = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${laf} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/* box styling for text/number layers */
function boxStyleOf(P, time) {
  if (!P.bg && !P.borderW) return null;
  const gc = P.borderC || P.bg || "#FFB224";
  const glow = P.boxFx === "glow" ? `0 0 16px ${gc}99, 0 0 40px ${gc}44`
    : P.boxFx === "pulse" ? `0 0 ${10 + 7 * Math.sin(time / 280)}px ${gc}BB` : "none";
  return { background: P.bg || "transparent", border: P.borderW ? `${P.borderW}px solid ${P.borderC}` : "none", borderRadius: P.radius, padding: `${Math.round(P.pad * 0.45)}px ${P.pad}px`, boxShadow: glow };
}

/* Shared border-effect renderer for both single-country maps and
   multi-country continent maps — same styles (plain/draw/comet/neon/
   reveal/pulse), driven by a precomputed path `d` and its bbox. */
function MapEffectPaths({ id, d, P, time }) {
  const S = P.mapStyle === "march" ? "pulse" : P.mapStyle;
  const u = clamp01((time - P.start) / P.dur);
  const eu = EASE.easeInOutCubic(u);
  const gid = "g" + id, cid = "c" + id;
  const hot = lerpColor(P.stroke, "#ffffff", 0.75);
  const animDraw = S === "draw" || S === "reveal";
  const fillNow = animDraw ? P.fillOp * clamp01(u * 1.15) : P.fillOp;
  const drawDash = animDraw ? { strokeDasharray: 100, strokeDashoffset: 100 * (1 - eu) } : {};
  const gw = Math.min(P.strokeW, 2);
  let g = 0;
  if (S === "neon") g = 1;
  if (S === "reveal") g = clamp01((time - P.start - P.dur) / 550);
  if (S === "pulse") g = 0.55 + 0.45 * Math.sin(time / 430);
  if (S === "comet") g = 0.2;
  const tipOn = animDraw && u > 0.005 && u < 0.995;
  const lead = eu * 100;
  const off = -((time / 26) % 100);
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={lerpColor(P.fillC, "#ffffff", 0.14)} />
          <stop offset="1" stopColor={lerpColor(P.fillC, "#000000", 0.34)} />
        </linearGradient>
        <clipPath id={cid}><path d={d} /></clipPath>
      </defs>
      <path d={d} fill={`url(#${gid})`} fillOpacity={fillNow} stroke="none" style={{ filter: "drop-shadow(0 3px 10px rgba(0,0,0,.35))" }} />
      {fillNow > 0.2 && (
        <g clipPath={`url(#${cid})`}>
          <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.22 * (animDraw ? eu : 1)} strokeWidth={gw * 3.2} pathLength={100} style={{ filter: "blur(2.5px)" }} {...drawDash} />
        </g>
      )}
      {g > 0.02 && <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.12 * g} strokeWidth={gw * 5.5} pathLength={100} strokeLinejoin="round" style={{ filter: "blur(4.5px)" }} {...drawDash} />}
      {g > 0.02 && <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.32 * g} strokeWidth={gw * 2.4} pathLength={100} strokeLinejoin="round" style={{ filter: "blur(1.8px)" }} {...drawDash} />}
      <path d={d} fill="none" stroke={S === "neon" ? hot : P.stroke} strokeWidth={P.strokeW * (S === "neon" ? 1.15 : 1)} vectorEffect="non-scaling-stroke" pathLength={100} strokeLinejoin="round"
        style={g > 0.25 ? { filter: `drop-shadow(0 0 3px ${P.stroke})` } : {}} {...drawDash} />
      {tipOn && <>
        <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.75} strokeWidth={P.strokeW * 2.6} pathLength={100} strokeDasharray="5 95" strokeDashoffset={-(lead - 5)} strokeLinecap="round" style={{ filter: "blur(2px)" }} />
        <path d={d} fill="none" stroke={hot} strokeWidth={P.strokeW * 1.3} pathLength={100} strokeDasharray="2 98" strokeDashoffset={-(lead - 2)} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${P.stroke})` }} />
      </>}
      {S === "comet" && <>
        <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.45} strokeWidth={P.strokeW * 3} pathLength={100} strokeDasharray="11 89" strokeDashoffset={off + 8} strokeLinecap="round" style={{ filter: "blur(3px)" }} />
        <path d={d} fill="none" stroke={P.stroke} strokeOpacity={0.9} strokeWidth={P.strokeW * 1.8} pathLength={100} strokeDasharray="6 94" strokeDashoffset={off + 3} strokeLinecap="round" style={{ filter: "blur(1px)" }} />
        <path d={d} fill="none" stroke={hot} strokeWidth={P.strokeW * 1.1} pathLength={100} strokeDasharray="3 97" strokeDashoffset={off} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3.5px ${P.stroke}) drop-shadow(0 0 8px ${P.stroke})` }} />
      </>}
    </>
  );
}
function MapEffectShape({ id, d, box, P, time, down, common, handles }) {
  const h = (P.w * box.h) / box.w;
  const ox = box.ox || 0, oy = box.oy || 0;
  return (
    <div onPointerDown={down} style={common}>
      <svg width={P.w} height={h} viewBox={`${ox - 7} ${oy - 7} ${box.w + 14} ${box.h + 14}`} style={{ display: "block", overflow: "visible" }}>
        <MapEffectPaths id={id} d={d} P={P} time={time} />
      </svg>
      {handles}
    </div>
  );
}

/* per-style confetti kinematics — pure playback of the particle fields
   precomputed in engine/fx.js (confettiParticles). Returns wrapper-local
   offsets {px, py} + rotation/opacity for one particle at dt seconds after
   the burst. `anchor` shifts the emission point: (0,0) = the object's own
   x/y (burst and most styles); cannons re-anchor to the stage's bottom
   corners, expressed relative to the object's position. "burst" below is
   the original fountain math, verbatim. */
function confettiMotion(style, p, dt, life, anchor) {
  if (style === "rain") {
    const px = p.ox + p.swayA * Math.sin(p.wob + dt * p.swayF);
    const py = -320 + p.vy * 620 * dt;
    const op = clamp01(dt / 0.25) * (1 - clamp01((dt - (life - 0.8)) / 0.8));
    return { px, py, rot: p.spin * dt, op };
  }
  if (style === "cannonL" || style === "cannonR") {
    const g = 2.1;
    const px = anchor.x + p.vx * 620 * dt + p.drift * dt * Math.sin(p.wob + dt * 5);
    const py = anchor.y + p.vy * 620 * dt + 0.5 * g * 620 * dt * dt;
    const op = 1 - clamp01((dt - (life - 0.7)) / 0.7);
    return { px, py, rot: p.spin * dt, op };
  }
  if (style === "firework") {
    const g = 1.35;
    const k = 1 / (1 + 0.9 * dt); /* air drag — the shell decelerates as it flies */
    const px = p.vx * 620 * dt * k + p.drift * dt * Math.sin(p.wob + dt * 4);
    const py = p.vy * 620 * dt * k + 0.5 * g * 620 * dt * dt;
    const fade = 1 - clamp01((dt - (life - 1.1)) / 1.1);
    const twinkle = 0.6 + 0.4 * Math.sin(p.wob + dt * p.twk * Math.PI);
    return { px, py, rot: p.spin * dt, op: fade * twinkle };
  }
  if (style === "spiral") {
    const r = p.r0 + p.vr * dt;
    const th = p.th0 + p.om * dt;
    const op = clamp01(dt / 0.18) * (1 - clamp01((dt - (life - 0.9)) / 0.9));
    return { px: r * Math.cos(th), py: r * Math.sin(th), rot: p.spin * dt, op };
  }
  if (style === "snow") {
    const px = p.ox + p.swayA * Math.sin(p.wob + dt * p.swayF);
    const py = -330 + p.vy * 620 * dt;
    const op = clamp01(dt / 0.6) * (1 - clamp01((dt - (life - 1.2)) / 1.2));
    return { px, py, rot: 0, op };
  }
  if (style === "pop") {
    const u = clamp01(dt / life);
    const e = 1 - Math.pow(1 - u, 3); /* easeOutCubic ring expansion, quick fade */
    return { px: p.vx * 260 * e, py: p.vy * 260 * e, rot: p.spin * dt, op: 1 - u * 1.15 };
  }
  const g = 1.9;
  const px = p.vx * 620 * dt + p.drift * dt * Math.sin(p.wob + dt * 5);
  const py = p.vy * 620 * dt + 0.5 * g * 620 * dt * dt;
  const fade = dt > 1.7 ? 1 - (dt - 1.7) / 0.7 : 1;
  return { px, py, rot: p.spin * dt, op: fade };
}

/* ============================================================
   CAMERA INJECTION POINT (2.5D scene camera + parallax)
   StageObject is the SINGLE shared render point of the editor preview and
   the export frame renderer. The optional `camera` prop is the project's
   raw camera state ({ tracks:{x,y,zoom} } | null); each root-level object
   wraps itself in a stage-sized div carrying its own parallax transform
   (engine/camera.js — ONE formula, never forked):

     f = 1 + depth · translate(−camX·f, −camY·f) · scale(1+(zoom−1)·f) about center

   · camera === null  → NO wrapper at all → old projects render byte-identical.
   · Clip children recurse WITHOUT a camera prop → camera applies at the ROOT
     scene level only; inside clips everything renders in raw clip space.
   · Selection outline, resize/rotate grips and the confetti glyph all live
     inside the object subtree → they track the camera transform for free.
   · stageScale passed inward is multiplied by the layer's screen scale so
     the grips keep a constant on-screen size even under camera zoom.
   ============================================================ */
export function StageObject(props) {
  const { camera } = props;
  if (!camera) return <StageObjectInner {...props} />;
  const t = cameraTransform(camera, props.time, props.obj?.props?.depth);
  /* mix-blend-mode is HOISTED to this outermost camera wrapper: the wrapper's
     own transform makes it a stacking context, so a blend mode on the inner
     element would blend against an empty (transparent) backdrop. Blur stays
     on the inner wrapper (unaffected by stacking contexts). Inert defaults
     (normal/absent) add NO style key → old projects render byte-identical. */
  const blend = blendCss(props.obj?.props);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: props.stage.w, height: props.stage.h, transform: camTransformCss(t), transformOrigin: `${props.stage.w / 2}px ${props.stage.h / 2}px`, pointerEvents: "none", ...(blend ? { mixBlendMode: blend } : {}) }}>
      <StageObjectInner {...props} stageScale={(props.stageScale || 1) * t.s} />
    </div>
  );
}

function StageObjectInner({ obj, time, stage, selected, onDown, onEnterClip, displayValue, onResize, onRotate, onClipScale, interactive, stageScale = 1, playing = false, selCount = 1, rotLive = null, camera = null }) {
  const P = obj.props;
  /* layer filters (engine/filters.js): blur applies right on each type's
     wrapper below; blend is skipped here when a camera wrapper already
     carries it (see StageObject above). Both "" at inert defaults. */
  const filterFx = blurCss(P);
  const blendFx = camera ? "" : blendCss(P);
  const fxStyle = {}; /* stays empty at inert defaults ⇒ byte-identical styles */
  if (filterFx) fxStyle.filter = filterFx;
  if (blendFx) fxStyle.mixBlendMode = blendFx;
  if (obj.hidden && !(interactive && selected)) return null;
  if (obj.type !== "clip") {
    const inT = P.inT || 0;
    if (time < inT || (P.outT != null && time > P.outT)) return null;
  }
  const dv = interactive && displayValue ? displayValue : (o, p) => valueAt(o, p, time);
  const [x, y] = P.path && P.path.pts?.length >= 2 ? pointOnPath(P.path, valueAt(obj, "prog", time)) : [dv(obj, "x"), dv(obj, "y")];
  const scale = valueAt(obj, "scale", time);
  const rot = valueAt(obj, "rotation", time);
  const op = valueAt(obj, "opacity", time);

  if (obj.type === "clip") {
    const local = clipLocalTime(P, time);
    const tr = clipTransition(P, time);
    if (local === null && !interactive) return null;
    /* clips are direct-manipulation citizens: body-drag moves (the full-canvas
       click target → onObjectDown, 40px clamp included); four CORNER grips on
       the selected frame scale the whole wrapper uniformly via the `scale`
       prop (contents scale with it — no Shift needed). Hidden while playing,
       multi-selected, locked, or non-interactive (export). */
    const canManipClip = selected && interactive && !obj.locked && !playing && selCount <= 1;
    const uClip = 1 / Math.max(0.05, (stageScale || 1) * Math.max(0.05, scale)); /* keep grips ~9px on screen at any stage zoom × clip scale */
    return (
      <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, transform: `translate(${x - stage.w / 2 + tr.tx}px, ${y - stage.h / 2 + tr.ty}px) rotate(${rot}deg) scale(${scale * tr.s})`, transformOrigin: `${stage.w / 2}px ${stage.h / 2}px`, opacity: local === null ? (interactive ? 0.15 : 0) : op * tr.o, pointerEvents: "none", ...fxStyle }}>
        {local !== null && P.bg && <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, background: P.bg }} />}
        {/* full-canvas click target — a clip IS the canvas, so selecting/entering it works anywhere on the frame, not just around its content */}
        {interactive && (
          <div onPointerDown={(e) => onDown(e, obj)} onDoubleClick={() => onEnterClip(obj.id)}
            title={`${obj.name} — drag to move · corner grips scale · double-click to open`}
            style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, pointerEvents: "auto", cursor: obj.locked ? "default" : "grab" }} />
        )}
        {/* children recurse WITHOUT a camera — UNLESS the clip opts in via
            props.camInside (per-child parallax depths inside the group).
            Absent on every old clip ⇒ children get camera=null and render
            in raw clip space, exactly as before (byte-identical). */}
        {local !== null && obj.children.map((ch) => <StageObject key={ch.id} obj={ch} time={local} stage={stage} selected={false} interactive={false} camera={P.camInside ? camera : null} />)}
        {interactive && selected && (
          <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, pointerEvents: "none", border: `1.5px solid ${C.amber}` }}>
            <span style={{ position: "absolute", top: -20, left: 0, fontSize: 10, fontWeight: 700, color: "#1a1405", background: C.amber, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>{obj.name} · clip{obj.locked && <LockIcon locked size={10} color="#1a1405" />}{local === null ? " · out of range" : ""}</span>
          </div>
        )}
        {canManipClip && onClipScale && CLIP_CORNER_DEFS.map(([hid, left, top, axis]) => (
          <div key={hid} className="gd-rzh" onPointerDown={(e) => { e.stopPropagation(); onClipScale(e, obj, hid, resizeCursor(axis, rot)); }}
            title="Drag to scale the whole clip uniformly"
            style={{ position: "absolute", left, top, width: 9 * uClip, height: 9 * uClip, transform: "translate(-50%,-50%)", background: "#fff", border: `${uClip}px solid ${C.amber}`, borderRadius: 0, cursor: resizeCursor(axis, rot), zIndex: 6, pointerEvents: "auto", touchAction: "none", boxSizing: "border-box" }} />
        ))}
      </div>
    );
  }

  if (obj.type === "confetti") {
    const style = confettiStyleOf(P); /* missing/unknown style → "burst" (pre-styles projects unchanged) */
    const parts = confettiParticles(obj);
    const life = confettiLife(style) / 1000;
    const dt = (time - P.burst) / 1000;
    const active = dt >= 0 && dt <= life;
    /* cannons emit from the stage's bottom corners — re-anchored relative to the object's own position */
    const anchor = style === "cannonL" ? { x: -x, y: stage.h - y } : style === "cannonR" ? { x: stage.w - x, y: stage.h - y } : { x: 0, y: 0 };
    const glyph = (CONFETTI_STYLES.find((s) => s.id === style) || CONFETTI_STYLES[0]).glyph;
    return (
      <div onPointerDown={interactive && !obj.locked ? (e) => onDown(e, obj) : undefined}
        style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", width: 44, height: 44, cursor: interactive && !obj.locked ? "grab" : "default", zIndex: 50, pointerEvents: interactive ? "auto" : "none", ...fxStyle }}>
        {(selected || (!active && interactive)) && <div style={{ position: "absolute", inset: 0, border: selected ? `1.5px dashed ${C.amber}` : "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, opacity: active ? 1 : 0.35 }}>{glyph}</div>}
        {active && parts.map((p, i) => {
          const m = confettiMotion(style, p, dt, life, anchor);
          return <div key={i} style={{ position: "absolute", left: 22 + m.px, top: 22 + m.py, width: p.size, height: p.size * (p.round ? 1 : 0.55), background: p.color, borderRadius: p.round ? "50%" : 1.5, transform: `rotate(${m.rot}deg)`, opacity: Math.max(0, Math.min(1, m.op)), pointerEvents: "none" }} />;
        })}
      </div>
    );
  }

  /* selection handles: 8 resize grips (corners + edge midpoints) + a rotation grip
     floating 22px above top-center on a 1px stem. Base-prop editing only — hidden
     while playing, multi-selected (move-only), locked, or non-interactive (export). */
  const canManip = selected && interactive && !obj.locked && !playing && selCount <= 1;
  const u = 1 / Math.max(0.05, stageScale || 1); /* inverse zoom → constant screen size */
  const handles = canManip && (onResize || onRotate)
    ? <>
        {onResize && HANDLE_DEFS.map(([hid, left, top, axis]) => (
          <div key={hid} className="gd-rzh" onPointerDown={(e) => { e.stopPropagation(); onResize(e, obj, hid, resizeCursor(axis, rot)); }}
            title="Drag to resize · Shift = keep aspect"
            style={{ position: "absolute", left, top, width: 8 * u, height: 8 * u, transform: "translate(-50%,-50%)", background: "#fff", border: `${u}px solid ${C.amber}`, borderRadius: 0, cursor: resizeCursor(axis, rot), zIndex: 6, pointerEvents: "auto", touchAction: "none", boxSizing: "border-box" }} />
        ))}
        {onRotate && <>
          {/* 1px stem from top-center up to the rotation grip */}
          <div style={{ position: "absolute", left: "50%", top: -ROTATE_OFFSET * u, width: u, height: ROTATE_OFFSET * u, transform: "translateX(-50%)", background: C.amber, pointerEvents: "none", zIndex: 6 }} />
          <div className="gd-rzh" onPointerDown={(e) => { e.stopPropagation(); onRotate(e, obj); }}
            title="Drag to rotate · Shift = 15° steps"
            style={{ position: "absolute", left: "50%", top: -ROTATE_OFFSET * u, width: 11 * u, height: 11 * u, transform: "translate(-50%,-50%)", borderRadius: "50%", background: "#fff", border: `${u}px solid ${C.amber}`, cursor: "grab", zIndex: 7, pointerEvents: "auto", touchAction: "none", boxSizing: "border-box" }} />
          {/* live angle readout — counter-rotated so it stays upright while the object spins */}
          {rotLive && rotLive.id === obj.id && (
            <div style={{ position: "absolute", left: `calc(50% + ${13 * u}px)`, top: -ROTATE_OFFSET * u, transform: `translateY(-50%) rotate(${-rot}deg)`, fontFamily: "'JetBrains Mono'", fontSize: 10.5 * u, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C.amber, background: "rgba(16,19,26,.92)", border: `${u}px solid ${C.line}`, borderRadius: 4 * u, padding: `${2 * u}px ${5 * u}px`, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 8 }}>
              {rotLive.deg}°
            </div>
          )}
        </>}
      </>
    : null;
  const common = {
    position: "absolute", left: x, top: y,
    transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${scale})`,
    opacity: obj.hidden ? op * 0.32 : op, cursor: interactive && !obj.locked ? "grab" : "default",
    outline: selected ? `1.5px solid ${obj.hidden ? C.faint : C.amber}` : "none", outlineOffset: 4,
    pointerEvents: interactive ? "auto" : "none",
    ...fxStyle,
  };
  const down = interactive && !obj.locked ? (e) => onDown(e, obj) : interactive ? (e) => { e.stopPropagation(); onDown(e, obj); } : undefined;

  if (obj.type === "backdrop") {
    /* full-stage animated background — pure function of (time, props, stage
       dims) via engine/backdrops.js (seamlessly loops over props.loopMs).
       The model is plain data (grads + shapes); markup here is a 1:1 map, so
       preview, SSR checks and the export rasterizer stay identical. Gradient
       ids are prefixed per layer — several backdrops/thumbnails can share a
       document without colliding. Softness comes from gradient falloff only
       (NO CSS blur at full-canvas cost — see engine/backdrops.js perf note).
       No resize grips: w/h are inert for this type (it always covers the
       stage); x/y/rotation/scale/opacity + depth/blur/blend still apply. */
    const M = backdropModel(P, time, stage.w, stage.h);
    const pid = "bd" + obj.id;
    const fillOf = (s) => (s.grad ? `url(#${pid}${s.grad})` : s.fill || "none");
    return (
      <div onPointerDown={down} style={{ ...common, width: stage.w, height: stage.h }}>
        <svg width={stage.w} height={stage.h} viewBox={`0 0 ${stage.w} ${stage.h}`} style={{ display: "block", overflow: "hidden" }}>
          <defs>
            {M.grads.map((g) => g.type === "radial" ? (
              <radialGradient key={g.id} id={`${pid}${g.id}`} cx="50%" cy="50%" r="50%">
                {g.stops.map((s, i) => <stop key={i} offset={s[0]} stopColor={s[1]} stopOpacity={s[2]} />)}
              </radialGradient>
            ) : (
              <linearGradient key={g.id} id={`${pid}${g.id}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                {g.stops.map((s, i) => <stop key={i} offset={s[0]} stopColor={s[1]} stopOpacity={s[2]} />)}
              </linearGradient>
            ))}
          </defs>
          {M.shapes.map((s, i) => {
            if (s.k === "rect") return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={fillOf(s)} opacity={s.op} />;
            if (s.k === "ellipse") return <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={fillOf(s)} opacity={s.op} />;
            if (s.k === "circle") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={fillOf(s)} opacity={s.op} />;
            if (s.k === "line") return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.sw} opacity={s.op} strokeLinecap="round" />;
            /* poly — closed silhouette (polygon) or open crest stroke (polyline) */
            const ptsStr = s.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
            return s.close
              ? <polygon key={i} points={ptsStr} fill={fillOf(s)} opacity={s.op} strokeLinejoin="round" />
              : <polyline key={i} points={ptsStr} fill="none" stroke={s.stroke} strokeWidth={s.sw} opacity={s.op} strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </svg>
      </div>
    );
  }

  if (obj.type === "shape") {
    const pts = morphPtsAt(obj, time);
    const fill = colorAt(obj, "fill", time);
    const fm = P.fillMode || "fill";
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={P.h} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
          <polygon points={ptsToStr(pts)} fill={fm === "stroke" ? "none" : fill} stroke={fm !== "fill" ? P.sC : "none"} strokeWidth={fm !== "fill" ? P.sW : 0} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {handles}
      </div>
    );
  }

  if (obj.type === "text" && P.path && P.path.pts.length >= 2 && (P.pathMode || "flow") === "flow") {
    const sp = pathSamples(P.path);
    const dPath = sp.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    const prog = valueAt(obj, "prog", time);
    const color = colorAt(obj, "fill", time);
    const raw = P.upper ? P.text.toUpperCase() : P.text;
    let pcx = 0, pcy = 0;
    sp.forEach((p) => { pcx += p[0]; pcy += p[1]; });
    pcx /= Math.max(1, sp.length); pcy /= Math.max(1, sp.length);
    return (
      <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", opacity: op, pointerEvents: "none", ...fxStyle }}>
        <defs><path id={"tp" + obj.id} d={dPath} /></defs>
        <g transform={`translate(${pcx} ${pcy}) rotate(${rot}) scale(${scale}) translate(${-pcx} ${-pcy})`}>
          {selected && <path d={dPath} fill="none" stroke={C.amber} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="4 4" />}
          <text onPointerDown={down} letterSpacing={P.ls} style={{ fontFamily: `'${P.fontFamily}'`, fontWeight: P.fontWeight, fontSize: P.fontSize, letterSpacing: P.ls, cursor: interactive && !obj.locked ? "grab" : "default", pointerEvents: interactive ? "auto" : "none" }} fill={color}>
            <textPath href={"#tp" + obj.id} startOffset={`${(prog * 100).toFixed(2)}%`}>{raw}</textPath>
          </text>
        </g>
      </svg>
    );
  }

  if (obj.type === "text") {
    const fx = P.textFx;
    const raw = P.upper ? P.text.toUpperCase() : P.text;
    const chars = fx ? raw.split("") : null;
    const box = boxStyleOf(P, time);
    const color = colorAt(obj, "fill", time);
    return (
      <div onPointerDown={down} style={common}>
        <div style={{ ...(box || {}), whiteSpace: "pre", fontFamily: `'${P.fontFamily}'`, fontWeight: P.fontWeight, fontSize: P.fontSize, color, letterSpacing: P.ls, display: "flex", alignItems: "center" }}>
          {!fx ? raw : chars.map((ch, i) => {
            const f = charFx(fx, i, chars.length, time, ch);
            return <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: f.o, transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.s})` }}>{f.ch}</span>;
          })}
        </div>
        {handles}
      </div>
    );
  }

  if (obj.type === "image") {
    return (
      <div onPointerDown={down} style={{ ...common, width: P.w, height: P.h }}>
        {P.src
          ? <img src={P.src} alt="" draggable={false} style={{ width: P.w, height: P.h, maxWidth: "none", maxHeight: "none", objectFit: "cover", borderRadius: 8, display: "block", pointerEvents: "none" }} />
          : <div style={{ width: P.w, height: P.h, border: `2px dashed ${C.faint}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 13 }}>No image</div>}
        {handles}
      </div>
    );
  }

  if (obj.type === "number") {
    const emH = 1.08;
    const box = boxStyleOf(P, time);
    const color = colorAt(obj, "fill", time);
    const fmt = P.format || "plain";
    /* optional style-preset ink (props from the Inspector swatches — all absent
       on pre-preset projects, whose markup stays byte-identical):
       stroke → -webkit-text-stroke · glow → layered text-shadow ·
       ls → tracking · tnum → tabular figures · pillBg → rounded pill chip */
    const numFx = {};
    if (P.ls) numFx.letterSpacing = P.ls;
    if (P.tnum) numFx.fontVariantNumeric = "tabular-nums";
    if (P.stroke) numFx.WebkitTextStroke = `${P.strokeW || 2}px ${P.stroke}`;
    if (P.glow) numFx.textShadow = `0 0 5px ${P.glow}A6, 0 0 16px ${P.glow}59, 0 0 38px ${P.glow}2E`;
    /* countdown visual styles (props.cdStyle) — rich variants for countdown-
       MODE layers (engine/fx.js CD_STYLES). cdStyleOf() returns "digits" for
       absent/unknown cdStyle or non-countdown modes ⇒ those layers fall
       through to the legacy paths below, byte-identical. All variants draw
       the SAME value the plain path would show (formatNumber(numberValue)),
       and ring/bar progress = countdownFraction (remaining share 1 → 0).
       data-cdstyle/data-cd markers double as the SSR/export render hooks. */
    const cdStyle = cdStyleOf(P);
    if (cdStyle !== "digits") {
      const p = countdownFraction(P, time);
      const txt = formatNumber(Math.max(0, numberValue(P, time)), fmt, P.decimals);
      const accent = P.ringC || "#FFB224";
      const fontCss = { fontFamily: `'${P.fontFamily}'`, fontWeight: P.fontWeight || 700, fontSize: P.fontSize, color, lineHeight: 1, ...numFx };
      const chars = txt.split("");
      const affix = (a, key) => (a ? <span key={key} style={{ whiteSpace: "pre" }}>{a}</span> : null);
      let cdBody = null;
      if (cdStyle === "flip") {
        /* flip-clock: every digit on a dark rounded card, split at the middle */
        cdBody = (
          <span style={{ display: "flex", alignItems: "center", gap: "0.09em" }}>
            {affix(P.prefix, "pre")}
            {chars.map((ch, i) => (ch >= "0" && ch <= "9") ? (
              <span key={i} style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "1em", padding: "0.07em 0.12em", background: "linear-gradient(180deg,#202634 0%,#202634 49%,#131824 51%,#131824 100%)", border: "1px solid rgba(255,255,255,.09)", borderRadius: "0.1em", boxShadow: "0 0.07em 0.2em rgba(0,0,0,.45)" }}>
                {ch}
                <span data-cd="split" style={{ position: "absolute", left: 0, right: 0, top: "50%", height: "0.032em", background: "rgba(0,0,0,.62)", transform: "translateY(-50%)", pointerEvents: "none" }} />
              </span>
            ) : <span key={i} style={{ whiteSpace: "pre" }}>{ch}</span>)}
            {affix(P.suffix, "suf")}
          </span>
        );
      } else if (cdStyle === "ring") {
        /* progress ring: remaining fraction sweeps an arc around the number
           (same geometry as the Counter ring below) */
        const R = P.fontSize * 1.15;
        const size = R * 2 + (P.ringW || 8) * 2 + 10;
        const c = size / 2;
        cdBody = (
          <span style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              <circle cx={c} cy={c} r={R} fill="none" stroke={accent} strokeOpacity={0.16} strokeWidth={P.ringW || 8} />
              {p > 0.0005 && <path data-cd="arc" d={arcStrokeD(c, c, R, -90, -90 + 359.9 * p)} fill="none" stroke={accent} strokeWidth={P.ringW || 8} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />}
            </svg>
            <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>{affix(P.prefix, "pre")}{txt}{affix(P.suffix, "suf")}</span>
          </span>
        );
      } else if (cdStyle === "bar") {
        /* number + remaining-fraction bar under it (shrinks as time runs out) */
        const pct = Math.round(p * 1000) / 10;
        cdBody = (
          <span style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "0.17em" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{affix(P.prefix, "pre")}{txt}{affix(P.suffix, "suf")}</span>
            <span style={{ display: "block", height: "0.15em", minHeight: 3, borderRadius: 999, background: "rgba(255,255,255,.14)", overflow: "hidden" }}>
              <span data-cd="fill" style={{ display: "block", width: `${pct}%`, height: "100%", borderRadius: 999, background: accent, boxShadow: `0 0 0.22em ${accent}` }} />
            </span>
          </span>
        );
      } else {
        /* boxed — each digit in its own mono box, LED glow */
        cdBody = (
          <span style={{ display: "flex", alignItems: "center", gap: "0.12em" }}>
            {affix(P.prefix, "pre")}
            {chars.map((ch, i) => (ch >= "0" && ch <= "9") ? (
              <span key={i} data-cd="digit" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "1.04em", height: "1.44em", background: "#0B0E13", border: "1px solid rgba(255,255,255,.12)", borderRadius: "0.09em", boxShadow: "inset 0 0 0.24em rgba(0,0,0,.75)", fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums", textShadow: `0 0 0.14em ${color}, 0 0 0.42em ${color}66` }}>{ch}</span>
            ) : <span key={i} style={{ whiteSpace: "pre", opacity: 0.75 }}>{ch}</span>)}
            {affix(P.suffix, "suf")}
          </span>
        );
      }
      return (
        <div onPointerDown={down} style={{ ...common, ...fontCss }} data-cdstyle={cdStyle}>
          {cdBody}
          {handles}
        </div>
      );
    }
    /* counter styles (props.style ∈ COUNTER_STYLES — engine/fx.js
       counterModel): 6 Jitter-grade renders (bold/blur/dotted/poster/pixel/
       progressring). counterModel is the pure frame source; the markup maps
       it 1:1, so preview, SSR checks and the export renderer produce
       identical frames. New style ids ONLY — odometer/count/slot fall
       through to the legacy paths below, byte-identical. data-cs markers
       double as the SSR/export render hooks. */
    const cStyle = counterStyleOf(P);
    if (cStyle) {
      const M = counterModel(P, time);
      const accent = P.ringC || "#FFB224";
      const csFont = { fontFamily: `'${P.fontFamily}'`, fontSize: P.fontSize, color, lineHeight: 1, ...numFx };
      const affix = (a, key) => (a ? <span key={key} style={{ whiteSpace: "pre" }}>{a}</span> : null);
      if (cStyle === "bold") {
        /* each digit change is a poster scene: the current digits spring in
           with overshoot + accelerate out; echo ghosts of the previous value
           scale up + fade behind (fill + accent layer) */
        return (
          <div onPointerDown={down} style={common} data-cs="bold">
            <span style={{ ...csFont, fontWeight: 800, position: "relative", display: "inline-flex", alignItems: "center" }}>
              {affix(P.prefix, "pre")}
              <span style={{ position: "relative", display: "inline-block" }}>
                {M.echoes.map((e, i) => (
                  <span key={i} data-cs="echo" aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: e.accent ? accent : color, opacity: e.op, transform: `scale(${e.scale})`, pointerEvents: "none" }}>{e.txt}</span>
                ))}
                <span data-cs="digit" style={{ position: "relative", display: "inline-block", transform: `scale(${M.scale})`, opacity: M.op }}>{M.txt}</span>
              </span>
              {affix(P.suffix, "suf")}
            </span>
            {handles}
          </div>
        );
      }
      if (cStyle === "blur") {
        /* change crossfade: outgoing blurs 0 → 24px while fading (CSS blur,
           the same filter mechanism the layer blur uses — export-safe),
           incoming blurs 24 → 0; a slight scale sells the defocus */
        return (
          <div onPointerDown={down} style={common} data-cs="blur">
            <span style={{ ...csFont, fontWeight: P.fontWeight || 700, position: "relative", display: "inline-flex", alignItems: "center" }}>
              {affix(P.prefix, "pre")}
              <span style={{ position: "relative", display: "inline-block" }}>
                {M.out && (
                  <span data-cs="out" aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", filter: `blur(${M.out.blur}px)`, opacity: M.out.op, transform: `scale(${1 + M.out.blur / 260})`, pointerEvents: "none" }}>{M.out.txt}</span>
                )}
                <span data-cs="in" style={{ position: "relative", display: "inline-block", filter: M.in.blur > 0.05 ? `blur(${M.in.blur}px)` : "none", opacity: M.in.op, transform: `scale(${1 + M.in.blur / 260})` }}>{M.txt}</span>
              </span>
              {affix(P.suffix, "suf")}
            </span>
            {handles}
          </div>
        );
      }
      if (cStyle === "dotted") {
        /* digits slide-swap vertically inside an overflow mask (old up, new
           from below in the accent color), wrapped by a dotted circle whose
           conic pie sweep fills per unit time */
        const R = P.fontSize * 1.15, rw = P.ringW || 8;
        const size = R * 2 + rw * 2 + 10, c = size / 2;
        const dotGap = (2 * Math.PI * R) / 60; /* ~60 dots around the ring */
        return (
          <div onPointerDown={down} style={common} data-cs="dotted">
            <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                {M.pie > 0.05 && <path data-cs="pie" d={arcPath(c, c, Math.max(1, R - rw / 2 - 3), -90, -90 + Math.min(359.9, M.pie))} fill={accent} fillOpacity={0.16} />}
                <circle data-cs="dots" cx={c} cy={c} r={R} fill="none" stroke={accent} strokeWidth={rw} strokeLinecap="round" strokeDasharray={`0.1 ${dotGap.toFixed(2)}`} style={{ filter: `drop-shadow(0 0 4px ${accent}66)` }} />
              </svg>
              <div style={{ position: "relative", zIndex: 1, ...csFont, fontWeight: P.fontWeight || 700, display: "flex", alignItems: "center" }}>
                {affix(P.prefix, "pre")}
                {M.chars.map((cc, i) => (cc.changed && cc.su < 1) ? (
                  <span key={i} data-cs="swap" style={{ position: "relative", display: "inline-block", height: "1em", overflow: "hidden" }}>
                    <span style={{ visibility: "hidden", whiteSpace: "pre" }}>{cc.ch}</span>
                    {cc.prevCh != null && <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, textAlign: "center", transform: `translateY(${cc.outDy}em)`, opacity: cc.outOp, whiteSpace: "pre" }}>{cc.prevCh}</span>}
                    <span style={{ position: "absolute", left: 0, right: 0, top: 0, textAlign: "center", transform: `translateY(${cc.inDy}em)`, opacity: cc.inOp, color: cc.mix > 0.02 ? lerpColor(color, accent, cc.mix) : color, whiteSpace: "pre" }}>{cc.ch}</span>
                  </span>
                ) : <span key={i} style={{ whiteSpace: "pre" }}>{cc.ch}</span>)}
                {affix(P.suffix, "suf")}
              </div>
            </div>
            {handles}
          </div>
        );
      }
      if (cStyle === "poster") {
        /* Swiss counter: the count itself is the motion; thin rules draw on,
           small-caps caption + zero-padded index marker; easeOutBack only on
           the scene entrance, accelerating exit over the last 18% */
        const fs = P.fontSize;
        return (
          <div onPointerDown={down} style={common} data-cs="poster">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: Math.max(4, fs * 0.12), minWidth: fs * 2.4, opacity: M.op, transform: `translateY(${M.dy}px) scale(${M.scale})`, transformOrigin: "0 50%", fontFamily: "'Inter'" }}>
              <span data-cs="rule" style={{ display: "block", height: 2, width: `${M.rule * 100}%`, background: color }} />
              <span data-cs="cap" style={{ fontSize: Math.max(9, fs * 0.13), fontWeight: 700, letterSpacing: "0.34em", color: accent }}>{M.caption}</span>
              <span data-cs="num" style={{ fontFamily: `'${P.fontFamily}'`, fontWeight: 800, fontSize: fs, lineHeight: 0.95, color, letterSpacing: "-0.02em", whiteSpace: "pre", ...numFx }}>{P.prefix}{M.txt}</span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
                <span data-cs="idx" style={{ fontFamily: "'JetBrains Mono'", fontSize: Math.max(9, fs * 0.12), fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{M.idx}</span>
                <span data-cs="rule2" style={{ display: "block", height: 1, flex: 1, background: color, opacity: 0.45, transform: `scaleX(${M.rule})`, transformOrigin: "0 50%" }} />
              </span>
            </div>
            {handles}
          </div>
        );
      }
      if (cStyle === "pixel") {
        /* 3×5 rect-composed pixel digits (crispEdges) with per-digit pop-in;
           on a digit change, seeded color-split slice ghosts glitch for
           200 ms (clip-path inset bands offset ±12px) */
        const k = P.fontSize / 5.2, gap = k * 0.55;
        const row = (ink, key) => (
          <span key={key} style={{ display: "inline-flex", alignItems: "baseline", gap }}>
            {M.chars.map((cc, i) => cc.bmp ? (
              <span key={i} style={{ display: "inline-block", transform: key === "main" ? `scale(${cc.pop})` : "none", transformOrigin: "50% 100%" }}>
                <svg data-cs={key === "main" ? "px" : undefined} width={3 * k} height={5 * k} viewBox="0 0 3 5" style={{ display: "block", shapeRendering: "crispEdges" }}>
                  {cc.bmp.map((r, ry) => r.split("").map((b, rx) => (b === "1" ? <rect key={`${rx}-${ry}`} x={rx} y={ry} width={1.06} height={1.06} fill={ink} /> : null)))}
                </svg>
              </span>
            ) : (
              <span key={i} style={{ fontFamily: `'${P.fontFamily}'`, fontWeight: 700, fontSize: P.fontSize * 0.82, color: ink, lineHeight: 1, opacity: key === "main" ? cc.pop : 1, whiteSpace: "pre" }}>{cc.ch}</span>
            ))}
          </span>
        );
        return (
          <div onPointerDown={down} style={common} data-cs="pixel">
            <span style={{ position: "relative", display: "inline-block" }}>
              {M.ghosts.map((g, i) => (
                <span key={i} data-cs="ghost" aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", clipPath: `inset(${g.top}% 0 ${g.bot}% 0)`, transform: `translateX(${g.dx}px)`, opacity: g.op, pointerEvents: "none" }}>
                  {row(g.color, "g" + i)}
                </span>
              ))}
              {row(color, "main")}
            </span>
            {handles}
          </div>
        );
      }
      /* progressring — expo-out count with a synced 0 → 354° arc, a glow dot
         trailing the arc tip, and a flash ring accenting the snap/reset at
         the loop point (state at t ≥ end ≡ t ≤ start) */
      const R = P.fontSize * 1.15, rw2 = P.ringW || 8;
      const size = R * 2 + rw2 * 2 + 10, c = size / 2;
      const rad = (M.dotA * Math.PI) / 180;
      return (
        <div onPointerDown={down} style={common} data-cs="progressring">
          <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", opacity: M.op }}>
            <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              <circle cx={c} cy={c} r={R} fill="none" stroke={accent} strokeOpacity={0.16} strokeWidth={rw2} />
              {M.arc > 0.3 && <path data-cs="arc" d={arcStrokeD(c, c, R, -90, -90 + M.arc)} fill="none" stroke={accent} strokeWidth={rw2} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />}
              <circle data-cs="dot" cx={c + R * Math.cos(rad)} cy={c + R * Math.sin(rad)} r={rw2 * (0.72 + 0.5 * M.flash)} fill={accent} style={{ filter: `drop-shadow(0 0 ${6 + 6 * M.flash}px ${accent})` }} />
              {M.flash > 0 && <circle data-cs="flash" cx={c} cy={c} r={R + 4 + M.flash * 14} fill="none" stroke={accent} strokeWidth={2} opacity={(1 - M.flash) * 0.55} />}
            </svg>
            <div style={{ position: "relative", zIndex: 1, ...csFont, fontWeight: P.fontWeight || 700, display: "flex", alignItems: "center" }}>
              {affix(P.prefix, "pre")}{M.txt}{affix(P.suffix, "suf")}
            </div>
          </div>
          {handles}
        </div>
      );
    }
    /* formats (compact/currency/percent/time) can't be column-rolled → they
       force the plain-text path; "plain" + style "count" is the legacy text
       path (formatNumber(v,"plain",dec) === v.toFixed(dec), zero drift) */
    const raw = (P.style === "count" || fmt !== "plain")
      ? <span style={{ whiteSpace: "pre" }}>{P.prefix}{formatNumber(Math.max(0, numberValue(P, time)), fmt, P.decimals)}{P.suffix}</span>
      : (
        <span style={{ display: "flex", alignItems: "center" }}>
          {P.prefix && <span style={{ whiteSpace: "pre" }}>{P.prefix}</span>}
          {numberColumns(P, time).map((c, i) => c.ch
            ? <span key={i}>{c.ch}</span>
            : <span key={i} style={{ display: "inline-block", height: `${emH}em`, overflow: "hidden", opacity: c.dim ? 0.22 : 1 }}>
                <span style={{ display: "block", transform: `translateY(${-c.d * emH}em)` }}>
                  {"01234567890".split("").map((d, j) => <span key={j} style={{ display: "block", height: `${emH}em` }}>{d}</span>)}
                </span>
              </span>)}
          {P.suffix && <span style={{ whiteSpace: "pre" }}>{P.suffix}</span>}
        </span>
      );
    const inner = P.pillBg
      ? <span style={{ background: P.pillBg, color: contrastOn(P.pillBg), borderRadius: 999, padding: "0.1em 0.45em", display: "inline-flex", alignItems: "center" }}>{raw}</span>
      : raw;
    const ring = P.ring || "none";
    if (ring !== "none") {
      const uLin = clamp01((time - P.start) / P.dur);
      /* countdown depletes, count-up fills — reversed either by from > to
         (legacy) or by the countdown MODE (value runs end → start) */
      const depletes = P.mode === "countdown" ? P.from < P.to : P.to < P.from;
      const p = depletes ? 1 - uLin : uLin;
      const R = P.fontSize * 1.15;
      const size = R * 2 + (P.ringW || 8) * 2 + 10;
      const c = size / 2;
      return (
        <div onPointerDown={down} style={common}>
          <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
              {ring === "pie" ? <>
                <circle cx={c} cy={c} r={R} fill={P.bg || "rgba(0,0,0,.55)"} />
                <path d={arcPath(c, c, R, -90, -90 + 359.9 * p)} fill={P.ringC} fillOpacity={0.38} />
                <circle cx={c} cy={c} r={R} fill="none" stroke={P.ringC} strokeWidth={2} strokeOpacity={0.9} />
              </> : <>
                {P.bg && <circle cx={c} cy={c} r={R} fill={P.bg} />}
                <circle cx={c} cy={c} r={R} fill="none" stroke={P.ringC} strokeOpacity={0.16} strokeWidth={P.ringW} />
                <circle cx={c} cy={c} r={R} fill="none" stroke={P.ringC} strokeWidth={P.ringW} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - p)} transform={`rotate(-90 ${c} ${c})`} style={{ filter: `drop-shadow(0 0 6px ${P.ringC})` }} />
              </>}
            </svg>
            <div style={{ position: "relative", zIndex: 1, fontFamily: `'${P.fontFamily}'`, fontWeight: P.fontWeight || 700, fontSize: P.fontSize, color, lineHeight: 1, display: "flex", alignItems: "center", ...numFx }}>{inner}</div>
          </div>
          {handles}
        </div>
      );
    }
    return (
      <div onPointerDown={down} style={common}>
        <div style={{ ...(box || {}), fontFamily: `'${P.fontFamily}'`, fontWeight: P.fontWeight || 600, fontSize: P.fontSize, color, lineHeight: 1, display: "flex", alignItems: "center", ...numFx }}>{inner}</div>
        {handles}
      </div>
    );
  }

  if (obj.type === "chart") {
    /* Jitter-grade charts — engine/fx.js chartModel(P, time) is the single
       source of truth (pure, deterministic, in → hold → out); the markup
       below maps the model 1:1, so preview, SSR checks and the export frame
       renderer produce identical frames. Gradient ids are prefixed per layer
       (several charts/thumbnails can share a document). The card backdrop
       (radius + soft shadow) lives on the wrapper div. */
    const M = chartModel(P, time);
    const pad = P.pad || 0;
    const pid = "ch" + obj.id;
    return (
      <div onPointerDown={down} style={common}>
        <div style={{ width: M.w + pad * 2, height: M.h + pad * 2, padding: pad, boxSizing: "border-box", background: P.bg || "transparent", opacity: P.bg ? P.bgOp : 1, borderRadius: P.radius, border: P.borderW ? `${P.borderW}px solid ${P.borderC}` : "none", boxShadow: P.bg ? "0 24px 60px rgba(0,0,0,.42), 0 4px 14px rgba(0,0,0,.30)" : "none" }}>
          <svg width={M.w} height={M.h} data-chart={M.type} style={{ display: "block", overflow: "visible" }}>
            {M.grads.length > 0 && (
              <defs>
                {M.grads.map((g) => (
                  <linearGradient key={g.id} id={pid + g.id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                    {g.stops.map((s, i) => <stop key={i} offset={s[0]} stopColor={s[1]} stopOpacity={s[2]} />)}
                  </linearGradient>
                ))}
              </defs>
            )}
            {M.items.map((it, i) => {
              if (it.k === "line") return <line key={i} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={it.stroke} strokeWidth={it.sw} strokeDasharray={it.dash} strokeLinecap={it.cap} opacity={it.op} />;
              if (it.k === "circle") return <circle key={i} cx={it.cx} cy={it.cy} r={it.r} fill={it.fill || "none"} stroke={it.stroke || "none"} strokeWidth={it.sw} opacity={it.op} transform={it.tr} />;
              if (it.k === "text") return <text key={i} x={it.x} y={it.y} textAnchor={it.anchor} fill={it.fill} fontSize={it.size} fontFamily={it.fam} fontWeight={it.wt} letterSpacing={it.ls} opacity={it.op} transform={it.tr} style={it.tnum ? { fontVariantNumeric: "tabular-nums" } : undefined}>{it.s}</text>;
              return <path key={i} d={it.d} fill={it.grad ? `url(#${pid}${it.grad})` : it.fill || "none"} stroke={it.stroke || "none"} strokeWidth={it.sw} strokeLinecap={it.cap} strokeLinejoin={it.stroke ? "round" : undefined} pathLength={it.plen} strokeDasharray={it.dash} strokeDashoffset={it.off} opacity={it.op} transform={it.tr} style={it.glow ? { filter: `drop-shadow(${it.glow})` } : undefined} />;
            })}
          </svg>
        </div>
        {handles}
      </div>
    );
  }

  if (obj.type === "map") {
    const m = MAPS[P.country];
    const box = mapBox(m);
    return <MapEffectShape id={obj.id} d={ringsToPath(m.rings)} box={box} P={P} time={time} down={down} common={common} handles={handles} />;
  }

  if (obj.type === "continent") {
    const codes = CONTINENTS[P.continent] || [];
    const d = codes.map((cc) => WORLD_D[cc]).filter(Boolean).join(" ");
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    codes.forEach((cc) => { const e = WORLD_EXT[cc]; if (!e) return; mnx = Math.min(mnx, e[0]); mny = Math.min(mny, e[1]); mxx = Math.max(mxx, e[2]); mxy = Math.max(mxy, e[3]); });
    if (mnx > mxx) return null;
    const box = { w: mxx - mnx, h: mxy - mny, ox: mnx, oy: mny };
    const his = normHi(P.hi).filter((hh) => codes.includes(hh.cc));
    if (!his.length) return <MapEffectShape id={obj.id} d={d} box={box} P={P} time={time} down={down} common={common} handles={handles} />;
    /* highlights present: same zoom-and-spotlight behavior as the World map,
       just cropped to this continent's own bounding box instead of the globe */
    const fallbackCenter = { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 };
    const zk = P.zoomK || 2.2;
    const cam = P.autoZoom !== false ? worldCameraAt({ ...P, hi: his }, time, fallbackCenter) : { focus: 0, cx: fallbackCenter.cx, cy: fallbackCenter.cy };
    const k = 1 + (zk - 1) * cam.focus;
    const gT = `translate(${cam.cx.toFixed(2)} ${cam.cy.toFixed(2)}) scale(${k.toFixed(3)}) translate(${(-cam.cx).toFixed(2)} ${(-cam.cy).toFixed(2)})`;
    const rd = Math.max(120, P.revealDur || 600);
    const hh_ = (P.w * box.h) / box.w;
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={hh_} viewBox={`${box.ox - 7} ${box.oy - 7} ${box.w + 14} ${box.h + 14}`} style={{ display: "block", overflow: "visible" }}>
          <g transform={gT}>
            <g style={{ filter: cam.focus > 0.02 ? `blur(${(2.5 * cam.focus).toFixed(2)}px)` : "none", opacity: 1 - 0.35 * cam.focus }}>
              <MapEffectPaths id={obj.id} d={d} P={P} time={time} />
            </g>
            {his.map((hh) => {
              const { cc, t } = hh;
              if (!WORLD_D[cc]) return null;
              const u = clamp01((time - t) / rd);
              if (u <= 0) return null;
              const ou = hh.out != null ? clamp01((time - hh.out) / Math.max(150, rd * 0.6)) : 0;
              if (ou >= 1) return null;
              const aMul = 1 - EASE.easeInQuad(ou);
              const R = P.reveal || "simple";
              const e = WORLD_EXT[cc] || [0, 0, 0, 0];
              const ccx = (e[0] + e[2]) / 2, ccy = (e[1] + e[3]) / 2;
              const glow = P.glow ? { filter: `drop-shadow(0 0 2.5px ${P.hiFill}) drop-shadow(0 0 ${(6 + 2.5 * Math.sin(time / 350)).toFixed(1)}px ${P.hiFill})` } : {};
              let el = null;
              if (R === "electric") {
                if (!highlightFlick(u, cc.charCodeAt(0) * 7 + cc.charCodeAt(1))) return null;
                el = <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />;
              } else if (R === "pop") {
                const sc = 0.2 + 0.8 * EASE.easeOutBack(u);
                el = (
                  <g transform={`translate(${ccx} ${ccy}) scale(${sc.toFixed(3)}) translate(${-ccx} ${-ccy})`} opacity={clamp01(u * 2)}>
                    <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else if (R === "trace") {
                const teu = EASE.easeInOutCubic(u);
                el = (
                  <g>
                    <path d={WORLD_D[cc]} fill={P.hiFill} fillOpacity={clamp01((u - 0.6) / 0.4)} stroke="none" />
                    <path d={WORLD_D[cc]} fill="none" stroke={P.hiStroke} strokeWidth={P.strokeW * 2.2} vectorEffect="non-scaling-stroke" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - teu)} strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else {
                const fillc = lerpColor(P.fillC, P.hiFill, EASE.easeOutCubic(u));
                el = <path d={WORLD_D[cc]} fill={fillc} stroke={P.hiStroke} strokeOpacity={u} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={u > 0.5 ? glow : {}} />;
              }
              return <g key={cc} opacity={aMul}>{el}</g>;
            })}
          </g>
        </svg>
        {handles}
      </div>
    );
  }

  if (obj.type === "world") {
    const h = (P.w * WORLD_H) / 200;
    const his = normHi(P.hi);
    const zk = P.zoomK || 2.6;
    const auto = P.autoZoom !== false;
    const cam = auto ? worldCameraAt(P, time) : (() => {
      const fo2 = clamp01(valueAt(obj, "focus", time));
      let gx2 = 100, gy2 = WORLD_H / 2;
      if (his.length) {
        let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
        his.forEach(({ cc }) => { const e = WORLD_EXT[cc]; if (!e) return; mnx = Math.min(mnx, e[0]); mny = Math.min(mny, e[1]); mxx = Math.max(mxx, e[2]); mxy = Math.max(mxy, e[3]); });
        if (mnx < 1e9) { gx2 = (mnx + mxx) / 2; gy2 = (mny + mxy) / 2; }
      }
      return { focus: fo2, cx: gx2, cy: gy2 };
    })();
    const fo = cam.focus, gx = cam.cx, gy = cam.cy;
    const k = 1 + (zk - 1) * fo;
    const tx = (100 - gx) * fo, ty = (WORLD_H / 2 - gy) * fo;
    const gT = `translate(${(gx + tx).toFixed(2)} ${(gy + ty).toFixed(2)}) scale(${k.toFixed(3)}) translate(${(-gx).toFixed(2)} ${(-gy).toFixed(2)})`;
    const rd = Math.max(120, P.revealDur || 600);
    const flick = highlightFlick;
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={h} viewBox={`-2 -2 204 ${WORLD_H + 4}`} style={{ display: "block", overflow: "visible" }}>
          <g style={{ filter: fo > 0.02 ? `blur(${(3.5 * fo).toFixed(2)}px)` : "none", opacity: 1 - 0.45 * fo }}>
            {Object.keys(WORLD_D).map((cc) => (
              <path key={cc} d={WORLD_D[cc]} fill={P.base} fillOpacity={P.baseOp} stroke={P.stroke} strokeWidth={P.strokeW} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ))}
          </g>
          <g transform={gT}>
            {his.map((hh) => {
              const { cc, t } = hh;
              if (!WORLD_D[cc]) return null;
              const u = clamp01((time - t) / rd);
              if (u <= 0) return null;
              const ou = hh.out != null ? clamp01((time - hh.out) / Math.max(150, rd * 0.6)) : 0;
              if (ou >= 1) return null;
              const aMul = 1 - EASE.easeInQuad(ou);
              const R = P.reveal || "simple";
              const e = WORLD_EXT[cc] || [0, 0, 0, 0];
              const ccx = (e[0] + e[2]) / 2, ccy = (e[1] + e[3]) / 2;
              const glow = P.glow ? { filter: `drop-shadow(0 0 2.5px ${P.hiFill}) drop-shadow(0 0 ${(6 + 2.5 * Math.sin(time / 350)).toFixed(1)}px ${P.hiFill})` } : {};
              let el = null;
              if (R === "electric") {
                if (!flick(u, cc.charCodeAt(0) * 7 + cc.charCodeAt(1))) return null;
                el = <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />;
              } else if (R === "pop") {
                const sc = 0.2 + 0.8 * EASE.easeOutBack(u);
                el = (
                  <g transform={`translate(${ccx} ${ccy}) scale(${sc.toFixed(3)}) translate(${-ccx} ${-ccy})`} opacity={clamp01(u * 2)}>
                    <path d={WORLD_D[cc]} fill={P.hiFill} stroke={P.hiStroke} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else if (R === "trace") {
                const teu = EASE.easeInOutCubic(u);
                el = (
                  <g>
                    <path d={WORLD_D[cc]} fill={P.hiFill} fillOpacity={clamp01((u - 0.6) / 0.4)} stroke="none" />
                    <path d={WORLD_D[cc]} fill="none" stroke={P.hiStroke} strokeWidth={P.strokeW * 2.2} vectorEffect="non-scaling-stroke" pathLength={100} strokeDasharray={100} strokeDashoffset={100 * (1 - teu)} strokeLinejoin="round" style={glow} />
                  </g>
                );
              } else {
                const fillc = lerpColor(P.base, P.hiFill, EASE.easeOutCubic(u));
                el = <path d={WORLD_D[cc]} fill={fillc} stroke={P.hiStroke} strokeOpacity={u} strokeWidth={P.strokeW * 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={u > 0.5 ? glow : {}} />;
              }
              return <g key={cc} opacity={aMul}>{el}</g>;
            })}
          </g>
        </svg>
        {handles}
      </div>
    );
  }

  return null;
}
