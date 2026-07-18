/* confetti drawer — every one of the 17 emission styles gets a LIVE ANIMATED
   preview card: the SAME StageObject/confettiParticles render path the stage,
   the SSR checks and the export use, driven by a shared 120ms ticker (the
   BackgroundsPanel/ChartsPanel live-thumb pattern — self-contained here, no
   TemplateThumb import). Each card loops its own burst→fade window so short
   styles replay often. One click still inserts at stage center, bursting at
   the playhead (addObject's confetti path); mirrors the MapsPanel close-on-
   insert behavior. */
import { useEffect, useState } from "react";
import { C, sectionLabel } from "../model";
import { StageObject } from "../../StageObject";
import { CONFETTI_STYLES, confettiStyleOf, confettiLife } from "../../../engine/fx.js";

const THUMB_W = 114, THUMB_H = 82;
/* confetti kinematics are stage-scale (~620 px/s), so the preview renders a
   real 320×230 mini-stage and CSS-scales it into the card — falling styles
   keep their true spawn offsets instead of starting miles above the card */
const PREV_W = 320, PREV_H = 230, PREV_K = THUMB_W / PREV_W;
const BURST = 80; /* ms — every thumb bursts just after its loop starts */

/* one shared ticker for the whole panel — every card animates off the same
   interval (preview-only wall-clock; the engine stays a pure f(time)). The
   7200ms wrap covers the longest loop (drift/snow: 80 + 6500 + 320 pad). */
function usePreviewTime() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setT((v) => (v + 120) % 7200), 120);
    return () => clearInterval(iv);
  }, []);
  return t;
}

/* per-player-family thumb framing: fall styles spawn ~320px ABOVE the object,
   so their thumb object sits just below the visible band and the pieces drift
   through the whole card (same as placing the object low on a real stage);
   burst/vortex/ring styles play from card center with tamer power */
const FAMILY_FRAME = {
  rain: { y: PREV_H + 70, power: 0.55, count: 26 },
  snow: { y: PREV_H + 70, power: 1.3, count: 32 },
};
const DEFAULT_FRAME = { y: PREV_H / 2, power: 0.55, count: 24 };

function Thumb({ def, time }) {
  const fam = confettiStyleOf({ style: def.id }); /* the kinematics player StageObject will use */
  const frame = FAMILY_FRAME[fam] || DEFAULT_FRAME;
  const loop = BURST + confettiLife(def.id) + 320; /* burst → fully faded + a breath */
  const obj = {
    id: `cfthumb-${def.id}`, type: "confetti", name: def.name, tracks: {}, locked: false, hidden: false,
    props: {
      x: PREV_W / 2, y: frame.y, scale: 1, rotation: 0, opacity: 1, fill: def.id === "mono" ? C.amber : "#F9F9F9", w: 0, h: 0, inT: 0, outT: null, path: null, prog: 0,
      burst: BURST, count: frame.count, power: frame.power, seed: 7, style: def.id,
    },
  };
  return <StageObject obj={obj} time={time % loop} stage={{ w: PREV_W, h: PREV_H }} selected={false} interactive={false} />;
}

export default function ConfettiPanel({ addObject, setConfettiOpen }) {
  const time = usePreviewTime();
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 268, maxHeight: "calc(100% - 24px)", overflowY: "auto", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <div style={{ ...sectionLabel, marginBottom: 4 }}>Confetti · bursts at the playhead</div>
            <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginBottom: 10 }}>Live previews — the exact frames the export renders. Click a card to add its style at the playhead.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CONFETTI_STYLES.map((s) => (
                <button key={s.id} className="gd-btn" title={`${s.name} — ${s.hint}. Click to add at the playhead.`}
                  onClick={() => { addObject("confetti", { name: `Confetti · ${s.name}`, props: { style: s.id, ...(s.id === "mono" ? { fill: C.amber } : {}) } }); setConfettiOpen(false); }}
                  style={{ background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 5, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ display: "block", position: "relative", width: THUMB_W, height: THUMB_H, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, pointerEvents: "none", background: "#0A0C10" }}>
                    <span style={{ display: "block", width: PREV_W, height: PREV_H, transform: `scale(${PREV_K})`, transformOrigin: "0 0" }}>
                      <Thumb def={s} time={time} />
                    </span>
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: C.txt, marginTop: 5 }}>{s.glyph} {s.name}</span>
                  <span style={{ display: "block", fontSize: 9, color: C.faint, marginTop: 1 }}>{s.hint}</span>
                </button>
              ))}
            </div>
            <div style={{ color: C.faint, fontSize: 9.5, lineHeight: 1.5, marginTop: 9 }}>Seeded + deterministic — same seed, same burst on every export. Tune count, power, seed and burst time in the Inspector.</div>
          </div>
  );
}
