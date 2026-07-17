/* ============================================================
   TIMELINE — transport, ruler, layer lanes, keyframes, audio lane.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { C, PROP_LABEL, KF_PROPS, TYPE_BAR, layerOut, transportBtn, chipStyle, inputStyle } from "./model";
import { NoteIcon, MiniBtn } from "./ui";
import { EASE_LABEL } from "../../engine/easing.js";
import { colorAt } from "../../engine/keyframes.js";
import { normHi, worldZoomWindow, WORLD } from "../../engine/maps.js";

export default function Timeline({ tlH, tlDragging, onTlHandleDown, resetTlH, setPlaying, setTime, playing, time, fmt, ctxDur, setCtxDurMs, stretchClips, setStretchClips, loop, setLoop, autokey, setAutokey, selMany, groupSelection, ctxLayers, selIds, setSelIds, setSelKf, enterClip, onLayerContext, onLaneContext, toggleHide, toggleLock, reorder, duplicateSelected, removeSelected, inClip, onAudioLaneDown, audioTrack, audioLaneSel, audioBarMs, onAudioBarDown, rulerRef, onRulerDown, onBarDown, onKfDown, selKf, onWorldKfDown }) {
  return (
      <div style={{ height: tlH, background: C.bg1, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "relative" }}>
        {/* top-edge resize handle: 6px hit zone, drag to resize (160px…45vh), double-click resets to 240px */}
        <div className={tlDragging ? "gd-tl-handle gd-dragging" : "gd-tl-handle"} onPointerDown={onTlHandleDown} onDoubleClick={resetTlH}
          title="Drag to resize the timeline · double-click to reset"
          style={{ position: "absolute", top: -3, left: 0, right: 0, height: 6, cursor: "ns-resize", zIndex: 60 }}>
          <div className="gd-tl-handle-line" style={{ position: "absolute", top: 2, left: 0, right: 0, height: 1, background: C.amber }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 12px", height: 44, borderBottom: `1px solid ${C.line}` }}>
          <button className="gd-btn" onClick={() => { setPlaying(false); setTime(0); }} style={transportBtn}>⏮</button>
          <button onClick={() => setPlaying(!playing)} style={{ ...transportBtn, width: 34, height: 28, background: C.amber, color: "#1a1405", border: "none", fontWeight: 800 }}>{playing ? "❚❚" : "▶"}</button>
          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 600, color: C.amber, minWidth: 88, fontVariantNumeric: "tabular-nums" }}>{fmt(time)} <span style={{ color: C.faint }}>/ {fmt(ctxDur)}</span></span>
          <span style={{ color: C.faint, fontSize: 11, fontWeight: 600 }}>Dur</span>
          <input type="number" min={1} max={30} step={0.5} value={+(ctxDur / 1000).toFixed(1)}
            onChange={(e) => setCtxDurMs((parseFloat(e.target.value) || 1) * 1000, stretchClips)}
            style={{ ...inputStyle, width: 56, padding: "4px 6px", fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
          <label title="When duration changes, keyframes rescale proportionally" style={{ display: "flex", alignItems: "center", gap: 5, color: C.dim, fontSize: 10.5, fontWeight: 600, cursor: "pointer" }}>
            <input type="checkbox" checked={stretchClips} onChange={(e) => setStretchClips(e.target.checked)} /> scale
          </label>
          <div style={{ width: 1, height: 20, background: C.line }} />
          <button className="gd-btn" onClick={() => setLoop(!loop)} style={{ background: C.bg2, border: `1px solid ${C.line}`, color: loop ? C.txt : C.faint, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Loop</button>
          <button className="gd-btn" onClick={() => setAutokey(!autokey)} title="Animate — ON: edits & drags record keyframes at the playhead. OFF: edits move the layer (or its whole animation) without adding keyframes."
            style={{ display: "flex", alignItems: "center", gap: 6, background: autokey ? C.amberSoft : C.bg2, border: `1px solid ${autokey ? C.amber : C.line}`, color: autokey ? C.amber : C.dim, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: autokey ? C.amber : C.faint, boxShadow: autokey ? `0 0 8px ${C.amber}` : "none" }} />Animate
          </button>
          <div style={{ flex: 1 }} />
          {selMany.length > 1 && <button className="gd-btn" onClick={groupSelection} style={{ ...chipStyle, cursor: "pointer", borderColor: C.amber, color: C.amber }}>⌘G Group {selMany.length} → Clip</button>}
          <span style={{ color: C.faint, fontSize: 10.5 }}>drag bar = move · edges = trim · right-click = easing</span>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0, overflowY: "auto" }}>
          <div style={{ width: 212, flexShrink: 0, borderRight: `1px solid ${C.line}` }}>
            <div style={{ height: 26 }} />
            {[...ctxLayers].reverse().map((o) => {
              const isSel = selIds.includes(o.id);
              return (
                <div key={o.id}
                  onClick={(e) => { if (e.ctrlKey || e.metaKey) setSelIds(isSel ? selIds.filter((i) => i !== o.id) : [...selIds, o.id]); else setSelIds([o.id]); setSelKf(null); }}
                  onDoubleClick={() => o.type === "clip" && enterClip(o.id)}
                  onContextMenu={(e) => onLayerContext(e, o)}
                  style={{ height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 6px", cursor: "pointer", background: isSel ? C.bg3 : "transparent", borderLeft: isSel ? `2px solid ${C.amber}` : "2px solid transparent", opacity: o.hidden ? 0.45 : o.locked ? 0.65 : 1 }}>
                  <button title={o.hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); toggleHide(o.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, width: 15, color: o.hidden ? C.amber : C.faint }}>{o.hidden ? "⊘" : "◉"}</button>
                  <button title={o.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); toggleLock(o.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: 0, width: 15, color: o.locked ? C.amber : C.faint }}>{o.locked ? "🔒" : "🔓"}</button>
                  {o.type === "clip"
                    ? <span style={{ width: 11, height: 10, flexShrink: 0, position: "relative" }}><span style={{ position: "absolute", inset: "0 2px 2px 0", border: `1.5px solid ${C.amber}`, borderRadius: 2 }} /><span style={{ position: "absolute", inset: "2px 0 0 2px", border: `1.5px solid ${C.amber}`, borderRadius: 2, background: C.bg1 }} /></span>
                    : <span style={{ width: 9, height: 9, borderRadius: 3, background: o.type === "confetti" ? "linear-gradient(135deg,#F5A524,#E5636A)" : o.type === "map" || o.type === "world" ? o.props.stroke : o.type === "image" ? "#939BAD" : colorAt(o, "fill", time), flexShrink: 0, border: `1px solid ${C.line}` }} />}
                  <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? C.txt : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                    {o.name}{o.type === "clip" && <span style={{ color: C.faint, fontWeight: 500 }}> ·{o.children.length}</span>}
                  </span>
                  {isSel && selIds.length === 1 && (
                    <span style={{ display: "flex", gap: 1 }}>
                      <MiniBtn title="Front" onClick={(e) => { e.stopPropagation(); reorder(o.id, +1); }}>▲</MiniBtn>
                      <MiniBtn title="Back" onClick={(e) => { e.stopPropagation(); reorder(o.id, -1); }}>▼</MiniBtn>
                      <MiniBtn title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateSelected(); }}>⧉</MiniBtn>
                      <MiniBtn title="Delete" danger onClick={(e) => { e.stopPropagation(); removeSelected(); }}>✕</MiniBtn>
                    </span>
                  )}
                </div>
              );
            })}
            {/* audio lane header (main timeline only — project audio lives at root) */}
            {!inClip && (
              <div onPointerDown={onAudioLaneDown} title={audioTrack ? `${audioTrack.name} — click to select` : "No audio attached — click to open the Audio panel"}
                style={{ height: 36, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", cursor: "pointer", borderTop: `1px solid ${C.line}`, background: audioLaneSel ? C.bg3 : "transparent", borderLeft: audioLaneSel ? `2px solid ${C.amber}` : "2px solid transparent", boxSizing: "border-box" }}>
                <NoteIcon size={13} color={audioTrack ? C.amber : C.faint} />
                <span style={{ fontSize: 12, fontWeight: 600, color: audioLaneSel ? C.txt : audioTrack ? C.dim : C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                  {audioTrack ? audioTrack.name : "Audio"}
                </span>
                {audioTrack && <span style={{ fontSize: 9.5, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>{fmt(audioTrack.startT)}</span>}
              </div>
            )}
          </div>

          <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            <div ref={rulerRef} onPointerDown={onRulerDown} style={{ height: 26, position: "relative", cursor: "col-resize", borderBottom: `1px solid ${C.line}`, background: C.bg2 }}>
              {Array.from({ length: 11 }).map((_, i) => (
                <div key={i} style={{ position: "absolute", left: `${i * 10}%`, top: 0, bottom: 0 }}>
                  <div style={{ width: 1, height: i % 2 === 0 ? 10 : 6, background: C.faint, opacity: 0.6 }} />
                  {i % 2 === 0 && <span style={{ position: "absolute", top: 9, left: 3, fontSize: 9.5, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>{((i * ctxDur) / 10000).toFixed(1)}s</span>}
                </div>
              ))}
            </div>

            <div onPointerDown={onRulerDown} style={{ position: "relative" }}>
              {[...ctxLayers].reverse().map((o) => {
                const isClip = o.type === "clip";
                const bIn = isClip ? o.props.start : o.props.inT || 0;
                const bOut = isClip ? Math.min(ctxDur, o.props.start + o.props.dur / (o.props.speed || 1)) : Math.min(ctxDur, layerOut(o, ctxDur));
                const kfs = [];
                [...KF_PROPS, "shape"].forEach((p) => (o.tracks[p] || []).forEach((k) => kfs.push({ p, k })));
                const isSel = selIds.includes(o.id);
                return (
                  <div key={o.id} onDoubleClick={() => isClip && enterClip(o.id)} onContextMenu={(e) => onLaneContext(e, o)}
                    style={{ height: 30, position: "relative", borderBottom: `1px solid ${C.bg2}`, background: isSel ? "rgba(245,165,36,.04)" : "transparent" }}>
                    {/* layer bar: dark, draggable, trim handles */}
                    <div onPointerDown={(e) => onBarDown(e, o, "move")}
                      title={o.locked ? `${o.name} · locked` : isClip ? `${o.name} · drag to retime · dbl-click to open` : "Drag to move (keyframes travel with the bar) · drag edges to trim"}
                      style={{ position: "absolute", left: `${(bIn / ctxDur) * 100}%`, width: `${((bOut - bIn) / ctxDur) * 100}%`, top: 5, height: 20, background: TYPE_BAR[o.type] || "#3A4356", filter: isSel ? "brightness(1.35)" : "none", border: `1px solid ${isSel ? C.amber : "rgba(255,255,255,.2)"}`, borderRadius: 6, cursor: o.locked ? "not-allowed" : "grab", overflow: "hidden" }}>
                      
                      {isClip && <span style={{ position: "absolute", left: 7, top: 3, fontSize: 9.5, fontWeight: 700, color: C.amber, whiteSpace: "nowrap", pointerEvents: "none" }}>{o.name}{o.props.speed !== 1 ? ` · ${o.props.speed}×` : ""}{o.props.end === "loop" ? " · ∞" : ""}</span>}
                      {!o.locked && <>
                        <div onPointerDown={(e) => onBarDown(e, o, "in")} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(255,255,255,.07)", borderRight: `1px solid rgba(255,255,255,.12)` }} />
                        <div onPointerDown={(e) => onBarDown(e, o, "out")} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(255,255,255,.07)", borderLeft: `1px solid rgba(255,255,255,.12)` }} />
                      </>}
                    </div>
                    {/* keyframe markers */}
                    {kfs.map(({ p, k }, i) => {
                      const isSelK = selKf && selKf.objId === o.id && selKf.prop === p && Math.abs(selKf.t - k.t) <= 5;
                      const isColor = p === "fill";
                      const isShape = p === "shape";
                      const isProg = p === "prog";
                      const bg = isSelK ? C.txt : isColor ? k.v : isShape ? "#C084FC" : isProg ? "#6EE7B7" : C.amber;
                      return (
                        <span key={i} className={isColor || isShape ? "gd-kfc" : "gd-kf"} onPointerDown={(e) => onKfDown(e, o.id, p, k)}
                          title={`${PROP_LABEL[p]} @ ${fmt(k.t)}${isColor ? ` · ${k.v}` : ""} · ${EASE_LABEL[k.ease] || "Linear"}`}
                          style={{ position: "absolute", left: `${(k.t / ctxDur) * 100}%`, top: "50%", width: 9, height: 9, transform: isColor || isShape ? "translate(-50%,-50%)" : "translate(-50%,-50%) rotate(45deg)", background: bg, borderRadius: isColor || isShape ? "50%" : 1.5, border: isColor ? `1.5px solid #fff` : "none", cursor: "ew-resize", transition: "transform .1s", boxShadow: isSelK ? "0 0 0 3px rgba(245,165,36,.4)" : "none", zIndex: 2 }} />
                      );
                    })}
                    {o.type === "world" && normHi(o.props.hi).map((hh, wi) => {
                      const zw = worldZoomWindow(hh, o.props);
                      return (
                      <span key={"w" + wi}>
                        <span className="gd-kfc" onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "t", hh.t)} title={`${WORLD[hh.cc]?.n || hh.cc} appears @ ${fmt(hh.t)} · drag to retime`}
                          style={{ position: "absolute", left: `${(hh.t / ctxDur) * 100}%`, top: "50%", width: 9, height: 9, transform: "translate(-50%,-50%)", background: o.props.hiFill, border: "1.5px solid #fff", borderRadius: 2.5, cursor: "ew-resize", transition: "transform .1s", zIndex: 2 }} />
                        {hh.out != null && (
                          <span className="gd-kfc" onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "out", hh.out)} title={`${WORLD[hh.cc]?.n || hh.cc} hides @ ${fmt(hh.out)} · drag to retime`}
                            style={{ position: "absolute", left: `${(hh.out / ctxDur) * 100}%`, top: "50%", width: 9, height: 9, transform: "translate(-50%,-50%)", background: "transparent", border: `2px solid ${o.props.hiFill}`, borderRadius: 2.5, cursor: "ew-resize", transition: "transform .1s", zIndex: 2 }} />
                        )}
                        {hh.zoom !== false && <>
                          <span onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "zoomIn", zw.zin)}
                            title={`${WORLD[hh.cc]?.n || hh.cc} zoom-in @ ${fmt(zw.zin)}${zw.zinAuto ? " (auto — drag to set)" : " · drag to retime"}`}
                            style={{ position: "absolute", left: `${(zw.zin / ctxDur) * 100}%`, top: "50%", width: 0, height: 0, transform: "translate(-2px,-50%)", borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid #5B8DEF", opacity: zw.zinAuto ? 0.4 : 1, cursor: "ew-resize", zIndex: 2 }} />
                          <span onPointerDown={(e) => onWorldKfDown(e, o.id, hh.cc, "zoomOut", zw.zout)}
                            title={`${WORLD[hh.cc]?.n || hh.cc} zoom-out @ ${fmt(zw.zout)}${zw.zoutAuto ? " (auto — drag to set)" : " · drag to retime"}`}
                            style={{ position: "absolute", left: `${(zw.zout / ctxDur) * 100}%`, top: "50%", width: 0, height: 0, transform: "translate(-6px,-50%)", borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: "8px solid #5B8DEF", opacity: zw.zoutAuto ? 0.4 : 1, cursor: "ew-resize", zIndex: 2 }} />
                        </>}
                      </span>
                      );
                    })}
                  </div>
                );
              })}
              {/* audio lane — flat labeled bar (waveform deliberately deferred); drag the bar to retime startT */}
              {!inClip && (
                <div onPointerDown={onAudioLaneDown} title={audioTrack ? undefined : "No audio attached — click to open the Audio panel"}
                  style={{ height: 36, position: "relative", borderTop: `1px solid ${C.line}`, background: audioLaneSel ? "rgba(245,165,36,.04)" : "transparent" }}>
                  {audioTrack ? (
                    <div onPointerDown={onAudioBarDown}
                      title={`${audioTrack.name} · starts ${fmt(audioTrack.startT)} · drag to retime (100ms snap)`}
                      style={{ position: "absolute", left: `${(audioTrack.startT / ctxDur) * 100}%`, width: `${(audioBarMs / ctxDur) * 100}%`, minWidth: 48, top: 6, height: 24, background: "#1F3D33", filter: audioLaneSel ? "brightness(1.35)" : "none", border: `1px solid ${audioLaneSel ? C.amber : "rgba(255,255,255,.2)"}`, borderRadius: 6, cursor: "grab", overflow: "hidden", display: "flex", alignItems: "center", gap: 6, padding: "0 8px", boxSizing: "border-box" }}>
                      <span style={{ display: "flex", flexShrink: 0, pointerEvents: "none" }}><NoteIcon size={12} color="#3FB68B" /></span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#9AD9BE", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{audioTrack.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 9, color: "#6FA98E", fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums", pointerEvents: "none", flexShrink: 0 }}>{fmt(audioTrack.startT)}</span>
                    </div>
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 10px", gap: 6, color: C.faint, fontSize: 10.5, pointerEvents: "none" }}>
                      <NoteIcon size={12} color={C.faint} /> No audio attached — open the Audio panel to add a track
                    </div>
                  )}
                </div>
              )}
              <div style={{ position: "absolute", top: -26, bottom: 0, left: `${(time / ctxDur) * 100}%`, width: 2, background: C.amber, boxShadow: "0 0 6px rgba(245,165,36,.45)", pointerEvents: "none", zIndex: 5 }}>
                <div style={{ position: "absolute", top: 0, left: -5, width: 0, height: 0, borderLeft: "5.5px solid transparent", borderRight: "5.5px solid transparent", borderTop: `7px solid ${C.amber}` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
