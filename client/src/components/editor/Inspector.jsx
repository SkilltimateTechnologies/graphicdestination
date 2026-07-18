/* ============================================================
   INSPECTOR — right-hand property panel (per-type cards).
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { C, PROP_LABEL, TEXTFX_LIST, NUM_STYLES, NUM_STYLE_PRESETS, NUM_STYLE_RESET, PRESETS, TRANSITIONS, STAGE_PRESETS, kfAt, inputStyle, chipStyle, sectionLabel } from "./model";
import { Card, ChipRow, ColorKfRow, PropRow, FontControls, WorldPicker, Row, SliderRow, EaseCurve, NoteIcon, CamIcon, LockIcon } from "./ui";
import { EASE, EASE_LABEL } from "../../engine/easing.js";
import { SHAPE_IDS, SHAPE_DEFS, ptsToStr } from "../../engine/shapes.js";
import { MAPS, CONTINENT_NAMES, CONTINENTS, normHi } from "../../engine/maps.js";
import { CONFETTI_STYLES, confettiStyleOf, NUM_FORMATS } from "../../engine/fx.js";
import { CAM_PROPS, CAM_ZOOM_MIN, CAM_ZOOM_MAX, CAM_DEPTH_MIN, CAM_DEPTH_MAX, cameraAt, camTrackHost, clampDepth } from "../../engine/camera.js";

/* one-click camera presets — each writes TWO keyframes spanning the whole
   composition (0 → compDur) on its prop, easeInOutCubic like every default ◆ */
const CAM_PRESETS = [
  { id: "push", name: "Push In", prop: "zoom", v0: 1, v1: 1.15 },
  { id: "pull", name: "Pull Out", prop: "zoom", v0: 1.15, v1: 1 },
  { id: "panL", name: "Pan Left", prop: "x", v0: 0, v1: -120 },
  { id: "panR", name: "Pan Right", prop: "x", v0: 0, v1: 120 },
  { id: "drift", name: "Drift Up", prop: "y", v0: 0, v1: -80 },
];
/* ◆-only Inspector rows: these transform props are edited spatially on the
   canvas — their PropRow shows the value read-only + ◆ / ‹ › (no input) */
const TRANSFORM_RO_PROPS = ["x", "y", "rotation", "scale", "opacity"];

/* tiny 56×34 inline-SVG swatch for the number style presets — renders "123"
   in the preset's own style (bold / mono / outline / pill / neon / minimal) */
function NumStyleSwatch({ id }) {
  const T = (props) => <text x="28" y="23" textAnchor="middle" fontSize="16" fontFamily="'Space Grotesk'" {...props}>123</text>;
  switch (id) {
    case "bold": return <T fontWeight="800" fill="#E9ECF3" />;
    case "mono": return <T fontWeight="600" fill={C.amber} fontFamily="'JetBrains Mono'" />;
    case "outline": return <T fontWeight="800" fill="none" stroke="#E9ECF3" strokeWidth="1" />;
    case "pill": return (<><rect x="5" y="7" width="46" height="20" rx="10" fill={C.amber} /><T y="22" fontSize="14" fontWeight="700" fill="#1A1405" /></>);
    case "neon": return (<><T fontWeight="700" fill={C.amber} opacity="0.65" style={{ filter: "blur(2.5px)" }} /><T fontWeight="700" fill="#FFD984" /></>);
    case "minimal": return <T fontWeight="400" fill={C.dim} letterSpacing="3" />;
    default: return null;
  }
}

/* per-layer parallax depth slider — lives in the FIRST card of every object
   type (absent for the audio lane / camera selection). 0 = world-locked
   (default, omitted from the JSON); −0.9 far background … +1.5 foreground. */
function DepthRow({ value, onChange }) {
  const d = value || 0;
  const on = Math.abs(d) > 1e-9;
  return (
    <div title="Parallax depth vs. the scene camera — 0 world-locked · −0.9 far background (barely moves) · +1.5 foreground (whips past) · −1 in JSON = camera-locked overlay"
      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>Depth</span>
      <input type="range" min={CAM_DEPTH_MIN} max={CAM_DEPTH_MAX} step={0.05} value={d} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} aria-label="Parallax depth" />
      <span style={{ width: 40, textAlign: "right", fontFamily: "'JetBrains Mono'", fontSize: 10.5, fontVariantNumeric: "tabular-nums", color: on ? C.amber : C.txt }}>{d.toFixed(2)}</span>
    </div>
  );
}

export default function Inspector({ audioLaneSel, audioTrack, patchAudio, detachAudio, fmt, cameraLaneSel, camera, editCameraProp, setCameraKeyframe, removeCameraKeyframe, cameraKfNav, resetCamera, selCamKfData, setCameraSegmentEase, applyCameraPreset, selMany, groupSelection, align, duplicateSelected, removeSelected, inClip, ctx, sel, patchObject, toggleHide, toggleLock, stage, stageBg, setStageBg, applyStagePreset, stageIsPreset, enterClip, patchProps, ctxDur, stretchClipDur, stretchClips, setStretchClips, ungroupClip, morphQ, setMorphQ, time, timeRef, setShapeAt, editProp, removeKeyframe, setKeyframe, setSelKf, flowText, brand, SW, addPathTo, patchPath, animateAlongPath, kfNav, selectedKfData, setSegmentEase, applyPreset, fileRef }) {
  /* camera as a valueAt-compatible pseudo-object for the shared PropRow UI */
  const camObj = camTrackHost(camera);
  const camVals = cameraAt(camera, time);
  const CAM_ROW_CFG = { x: [-stage.w, stage.w, 1], y: [-stage.h, stage.h, 1], zoom: [CAM_ZOOM_MIN, CAM_ZOOM_MAX, 0.01] };
  const CAM_ROW_LABEL = { x: "Pan X", y: "Pan Y", zoom: "Zoom" };
  /* depth lives on props but 0 is the default — remove the key entirely so
     untouched layers keep their old-project JSON shape (no depth field) */
  const setDepth = (v) => {
    const d = clampDepth(v);
    if (Math.abs(d) < 1e-9) patchObject(sel.id, (o) => { const p = { ...o.props }; delete p.depth; return { ...o, props: p }; });
    else patchProps(sel.id, { depth: d });
  };
  /* number style preset click: reset every preset-controlled prop to inert,
     apply the preset patch, remember the swatch (amber ring). Outline inks
     its stroke from the layer's CURRENT fill so it never vanishes. */
  const applyNumPreset = (p) => {
    const patch = { ...NUM_STYLE_RESET, ...p.patch, numStyle: p.id };
    if (p.id === "outline" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(sel.props.fill || "")) patch.stroke = sel.props.fill;
    patchProps(sel.id, patch);
  };
  /* x/y/w/h/rotation moved on-canvas (direct manipulation) — Transform keeps only
     the props that aren't canvas-editable; the card collapses if that list is empty */
  /* Keyframeable transform props. x/y/rotation VALUES are edited on-canvas
     (direct manipulation) — these rows exist so users can set/jump/ease their
     KEYFRAMES; the on-canvas grips write the same base props. */
  const tProps = !sel || sel.type === "confetti" ? [] : sel.type === "world" ? (sel.props.autoZoom !== false ? ["scale", "opacity"] : ["scale", "opacity", "focus"]) : sel.props.path ? ["prog", "x", "y", "rotation", "scale", "opacity"] : ["x", "y", "rotation", "scale", "opacity"];
  return (
        <div style={{ width: 280, background: C.bg1, borderLeft: `1px solid ${C.line}`, overflowY: "auto", flexShrink: 0, padding: "12px 12px 30px" }}>
          {audioLaneSel ? (
            <Card title="Audio track" hint="main timeline">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <NoteIcon size={16} color={C.amber} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div title={audioTrack.name} style={{ fontSize: 12.5, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{audioTrack.name}</div>
                  <div style={{ fontSize: 10, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>starts {fmt(audioTrack.startT)} · drag the lane bar to retime</div>
                </div>
              </div>
              <SliderRow label="Volume" min={0} max={1} step={0.01} value={audioTrack.volume} onChange={(v) => patchAudio({ volume: v })} />
              <Row label="Fade in">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="number" min={0} step={100} value={audioTrack.fadeIn} onChange={(e) => patchAudio({ fadeIn: Math.max(0, Math.round(parseFloat(e.target.value) || 0)) })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
                  <span style={{ color: C.faint, fontSize: 10.5, flexShrink: 0 }}>ms</span>
                </div>
              </Row>
              <Row label="Fade out">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="number" min={0} step={100} value={audioTrack.fadeOut} onChange={(e) => patchAudio({ fadeOut: Math.max(0, Math.round(parseFloat(e.target.value) || 0)) })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
                  <span style={{ color: C.faint, fontSize: 10.5, flexShrink: 0 }}>ms</span>
                </div>
              </Row>
              <button className="gd-btn" onClick={detachAudio} style={{ ...chipStyle, cursor: "pointer", color: C.danger, width: "100%", padding: "7px 0", marginTop: 2 }}>✕ Remove audio from project</button>
            </Card>
          ) : cameraLaneSel ? (
            <div>
              <Card title="Camera" hint="2.5D scene · root timeline">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <CamIcon size={16} color={C.amber} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.txt }}>Scene camera</div>
                    <div style={{ fontSize: 10, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>
                      x {Math.round(camVals.x)} px · y {Math.round(camVals.y)} px · {camVals.zoom.toFixed(2)}×
                    </div>
                  </div>
                </div>
                {CAM_PROPS.map((p) => (
                  <PropRow key={p} obj={camObj} prop={p} time={time} ctxDur={ctxDur} stage={stage}
                    cfgMap={CAM_ROW_CFG} label={CAM_ROW_LABEL[p]}
                    onEdit={(v) => editCameraProp(p, v)}
                    onKfToggle={(has, v) => { if (has) removeCameraKeyframe(p, Math.round(time / 10) * 10); else setCameraKeyframe(p, time, v); }}
                    onNav={(dir) => cameraKfNav(p, dir)} />
                ))}
                <button className="gd-btn" onClick={() => CAM_PROPS.forEach((p) => setCameraKeyframe(p, time, camVals[p]))}
                  title="Keyframe all three camera props at the playhead with their current values"
                  style={{ width: "100%", background: C.bg2, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 6, padding: "7px 0", cursor: "pointer", fontWeight: 700, marginBottom: 8 }}>◆ Add keyframe at playhead</button>
                <div style={{ ...sectionLabel, margin: "2px 0 6px" }}>Presets · two ◆ spanning the comp</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 8 }}>
                  {CAM_PRESETS.map((pr) => (
                    <button key={pr.id} className="gd-btn" onClick={() => applyCameraPreset(pr.prop, pr.v0, pr.v1)}
                      title={`${pr.name}: ${pr.prop} ${pr.v0} → ${pr.v1} · keyframes at 0:00 and the end, ease in-out`}
                      style={{ ...chipStyle, cursor: "pointer", padding: "6px 5px", fontSize: 11, textAlign: "center" }}>{pr.name}</button>
                  ))}
                </div>
                <button className="gd-btn" onClick={resetCamera}
                  title="Remove every camera keyframe — the camera field leaves the project JSON and the scene renders exactly as before"
                  style={{ ...chipStyle, cursor: "pointer", color: C.danger, width: "100%", padding: "7px 0" }}>⟲ Reset camera</button>
                <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.55, marginTop: 9 }}>
                  On-canvas: drag empty stage space to pan · Alt+wheel (or wheel while this card is open) to zoom.
                  Layers react through their <b style={{ color: C.txt }}>Depth</b>: −0.9 far background · 0 world-locked · +1.5 foreground · −1 = camera-locked overlay (JSON only).
                  The camera applies at the root scene only — clips edit in raw clip space.
                </div>
              </Card>
              {selCamKfData && (
                <Card title="Camera easing" hint={`${CAM_ROW_LABEL[selCamKfData.prop]} @ ${fmt(selCamKfData.t)}`}>
                  <EaseCurve ease={selCamKfData.k.ease} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {Object.keys(EASE).map((e) => (
                      <button key={e} className="gd-btn" onClick={() => setCameraSegmentEase(selCamKfData.prop, selCamKfData.t, e)}
                        style={{ ...chipStyle, cursor: "pointer", borderColor: selCamKfData.k.ease === e ? C.amber : C.line, color: selCamKfData.k.ease === e ? C.amber : C.dim }}>{EASE_LABEL[e]}</button>
                    ))}
                  </div>
                  <div style={{ color: C.faint, fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>Shapes the segment leaving this ◆. Click a diamond on the Camera lane to pick a keyframe.</div>
                </Card>
              )}
            </div>
          ) : selMany.length > 1 ? (
            <Card title={`${selMany.length} layers selected`}>
              <button className="gd-btn" onClick={groupSelection} style={{ width: "100%", background: C.amber, color: "#1a1405", border: "none", borderRadius: 6, padding: "9px 0", cursor: "pointer", fontWeight: 700, marginBottom: 12 }}>⌘G · Group into Clip</button>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
                {[["left", "⇤"], ["hcenter", "↔"], ["right", "⇥"], ["top", "⤒"], ["vcenter", "↕"], ["bottom", "⤓"]].map(([m, ic]) => (
                  <button key={m} className="gd-btn" onClick={() => align(m)} style={{ ...chipStyle, cursor: "pointer", borderRadius: 6, padding: "7px 0", textAlign: "center" }}>{ic}</button>
                ))}
              </div>
              <button className="gd-btn" onClick={duplicateSelected} style={{ ...chipStyle, cursor: "pointer", marginRight: 6 }}>⧉ Duplicate</button>
              <button className="gd-btn" onClick={removeSelected} style={{ ...chipStyle, cursor: "pointer", color: C.danger }}>✕ Delete</button>
            </Card>
          ) : !sel ? (
            <Card title={inClip ? `Clip: ${ctx.names[ctx.names.length - 1]}` : "Stage"}>
              {!inClip && <Row label="Size">
                <select value={`${stage.w}x${stage.h}`} onChange={(e) => applyStagePreset(e.target.value)} aria-label="Stage size preset">
                  {!stageIsPreset && <option value={`${stage.w}x${stage.h}`}>Custom · {stage.w}×{stage.h}</option>}
                  {STAGE_PRESETS.map((p) => <option key={p.id} value={`${p.w}x${p.h}`}>{p.name}</option>)}
                </select>
              </Row>}
              {!inClip && (
                <div style={{ color: C.faint, fontSize: 10.5, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums", marginTop: -2, marginBottom: 8 }}>
                  {stage.w}×{stage.h} px · exports at this size
                </div>
              )}
              {!inClip && <Row label="Background"><input type="color" value={stageBg} onChange={(e) => setStageBg(e.target.value)} /></Row>}
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.65 }}>
                {inClip ? "You're inside a clip — its timeline runs on local time." : "Add layers from the rail. Drag on stage with Autokey to record motion. Right-click between two ◆ on the timeline to set that segment's easing."}
              </div>
            </Card>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <input value={sel.name} onChange={(e) => patchObject(sel.id, (o) => ({ ...o, name: e.target.value }))} style={{ ...inputStyle, fontWeight: 700 }} />
                <button className="gd-btn" title={sel.hidden ? "Show" : "Hide"} onClick={() => toggleHide(sel.id)}
                  style={{ ...chipStyle, cursor: "pointer", padding: "5px 9px", borderColor: sel.hidden ? C.amber : C.line, color: sel.hidden ? C.amber : C.dim }}>{sel.hidden ? "⊘" : "◉"}</button>
                <button className="gd-btn" title={sel.locked ? "Unlock" : "Lock"} onClick={() => toggleLock(sel.id)}
                  style={{ ...chipStyle, cursor: "pointer", padding: "5px 9px", borderColor: sel.locked ? C.amber : C.line, color: sel.locked ? C.amber : C.dim, display: "flex", alignItems: "center" }}>
                  <LockIcon locked={sel.locked} size={13} color={sel.locked ? C.amber : C.dim} />
                </button>
              </div>
              <div style={{ color: C.faint, fontSize: 11, marginBottom: 10 }}>{sel.type}{sel.type === "clip" ? ` · ${sel.children.length} layers` : ""}{sel.locked ? " · locked" : ""}{sel.hidden ? " · hidden" : ""}</div>

              {sel.type === "clip" && (
                <Card title="Clip">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <button className="gd-btn" onClick={() => enterClip(sel.id)} style={{ width: "100%", background: C.amber, color: "#1a1405", border: "none", borderRadius: 6, padding: "8px 0", cursor: "pointer", fontWeight: 700, marginBottom: 10 }}>Open clip timeline →</button>
                  <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 100)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                  <SliderRow label="Duration" min={300} max={15000} step={100} value={sel.props.dur} onChange={(v) => stretchClipDur(sel.id, v)} />
                  <label style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 11.5, fontWeight: 600, marginBottom: 9, cursor: "pointer" }}>
                    <input type="checkbox" checked={stretchClips} onChange={(e) => setStretchClips(e.target.checked)} />
                    Time-stretch contents with duration
                  </label>
                  <ChipRow label="Speed" options={[[0.5, "0.5×"], [1, "1×"], [1.5, "1.5×"], [2, "2×"]]} value={sel.props.speed} onChange={(v) => patchProps(sel.id, { speed: v })} />
                  <ChipRow label="After end" options={[["hold", "Hold"], ["hide", "Hide"], ["loop", "Loop"]]} value={sel.props.end} onChange={(v) => patchProps(sel.id, { end: v })} />
                  <button className="gd-btn" onClick={() => ungroupClip(sel.id)} style={{ ...chipStyle, cursor: "pointer" }}>⛓ Ungroup</button>
                </Card>
              )}
              {sel.type === "clip" && (
                <Card title="Clip background">
                  <Row label="Color">
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="gd-btn" onClick={() => patchProps(sel.id, { bg: "" })} style={{ ...chipStyle, cursor: "pointer", borderColor: !sel.props.bg ? C.amber : C.line, color: !sel.props.bg ? C.amber : C.dim }}>None</button>
                      <input type="color" value={sel.props.bg || "#141926"} onChange={(e) => patchProps(sel.id, { bg: e.target.value })} />
                    </div>
                  </Row>
                </Card>
              )}
              {sel.type === "clip" && (
                <Card title="Transitions" hint="in / out">
                  <ChipRow label="In" options={TRANSITIONS.map((t) => [t.id, t.name])} value={sel.props.tIn} onChange={(v) => patchProps(sel.id, { tIn: v })} wrap />
                  <ChipRow label="Out" options={TRANSITIONS.map((t) => [t.id, t.name])} value={sel.props.tOut} onChange={(v) => patchProps(sel.id, { tOut: v })} wrap />
                  <SliderRow label="Length" min={150} max={1500} step={10} value={sel.props.tDur} onChange={(v) => patchProps(sel.id, { tDur: v })} />
                  {sel.props.tOut !== "none" && sel.props.end !== "hide" && <div style={{ color: C.amber, fontSize: 10.5, lineHeight: 1.5 }}>Out transition plays when "After end" is set to Hide.</div>}
                </Card>
              )}

              {sel.type === "shape" && (
                <Card title="Shape" hint="click = morph keyframe">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <input value={morphQ} onChange={(e) => setMorphQ(e.target.value)} placeholder="Search shapes…" style={{ ...inputStyle, marginBottom: 7 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5, marginBottom: 9 }}>
                    {SHAPE_IDS.filter((sid) => SHAPE_DEFS[sid].name.toLowerCase().includes(morphQ.toLowerCase())).map((sid) => {
                      const atNow = kfAt(sel.tracks.shape, Math.round(time / 10) * 10);
                      const isCur = atNow ? atNow.v === sid : (!sel.tracks.shape?.length && sel.props.shape === sid);
                      return (
                        <button key={sid} className="gd-btn" title={SHAPE_DEFS[sid].name} onClick={() => setShapeAt(sel.id, sid)}
                          style={{ background: C.bg2, border: `1px solid ${isCur ? C.amber : C.line}`, borderRadius: 6, padding: 4, cursor: "pointer", aspectRatio: "1" }}>
                          <svg width="100%" height="100%" viewBox="-6 -6 112 112"><polygon points={ptsToStr(SHAPE_DEFS[sid].pts)} fill={isCur ? C.amber : C.dim} /></svg>
                        </button>
                      );
                    })}
                  </div>
                  <ChipRow label="Style" options={[["fill", "Fill"], ["stroke", "Border"], ["both", "Both"]]} value={sel.props.fillMode} onChange={(v) => patchProps(sel.id, { fillMode: v })} />
                  <ColorKfRow label="Fill" obj={sel} time={time} sw={SW} onEdit={(v) => editProp(sel.id, "fill", v)} onKf={(has, v) => { if (has) removeKeyframe(sel.id, "fill", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "fill", time, v); setSelKf({ objId: sel.id, prop: "fill", t: T }); } }} />
                  {sel.props.fillMode !== "fill" && (
                    <>
                      <Row label="Border"><input type="color" value={sel.props.sC} onChange={(e) => patchProps(sel.id, { sC: e.target.value })} /></Row>
                      <SliderRow label="Border W" min={1} max={16} value={sel.props.sW} onChange={(v) => patchProps(sel.id, { sW: v })} />
                    </>
                  )}
                  <SliderRow label="Corner R" min={0} max={49} value={sel.props.cornerR} onChange={(v) => patchProps(sel.id, { cornerR: v })} />
                </Card>
              )}

              {sel.type === "text" && (
                <Card title="Text">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <Row label="Text"><input value={sel.props.text} onChange={(e) => patchProps(sel.id, { text: e.target.value })} style={inputStyle} /></Row>
                  <FontControls P={sel.props} onChange={(patch) => patchProps(sel.id, patch)} showSpacing brand={brand} />
                  <ColorKfRow label="Color" obj={sel} time={time} sw={SW} onEdit={(v) => editProp(sel.id, "fill", v)} onKf={(has, v) => { if (has) removeKeyframe(sel.id, "fill", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "fill", time, v); setSelKf({ objId: sel.id, prop: "fill", t: T }); } }} />
                  {flowText && <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, margin: "8px 0" }}>Flowing on a path — animate with <b style={{ color: C.txt }}>Path progress</b>, <b style={{ color: C.txt }}>Rotation</b> (spins around the loop), <b style={{ color: C.txt }}>Scale</b> and <b style={{ color: C.txt }}>Opacity</b> (flow in, fade out). Text FX and boxes apply in normal or Travel mode.</div>}
                  {!flowText && <div style={{ ...sectionLabel, margin: "10px 0 6px" }}>TEXT FX · starts at playhead</div>}
                  {!flowText && sel.props.textFx && <SliderRow label="FX speed" min={0.25} max={3} step={0.05} value={sel.props.textFx.speed || 1} onChange={(v) => patchProps(sel.id, { textFx: { ...sel.props.textFx, speed: v } })} />}
                  {!flowText && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    {TEXTFX_LIST.map((fx) => {
                      const on = (sel.props.textFx?.type || "none") === fx.id;
                      return <button key={fx.id} className="gd-btn" onClick={() => patchProps(sel.id, { textFx: fx.id === "none" ? null : { type: fx.id, start: Math.round(timeRef.current / 10) * 10, seed: Math.floor(Math.random() * 9999) } })}
                        style={{ background: C.bg2, border: `1px solid ${on ? C.amber : C.line}`, color: on ? C.amber : C.txt, borderRadius: 6, padding: "6px 5px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{fx.name}</button>;
                    })}
                  </div>}
                </Card>
              )}

              {sel.type === "number" && (
                <Card title="Number">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  {/* mode selection lives in the Number rail panel (count up / countdown / odometer insert buttons) — no duplicate chips here */}
                  <ChipRow label="Format" options={NUM_FORMATS.map((f) => [f.id, f.name])} value={sel.props.format || "plain"} onChange={(v) => patchProps(sel.id, { format: v })} wrap />
                  {(sel.props.format || "plain") === "time" && <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, margin: "-4px 0 8px" }}>Seconds in, mm:ss out — pairs with Countdown mode.</div>}
                  <div style={{ color: C.dim, fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Style presets</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 8 }}>
                    {NUM_STYLE_PRESETS.map((p) => {
                      const on = sel.props.numStyle === p.id;
                      return (
                        <button key={p.id} className="gd-btn" title={`${p.name} — ${p.hint}`} onClick={() => applyNumPreset(p)}
                          style={{ background: C.bg1, border: `1px solid ${on ? C.amber : C.line}`, borderRadius: 6, padding: 3, cursor: "pointer", boxShadow: on ? `0 0 0 1px ${C.amber}` : "none" }}>
                          <svg width="100%" height="34" viewBox="0 0 56 34" style={{ display: "block" }}><NumStyleSwatch id={p.id} /></svg>
                        </button>
                      );
                    })}
                  </div>
                  {!!sel.props.stroke && (
                    <Row label="Stroke"><input type="color" value={(sel.props.stroke || "#FFB224").slice(0, 7)} onChange={(e) => patchProps(sel.id, { stroke: e.target.value })} /></Row>
                  )}
                  {!!sel.props.pillBg && (
                    <Row label="Pill"><input type="color" value={(sel.props.pillBg || "#FFB224").slice(0, 7)} onChange={(e) => patchProps(sel.id, { pillBg: e.target.value })} /></Row>
                  )}
                  <Row label="From"><input type="number" value={sel.props.from} onChange={(e) => patchProps(sel.id, { from: Math.max(0, parseFloat(e.target.value) || 0) })} style={inputStyle} /></Row>
                  <Row label="To"><input type="number" value={sel.props.to} onChange={(e) => patchProps(sel.id, { to: Math.max(0, parseFloat(e.target.value) || 0) })} style={inputStyle} /></Row>
                  <ChipRow label="Digits" options={NUM_STYLES.map((s) => [s.id, s.name])} value={sel.props.style} onChange={(v) => patchProps(sel.id, { style: v })} wrap />
                  <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                  <SliderRow label="Duration" min={300} max={5000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                  <SliderRow label="Decimals" min={0} max={2} value={sel.props.decimals} onChange={(v) => patchProps(sel.id, { decimals: v })} />
                  <Row label="Prefix"><input value={sel.props.prefix} onChange={(e) => patchProps(sel.id, { prefix: e.target.value })} style={inputStyle} placeholder="$" /></Row>
                  <Row label="Suffix"><input value={sel.props.suffix} onChange={(e) => patchProps(sel.id, { suffix: e.target.value })} style={inputStyle} placeholder="+" /></Row>
                  <ChipRow label="Ease" options={[["easeOutCubic", "Out Cubic"], ["easeInOutCubic", "In-Out"], ["linear", "Linear"], ["easeInOutSine", "Apple"]]} value={sel.props.numEase} onChange={(v) => patchProps(sel.id, { numEase: v })} wrap />
                  <ChipRow label="Counter" options={[["none", "Plain"], ["ring", "Ring"], ["pie", "Pie wipe"]]} value={sel.props.ring || "none"} onChange={(v) => patchProps(sel.id, { ring: v })} />
                  {(sel.props.ring || "none") !== "none" && <>
                    <Row label="Ring"><input type="color" value={sel.props.ringC} onChange={(e) => patchProps(sel.id, { ringC: e.target.value })} /></Row>
                    <SliderRow label="Ring W" min={3} max={22} value={sel.props.ringW} onChange={(v) => patchProps(sel.id, { ringW: v })} />
                    <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5 }}>Counting down (To &lt; From, or Countdown mode)? The circle depletes like a game timer. Counting up? It fills.</div>
                  </>}
                  <FontControls P={sel.props} onChange={(patch) => patchProps(sel.id, patch)} brand={brand} />
                  <ColorKfRow label="Color" obj={sel} time={time} sw={SW} onEdit={(v) => editProp(sel.id, "fill", v)} onKf={(has, v) => { if (has) removeKeyframe(sel.id, "fill", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "fill", time, v); setSelKf({ objId: sel.id, prop: "fill", t: T }); } }} />
                </Card>
              )}

              {(sel.type === "text" || sel.type === "number") && !flowText && !(sel.type === "number" && (sel.props.ring || "none") !== "none") && (
                <Card title="Box" hint="background + border">
                  <Row label="Fill">
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="gd-btn" onClick={() => patchProps(sel.id, { bg: "" })} style={{ ...chipStyle, cursor: "pointer", borderColor: !sel.props.bg ? C.amber : C.line, color: !sel.props.bg ? C.amber : C.dim }}>None</button>
                      <input type="color" value={(sel.props.bg || "#141926").slice(0, 7)} onChange={(e) => patchProps(sel.id, { bg: e.target.value })} />
                    </div>
                  </Row>
                  <SliderRow label="Padding" min={0} max={80} value={sel.props.pad} onChange={(v) => patchProps(sel.id, { pad: v })} />
                  <SliderRow label="Radius" min={0} max={90} value={sel.props.radius} onChange={(v) => patchProps(sel.id, { radius: v })} />
                  <SliderRow label="Border W" min={0} max={8} step={0.5} value={sel.props.borderW} onChange={(v) => patchProps(sel.id, { borderW: v })} />
                  <Row label="Border"><input type="color" value={sel.props.borderC} onChange={(e) => patchProps(sel.id, { borderC: e.target.value })} /></Row>
                  <ChipRow label="Glow" options={[["none", "None"], ["glow", "Glow"], ["pulse", "Pulse"]]} value={sel.props.boxFx} onChange={(v) => patchProps(sel.id, { boxFx: v })} />
                </Card>
              )}

              {sel.type === "image" && (
                <Card title="Image">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <button className="gd-btn" onClick={() => fileRef.current?.click()} style={{ ...chipStyle, cursor: "pointer" }}>Replace image…</button>
                </Card>
              )}

              {sel.type === "map" && (
                <Card title="Country map" hint="real outlines">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <ChipRow label="Country" options={Object.keys(MAPS).map((cc) => [cc, MAPS[cc].name])} value={sel.props.country} onChange={(v) => patchProps(sel.id, { country: v })} wrap />
                  <ChipRow label="Effect" options={[["plain", "Plain"], ["draw", "Draw & stay"], ["comet", "Comet"], ["neon", "Neon"], ["reveal", "Draw → Glow"], ["pulse", "Glow pulse"]]} value={sel.props.mapStyle} onChange={(v) => patchProps(sel.id, { mapStyle: v })} wrap />
                  <Row label="Fill"><input type="color" value={sel.props.fillC} onChange={(e) => patchProps(sel.id, { fillC: e.target.value })} /></Row>
                  <SliderRow label="Fill op." min={0} max={1} step={0.01} value={sel.props.fillOp} onChange={(v) => patchProps(sel.id, { fillOp: v })} />
                  <Row label="Border"><input type="color" value={sel.props.stroke} onChange={(e) => patchProps(sel.id, { stroke: e.target.value })} /></Row>
                  <SliderRow label="Border W" min={0.5} max={5} step={0.1} value={sel.props.strokeW} onChange={(v) => patchProps(sel.id, { strokeW: v })} />
                  {(sel.props.mapStyle === "draw" || sel.props.mapStyle === "reveal") && (
                    <>
                      <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                      <SliderRow label="Draw time" min={300} max={4000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                    </>
                  )}
                </Card>
              )}

              {sel.type === "world" && (
                <Card title="World map" hint="countries appear at their set time">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <WorldPicker hi={normHi(sel.props.hi)} fmt={fmt} zoomHoldMs={sel.props.zoomHoldMs || 1600}
                    onAdd={(cc) => patchProps(sel.id, { hi: [...normHi(sel.props.hi), { cc, t: Math.round(timeRef.current / 10) * 10, zoom: true }] })}
                    onRetime={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, t: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onRemove={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).filter((h) => h.cc !== cc) })}
                    onSetOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, out: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { out, ...rest } = h; return rest; }) })}
                    onSetZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomIn: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomIn, ...rest } = h; return rest; }) })}
                    onSetZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomOut: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomOut, ...rest } = h; return rest; }) })}
                    onToggleZoom={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoom: h.zoom === false } : h)) })} />
                  <ChipRow label="Reveal" options={[["simple", "Simple"], ["electric", "Electric"], ["pop", "Pop"], ["trace", "Trace"]]} value={sel.props.reveal || "simple"} onChange={(v) => patchProps(sel.id, { reveal: v })} />
                  <SliderRow label="Reveal ms" min={150} max={2500} step={10} value={sel.props.revealDur || 600} onChange={(v) => patchProps(sel.id, { revealDur: v })} />
                  <Row label="Highlight"><input type="color" value={sel.props.hiFill} onChange={(e) => patchProps(sel.id, { hiFill: e.target.value })} /></Row>
                  <Row label="Hi border"><input type="color" value={sel.props.hiStroke} onChange={(e) => patchProps(sel.id, { hiStroke: e.target.value })} /></Row>
                  <Row label="Base"><input type="color" value={sel.props.base} onChange={(e) => patchProps(sel.id, { base: e.target.value })} /></Row>
                  <SliderRow label="Base op." min={0.05} max={1} step={0.01} value={sel.props.baseOp} onChange={(v) => patchProps(sel.id, { baseOp: v })} />
                  <Row label="Outlines"><input type="color" value={sel.props.stroke} onChange={(e) => patchProps(sel.id, { stroke: e.target.value })} /></Row>
                  <ChipRow label="Glow" options={[[true, "On"], [false, "Off"]]} value={sel.props.glow} onChange={(v) => patchProps(sel.id, { glow: v })} />
                  <div style={{ ...sectionLabel, margin: "10px 0 5px" }}>ZOOM CAMERA</div>
                  <ChipRow label="Mode" options={[[true, "Automatic"], [false, "Manual"]]} value={sel.props.autoZoom !== false} onChange={(v) => patchProps(sel.id, { autoZoom: v })} />
                  {sel.props.autoZoom !== false ? (
                    <>
                      <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginBottom: 8 }}>Each country below has 4 independent points: appears, zoom‑in, zoom‑out, hides. Set any of them at the playhead — unset ones fall back automatically (zoom‑in = appear, zoom‑out = hide).</div>
                      <SliderRow label="Fallback ms" min={400} max={4000} step={50} value={sel.props.zoomHoldMs || 1600} onChange={(v) => patchProps(sel.id, { zoomHoldMs: v })} />
                      <SliderRow label="Ease ms" min={150} max={1500} step={10} value={sel.props.zoomTransMs || 550} onChange={(v) => patchProps(sel.id, { zoomTransMs: v })} />
                    </>
                  ) : (
                    <PropRow obj={sel} prop="focus" time={time} ctxDur={ctxDur} stage={stage}
                      onEdit={(v) => editProp(sel.id, "focus", v)}
                      onKfToggle={(has, v) => { if (has) removeKeyframe(sel.id, "focus", Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, "focus", time, v); setSelKf({ objId: sel.id, prop: "focus", t: T }); } }}
                      onNav={(dir) => kfNav(sel, "focus", dir)} />
                  )}
                  <SliderRow label="Zoom amount" min={1.4} max={5} step={0.1} value={sel.props.zoomK || 2.6} onChange={(v) => patchProps(sel.id, { zoomK: v })} />
                  <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginTop: 4 }}>Keyframe <b style={{ color: C.txt }}>Zoom focus</b> in Transform — the lit countries enlarge to the map's center while the rest of the world blurs behind them.</div>
                </Card>
              )}

              {sel.type === "continent" && (
                <Card title="Continent map" hint="all countries in the region">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <ChipRow label="Region" options={Object.keys(CONTINENT_NAMES).map((k) => [k, CONTINENT_NAMES[k]])} value={sel.props.continent} onChange={(v) => patchProps(sel.id, { continent: v })} wrap />
                  <ChipRow label="Effect" options={[["plain", "Plain"], ["draw", "Draw & stay"], ["comet", "Comet"], ["neon", "Neon"], ["reveal", "Draw → Glow"], ["pulse", "Glow pulse"]]} value={sel.props.mapStyle} onChange={(v) => patchProps(sel.id, { mapStyle: v })} wrap />
                  <Row label="Fill"><input type="color" value={sel.props.fillC} onChange={(e) => patchProps(sel.id, { fillC: e.target.value })} /></Row>
                  <SliderRow label="Fill op." min={0} max={1} step={0.01} value={sel.props.fillOp} onChange={(v) => patchProps(sel.id, { fillOp: v })} />
                  <Row label="Border"><input type="color" value={sel.props.stroke} onChange={(e) => patchProps(sel.id, { stroke: e.target.value })} /></Row>
                  <SliderRow label="Border W" min={0.3} max={3} step={0.1} value={sel.props.strokeW} onChange={(v) => patchProps(sel.id, { strokeW: v })} />
                  {(sel.props.mapStyle === "draw" || sel.props.mapStyle === "reveal") && (
                    <>
                      <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                      <SliderRow label="Draw time" min={300} max={5000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                    </>
                  )}
                  <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, marginTop: 4 }}>Every country border in the region shares this effect — the comet travels every outline, the glow lights the whole cluster.</div>
                </Card>
              )}
              {sel.type === "continent" && (
                <Card title="Highlight a country" hint="zooms in, just like World map">
                  <WorldPicker hi={normHi(sel.props.hi)} fmt={fmt} zoomHoldMs={sel.props.zoomHoldMs || 1600} scopeCodes={CONTINENTS[sel.props.continent] || []}
                    onAdd={(cc) => patchProps(sel.id, { hi: [...normHi(sel.props.hi), { cc, t: Math.round(timeRef.current / 10) * 10, zoom: true }] })}
                    onRetime={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, t: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onRemove={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).filter((h) => h.cc !== cc) })}
                    onSetOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, out: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { out, ...rest } = h; return rest; }) })}
                    onSetZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomIn: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomIn={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomIn, ...rest } = h; return rest; }) })}
                    onSetZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoomOut: Math.round(timeRef.current / 10) * 10 } : h)) })}
                    onClearZoomOut={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => { if (h.cc !== cc) return h; const { zoomOut, ...rest } = h; return rest; }) })}
                    onToggleZoom={(cc) => patchProps(sel.id, { hi: normHi(sel.props.hi).map((h) => (h.cc === cc ? { ...h, zoom: h.zoom === false } : h)) })} />
                  <ChipRow label="Reveal" options={[["simple", "Simple"], ["electric", "Electric"], ["pop", "Pop"], ["trace", "Trace"]]} value={sel.props.reveal || "simple"} onChange={(v) => patchProps(sel.id, { reveal: v })} />
                  <SliderRow label="Reveal ms" min={150} max={2500} step={10} value={sel.props.revealDur || 600} onChange={(v) => patchProps(sel.id, { revealDur: v })} />
                  <Row label="Highlight"><input type="color" value={sel.props.hiFill} onChange={(e) => patchProps(sel.id, { hiFill: e.target.value })} /></Row>
                  <Row label="Hi border"><input type="color" value={sel.props.hiStroke} onChange={(e) => patchProps(sel.id, { hiStroke: e.target.value })} /></Row>
                  <ChipRow label="Glow" options={[[true, "On"], [false, "Off"]]} value={sel.props.glow} onChange={(v) => patchProps(sel.id, { glow: v })} />
                  {normHi(sel.props.hi).length > 0 && (
                    <>
                      <ChipRow label="Zoom" options={[[true, "Automatic"], [false, "Manual off"]]} value={sel.props.autoZoom !== false} onChange={(v) => patchProps(sel.id, { autoZoom: v })} />
                      <SliderRow label="Zoom amount" min={1.2} max={4} step={0.1} value={sel.props.zoomK || 2.2} onChange={(v) => patchProps(sel.id, { zoomK: v })} />
                      <SliderRow label="Hold fallback" min={400} max={4000} step={50} value={sel.props.zoomHoldMs || 1600} onChange={(v) => patchProps(sel.id, { zoomHoldMs: v })} />
                    </>
                  )}
                </Card>
              )}
              {sel.type === "chart" && (
                <Card title="Chart" hint="one row per line: Label, value">
                  {/* chart type is chosen at insert (Charts rail panel) — not switchable here */}
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <textarea value={sel.props.dataStr} onChange={(e) => patchProps(sel.id, { dataStr: e.target.value })}
                    style={{ ...inputStyle, height: 92, resize: "none", fontFamily: "'JetBrains Mono'", fontSize: 11, marginBottom: 8 }} placeholder={"Q1, 42\nQ2, 65"} />
                  {sel.props.chartType !== "gauge" && <ChipRow label="Values" options={[[true, "Show"], [false, "Hide"]]} value={sel.props.showVals} onChange={(v) => patchProps(sel.id, { showVals: v })} />}
                  <SliderRow label="Start" min={0} max={Math.max(100, ctxDur - 300)} step={10} value={sel.props.start} onChange={(v) => patchProps(sel.id, { start: v })} />
                  <SliderRow label="Duration" min={400} max={5000} step={10} value={sel.props.dur} onChange={(v) => patchProps(sel.id, { dur: v })} />
                  <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5 }}>Series colors follow the brand palette. Bars stagger in, lines draw on, donuts sweep, the gauge always reads a % — all easing-finished.</div>
                </Card>
              )}
              {sel.type === "chart" && (
                <Card title="Chart box" hint="background + border">
                  <Row label="Fill">
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="gd-btn" onClick={() => patchProps(sel.id, { bg: "" })} style={{ ...chipStyle, cursor: "pointer", borderColor: !sel.props.bg ? C.amber : C.line, color: !sel.props.bg ? C.amber : C.dim }}>None</button>
                      <input type="color" value={sel.props.bg || "#171B24"} onChange={(e) => patchProps(sel.id, { bg: e.target.value })} />
                    </div>
                  </Row>
                  <SliderRow label="Fill op." min={0} max={1} step={0.01} value={sel.props.bgOp} onChange={(v) => patchProps(sel.id, { bgOp: v })} />
                  <SliderRow label="Padding" min={0} max={80} value={sel.props.pad} onChange={(v) => patchProps(sel.id, { pad: v })} />
                  <SliderRow label="Radius" min={0} max={60} value={sel.props.radius} onChange={(v) => patchProps(sel.id, { radius: v })} />
                  <SliderRow label="Border W" min={0} max={8} step={0.5} value={sel.props.borderW} onChange={(v) => patchProps(sel.id, { borderW: v })} />
                  <Row label="Border"><input type="color" value={sel.props.borderC} onChange={(e) => patchProps(sel.id, { borderC: e.target.value })} /></Row>
                </Card>
              )}
              {sel.type === "confetti" && (
                <Card title="Confetti">
                  <DepthRow value={sel.props.depth} onChange={setDepth} />
                  <ChipRow label="Style" options={CONFETTI_STYLES.map((s) => [s.id, s.name])} value={confettiStyleOf(sel.props)} onChange={(v) => patchProps(sel.id, { style: v })} wrap />
                  <SliderRow label="Burst" min={0} max={Math.max(100, ctxDur - 500)} step={10} value={sel.props.burst} onChange={(v) => patchProps(sel.id, { burst: v })} />
                  <SliderRow label="Particles" min={20} max={160} value={sel.props.count} onChange={(v) => patchProps(sel.id, { count: v })} />
                  <SliderRow label="Power" min={0.4} max={2} step={0.05} value={sel.props.power} onChange={(v) => patchProps(sel.id, { power: v })} />
                  <Row label="Seed"><button className="gd-btn" onClick={() => patchProps(sel.id, { seed: Math.floor(Math.random() * 9999) })} style={{ ...chipStyle, cursor: "pointer" }}>#{sel.props.seed} · shuffle</button></Row>
                </Card>
              )}

              {(sel.type === "shape" || sel.type === "text" || sel.type === "image" || sel.type === "number") && (
                <Card title="Motion path" hint={sel.props.path ? "object follows the line" : ""}>
                  {!sel.props.path ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="gd-btn" onClick={() => addPathTo(sel.id, "line")} style={{ ...chipStyle, cursor: "pointer" }}>─ Line path</button>
                      <button className="gd-btn" onClick={() => addPathTo(sel.id, "circle")} style={{ ...chipStyle, cursor: "pointer" }}>◯ Circle path</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => ({ ...p, show: !p.show }))} style={{ ...chipStyle, cursor: "pointer", borderColor: sel.props.path.show ? C.amber : C.line, color: sel.props.path.show ? C.amber : C.dim }}>{sel.props.path.show ? "Guide on" : "Guide off"}</button>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => ({ ...p, curved: !p.curved }))} style={{ ...chipStyle, cursor: "pointer", borderColor: sel.props.path.curved ? C.amber : C.line, color: sel.props.path.curved ? C.amber : C.dim }}>{sel.props.path.curved ? "Curved" : "Straight"}</button>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => ({ ...p, closed: !p.closed }))} style={{ ...chipStyle, cursor: "pointer", borderColor: sel.props.path.closed ? C.amber : C.line, color: sel.props.path.closed ? C.amber : C.dim }}>{sel.props.path.closed ? "Closed loop" : "Open ends"}</button>
                        <button className="gd-btn" onClick={() => patchPath(sel.id, (p) => { const l = p.pts[p.pts.length - 1]; return { ...p, pts: [...p.pts, [Math.min(stage.w - 40, l[0] + 160), l[1]]] }; })} style={{ ...chipStyle, cursor: "pointer" }}>＋ Point</button>
                        <button className="gd-btn" onClick={() => patchProps(sel.id, { path: null })} style={{ ...chipStyle, cursor: "pointer", color: C.danger }}>✕ Remove</button>
                      </div>
                      {sel.type === "text" && <ChipRow label="Text" options={[["flow", "Flows on path"], ["travel", "Travels the path"]]} value={sel.props.pathMode || "flow"} onChange={(v) => patchProps(sel.id, { pathMode: v })} />}
                      <button className="gd-btn" onClick={() => animateAlongPath(sel.id)} style={{ width: "100%", background: C.bg2, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 6, padding: "7px 0", cursor: "pointer", fontWeight: 700, marginBottom: 6 }}>▶ Animate along path (adds ◆ 0 → 1)</button>
                      <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5 }}>Drag the round handles on stage to reshape · drag the object to move the whole path · keyframe "Path progress" below.</div>
                    </>
                  )}
                </Card>
              )}

              {tProps.length > 0 && (
                <Card title="Transform" hint="◆ keyframe · ‹ › jump · drag on canvas to edit">
                  {tProps.map((p) => (
                    <PropRow key={p} obj={sel} prop={p} time={time} ctxDur={ctxDur} stage={stage}
                      readOnly={TRANSFORM_RO_PROPS.includes(p)}
                      onEdit={(v) => editProp(sel.id, p, v)}
                      onKfToggle={(has, v) => { if (has) removeKeyframe(sel.id, p, Math.round(time / 10) * 10); else { const T = setKeyframe(sel.id, p, time, v); setSelKf({ objId: sel.id, prop: p, t: T }); } }}
                      onNav={(dir) => kfNav(sel, p, dir)} />
                  ))}
                </Card>
              )}

              {selectedKfData && selectedKfData.objId === sel.id && (
                <Card title="Easing" hint={`${PROP_LABEL[selectedKfData.prop]} @ ${fmt(selectedKfData.t)}`}>
                  <EaseCurve ease={selectedKfData.k.ease} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {Object.keys(EASE).map((e) => (
                      <button key={e} className="gd-btn" onClick={() => setSegmentEase(sel.id, selectedKfData.prop, selectedKfData.t, e)}
                        style={{ ...chipStyle, cursor: "pointer", borderColor: selectedKfData.k.ease === e ? C.amber : C.line, color: selectedKfData.k.ease === e ? C.amber : C.dim }}>{EASE_LABEL[e]}</button>
                    ))}
                  </div>
                  <div style={{ color: C.faint, fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>Shapes the segment leaving this ◆. Tip: right-click between two ◆ on the timeline.</div>
                </Card>
              )}

              {sel.type !== "confetti" && sel.type !== "map" && sel.type !== "world" && !flowText && (
                <Card title="Motion presets" hint="applied at playhead">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    {PRESETS.map((pr) => (
                      <button key={pr.id} className="gd-btn" onClick={() => applyPreset(pr)}
                        style={{ background: C.bg2, border: `1px solid ${C.line}`, color: C.txt, borderRadius: 6, padding: "7px 5px", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                        <span style={{ color: C.amber }}>{pr.icon}</span>{pr.name}
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
  );
}
