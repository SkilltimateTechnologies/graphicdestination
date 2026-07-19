/* ============================================================
   STAGE OBJECT (recursive renderer) + map effect helpers.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2);
   GraphicDestinationMotion.jsx re-exports StageObject from here.
   ============================================================ */
import { useMemo } from "react";
import { C, bboxOfLayers } from "./editor/model";
import { LockIcon } from "./editor/ui";
import { kitRenderSpec } from "../engine/kits.js";
import { clamp01 } from "../engine/easing.js";
import { ptsToStr, pathSamples, pointOnPath, morphPtsAt } from "../engine/shapes.js";
import { valueAt, colorAt, lerpColor, clipLocalTime, clipTransition } from "../engine/keyframes.js";
import { cameraTransform, camTransformCss } from "../engine/camera.js";
import { blurCss, blendCss } from "../engine/filters.js";
import { MAPS, WORLD, WORLD_H, CONTINENTS, ringsToPath, arcPath, mapBox, WORLD_D, normHi, continentBox, countryCenter, hiColors, hiState, traceState } from "../engine/maps.js";
import { CONFETTI_STYLES, confettiStyleOf, confettiDurMs, confettiParticles, charFx, numberValue, numberColumns, formatNumber, contrastOn, chartModel, cdStyleOf, countdownFraction, counterStyleOf, counterModel } from "../engine/fx.js";
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

/* ============================================================
   MAP GRAMMAR — simple · electric · pop (real 50m geography)
   · CountryTracePaths: the outline draws from ONE point around the border,
     CLOSES and STAYS (stroke remains solid); a soft flat fill fades in.
   · MapHighlight: timed country highlight for continent/world maps — pops in
     at t (easeOutBack from the country's own centre), holds, pops out at out.
   · MapLegend: color-coded swatch + name chips, synced with visibility.
   All pure f(time) — export renders these exact frames.
   ============================================================ */
function CountryTracePaths({ d, P, time }) {
  const tr = traceState(P, time);
  const sw = P.strokeW || 1.6;
  const stroke = P.stroke || "#00E5FF";
  const hot = lerpColor(stroke, "#ffffff", 0.7);
  const started = tr.u > 0.002;
  const tracing = started && tr.u < 0.998;
  const lead = tr.e * 100;
  return (
    <>
      {tr.fillK > 0.002 && <path d={d} fill={P.fillC || "#2A3350"} fillOpacity={((P.fillOp != null ? P.fillOp : 0.55) * tr.fillK).toFixed(3)} stroke="none" />}
      {/* the trace — nothing before start; dasharray while drawing; once the
          loop CLOSES the dash comes off and the solid stroke STAYS forever */}
      {started && <path d={d} fill="none" stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" pathLength={100}
        strokeDasharray={tracing ? 100 : "none"} strokeDashoffset={tracing ? tr.dash : 0} strokeLinejoin="round" strokeLinecap="round" />}
      {tracing && <>
        <path d={d} fill="none" stroke={stroke} strokeOpacity={0.5} strokeWidth={sw * 2.2} vectorEffect="non-scaling-stroke" pathLength={100} strokeDasharray="4 96" strokeDashoffset={-(lead - 4)} strokeLinecap="round" style={{ filter: "blur(1.6px)" }} />
        <path d={d} fill="none" stroke={hot} strokeWidth={sw * 1.15} vectorEffect="non-scaling-stroke" pathLength={100} strokeDasharray="1.6 98.4" strokeDashoffset={-(lead - 1.6)} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${stroke})` }} />
      </>}
    </>
  );
}
function MapHighlight({ cc, color, stroke, st, sw }) {
  if (!st.on || !WORLD_D[cc]) return null;
  const { cx, cy } = countryCenter(cc);
  return (
    <g transform={`translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${st.scale.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`} opacity={st.aMul.toFixed(3)}>
      <path d={WORLD_D[cc]} fill={color} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </g>
  );
}
/* color-coded legend: swatch + country name, one row per highlight, rows fade
   in/out WITH their country. Anchored bottom-left inside the map viewport. */
function MapLegend({ rows, box, pad }) {
  const vis = rows.filter((r) => r.aMul > 0.01);
  if (!vis.length) return null;
  const rowH = Math.max(2.6, box.h * 0.052);
  const fs = rowH * 0.62, sw = rowH * 0.52;
  const maxN = Math.max(...vis.map((r) => r.name.length));
  const w = sw + 1.6 + maxN * fs * 0.6 + 1.6, h = vis.length * rowH + 1.2;
  const x = box.ox - pad + Math.max(1.2, box.w * 0.02), y = box.oy + box.h + pad - Math.max(1.2, box.h * 0.02);
  return (
    <g fontFamily="'Space Grotesk', system-ui, sans-serif">
      <rect x={x} y={y - h} width={w} height={h} rx={rowH * 0.32} fill="#0A0D14" fillOpacity={0.62} />
      {vis.map((r, i) => (
        <g key={i} transform={`translate(${(x + 1.1).toFixed(2)} ${(y - 0.6 - (vis.length - 1 - i) * rowH).toFixed(2)})`} opacity={Math.min(1, r.aMul * 1.6).toFixed(3)}>
          <rect x={0} y={-rowH * 0.72} width={sw} height={sw} rx={sw * 0.22} fill={r.color} />
          <text x={sw + 1.1} y={-rowH * 0.72 + sw * 0.82} fontSize={fs} fontWeight={600} fill="#F4F6FB">{r.name}</text>
        </g>
      ))}
    </g>
  );
}
/* shared continent/world body: neutral flat landmass + timed highlights + legend */
function MapUnionPaths({ codes, P, time, box, pad }) {
  const his = normHi(P.highlights || P.hi).filter((hh) => codes.includes(hh.cc));
  const colors = hiColors(his, P);
  const anyColor = his.some((hh) => hh.color);
  const rd = Math.max(120, P.revealDur || 600);
  const legendOn = P.legend === true || (P.legend !== false && anyColor && his.length > 0);
  const baseFill = P.base || P.fillC || "#2A3350";
  const baseOp = P.baseOp != null ? P.baseOp : (P.fillOp != null ? P.fillOp : 0.85);
  return (
    <>
      {codes.map((cc) => (WORLD_D[cc] ? (
        <path key={cc} d={WORLD_D[cc]} fill={baseFill} fillOpacity={baseOp} stroke={P.stroke || "#3D4A6E"} strokeWidth={P.strokeW || 0.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ) : null))}
      {his.map((hh, i) => {
        const st = hiState(hh, time, rd);
        const stroke = anyColor ? lerpColor(colors[i], "#ffffff", 0.55) : (P.hiStroke || "#ffffff");
        return <MapHighlight key={hh.cc} cc={hh.cc} color={colors[i]} stroke={stroke} st={st} sw={Math.max(1, (P.strokeW || 0.8) * 1.6)} />;
      })}
      {legendOn && <MapLegend rows={his.map((hh, i) => ({ color: colors[i], name: (WORLD[hh.cc] && WORLD[hh.cc].n) || hh.cc, aMul: hiState(hh, time, rd).aMul }))} box={box} pad={pad} />}
    </>
  );
}

/* per-style confetti kinematics — pure playback of the particle fields
   precomputed in engine/fx.js (confettiParticles). confettiFlight returns
   the RAW wrapper-local offsets {px, py} + rotation/opacity for one particle
   at dt seconds after the burst; confettiMotion then clamps it to the stage
   bounds. `anchor` shifts the emission point: (0,0) = the object's own
   x/y (burst and most styles); cannons re-anchor to the stage's bottom
   corners, expressed relative to the object's position. "burst" below is
   the original fountain math, verbatim. */

/* per-style fade windows as FRACTIONS of the particle life [fadeIn, fadeOut],
   so the duration prop (props.dur) scales the whole motion instead of
   truncating it. Rebalanced so pieces live out their full styled motion:
   fade-out never starts before 55% of the life (pop) and every other style
   holds full opacity until ≥ 68% — the lifetime floor check-r8w2 asserts.
   (family-normalized ids only — streamers→rain etc. arrive pre-mapped) */
const CONFETTI_FADE = {
  rain: [0.07, 0.24], cannonL: [0, 0.27], cannonR: [0, 0.27],
  firework: [0, 0.32], spiral: [0.07, 0.32], snow: [0.09, 0.18], pop: [0, 0.45],
};
const confettiFade = (style, dt, life) => {
  const w = CONFETTI_FADE[style] || [0, 0.3]; /* default = the burst family */
  const fin = w[0] > 0 ? clamp01(dt / (life * w[0])) : 1;
  const fout = 1 - clamp01((dt - life * (1 - w[1])) / (life * w[1]));
  return fin * fout;
};

function confettiFlight(style, p, dt, life, anchor) {
  if (style === "rain") {
    const px = p.ox + p.swayA * Math.sin(p.wob + dt * p.swayF);
    const py = -320 + p.vy * 620 * dt;
    return { px, py, rot: p.spin * dt, op: confettiFade(style, dt, life) };
  }
  if (style === "cannonL" || style === "cannonR") {
    const g = 2.1;
    const px = anchor.x + p.vx * 620 * dt + p.drift * dt * Math.sin(p.wob + dt * 5);
    const py = anchor.y + p.vy * 620 * dt + 0.5 * g * 620 * dt * dt;
    return { px, py, rot: p.spin * dt, op: confettiFade(style, dt, life) };
  }
  if (style === "firework") {
    const g = 1.35;
    const k = 1 / (1 + 0.9 * dt); /* air drag — the shell decelerates as it flies */
    const px = p.vx * 620 * dt * k + p.drift * dt * Math.sin(p.wob + dt * 4);
    const py = p.vy * 620 * dt * k + 0.5 * g * 620 * dt * dt;
    /* softer twinkle (never dips below 0.5 mid-flight — pieces read as
       sparkling, never as vanishing) */
    const twinkle = 0.75 + 0.25 * Math.sin(p.wob + dt * p.twk * Math.PI);
    return { px, py, rot: p.spin * dt, op: confettiFade(style, dt, life) * twinkle };
  }
  if (style === "spiral") {
    const r = p.r0 + p.vr * dt;
    const th = p.th0 + p.om * dt;
    return { px: r * Math.cos(th), py: r * Math.sin(th), rot: p.spin * dt, op: confettiFade(style, dt, life) };
  }
  if (style === "snow") {
    const px = p.ox + p.swayA * Math.sin(p.wob + dt * p.swayF);
    const py = -330 + p.vy * 620 * dt;
    return { px, py, rot: 0, op: confettiFade(style, dt, life) };
  }
  if (style === "pop") {
    const u = clamp01(dt / life);
    const e = 1 - Math.pow(1 - u, 3); /* easeOutCubic ring expansion */
    /* rebalanced: full opacity through the first 55% of the life, then a
       graceful fade — no more vanishing-from-birth */
    return { px: p.vx * 260 * e, py: p.vy * 260 * e, rot: p.spin * dt, op: confettiFade(style, dt, life) };
  }
  const g = 1.9;
  const px = p.vx * 620 * dt + p.drift * dt * Math.sin(p.wob + dt * 5);
  const py = p.vy * 620 * dt + 0.5 * g * 620 * dt * dt;
  return { px, py, rot: p.spin * dt, op: confettiFade(style, dt, life) };
}

/* canvas clamp (stage bounds): the particle's position clamps at the canvas
   edge — its velocity dies there — and it fades out over the last
   CONFETTI_EDGE_PX of would-be travel past the edge, so nothing ever renders
   outside the stage box (exported frames show zero particles beyond bounds).
   bounds = { ox, oy } the object's stage position + { w, h } the stage size. */
const CONFETTI_EDGE_PX = 90;
function confettiMotion(style, p, dt, life, anchor, bounds) {
  const m = confettiFlight(style, p, dt, life, anchor);
  if (!bounds) return m;
  const pw = p.size || 0, ph = pw * (p.round ? 1 : 0.55);
  const sx0 = bounds.ox + m.px, sy0 = bounds.oy + m.py;
  const sx = Math.min(Math.max(sx0, 0), Math.max(0, bounds.w - pw));
  const sy = Math.min(Math.max(sy0, 0), Math.max(0, bounds.h - ph));
  const pen = Math.max(Math.abs(sx - sx0), Math.abs(sy - sy0)); /* deepest axis overshoot past the edge */
  const edge = 1 - clamp01(pen / CONFETTI_EDGE_PX);
  return { px: sx - bounds.ox, py: sy - bounds.oy, rot: m.rot, op: m.op * edge };
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
  /* locked kit objects (R7a): the art tree is re-derived from engine/kits.js
     — memoized per (kit id, variant, colors) so render is a pure f(props,time).
     Hook called unconditionally (before any early return) — null for non-kit. */
  const kitSpec = useMemo(
    () => (obj.type === "kit" ? kitRenderSpec(P.kit, { variant: P.variant, color: P.color, accent: P.accent }) : null),
    [obj.type, P.kit, P.variant, P.color, P.accent]
  );
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
    /* confetti plays EXACTLY its duration (burst + settle) independent of how
       much timeline remains — the outT cutoff does not apply to it. Every
       other type keeps the legacy gate, byte-identical. */
    if (time < inT || (obj.type !== "confetti" && P.outT != null && time > P.outT)) return null;
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
       multi-selected, locked, or non-interactive (export).
       R7a: the selection frame + grips now HUG THE CONTENT bbox (the same
       box the drag clamp/align use), so group-style inserts read as movable
       objects instead of full-stage "scene" blocks; genuinely full-bleed
       scenes (bbox ≈ stage) keep the full-stage frame. A rotation grip rides
       above the content box — same base-rotation drag as the other types. */
    const canManipClip = selected && interactive && !obj.locked && !playing && selCount <= 1;
    const uClip = 1 / Math.max(0.05, (stageScale || 1) * Math.max(0.05, scale)); /* keep grips ~9px on screen at any stage zoom × clip scale */
    const cbox = interactive && selected && local !== null ? bboxOfLayers(obj.children, local) : null; /* internal clip coords */
    const gb = cbox || { x: 0, y: 0, w: stage.w, h: stage.h }; /* grip/outline box */
    const clipGripPos = { nw: [gb.x, gb.y], ne: [gb.x + gb.w, gb.y], se: [gb.x + gb.w, gb.y + gb.h], sw: [gb.x, gb.y + gb.h] };
    return (
      <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, transform: `translate(${x - stage.w / 2 + tr.tx}px, ${y - stage.h / 2 + tr.ty}px) rotate(${rot}deg) scale(${scale * tr.s})`, transformOrigin: `${stage.w / 2}px ${stage.h / 2}px`, opacity: local === null ? (interactive ? 0.15 : 0) : op * tr.o, pointerEvents: "none", ...fxStyle }}>
        {local !== null && P.bg && <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, background: P.bg }} />}
        {/* full-canvas click target — a clip IS the canvas, so selecting/entering it works anywhere on the frame, not just around its content */}
        {interactive && (
          <div onPointerDown={(e) => onDown(e, obj)} onDoubleClick={() => onEnterClip(obj.id)}
            title={`${obj.name} — drag to move · corner grips scale · rotate grip spins · double-click to open`}
            style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, pointerEvents: "auto", cursor: obj.locked ? "default" : "grab" }} />
        )}
        {/* children recurse WITHOUT a camera — UNLESS the clip opts in via
            props.camInside (per-child parallax depths inside the group).
            Absent on every old clip ⇒ children get camera=null and render
            in raw clip space, exactly as before (byte-identical). */}
        {local !== null && obj.children.map((ch) => <StageObject key={ch.id} obj={ch} time={local} stage={stage} selected={false} interactive={false} camera={P.camInside ? camera : null} />)}
        {interactive && selected && (
          <div style={{ position: "absolute", left: gb.x, top: gb.y, width: gb.w, height: gb.h, pointerEvents: "none", border: `1.5px solid ${C.amber}` }}>
            <span style={{ position: "absolute", top: -20, left: 0, fontSize: 10, fontWeight: 700, color: "#1a1405", background: C.amber, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>{obj.name} · clip{obj.locked && <LockIcon locked size={10} color="#1a1405" />}{local === null ? " · out of range" : ""}</span>
          </div>
        )}
        {canManipClip && onClipScale && CLIP_CORNER_DEFS.map(([hid, , , axis]) => (
          <div key={hid} className="gd-rzh" onPointerDown={(e) => { e.stopPropagation(); onClipScale(e, obj, hid, resizeCursor(axis, rot), gb); }}
            title="Drag to scale the whole clip uniformly"
            style={{ position: "absolute", left: clipGripPos[hid][0], top: clipGripPos[hid][1], width: 9 * uClip, height: 9 * uClip, transform: "translate(-50%,-50%)", background: "#fff", border: `${uClip}px solid ${C.amber}`, borderRadius: 0, cursor: resizeCursor(axis, rot), zIndex: 6, pointerEvents: "auto", touchAction: "none", boxSizing: "border-box" }} />
        ))}
        {/* rotation grip above the content box — base `rotation` prop via the
            shared onRotate drag (auto-keyframe aware, Shift = 15° steps) */}
        {canManipClip && onRotate && <>
          <div style={{ position: "absolute", left: gb.x + gb.w / 2, top: gb.y - ROTATE_OFFSET * uClip, width: uClip, height: ROTATE_OFFSET * uClip, transform: "translateX(-50%)", background: C.amber, pointerEvents: "none", zIndex: 6 }} />
          <div className="gd-rzh" onPointerDown={(e) => { e.stopPropagation(); onRotate(e, obj); }}
            title="Drag to rotate · Shift = 15° steps"
            style={{ position: "absolute", left: gb.x + gb.w / 2, top: gb.y - ROTATE_OFFSET * uClip, width: 11 * uClip, height: 11 * uClip, transform: "translate(-50%,-50%)", borderRadius: "50%", background: "#fff", border: `${uClip}px solid ${C.amber}`, cursor: "grab", zIndex: 7, pointerEvents: "auto", touchAction: "none" }} />
          {rotLive && rotLive.id === obj.id && (
            <div style={{ position: "absolute", left: gb.x + gb.w / 2 + 13 * uClip, top: gb.y - ROTATE_OFFSET * uClip, transform: `translateY(-50%) rotate(${-rot}deg)`, fontFamily: "'JetBrains Mono'", fontSize: 10.5 * uClip, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C.amber, background: "rgba(16,19,26,.92)", border: `${uClip}px solid ${C.line}`, borderRadius: 4 * uClip, padding: `${2 * uClip}px ${5 * uClip}px`, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 8 }}>
              {rotLive.deg}°
            </div>
          )}
        </>}
      </div>
    );
  }

  if (obj.type === "confetti") {
    const style = confettiStyleOf(P); /* missing/unknown style → "burst" (pre-styles projects unchanged) */
    const parts = confettiParticles(obj);
    /* duration prop (props.dur, ms — engine/fx.js confettiDurMs): the burst
       plays for EXACTLY this long, independent of how much timeline remains
       (the outT cutoff does not apply — see the visibility gate above).
       Absent ⇒ the style's default life, so pre-duration projects unchanged. */
    const life = confettiDurMs(P) / 1000;
    const dt = (time - P.burst) / 1000;
    const active = dt >= 0 && dt <= life;
    /* cannons emit from the stage's bottom corners — re-anchored relative to the object's own position */
    const anchor = style === "cannonL" ? { x: -x, y: stage.h - y } : style === "cannonR" ? { x: stage.w - x, y: stage.h - y } : { x: 0, y: 0 };
    /* canvas clamp: particles pin + fade at the stage edges, never outside */
    const bounds = { ox: x, oy: y, w: stage.w, h: stage.h };
    const glyph = (CONFETTI_STYLES.find((s) => s.id === style) || CONFETTI_STYLES[0]).glyph;
    return (
      <div onPointerDown={interactive && !obj.locked ? (e) => onDown(e, obj) : undefined}
        style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", width: 44, height: 44, cursor: interactive && !obj.locked ? "grab" : "default", zIndex: 50, pointerEvents: interactive ? "auto" : "none", ...fxStyle }}>
        {(selected || (!active && interactive)) && <div style={{ position: "absolute", inset: 0, border: selected ? `1.5px dashed ${C.amber}` : "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, opacity: active ? 1 : 0.35 }}>{glyph}</div>}
        {active && parts.map((p, i) => {
          const m = confettiMotion(style, p, dt, life, anchor, bounds);
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

  if (obj.type === "kit") {
    /* LOCKED KIT OBJECT (R7a) — ONE document layer, NO editable children:
       props { kit, variant, color, accent } re-derive the same layer tree
       the kit builders ship (engine/kits.js kitRenderSpec) and it is drawn
       READ-ONLY, uniformly scaled + centered into the object's w/h box.
       The tree is a seamlessly-looping clip in 1280×720 stage coords, so
       the shared render path below (preview AND export) is literally the
       old kit-clip path — time runs as clip-local loop time measured from
       the object's inT. Selection shows the standard move/resize/rotate
       grips (w/h box); it can never be entered or ungrouped. Unknown kit
       ids render nothing (defensive — never produced by the panels). */
    if (!kitSpec) return null;
    const { tree, frame } = kitSpec;
    const local = Math.max(0, time - (P.inT || 0));
    const s = Math.min(P.w / Math.max(1, frame.w), P.h / Math.max(1, frame.h));
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    return (
      <div onPointerDown={down} style={{ ...common, width: P.w, height: P.h }}>
        <div style={{ position: "absolute", left: P.w / 2 - s * cx, top: P.h / 2 - s * cy, width: 1280, height: 720, transform: `scale(${s})`, transformOrigin: "0 0", pointerEvents: "none" }}>
          <StageObject obj={tree} time={local} stage={{ w: 1280, h: 720 }} selected={false} interactive={false} />
        </div>
        {handles}
      </div>
    );
  }

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
    /* single country — TRACE: outline draws from one point, closes, stays */
    const m = MAPS[P.country] || MAPS.IND;
    const box = mapBox(m);
    const d = ringsToPath(m.rings);
    const tr = traceState(P, time);
    const h = (P.w * box.h) / box.w;
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={h} viewBox={`-4 -4 ${box.w + 8} ${box.h + 8}`} style={{ display: "block", overflow: "visible" }}>
          <g transform={`translate(${(box.w / 2).toFixed(2)} ${(box.h / 2).toFixed(2)}) scale(${tr.popScale.toFixed(4)}) translate(${(-box.w / 2).toFixed(2)} ${(-box.h / 2).toFixed(2)})`}>
            <CountryTracePaths d={d} P={P} time={time} />
          </g>
        </svg>
        {handles}
      </div>
    );
  }

  if (obj.type === "continent") {
    /* continent union (true member countries) + timed pop highlights */
    const name = CONTINENTS[P.continent] ? P.continent : "ASIA";
    const codes = CONTINENTS[name];
    const box = continentBox(name);
    if (!box) return null;
    const pad = 3;
    const h = (P.w * box.h) / box.w;
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={h} viewBox={`${box.ox - pad} ${box.oy - pad} ${box.w + pad * 2} ${box.h + pad * 2}`} style={{ display: "block", overflow: "hidden" }}>
          <MapUnionPaths codes={codes} P={P} time={time} box={box} pad={pad} />
        </svg>
        {handles}
      </div>
    );
  }

  if (obj.type === "world") {
    /* the whole world — neutral landmass, timed pop highlights, color legend */
    const h = (P.w * WORLD_H) / 200;
    const box = { ox: 0, oy: 0, w: 200, h: WORLD_H };
    return (
      <div onPointerDown={down} style={common}>
        <svg width={P.w} height={h} viewBox={`-2 -2 204 ${WORLD_H + 4}`} style={{ display: "block", overflow: "visible" }}>
          <MapUnionPaths codes={Object.keys(WORLD)} P={P} time={time} box={box} pad={2} />
        </svg>
        {handles}
      </div>
    );
  }

  return null;
}
