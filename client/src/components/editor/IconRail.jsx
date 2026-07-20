/* ============================================================
   ICON RAIL — left tool rail. Extracted VERBATIM from
   GraphicDestinationMotion.jsx (Refactor Pass 2).
   ============================================================ */
import { C } from "./model";
import { RailBtn, NoteIcon } from "./ui";
import { ptsToStr, SHAPE_DEFS } from "../../engine/shapes.js";
import { ringsToPath, MAPS } from "../../engine/maps.js";

export default function IconRail({ shapesOpen, setShapesOpen, textOpen, setTextOpen, imagesOpen, setImagesOpen, audioOpen, setAudioOpen, mapsOpen, setMapsOpen, templatesOpen, setTemplatesOpen, chartsOpen, setChartsOpen, confettiOpen, setConfettiOpen, numbersOpen, setNumbersOpen, uiOpen, setUiOpen, svgIconsOpen, setSvgIconsOpen, audioTrack, addObject }) {
  return (
        <div style={{ width: 76, background: C.bg1, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 9, flexShrink: 0, zIndex: 20, overflowY: "auto" }}>
          <RailBtn label="Templates" active={templatesOpen} onClick={() => setTemplatesOpen(!templatesOpen)} glyph={<svg width="17" height="17" viewBox="0 0 18 18"><rect x="1" y="1" width="7" height="7" rx="1.5" fill={C.dim} /><rect x="10" y="1" width="7" height="7" rx="1.5" fill={C.dim} /><rect x="1" y="10" width="7" height="7" rx="1.5" fill={C.dim} /><rect x="10" y="10" width="7" height="7" rx="1.5" fill={C.dim} /></svg>} />
          {/* Fluent emoji rail retired (B phase 4) — replaced by the admin SVG
              Icons library. engine/emoji.js + the PNGs stay for BACK-COMPAT of
              old projects (same retirement pattern as the bezier icons). */}
          <RailBtn label="Icons" active={svgIconsOpen} onClick={() => setSvgIconsOpen(!svgIconsOpen)} glyph={<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke={C.dim} strokeWidth="1.5"><path d="M9 1.8 11 6.2l4.7.5-3.5 3.2.9 4.6L9 12.1 4.9 14.5l.9-4.6-3.5-3.2L7 6.2Z" strokeLinejoin="round" /></svg>} />
          <RailBtn label="UI" active={uiOpen} onClick={() => setUiOpen(!uiOpen)} glyph={<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.dim} strokeWidth="1.5"><rect x="1.5" y="4.5" width="15" height="9" rx="4.5" /><circle cx="10.6" cy="9" r="2.7" fill={C.dim} stroke="none" /></svg>} />
          <RailBtn label="Shapes" active={shapesOpen} onClick={() => setShapesOpen(!shapesOpen)} glyph={<svg width="19" height="19" viewBox="0 0 100 100"><polygon points={ptsToStr(SHAPE_DEFS.star.pts)} fill={C.dim} /></svg>} />
          {/* R9w3: when the host wires textOpen/setTextOpen the Text button
              toggles the TextPanel (presets + effects); without them it keeps
              the legacy one-click plain-text insert. */}
          <RailBtn label="Text" active={!!textOpen} onClick={() => (setTextOpen ? setTextOpen(!textOpen) : addObject("text"))} glyph={<div style={{ color: C.dim, fontWeight: 800, fontSize: 15 }}>T</div>} />
          <RailBtn label="Image" active={imagesOpen} onClick={() => setImagesOpen(!imagesOpen)} glyph={<div style={{ width: 18, height: 14, border: `2px solid ${C.dim}`, borderRadius: 3, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", width: 7, height: 7, background: C.dim, transform: "rotate(45deg)", bottom: -4, left: 3 }} /></div>} />
          <RailBtn label="Audio" active={audioOpen} onClick={() => setAudioOpen(!audioOpen)} glyph={<NoteIcon size={18} color={audioTrack ? C.amber : C.dim} />} />
          <RailBtn label="Number" active={numbersOpen} onClick={() => setNumbersOpen(!numbersOpen)} glyph={<div style={{ color: C.dim, fontWeight: 800, fontSize: 12.5, fontFamily: "'JetBrains Mono'" }}>123</div>} />
          <RailBtn label="Charts" active={chartsOpen} onClick={() => setChartsOpen(!chartsOpen)} glyph={<div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 16 }}><div style={{ width: 4, height: 8, background: C.dim, borderRadius: 1 }} /><div style={{ width: 4, height: 15, background: C.dim, borderRadius: 1 }} /><div style={{ width: 4, height: 11, background: C.dim, borderRadius: 1 }} /></div>} />
          <RailBtn label="Maps" active={mapsOpen} onClick={() => setMapsOpen(!mapsOpen)} glyph={<svg width="19" height="19" viewBox="0 0 100 102"><path d={ringsToPath(MAPS.IND.rings)} fill="none" stroke={C.dim} strokeWidth="5" /></svg>} />
          <RailBtn label="Confetti" active={confettiOpen} onClick={() => setConfettiOpen(!confettiOpen)} glyph={<div style={{ fontSize: 14 }}>🎉</div>} />
          {/* Backdrop rail button removed — backgrounds/themes retired from the
              picker (engine/backdrops.js stays for back-compat: old projects
              that reference a backdrop layer still render). */}
          <div style={{ height: 1, width: 44, background: C.line }} />
          <RailBtn label="Clip" onClick={() => addObject("clip")} glyph={<div style={{ position: "relative", width: 20, height: 16 }}><div style={{ position: "absolute", inset: "0 4px 4px 0", border: `2px solid ${C.dim}`, borderRadius: 3 }} /><div style={{ position: "absolute", inset: "4px 0 0 4px", border: `2px solid ${C.dim}`, borderRadius: 3, background: C.bg2 }} /></div>} />
        </div>
  );
}
