/* ============================================================
   STAGE VIEW — canvas, workspace overlays, zoom controls.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { C, STAGE_PAD, zoomCtlBtn } from "./model";
import { StageObject } from "../StageObject";
import { PathEditor } from "./PathEditor";

export default function StageView({ stageWrapRef, stageScrollRef, tlDragging, zoomed, stage, stageScale, stageBg, inClip, ctx, ctxLayers, time, selIds, sel, overflowShow, zoomMode, playing, rotLive, onObjectDown, enterClip, displayValue, onResizeDown, onRotateDown, onPathPtDown, patchPath, setOverflowShow, setSelIds, setSelKf, setAudioSel, setShapesOpen, setMapsOpen, setImagesOpen, setAudioOpen, stepZoom, cycleZoom, setZoom }) {
  return (
        <div ref={stageWrapRef} onPointerDown={() => { setSelIds([]); setSelKf(null); setAudioSel(false); setShapesOpen(false); setMapsOpen(false); setImagesOpen(false); setAudioOpen(false); }}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg0, minWidth: 0, position: "relative", overflow: "hidden", pointerEvents: tlDragging ? "none" : undefined }}>
          {/* manual zoom: inner scroller pans the padded canvas area (margin:auto centers until larger than the viewport);
              floating overlays stay pinned because the scroller is a sibling. fit mode: display:contents = zero layout change */}
          <div ref={stageScrollRef} style={zoomed ? { position: "absolute", inset: 0, overflow: "auto", display: "flex" } : { display: "contents" }}>
          <div style={zoomed ? { width: stage.w * stageScale + STAGE_PAD * 2, height: stage.h * stageScale + STAGE_PAD * 2, margin: "auto", flexShrink: 0, position: "relative", overflow: "hidden" } : { display: "contents" }}>
          <div style={{ width: stage.w, height: stage.h, transform: `scale(${stageScale})`, background: stageBg, borderRadius: 6, boxShadow: inClip ? `0 0 0 2px ${C.amber}55, 0 8px 50px rgba(0,0,0,.55)` : "0 8px 50px rgba(0,0,0,.55)", position: zoomed ? "absolute" : "relative", overflow: overflowShow ? "visible" : "hidden", flexShrink: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.045) 1px, transparent 1px)", backgroundSize: "36px 36px", ...(zoomed ? { left: STAGE_PAD, top: STAGE_PAD, transformOrigin: "0 0" } : null) }}>
            {inClip && ctx.clip?.props.bg && <div style={{ position: "absolute", inset: 0, background: ctx.clip.props.bg, pointerEvents: "none" }} />}
            {ctxLayers.map((obj) => (
              <StageObject key={obj.id} obj={obj} time={time} stage={stage} selected={selIds.includes(obj.id)} onDown={onObjectDown} onEnterClip={enterClip} displayValue={displayValue} onResize={onResizeDown} onRotate={onRotateDown} stageScale={stageScale} playing={playing} selCount={selIds.length} rotLive={rotLive} interactive />
            ))}
            {overflowShow && <>
              <div style={{ position: "absolute", left: -4000, top: -4000, width: 9000, height: 4000, background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: -4000, top: "100%", width: 9000, height: 4000, background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: -4000, top: 0, width: 4000, height: "100%", background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: "100%", top: 0, width: 4000, height: "100%", background: "rgba(8,10,14,.58)", zIndex: 70, pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, border: "1px dashed rgba(245,165,36,.4)", zIndex: 71, pointerEvents: "none" }} />
            </>}
            {sel && sel.props.path && (sel.props.path.show || selIds.includes(sel.id)) && (
              <PathEditor obj={sel} onPtDown={onPathPtDown} patchPath={patchPath} locked={sel.locked} />
            )}
          </div>
          </div>
          </div>
          {inClip && (
            <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: C.amberSoft, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 999, padding: "5px 14px", fontSize: 11.5, fontWeight: 700 }}>
              Editing clip: {ctx.names[ctx.names.length - 1]} — Esc to go back
            </div>
          )}
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
