/* ============================================================
   TEMPLATE THUMB — live-rendered template thumbnail (no PNGs).
   Renders the template's representative frame (t ≈ 40% of its
   duration — intros settled, every layer alive) at ~0.15 scale
   through the app's OWN renderer: the same <StageObject> + engine
   evaluation the stage uses (imported from the same paths — nothing
   reimplemented). Static: one fixed time, no animation loop, renders
   once per mount; memoized so panel search/filter re-renders skip it.
   Handles every layer type StageObject handles (shapes, text, numbers,
   charts, maps, confetti, clips at clip-local time). Image layers with
   no src are skipped; any render failure degrades to a graceful
   accent-tinted placeholder with the template's initial.
   ============================================================ */
import { Component, memo, useMemo } from "react";
import { StageObject } from "../StageObject";
import { C } from "./model";

const THUMB_T = 0.4; /* representative frame: 40% of the template duration */

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
  if (!proj) return <ThumbFallback tpl={tpl} w={w} h={h} />;
  const stage = proj.stage;
  const time = Math.round((stage.dur || 5000) * THUMB_T);
  const s = w / stage.w;
  return (
    <div data-thumb={tpl.id}
      style={{ width: w, height: h, borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden", background: stage.bg, pointerEvents: "none", position: "relative", flexShrink: 0, boxSizing: "border-box" }}>
      <div style={{ width: stage.w, height: stage.h, transform: `scale(${s})`, transformOrigin: "0 0", position: "absolute", left: 0, top: 0 }}>
        {objects.map((o) => <StageObject key={o.id} obj={o} time={time} stage={stage} selected={false} interactive={false} />)}
      </div>
    </div>
  );
}

/* 192×108 default (1280×720 stage at 0.15 scale). */
export default memo(function TemplateThumb({ tpl, w = 192, h = 108 }) {
  return (
    <ThumbGuard fallback={<ThumbFallback tpl={tpl} w={w} h={h} />}>
      <ThumbFrame tpl={tpl} w={w} h={h} />
    </ThumbGuard>
  );
});
