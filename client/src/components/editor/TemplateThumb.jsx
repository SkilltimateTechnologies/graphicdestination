/* ============================================================
   TEMPLATE THUMB — live-rendered template thumbnail (no PNGs).
   Renders the template's representative frame (t ≈ 40% of its
   duration — intros settled, every layer alive) at ~0.15 scale
   through the app's OWN renderer: the same <StageObject> + engine
   evaluation the stage uses (imported from the same paths — nothing
   reimplemented). Handles every layer type StageObject handles
   (shapes, text, numbers, charts, maps, confetti, clips at clip-local
   time). Image layers with no src are skipped; any render failure
   degrades to a graceful accent-tinted placeholder with the
   template's initial.

   HOVER-PLAY (R7a): thumbs render ONE static representative frame by
   default (zero timers, SSR-safe); the shared 120 ms ticker runs ONLY
   while the pointer hovers the thumb, and mouse-leave resets back to
   the static frame. The mechanism is exported (useHoverPlay /
   <HoverThumb> + the pure hoverStillTime/hoverTickTime helpers) so
   every panel thumb (templates, icons, UI elements — and the confetti
   panel later) shares one implementation.
   ============================================================ */
import { Component, memo, useCallback, useEffect, useMemo, useState } from "react";
import { StageObject } from "../StageObject";
import { C } from "./model";

const THUMB_T = 0.4; /* representative frame: 40% of the template duration */
const HOVER_TICK = 120; /* ms — the shared panel-ticker cadence */

/* ---------- hover-play: pure timing core (node-testable) ---------- */
/* the frozen frame: intros settled, every layer alive */
export const hoverStillTime = (dur, frac = THUMB_T) => Math.max(0, Math.round((dur || 0) * frac));
/* one ticker step, wrapping at the loop end */
export const hoverTickTime = (t, step, dur) => (dur > 0 ? (t + step) % dur : 0);

/* useHoverPlay({ dur, still, step }) — thumbnail playback state:
   · NOT hovered  → time frozen at the representative frame, NO timer.
   · hovered      → a 120 ms ticker advances time (wrapping at dur),
                    restarting from the representative frame on entry.
   · mouse-leave  → ticker stops, time resets to the static frame.
   Returns { time, playing, bind } — spread `bind` onto the hover target. */
export function useHoverPlay({ dur = 5000, still = THUMB_T, step = HOVER_TICK } = {}) {
  const stillT = hoverStillTime(dur, still);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(stillT);
  useEffect(() => {
    if (!playing) return undefined; /* frozen — no timer at all */
    const iv = setInterval(() => setTime((t) => hoverTickTime(t, step, dur)), step);
    return () => clearInterval(iv);
  }, [playing, step, dur]);
  const onPointerEnter = useCallback(() => { setTime(stillT); setPlaying(true); }, [stillT]);
  const onPointerLeave = useCallback(() => { setPlaying(false); setTime(stillT); }, [stillT]);
  return { time, playing, bind: { onPointerEnter, onPointerLeave } };
}

/* <HoverThumb> — reusable hover-play wrapper: children is a render prop
   receiving (time, playing). Static frame by default, animates on hover,
   resets on leave. Used by the kit panels; the confetti panel can adopt it
   the same way later. */
export function HoverThumb({ dur, still, step, children, ...rest }) {
  const hp = useHoverPlay({ dur, still, step });
  return <div {...rest} {...hp.bind}>{children(hp.time, hp.playing)}</div>;
}

/* image layers with nothing to load are skipped (a broken/empty src would
   draw the "No image" placeholder or a broken-image glyph in the thumb) */
const stripEmptyImages = (list) =>
  list.filter((o) => o.type !== "image" || !!o.props.src)
    .map((o) => (o.children ? { ...o, children: stripEmptyImages(o.children) } : o));

/* render guard: a template that fails mid-render must never take the panel
   down (client-side render errors) — swap in the accent placeholder instead.
   Build failures are already handled defensively in ThumbFrame below (that
   path also works in SSR, where error boundaries don't catch). */
class ThumbGuard extends Component {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

function ThumbFallback({ tpl, w, h }) {
  return (
    <div data-thumb-fallback={tpl.id}
      style={{ width: w, height: h, borderRadius: 6, border: `1px solid ${C.line}`, background: `${tpl.accent || C.amber}1F`, display: "flex", alignItems: "center", justifyContent: "center", color: tpl.accent || C.amber, fontSize: Math.round(h * 0.32), fontWeight: 800, pointerEvents: "none", flexShrink: 0, boxSizing: "border-box" }}>
      {(tpl.name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

function ThumbFrame({ tpl, w, h }) {
  const proj = useMemo(() => { try { return tpl.buildProject(); } catch { return null; } }, [tpl]);
  const objects = useMemo(() => (proj ? stripEmptyImages(proj.objects || []) : []), [proj]);
  /* hover-play: static representative frame; the 120 ms ticker runs only
     while hovered. SSR + first paint = the static frame (no timers). */
  const hp = useHoverPlay({ dur: proj?.stage?.dur || 5000, still: THUMB_T });
  if (!proj) return <ThumbFallback tpl={tpl} w={w} h={h} />;
  const stage = proj.stage;
  const s = w / stage.w;
  return (
    <div data-thumb={tpl.id} {...hp.bind}
      style={{ width: w, height: h, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", background: stage.bg, position: "relative", flexShrink: 0, boxSizing: "border-box" }}>
      <div style={{ width: stage.w, height: stage.h, transform: `scale(${s})`, transformOrigin: "0 0", position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        {objects.map((o) => <StageObject key={o.id} obj={o} time={hp.time} stage={stage} selected={false} interactive={false} />)}
      </div>
    </div>
  );
}

/* 192×108 default (1280×720 stage at 0.15 scale). Memoized so panel
   search/filter re-renders skip it; hover state lives inside ThumbFrame. */
export default memo(function TemplateThumb({ tpl, w = 192, h = 108 }) {
  return (
    <ThumbGuard fallback={<ThumbFallback tpl={tpl} w={w} h={h} />}>
      <ThumbFrame tpl={tpl} w={w} h={h} />
    </ThumbGuard>
  );
});
