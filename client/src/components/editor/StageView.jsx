/* ============================================================
   STAGE VIEW — canvas, workspace overlays, zoom controls.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   Camera additions: the scene camera object is threaded to every root
   StageObject (the shared render point — see StageObject.jsx); the path
   editor overlay is wrapped in the SELECTED layer's own camera transform
   so its guide + grips track parallax; camera frame corners show while the
   camera lane is selected. The camera never applies inside clip editing.
   ============================================================ */
import { C, STAGE_PAD, zoomCtlBtn } from "./model";
import { StageObject } from "../StageObject";
import { PathEditor } from "./PathEditor";
import { cameraTransform, camTransformCss } from "../../engine/camera.js";

/* subtle camera frame corners at the stage edges (camera lane selected) */
function CameraCorners() {
  const arm = 26, w = 2, col = "rgba(245,165,36,.55)";
  const mk = (left, top, right, bottom, bl, bt) => (
    <div style={{ position: "absolute", left, top, right, bottom, width: arm, height: arm, borderLeft: bl ? `${w}px solid ${col}` : "none", borderRight: bl ? "none" : `${w}px solid ${col}`, borderTop: bt ? `${w}px solid ${col}` : "none", borderBottom: bt ? "none" : `${w}px solid ${col}`, boxSizing: "border-box" }} />
  );
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 65, pointerEvents: "none" }}>
      {mk(8, 8, "auto", "auto", true, true)}
      {mk("auto", 8, 8, "auto", false, true)}
      {mk(8, "auto", "auto", 8, true, false)}
      {mk("auto", "auto", 8, 8, false, false)}
    </div>
  );
}

export default function StageView({ stageWrapRef, stageScrollRef, stageElRef, marquee, tlDragging, zoomed, stage, stageScale, stageBg, inClip, ctx, ctxLayers, time, selIds, sel, overflowShow, zoomMode, playing, rotLive, onObjectDown, enterClip, displayValue, onResizeDown, onRotateDown, onClipScaleDown, onPathPtDown, patchPath, setOverflowShow, camera, cameraLaneSel, onStageEmptyDown, snapGuides, snapOn, onToggleSnap, stepZoom, cycleZoom, setZoom, showGrid }) {
  /* the scene camera applies at the ROOT scene level only — inside-clip
     editing shows raw clip space (documented in engine/camera.js) */
  const cam = !inClip && camera ? camera : null;
  return (
        <div ref={stageWrapRef} onPointerDown={onStageEmptyDown}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg0, minWidth: 0, position: "relative", overflow: "hidden", pointerEvents: tlDragging ? "none" : undefined }}>
          {/* manual zoom: inner scroller pans the padded canvas area (margin:auto centers until larger than the viewport);
              floating overlays stay pinned because the scroller is a sibling. fit mode: display:contents = zero layout change */}
          <div ref={stageScrollRef} style={zoomed ? { position: "absolute", inset: 0, overflow: "auto", display: "flex" } : { display: "contents" }}>
          <div style={zoomed ? { width: stage.w * stageScale + STAGE_PAD * 2, height: stage.h * stageScale + STAGE_PAD * 2, margin: "auto", flexShrink: 0, position: "relative", overflow: "hidden" } : { display: "contents" }}>
          <div ref={stageElRef} style={{ width: stage.w, height: stage.h, transform: `scale(${stageScale})`, background: stageBg, borderRadius: 6, boxShadow: inClip ? `0 0 0 2px ${C.amber}55, 0 8px 50px rgba(0,0,0,.55)` : "0 8px 50px rgba(0,0,0,.55)", position: zoomed ? "absolute" : "relative", overflow: overflowShow ? "visible" : "hidden", flexShrink: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.045) 1px, transparent 1px)", backgroundSize: "36px 36px", ...(zoomed ? { left: STAGE_PAD, top: STAGE_PAD, transformOrigin: "0 0" } : null) }}>
            {inClip && ctx.clip?.props.bg && <div style={{ position: "absolute", inset: 0, background: ctx.clip.props.bg, pointerEvents: "none" }} />}
            {ctxLayers.map((obj) => (
              <StageObject key={obj.id} obj={obj} time={time} stage={stage} camera={cam} selected={selIds.includes(obj.id)} onDown={onObjectDown} onEnterClip={enterClip} displayValue={displayValue} onResize={onResizeDown} onRotate={onRotateDown} onClipScale={onClipScaleDown} stageScale={stageScale} playing={playing} selCount={selIds.length} rotLive={rotLive} interactive />
            ))}
            {/* alignment GRID overlay (enable-grid toggle in the timeline bar):
                a subtle 40px lattice over the canvas — a pure editing aid.
                It lives ONLY in this editor component: the export render path
                (export/frameRenderer.js) draws StageObject trees directly and
                never mounts StageView, so the grid can never leak into an
                exported frame. pointerEvents:none — it never intercepts. */}
            {showGrid && (
              <div className="gd-grid-overlay" aria-hidden="true"
                style={{ position: "absolute", inset: 0, zIndex: 60, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            )}
            {overflowShow && <>
              <div style={{ position: "absolute", left: -4000, top: -4000, width: 9000, height: 4000, background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: -4000, top: "100%", width: 9000, height: 4000, background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: -4000, top: 0, width: 4000, height: "100%", background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: "100%", top: 0, width: 4000, height: "100%", background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, border: "1px dashed rgba(245,165,36,.4)", zIndex: 71, pointerEvents: "none" }} />
            </>}
            {sel && sel.props.path && (sel.props.path.show || selIds.includes(sel.id)) && (() => {
              const pe = <PathEditor obj={sel} onPtDown={onPathPtDown} patchPath={patchPath} locked={sel.locked} />;
              if (!cam) return pe;
              /* the path overlay lives in the selected layer's coordinate space —
                 wrap it in that layer's OWN camera transform so guide + grips
                 track parallax (verified at zoom 2 / depth 1) */
              const t = cameraTransform(cam, time, sel.props.depth);
              return (
                <div style={{ position: "absolute", left: 0, top: 0, width: stage.w, height: stage.h, transform: camTransformCss(t), transformOrigin: `${stage.w / 2}px ${stage.h / 2}px`, pointerEvents: "none" }}>
                  {pe}
                </div>
              );
            })()}
            {/* alignment guides — stage coordinate space (same as the selection
                chrome, so they track zoom); u counter-scales the stroke so lines
                stay a crisp 1 screen px. Rendered only while a drag supplies them. */}
            {snapGuides && snapGuides.length > 0 && (() => {
              const u = 1 / Math.max(0.05, stageScale || 1);
              const tick = 6 * u, col = "rgba(245,165,36,0.7)"; /* accent amber @ 70% */
              return (
                <div className="gd-snap-guides" style={{ position: "absolute", inset: 0, zIndex: 72, pointerEvents: "none" }}>
                  {snapGuides.map((g, i) => {
                    const vert = g.axis === "x";
                    const len = Math.max(0, g.to - g.from);
                    return (
                      <div key={i} data-axis={g.axis} data-pos={g.pos}>
                        <div style={{ position: "absolute", left: vert ? g.pos - u / 2 : g.from, top: vert ? g.from : g.pos - u / 2, width: vert ? u : len, height: vert ? len : u, background: col }} />
                        <div style={{ position: "absolute", left: vert ? g.pos - tick / 2 : g.from, top: vert ? g.from : g.pos - tick / 2, width: vert ? tick : u, height: vert ? u : tick, background: col }} />
                        <div style={{ position: "absolute", left: vert ? g.pos - tick / 2 : g.to - u, top: vert ? g.to - u : g.pos - tick / 2, width: vert ? tick : u, height: vert ? u : tick, background: col }} />
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {cameraLaneSel && !inClip && <CameraCorners />}
          </div>
          </div>
          </div>
          {/* marquee rubber-band (viewport coords → position:fixed). Non-interactive
              overlay drawn while a plain drag on empty canvas selects objects. */}
          {marquee && (() => {
            const l = Math.min(marquee.x0, marquee.x1), tp = Math.min(marquee.y0, marquee.y1);
            const w = Math.abs(marquee.x1 - marquee.x0), h = Math.abs(marquee.y1 - marquee.y0);
            return <div style={{ position: "fixed", left: l, top: tp, width: w, height: h, border: `1px solid ${C.amber}`, background: "rgba(245,165,36,0.12)", zIndex: 200, pointerEvents: "none", borderRadius: 2 }} />;
          })()}
          {/* clip-context indicator moved to the slim breadcrumb bar directly
              above the timeline (editor/Timeline.jsx) — Esc still exits a level */}
          {/* ---- zoom controls (bottom-right) ---- */}
          <div onPointerDown={(e) => e.stopPropagation()}
            style={{ position: "absolute", right: 14, bottom: 8, display: "flex", alignItems: "center", gap: 2, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 6, padding: 3, zIndex: 80 }}>
            <button className="gd-btn" onClick={() => setOverflowShow(!overflowShow)}
              title={overflowShow ? "Hide off-canvas layers" : "Show off-canvas layers"}
              style={{ ...zoomCtlBtn, color: overflowShow ? C.amber : C.dim }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button className="gd-btn" onClick={onToggleSnap}
              title={snapOn ? "Snapping ON — drag objects to snap to edges/centers + canvas (Alt-drag inverts)" : "Snapping OFF — Alt-drag snaps temporarily"}
              style={{ ...zoomCtlBtn, color: snapOn ? C.amber : C.dim }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v8a6 6 0 0 0 12 0V3"/>
                <path d="M6 3h4v5H6z"/>
                <path d="M14 3h4v5h-4z"/>
              </svg>
            </button>
            <div style={{ width: 1, height: 16, background: C.line, margin: "0 2px" }} />
            <button className="gd-btn" onClick={() => stepZoom(-1)} title="Zoom out" style={zoomCtlBtn}>−</button>
            <button className="gd-btn" onClick={cycleZoom} title="Zoom — click to cycle Fit → 100% → 50% → 25%"
              style={{ ...zoomCtlBtn, minWidth: 52, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
              {Math.round((zoomMode === "fit" ? stageScale : zoomMode) * 100)}%
            </button>
            <button className="gd-btn" onClick={() => stepZoom(1)} title="Zoom in" style={zoomCtlBtn}>+</button>
            <div style={{ width: 1, height: 16, background: C.line, margin: "0 2px" }} />
            <button className="gd-btn" onClick={() => setZoom("fit")} title="Fit stage to the available space"
              style={{ ...zoomCtlBtn, padding: "0 10px", fontSize: 11.5, fontWeight: 700, color: zoomMode === "fit" ? C.amber : C.dim }}>Fit</button>
          </div>
        </div>
  );
}
