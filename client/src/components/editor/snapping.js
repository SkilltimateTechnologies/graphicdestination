/* ============================================================
   SNAPPING — pure smart-snap engine for stage drags (no DOM).
   computeSnap() takes the moving bbox + the bboxes of every
   snappable sibling (visible, unlocked, non-selected — the caller
   scopes them to the current editing context) and returns the
   snapped delta plus the alignment guides to draw.

   Candidate lines per axis (priority order — object edges/centers
   first, canvas center second, canvas edges last; nearest wins
   inside a priority group, a higher-priority group always beats a
   lower one as long as it is within the threshold):
     · left / centerX / right (top / centerY / bottom) of every other bbox
     · canvas center line (stageW/2 · stageH/2)
     · canvas edges (0 · stageW / stageH)

   A guide { axis, pos, from, to } is a vertical line at x = pos
   (axis "x") or a horizontal line at y = pos (axis "y") spanning
   [from, to] on the perpendicular axis: the union of the aligned
   pair's extents (moving bbox AFTER the snap vs the snap target),
   extended SNAP_GUIDE_EXT px past each end. Canvas targets span
   the canvas edge, so their guides run the full canvas.

   `points` (optional) restricts which moving points may snap per
   axis — resize grips pass only the dragged edge(s); move drags
   use the default (all three). The result also carries `edges`
   (which moving point won, per axis) so resize can convert the
   delta into a size change.
   ============================================================ */

export const SNAP_THRESHOLD = 6; /* screen px at zoom 1 — the caller divides by the current zoom */
export const SNAP_GUIDE_EXT = 12; /* stage px a guide extends past the aligned extent */

const PR_OBJECT = 0; /* object edges/centers */
const PR_CENTER = 1; /* canvas center lines */
const PR_EDGE = 2; /* canvas edges */

const X_POINTS = ["left", "centerX", "right"];
const Y_POINTS = ["top", "centerY", "bottom"];

/* best snap on ONE axis: lowest priority group first, nearest |delta| inside it.
   m0/mSize = moving bbox origin+size on the axis; pts = allowed moving points. */
function axisSnap(m0, mSize, cands, threshold, pts) {
  const offs = pts.map((edge) => ({ edge, off: edge === "left" || edge === "top" ? 0 : edge === "right" || edge === "bottom" ? mSize : mSize / 2 }));
  let best = null;
  for (const c of cands) {
    for (const p of offs) {
      const delta = c.pos - (m0 + p.off);
      const ad = Math.abs(delta);
      if (ad > threshold) continue;
      if (!best || c.pr < best.pr || (c.pr === best.pr && ad < best.ad)) best = { pos: c.pos, pr: c.pr, other: c.other || null, edge: p.edge, delta, ad };
    }
  }
  return best;
}

/* moving: {x,y,w,h} (top-left bbox) · others: array of the same ·
   stageW/stageH: canvas dims · threshold: stage units ·
   points: { x: ["left","centerX","right"], y: ["top","centerY","bottom"] } subset */
export function computeSnap({ moving, others = [], stageW, stageH, threshold = SNAP_THRESHOLD, points } = {}) {
  const px = (points && points.x) || X_POINTS;
  const py = (points && points.y) || Y_POINTS;
  const xCands = [], yCands = [];
  for (const o of others) {
    if (!o) continue;
    xCands.push({ pos: o.x, pr: PR_OBJECT, other: o }, { pos: o.x + o.w / 2, pr: PR_OBJECT, other: o }, { pos: o.x + o.w, pr: PR_OBJECT, other: o });
    yCands.push({ pos: o.y, pr: PR_OBJECT, other: o }, { pos: o.y + o.h / 2, pr: PR_OBJECT, other: o }, { pos: o.y + o.h, pr: PR_OBJECT, other: o });
  }
  xCands.push({ pos: stageW / 2, pr: PR_CENTER }, { pos: 0, pr: PR_EDGE }, { pos: stageW, pr: PR_EDGE });
  yCands.push({ pos: stageH / 2, pr: PR_CENTER }, { pos: 0, pr: PR_EDGE }, { pos: stageH, pr: PR_EDGE });

  const bx = px.length ? axisSnap(moving.x, moving.w, xCands, threshold, px) : null;
  const by = py.length ? axisSnap(moving.y, moving.h, yCands, threshold, py) : null;
  const dx = bx ? bx.delta : 0;
  const dy = by ? by.delta : 0;

  const guides = [];
  if (bx) {
    /* span on y: moving extent AFTER the snap vs the target's extent */
    const mA = moving.y + dy, mB = mA + moving.h;
    const oA = bx.other ? bx.other.y : 0, oB = bx.other ? bx.other.y + bx.other.h : stageH;
    guides.push({ axis: "x", pos: bx.pos, from: Math.min(mA, oA) - SNAP_GUIDE_EXT, to: Math.max(mB, oB) + SNAP_GUIDE_EXT });
  }
  if (by) {
    const mA = moving.x + dx, mB = mA + moving.w;
    const oA = by.other ? by.other.x : 0, oB = by.other ? by.other.x + by.other.w : stageW;
    guides.push({ axis: "y", pos: by.pos, from: Math.min(mA, oA) - SNAP_GUIDE_EXT, to: Math.max(mB, oB) + SNAP_GUIDE_EXT });
  }
  return { dx, dy, guides, edges: { x: bx ? bx.edge : null, y: by ? by.edge : null } };
}
