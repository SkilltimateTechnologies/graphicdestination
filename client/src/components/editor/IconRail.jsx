/* ============================================================
   ICON RAIL — left tool rail. Extracted VERBATIM from
   GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { C } from "./model";
import { RailBtn, NoteIcon } from "./ui";
import { ptsToStr, SHAPE_DEFS } from "../../engine/shapes.js";
import { ringsToPath, MAPS } from "../../engine/maps.js";

export default function IconRail({ shapesOpen, setShapesOpen, imagesOpen, setImagesOpen, audioOpen, setAudioOpen, mapsOpen, setMapsOpen, templatesOpen, setTemplatesOpen, chartsOpen, setChartsOpen, confettiOpen, setConfettiOpen, numbersOpen, setNumbersOpen, threeDOpen, setThreeDOpen, bgOpen, setBgOpen, audioTrack, addObject }) {
  return (
        <div style={{ width: 76, background: C.bg1, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 9, flexShrink: 0, zIndex: 20, overflowY: "auto" }}>
          <RailBtn label="Templates" active={templatesOpen} onClick={() => setTemplatesOpen(!templatesOpen)} glyph={<svg width="17" height="17" viewBox="0 0 18 18"><rect x="1" y="1" width="7" height="7" rx="1.5" fill={C.dim} /><rect x="10" y="1" width="7" height="7" rx="1.5" fill={C.dim} /><rect x="1" y="10" width="7" height="7" rx="1.5" fill={C.dim} /><rect x="10" y="10" width="7" height="7" rx="1.5" fill={C.dim} /></svg>} />
          <RailBtn label="Shapes" active={shapesOpen} onClick={() => setShapesOpen(!shapesOpen)} glyph={<svg width="19" height="19" viewBox="0 0 100 100"><polygon points={ptsToStr(SHAPE_DEFS.star.pts)} fill={C.dim} /></svg>} />
          <RailBtn label="Text" onClick={() => addObject("text")} glyph={<div style={{ color: C.dim, fontWeight: 800, fontSize: 15 }}>T</div>} />
          <RailBtn label="Image" active={imagesOpen} onClick={() => setImagesOpen(!imagesOpen)} glyph={<div style={{ width: 18, height: 14, border: `2px solid ${C.dim}`, borderRadius: 3, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", width: 7, height: 7, background: C.dim, transform: "rotate(45deg)", bottom: -4, left: 3 }} /></div>} />
          <RailBtn label="Audio" active={audioOpen} onClick={() => setAudioOpen(!audioOpen)} glyph={<NoteIcon size={18} color={audioTrack ? C.amber : C.dim} />} />
          <RailBtn label="Number" active={numbersOpen} onClick={() => setNumbersOpen(!numbersOpen)} glyph={<div style={{ color: C.dim, fontWeight: 800, fontSize: 12.5, fontFamily: "'JetBrains Mono'" }}>123</div>} />
          <RailBtn label="Charts" active={chartsOpen} onClick={() => setChartsOpen(!chartsOpen)} glyph={<div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 16 }}><div style={{ width: 4, height: 8, background: C.dim, borderRadius: 1 }} /><div style={{ width: 4, height: 15, background: C.dim, borderRadius: 1 }} /><div style={{ width: 4, height: 11, background: C.dim, borderRadius: 1 }} /></div>} />
          <RailBtn label="Maps" active={mapsOpen} onClick={() => setMapsOpen(!mapsOpen)} glyph={<svg width="19" height="19" viewBox="0 0 100 102"><path d={ringsToPath(MAPS.IND.rings)} fill="none" stroke={C.dim} strokeWidth="5" /></svg>} />
          <RailBtn label="Confetti" active={confettiOpen} onClick={() => setConfettiOpen(!confettiOpen)} glyph={<div style={{ fontSize: 14 }}>🎉</div>} />
          <RailBtn label="3D" active={threeDOpen} onClick={() => setThreeDOpen(!threeDOpen)} glyph={<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 1.8l6.2 3.6v7.2L9 16.2l-6.2-3.6V5.4z" /><path d="M9 9V16.2M9 9L2.8 5.4M9 9l6.2-3.6" /></svg>} />
          <RailBtn label="Backdrop" active={bgOpen} onClick={() => setBgOpen(!bgOpen)} glyph={<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><defs><linearGradient id="railbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.dim} stopOpacity="0.9" /><stop offset="1" stopColor={C.dim} stopOpacity="0.25" /></linearGradient></defs><rect x="2" y="2" width="14" height="14" rx="2.5" fill="url(#railbg)" stroke="none" /><path d="M2 12.5L9 16l7-3.5" /><path d="M2 9l7 3.5L16 9" strokeOpacity="0.7" /></svg>} />
          <div style={{ height: 1, width: 44, background: C.line }} />
          <RailBtn label="Clip" onClick={() => addObject("clip")} glyph={<div style={{ position: "relative", width: 20, height: 16 }}><div style={{ position: "absolute", inset: "0 4px 4px 0", border: `2px solid ${C.dim}`, borderRadius: 3 }} /><div style={{ position: "absolute", inset: "4px 0 0 4px", border: `2px solid ${C.dim}`, borderRadius: 3, background: C.bg2 }} /></div>} />
        </div>
  );
}
