/* ============================================================
   TIMELINE — transport, ruler, layer lanes, keyframes, audio lane.
   Extracted VERBATIM from GraphicDestinationMotion.jsx (Refactor Pass 2).
   Rows are AUTO-PACKED: objects whose time spans don't overlap share a
   lane (packRows in ./model) — only the vertical assignment is computed;
   bars, diamonds and every interaction render exactly as before.
   R8w1: row-jump deadzone (a horizontal drag keeps the bar's row unless
   the pointer crosses a boundary with intent), dashed empty-gap pills
   (click selects, Delete / Close-gap ripples the row left), explicit
   eye/lock icon toggles, an enable-grid toggle and the relocated save
   control in the transport bar.
   ============================================================ */
import { Fragment } from "react";
import { C, PROP_LABEL, KF_PROPS, TYPE_BAR, layerSpan, packRows, transportBtn, chipStyle, inputStyle } from "./model";
import { NoteIcon, MiniBtn, CamIcon } from "./ui";
import { EASE_LABEL } from "../../engine/easing.js";
import { colorAt } from "../../engine/keyframes.js";
import { normHi, worldZoomWindow, WORLD } from "../../engine/maps.js";
import { CAM_PROPS, cameraKeyCount } from "../../engine/camera.js";

/* ============================================================
   PURE TIMELINE HELPERS — no JSX, no imports, self-contained so the
   node check scripts (check-timeline.mjs / check-r8w1.mjs) can extract
   and exercise them directly. Keep them free of module-scope refs.
   ============================================================ */
/* lane height (px) — every packed row lane + its label render at this */
export const TL_ROW_H = 30;

/* ROW-JUMP DEADZONE — decide which row a bar-drag belongs to from the
   pointer's y inside the rows area. Rows are auto-packed, so a purely
   HORIZONTAL drag that starts overlapping a neighbour would re-pack the
   bar into a different lane mid-gesture (the "row jump"). The deadzone
   keeps the bar in `curRow` until the pointer crosses a row boundary
   with clear intent: ≥ `frac` (60%) INTO the target row, or ≥ `px`
   (20px) beyond the current row's edge — whichever trips first. */
export function rowJumpTarget(y, rowH, curRow, px = 20, frac = 0.6) {
  const naive = Math.floor(y / rowH);
  if (naive === curRow) return curRow;
  const into = y - naive * rowH; /* px below the naive row's top edge */
  if (naive < curRow) {
    const beyond = curRow * rowH - y; /* px past the shared boundary, upward */
    return into <= rowH * (1 - frac) || beyond >= px ? naive : curRow;
  }
  const beyond = y - (curRow + 1) * rowH; /* px past the shared boundary, downward */
  return into >= rowH * frac || beyond >= px ? naive : curRow;
}

/* EMPTY GAPS — the idle stretches BETWEEN two clips of one packed row
   (rows are auto-packed, so a row's spans never overlap; touching spans
   have no gap). Input: the row's [{ id, start, end }] (any order).
   Output: [{ leftId, rightId, start, end }] with end - start >= minGap.
   A max-end sweep (not just pairwise) keeps the math honest even when a
   drag-pin briefly parks an overlapping bar in the row. */
export function rowGaps(spans, minGap = 1) {
  const s = spans.slice().sort((a, b) => (a.start - b.start) || (a.end - b.end));
  const gaps = [];
  let maxEnd = -Infinity;
  let maxId = null;
  for (const c of s) {
    if (maxId !== null && c.start - maxEnd >= minGap) gaps.push({ leftId: maxId, rightId: c.id, start: maxEnd, end: c.start });
    if (c.end > maxEnd) { maxEnd = c.end; maxId = c.id; }
  }
  return gaps;
}

/* stable identity of a gap (selection survives re-renders/re-packs) */
export function gapKey(g) {
  return `${g.leftId}|${g.rightId}`;
}

/* RIPPLE-CLOSE — deleting a gap shifts the row's LATER clips left by the
   gap width so it closes. Input: the row's spans + the gap; output:
   [{ id, dt }] (dt always negative) for every member starting at/after
   the gap's end — the right-hand clip and everything behind it. Other
   rows are never part of the row's span list, so they stay untouched. */
export function rippleShift(spans, gap) {
  const dt = -(gap.end - gap.start);
  if (!dt) return [];
  return spans.filter((s) => s.start >= gap.end - 0.5).map((s) => ({ id: s.id, dt }));
}

/* ---------- explicit two-state lane icons (R8w1) ----------
   Eye: open eye (visible) vs crossed-out eye (hidden) — not just a tint.
   Padlock: open shackle + outline body (unlocked) vs closed shackle +
   solid body + keyhole (locked). */
export function EyeIcon({ off, size = 12, color = C.faint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      {off
        ? <path d="M4.5 4.5l15 15" />
        : <circle cx="12" cy="12" r="2.6" fill={color} stroke="none" />}
    </svg>
  );
}
export function PadlockIcon({ locked, size = 11, color = C.faint }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      {locked
        ? <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
        : <path d="M7.5 11V7.5a4.5 4.5 0 0 1 8.8-1.4" />}
      <rect x="5" y="11" width="14" height="9" rx="2" fill={locked ? color : "none"} fillOpacity={locked ? 0.9 : 0} />
      {locked && <circle cx="12" cy="15.3" r="1.4" fill={C.bg1} stroke="none" />}
    </svg>
  );
}
/* tiny grid glyph for the enable-grid toggle */
export function GridIcon({ size = 12, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" style={{ display: "block" }}>
      <path d="M4 4h16v16H4z" />
      <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
    </svg>
  );
}

/* camera lane diamond colors: x amber · y teal · zoom blue */
const CAM_KF_COLOR = { x: C.amber, y: "#6EE7B7", zoom: C.info };
const CAM_PROP_LABEL = { x: "Camera X", y: "Camera Y", zoom: "Camera zoom" };
/* relocated save control (transport bar): per-state look — dirty = accent
   call-to-action, saving = muted, saved = calm success tint, error = danger */
const SAVE_BTN_STATE = {
  dirty: { background: C.amber, color: "#1A1405" },
  saving: { background: "#2A2415", color: C.dim },
  saved: { background: "rgba(63,182,139,0.12)", color: "#3FB68B" },
  error: { background: C.danger, color: "#FFFFFF" },
};

export default function Timeline({ tlH, tlDragging, onTlHandleDown, resetTlH, setPlaying, setTime, playing, time, fmt, ctxDur, setCtxDurMs, stretchClips, setStretchClips, loop, setLoop, selMany, groupSelection, ctxLayers, selIds, setSelIds, setSelKf, enterClip, exitToDepth, crumbs, onLayerContext, onLaneContext, toggleHide, toggleLock, reorder, duplicateSelected, removeSelected, inClip, onAudioLaneDown, audioTrack, audioLaneSel, audioBarMs, onAudioBarDown, camera, cameraLaneSel, onCameraLaneDown, onCameraKfDown, selCamKf, rulerRef, onRulerDown, onBarDown, onKfDown, selKf, onWorldKfDown, rowsRef, barDrag, selGap, onGapDown, onCloseGap, saveCtl, showGrid, onToggleGrid }) {
  /* ---------- auto-packed rows (visual only) ----------
     spanById holds each object's [start, end] exactly as its bar renders it;
     packRows groups non-overlapping objects (touching boundaries can share). */
  const spans = ctxLayers.map((o) => { const [start, end] = layerSpan(o, ctxDur); return { id: o.id, start, end }; });
  const spanById = new Map(spans.map((s) => [s.id, [s.start, s.end]]));
  const byId = new Map(ctxLayers.map((o) => [o.id, o]));
  let rows = packRows(spans).map((ids) => ids.map((id) => byId.get(id)).filter(Boolean));
  /* ROW-JUMP DEADZONE (display pin): while a bar body-drag is live, the
     dragged bar stays in its pinned row (chosen by rowJumpTarget's deadzone
     in GraphicDestinationMotion.onBarDown) instead of re-packing mid-drag
     when it starts overlapping a neighbour. The pin is display-only and
     ends on pointer-up, when normal packing resumes. The bar is appended
     LAST in its row so it paints above row-mates it now overlaps; a pin at
     index rows.length opens a fresh lane at the bottom. Rows the pin
     vacated keep their slot for the gesture (indices stay stable). */
  if (barDrag && byId.has(barDrag.id)) {
    const dragObj = byId.get(barDrag.id);
    rows = rows.map((r) => r.filter((o) => o.id !== barDrag.id));
    const ri = Math.max(0, Math.min(barDrag.row, rows.length));
    if (ri === rows.length) rows.push([dragObj]);
    else rows[ri] = [...rows[ri], dragObj];
  }
  /* cursor time within the lanes (same math the ruler scrub uses) */
  const laneT = (e) => {
    const r = rulerRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ctxDur;
  };
  /* which row member a lane gesture at time t belongs to (spans in a row never
     overlap, so at most one contains t; in the gaps fall back to the nearest) */
  const objAtTime = (row, t) => {
    let best = row[0], bestD = Infinity;
    for (const o of row) {
      const [s0, s1] = spanById.get(o.id);
      if (t >= s0 && t <= s1) return o;
      const d = t < s0 ? s0 - t : t - s1;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  };
  return (
      <div style={{ height: tlH, background: C.bg1, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "relative" }}>
        {/* top-edge resize handle: 6px hit zone, drag to resize (160px…45vh), double-click resets to 240px */}
        <div className={tlDragging ? "gd-tl-handle gd-dragging" : "gd-tl-handle"} onPointerDown={onTlHandleDown} onDoubleClick={resetTlH}
          title="Drag to resize the timeline · double-click to reset"
          style={{ position: "absolute", top: -3, left: 0, right: 0, height: 6, cursor: "ns-resize", zIndex: 60 }}>
          <div className="gd-tl-handle-line" style={{ position: "absolute", top: 2, left: 0, right: 0, height: 1, background: C.amber }} />
        </div>
        {/* clip-context breadcrumb — slim bar directly above the timeline (replaces the old top-bar crumb + stage pill) */}
        {inClip && (
          <div style={{ height: 28, flexShrink: 0, display: "flex", alignItems: "center", gap: 3, padding: "0 12px", background: C.bg1, borderBottom: `1px solid ${C.line}` }}>
            <button className="gd-btn" onClick={() => exitToDepth(0)} title="Back to the main timeline"
              style={{ background: "transparent", border: "none", color: C.dim, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Main</button>
            {(crumbs || []).map((nm, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
                <span style={{ color: C.amber, fontSize: 12, lineHeight: 1, pointerEvents: "none" }}>›</span>
                {i < crumbs.length - 1 ? (
                  <button className="gd-btn" onClick={() => exitToDepth(i + 1)} title={`Back to ${nm}`}
                    style={{ background: "transparent", border: "none", color: C.dim, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "'JetBrains Mono'", whiteSpace: "nowrap" }}>{nm}</button>
                ) : (
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 600, color: C.amber, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "2px 0" }}>{nm}</span>
                )}
              </span>
            ))}
            <span style={{ marginLeft: "auto", color: C.faint, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap", paddingLeft: 12 }}>Editing clip — Esc to go back</span>
          </div>
        )}
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
          {/* enable-grid toggle (sits where the old Animate/autokey control was):
              a subtle alignment grid on the canvas — pure visual aid, gated
              out of the export render path (StageView only). */}
          <button className="gd-btn gd-grid-toggle" onClick={onToggleGrid} aria-pressed={!!showGrid}
            title={showGrid ? "Grid ON — subtle alignment grid on the canvas (visual aid only, never exported)" : "Enable grid — show a subtle alignment grid on the canvas (visual aid only, never exported)"}
            style={{ display: "flex", alignItems: "center", gap: 6, background: showGrid ? C.amberSoft : C.bg2, border: `1px solid ${showGrid ? C.amber : C.line}`, color: showGrid ? C.amber : C.dim, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            <GridIcon size={12} color={showGrid ? C.amber : C.dim} />Grid
          </button>
          <div style={{ flex: 1 }} />
          {selGap && (
            <button className="gd-btn gd-gap-delete" onClick={onCloseGap}
              title="Close this gap — the row's later clips ripple left (Delete key works too). Other rows and the playhead are untouched."
              style={{ ...chipStyle, cursor: "pointer", borderColor: C.amber, color: C.amber, display: "flex", alignItems: "center", gap: 6 }}>
              ✕ Close gap · {fmt(selGap.end - selGap.start)}
            </button>
          )}
          {selMany.length > 1 && <button className="gd-btn" onClick={groupSelection} style={{ ...chipStyle, cursor: "pointer", borderColor: C.amber, color: C.amber }}>⌘G Group {selMany.length} → Clip</button>}
          <span style={{ color: C.faint, fontSize: 10.5 }}>drag bar = move · edges = trim · right-click = easing</span>
          {/* relocated save control (was the top-bar Save button + "saved" text):
              one click away in the docked timeline bar; the button itself IS
              the save-state indicator (dirty amber / saving muted / saved green
              / error red). Rendered only when the host page wires saving up. */}
          {saveCtl && (
            <button className="gd-btn gd-tl-save" data-state={saveCtl.state} onClick={saveCtl.onSave}
              disabled={saveCtl.state !== "dirty" && saveCtl.state !== "error"}
              title={saveCtl.state === "dirty" ? "Unsaved changes — click to save now" : saveCtl.state === "saving" ? "Saving…" : saveCtl.state === "error" ? "Couldn't save — click to retry" : "Everything is saved"}
              style={{ marginLeft: 8, borderRadius: 6, border: saveCtl.state === "saved" ? "1px solid rgba(63,182,139,0.35)" : "none", padding: "5px 14px", cursor: saveCtl.state === "dirty" || saveCtl.state === "error" ? "pointer" : "default", fontWeight: 700, fontSize: 12, fontFamily: "inherit", flexShrink: 0, ...(SAVE_BTN_STATE[saveCtl.state] || SAVE_BTN_STATE.saved) }}>
              {saveCtl.state === "saving" ? "Saving…" : saveCtl.state === "dirty" ? "● Save" : saveCtl.state === "error" ? "Retry save" : "Saved ✓"}
            </button>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0, overflowY: "auto" }}>
          <div style={{ width: 212, flexShrink: 0, borderRight: `1px solid ${C.line}` }}>
            <div style={{ height: 26 }} />
            {/* camera lane header — pinned at the TOP (main timeline only: the
                scene camera lives at root). Click selects "Camera" in the Inspector. */}
            {!inClip && (
              <div onPointerDown={onCameraLaneDown} title="Scene camera — click to select · drag empty stage space to pan · Alt+wheel (or select this lane) to zoom"
                style={{ height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", cursor: "pointer", borderBottom: `1px solid ${C.bg2}`, background: cameraLaneSel ? C.bg3 : "transparent", borderLeft: cameraLaneSel ? `2px solid ${C.amber}` : "2px solid transparent", boxSizing: "border-box" }}>
                <CamIcon size={13} color={cameraLaneSel || cameraKeyCount(camera) ? C.amber : C.faint} />
                <span style={{ fontSize: 12, fontWeight: 600, color: cameraLaneSel ? C.txt : cameraKeyCount(camera) ? C.dim : C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                  Camera
                </span>
                {cameraKeyCount(camera) > 0 && <span style={{ fontSize: 9.5, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>{cameraKeyCount(camera)}◆</span>}
              </div>
            )}
            {rows.map((row, ri) => (
              /* one label row per packed lane — a single object gets the classic
                 full row; sharing objects split it into compact segments, each
                 with the same chip / name / hide / lock / click behaviors */
              <div key={ri} style={{ height: 30, display: "flex", alignItems: "stretch", flexShrink: 0 }}>
                {row.map((o) => {
                  const isSel = selIds.includes(o.id);
                  const solo = row.length === 1;
                  return (
                    <div key={o.id}
                      onClick={(e) => { if (e.ctrlKey || e.metaKey) setSelIds(isSel ? selIds.filter((i) => i !== o.id) : [...selIds, o.id]); else setSelIds([o.id]); setSelKf(null); }}
                      onDoubleClick={() => o.type === "clip" && enterClip(o.id)}
                      onContextMenu={(e) => onLayerContext(e, o)}
                      title={o.name}
                      style={{ height: 30, display: "flex", alignItems: "center", gap: solo ? 6 : 4, padding: solo ? "0 6px" : "0 4px", flex: solo ? "1 1 auto" : "1 1 0", minWidth: 0, overflow: "hidden", cursor: "pointer", background: isSel ? C.bg3 : "transparent", borderLeft: isSel ? `2px solid ${C.amber}` : "2px solid transparent", boxSizing: "border-box", opacity: o.hidden ? 0.45 : o.locked ? 0.65 : 1 }}>
                      {/* explicit two-state toggles: eye / eye-off (visibility)
                          and open / solid-closed padlock (lock) — wired to the
                          existing toggleHide / toggleLock mechanisms. */}
                      <button className="gd-tl-hide" aria-label={o.hidden ? `Show ${o.name}` : `Hide ${o.name}`} aria-pressed={!!o.hidden} title={o.hidden ? "Show layer" : "Hide layer"} onClick={(e) => { e.stopPropagation(); toggleHide(o.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: 15, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <EyeIcon off={!!o.hidden} size={12} color={o.hidden ? C.amber : C.faint} />
                      </button>
                      <button className="gd-tl-lock" aria-label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} aria-pressed={!!o.locked} title={o.locked ? "Unlock layer" : "Lock layer"} onClick={(e) => { e.stopPropagation(); toggleLock(o.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: 15, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <PadlockIcon locked={!!o.locked} size={11} color={o.locked ? C.amber : C.faint} />
                      </button>
                      {o.type === "clip"
                        ? <span style={{ width: 11, height: 10, flexShrink: 0, position: "relative" }}><span style={{ position: "absolute", inset: "0 2px 2px 0", border: `1.5px solid ${C.amber}`, borderRadius: 2 }} /><span style={{ position: "absolute", inset: "2px 0 0 2px", border: `1.5px solid ${C.amber}`, borderRadius: 2, background: C.bg1 }} /></span>
                        : <span style={{ width: 9, height: 9, borderRadius: 3, background: o.type === "confetti" ? "linear-gradient(135deg,#F5A524,#E5636A)" : o.type === "map" || o.type === "world" ? o.props.stroke : o.type === "image" ? "#939BAD" : colorAt(o, "fill", time), flexShrink: 0, border: `1px solid ${C.line}` }} />}
                      <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? C.txt : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
                        {o.name}{o.type === "clip" && <span style={{ color: C.faint, fontWeight: 500 }}> ·{o.children.length}</span>}
                      </span>
                      {isSel && selIds.length === 1 && solo && (
                        <span style={{ display: "flex", gap: 1, flexShrink: 0 }}>
                          <MiniBtn title="Front" onClick={(e) => { e.stopPropagation(); reorder(o.id, +1); }}>▲</MiniBtn>
                          <MiniBtn title="Back" onClick={(e) => { e.stopPropagation(); reorder(o.id, -1); }}>▼</MiniBtn>
                          <MiniBtn title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateSelected(); }}>⧉</MiniBtn>
                          <MiniBtn title="Delete" danger onClick={(e) => { e.stopPropagation(); removeSelected(); }}>✕</MiniBtn>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
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
              {/* camera lane — pinned at the TOP, above the packed rows (mirrors the
                  audio lane pattern). ◆ diamonds for x/y/zoom: click seeks + selects
                  the keyframe, drag retimes it. Main timeline only. */}
              {!inClip && (
                <div onPointerDown={onCameraLaneDown} title="Scene camera · drag empty stage space to pan · Alt+wheel (or select this lane) to zoom"
                  style={{ height: 30, position: "relative", borderBottom: `1px solid ${C.bg2}`, background: cameraLaneSel ? "rgba(245,165,36,.04)" : "transparent" }}>
                  {CAM_PROPS.map((p) => (camera?.tracks?.[p] || []).map((k) => {
                    const isSelK = selCamKf && selCamKf.prop === p && Math.abs(selCamKf.t - k.t) <= 5;
                    return (
                      <span key={`${p}:${k.t}`} className="gd-kf" onPointerDown={(e) => onCameraKfDown(e, p, k)}
                        title={`${CAM_PROP_LABEL[p]} @ ${fmt(k.t)} · ${p === "zoom" ? `${k.v.toFixed(2)}×` : `${Math.round(k.v)}px`} · ${EASE_LABEL[k.ease] || "Linear"} · drag to retime`}
                        style={{ position: "absolute", left: `${(k.t / ctxDur) * 100}%`, top: "50%", width: 9, height: 9, transform: "translate(-50%,-50%) rotate(45deg)", background: isSelK ? C.txt : CAM_KF_COLOR[p], borderRadius: 1.5, cursor: "ew-resize", transition: "transform .1s", boxShadow: isSelK ? "0 0 0 3px rgba(245,165,36,.4)" : "none", zIndex: 2 }} />
                    );
                  }))}
                  {!cameraKeyCount(camera) && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 10px", gap: 6, color: C.faint, fontSize: 10.5, pointerEvents: "none" }}>
                      <CamIcon size={12} color={C.faint} /> ◆ add a keyframe or pick a preset in the inspector
                    </div>
                  )}
                </div>
              )}
              {/* rowsRef wraps ONLY the packed lanes (camera/audio lanes live
                  outside it) so the bar-drag deadzone can map pointer y → row
                  index with a single getBoundingClientRect. */}
              <div ref={rowsRef}>
              {rows.map((row, ri) => {
                const anySel = row.some((o) => selIds.includes(o.id));
                return (
                  /* one lane per packed row; bars/diamonds are absolutely positioned
                     inside it exactly like the old one-object rows. Lane-level
                     dbl-click / right-click resolve their object from the cursor
                     time (row-mates never overlap in time). */
                  <div key={ri}
                    onDoubleClick={(e) => { const o = objAtTime(row, laneT(e)); if (o && o.type === "clip") enterClip(o.id); }}
                    onContextMenu={(e) => { const o = objAtTime(row, laneT(e)); if (o) onLaneContext(e, o); }}
                    style={{ height: 30, position: "relative", borderBottom: `1px solid ${C.bg2}`, background: anySel ? "rgba(245,165,36,.04)" : "transparent" }}>
                    {/* empty-gap pills: dashed "empty" spans between two clips of
                        THIS row. Click selects the gap; the ✕ Close gap chip in the
                        transport bar (or Delete) ripples the row's later clips left. */}
                    {rowGaps(row.map((o) => { const [g0, g1] = spanById.get(o.id); return { id: o.id, start: g0, end: g1 }; })).map((g) => {
                      const isSelG = !!selGap && gapKey(selGap) === gapKey(g);
                      return (
                        <button key={gapKey(g)} type="button" className={isSelG ? "gd-gap-pill gd-gap-sel" : "gd-gap-pill"} data-left={g.leftId} data-right={g.rightId}
                          onPointerDown={(e) => onGapDown(e, g)}
                          title={`Empty gap · ${fmt(g.end - g.start)} — click to select, then Delete (or ✕ Close gap above) ripples this row's later clips left`}
                          style={{ position: "absolute", left: `${(g.start / ctxDur) * 100}%`, width: `${((g.end - g.start) / ctxDur) * 100}%`, minWidth: 10, top: 8, height: 14, background: isSelG ? C.amberSoft : "transparent", border: `1px dashed ${isSelG ? C.amber : C.faint}`, borderRadius: 7, cursor: "pointer", opacity: isSelG ? 1 : 0.5, padding: 0, zIndex: 1 }} />
                      );
                    })}
                    {row.map((o) => {
                      const isClip = o.type === "clip";
                      const [bIn, bOut] = spanById.get(o.id);
                      const kfs = [];
                      [...KF_PROPS, "shape"].forEach((p) => (o.tracks[p] || []).forEach((k) => kfs.push({ p, k })));
                      const isSel = selIds.includes(o.id);
                      return (
                        <Fragment key={o.id}>
                          {/* layer bar: dark, draggable, trim handles */}
                          <div onPointerDown={(e) => onBarDown(e, o, "move")}
                            title={o.locked ? `${o.name} · locked` : isClip ? `${o.name} · drag to retime · dbl-click to open` : "Drag to move (keyframes travel with the bar) · drag edges to trim"}
                            style={{ position: "absolute", left: `${(bIn / ctxDur) * 100}%`, width: `${((bOut - bIn) / ctxDur) * 100}%`, top: 5, height: 20, background: TYPE_BAR[o.type] || "#3A4356", filter: isSel ? "brightness(1.35)" : "none", border: `1px solid ${isSel ? C.amber : "rgba(255,255,255,.2)"}`, borderRadius: 6, cursor: o.locked ? "not-allowed" : barDrag && barDrag.id === o.id ? "grabbing" : "grab", overflow: "hidden", zIndex: barDrag && barDrag.id === o.id ? 6 : 0, boxShadow: barDrag && barDrag.id === o.id ? "0 4px 14px rgba(0,0,0,.5)" : "none" }}>

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
                        </Fragment>
                      );
                    })}
                  </div>
                );
              })}
              </div>
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
