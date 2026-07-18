/* charts drawer — 11 Jitter-grade chart types as separate one-click widgets.
   Every card shows a LIVE animated thumbnail: the SAME StageObject/chartModel
   render the stage and the export use (engine/fx.js — pure, deterministic,
   in → hold → out), driven by a shared 120ms ticker. The type is chosen HERE
   at insert time (the inspector no longer switches it): click runs the normal
   addObject("chart") path and patches chartType/dataStr via over.props.
   Mirrors the BackgroundsPanel cards + close-on-insert behavior. */
import { useEffect, useState } from "react";
import { C, sectionLabel } from "../model";
import { StageObject } from "../../StageObject";

const THUMB_W = 114, THUMB_H = 82;

/* one shared ticker for the whole panel — every card animates off the same
   interval (preview-only wall-clock; the engine stays a pure f(time)). The
   4200ms wrap leaves a beat after each widget's 120+3400ms in→hold→out
   window, so every thumbnail loops seamlessly. */
function usePreviewTime() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setT((v) => (v + 120) % 4200), 120);
    return () => clearInterval(iv);
  }, []);
  return t;
}

const CHART_DEFS = [
  { id: "bar", name: "Bars", hint: "Rise + overshoot, staggered", data: "Q1, 42\nQ2, 65\nQ3, 38\nQ4, 84" },
  { id: "grouped", name: "Grouped", hint: "Two series side by side", data: "Q1, 42, 58\nQ2, 65, 44\nQ3, 38, 62\nQ4, 84, 70" },
  { id: "stacked", name: "Stacked", hint: "Segments grow bottom-up", data: "Q1, 30, 22\nQ2, 45, 28\nQ3, 26, 34\nQ4, 52, 30" },
  { id: "hbar", name: "H-Bars", hint: "Horizontal, row labels", data: "Alpha, 72\nBeta, 48\nGamma, 91\nDelta, 33" },
  { id: "line", name: "Line", hint: "Draws on, points pop", data: "Jan, 24\nFeb, 48\nMar, 36\nApr, 72\nMay, 58" },
  { id: "area", name: "Area", hint: "Gradient fill + draw-on", data: "Jan, 18\nFeb, 42\nMar, 30\nApr, 66\nMay, 52" },
  { id: "donut", name: "Donut", hint: "Sweep + spin, counts up", data: "Subs, 46\nAds, 28\nSales, 18\nOther, 8", w: 430 },
  { id: "pie", name: "Pie", hint: "Slices sweep + % labels", data: "Subs, 46\nAds, 28\nSales, 18\nOther, 8", w: 430 },
  { id: "ring", name: "Ring", hint: "Radial progress, overshoots", data: "Goal, 72", w: 430 },
  { id: "lollipop", name: "Lollipop", hint: "Stems + popping heads", data: "A, 34\nB, 58\nC, 44\nD, 76" },
  { id: "gauge", name: "Gauge", hint: "0–100 radial meter", data: "Progress, 68", w: 430 },
];

function Thumb({ def, time }) {
  const obj = {
    id: `chthumb-${def.id}`, type: "chart", name: def.name, tracks: {}, locked: false, hidden: false,
    props: {
      x: THUMB_W / 2, y: THUMB_H / 2, scale: 1, rotation: 0, opacity: 1, fill: "#F9F9F9", inT: 0, outT: null, path: null, prog: 0,
      w: THUMB_W - 12, h: THUMB_H - 12, chartType: def.id, dataStr: def.data, start: 120, dur: 3400, showVals: false,
      bg: "#141824", bgOp: 1, radius: 10, borderC: "#2B3140", borderW: 1, pad: 5,
    },
  };
  return <StageObject obj={obj} time={time} stage={{ w: THUMB_W, h: THUMB_H }} selected={false} interactive={false} />;
}

export default function ChartsPanel({ addObject, setChartsOpen }) {
  const time = usePreviewTime();
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 268, maxHeight: "calc(100% - 24px)", overflowY: "auto", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 4 }}>Charts · in → hold → out</div>
            <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginBottom: 10 }}>Click a card to insert. Every widget springs in with a stagger, holds, then accelerates off — loops cleanly at its duration.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CHART_DEFS.map((c) => (
                <button key={c.id} className="gd-btn" title={`${c.name} — ${c.hint}. Click to insert.`}
                  onClick={() => { addObject("chart", { name: c.name, props: { chartType: c.id, dataStr: c.data, ...(c.w ? { w: c.w } : {}), radius: 32, showVals: true } }); setChartsOpen(false); }}
                  style={{ background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 5, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ display: "block", position: "relative", width: THUMB_W, height: THUMB_H, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, pointerEvents: "none", background: "#0A0C10" }}>
                    <Thumb def={c} time={time} />
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.txt, marginTop: 5 }}>{c.name}</span>
                  <span style={{ display: "block", fontSize: 9, color: C.faint, marginTop: 1 }}>{c.hint}</span>
                </button>
              ))}
            </div>
            <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginTop: 9 }}>Pure timeline-driven motion — the exported video renders these exact frames. Edit rows, timing and the card in the Inspector.</div>
          </div>
  );
}
