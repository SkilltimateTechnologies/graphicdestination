/*
 * Template-data validator — stored template JSON is UNTRUSTED input (it comes
 * from admins and users over the wire). Not a full schema check (the client
 * render is defensive by contract — StageObject never crashes on unknown
 * fields); instead: hard structural guarantees + caps, so a stored template
 * can always round-trip through the normal project path.
 *
 *   · root must be a plain object with an objects ARRAY (1..300 layers)
 *   · every layer: known type, plain-object props/tracks, ≤600 total nodes,
 *     clip nesting ≤ 6 deep
 *   · stage (optional): w/h ≤ 7680, dur 1000..300000 ms, bg string ≤ 40 chars
 *   · brands/brandId/camera/audio pass through only as plain objects
 *   · serialized size ≤ 512 KB
 */

const KNOWN_TYPES = new Set(["shape", "text", "image", "number", "map", "continent", "world", "confetti", "backdrop", "chart", "kit", "clip"]);
const MAX_OBJECTS = 300, MAX_NODES = 600, MAX_DEPTH = 6, MAX_BYTES = 512 * 1024;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function walkLayer(l, depth, budget) {
  if (!isObj(l)) return "layer must be an object";
  if (typeof l.type !== "string" || !KNOWN_TYPES.has(l.type)) return `unknown layer type "${l.type}"`;
  if (l.props != null && !isObj(l.props)) return "props must be an object";
  if (l.tracks != null && !isObj(l.tracks)) return "tracks must be an object";
  if (l.name != null && typeof l.name !== "string") return "name must be a string";
  budget.nodes++;
  if (budget.nodes > MAX_NODES) return `too many layers (max ${MAX_NODES})`;
  if (l.type === "clip") {
    if (depth >= MAX_DEPTH) return `clip nesting too deep (max ${MAX_DEPTH})`;
    if (!Array.isArray(l.children)) return "clip layer must have a children array";
    for (const c of l.children) {
      const err = walkLayer(c, depth + 1, budget);
      if (err) return err;
    }
  }
  return null;
}

/**
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
export function validateTemplateData(raw) {
  if (!isObj(raw)) return { ok: false, error: "template data must be an object" };
  if (!Array.isArray(raw.objects)) return { ok: false, error: "template data needs an objects array" };
  if (!raw.objects.length) return { ok: false, error: "template has no layers" };
  if (raw.objects.length > MAX_OBJECTS) return { ok: false, error: `too many root layers (max ${MAX_OBJECTS})` };
  const budget = { nodes: 0 };
  for (const l of raw.objects) {
    const err = walkLayer(l, 1, budget);
    if (err) return { ok: false, error: err };
  }
  if (raw.stage != null) {
    if (!isObj(raw.stage)) return { ok: false, error: "stage must be an object" };
    const { w, h, dur, bg } = raw.stage;
    if (w != null && (!Number.isFinite(w) || w < 16 || w > 7680)) return { ok: false, error: "stage.w out of range" };
    if (h != null && (!Number.isFinite(h) || h < 16 || h > 7680)) return { ok: false, error: "stage.h out of range" };
    if (dur != null && (!Number.isFinite(dur) || dur < 1000 || dur > 300000)) return { ok: false, error: "stage.dur must be 1000-300000 ms" };
    if (bg != null && (typeof bg !== "string" || bg.length > 40)) return { ok: false, error: "stage.bg must be a short string" };
  }
  for (const k of ["brands", "camera", "audio"]) {
    if (raw[k] != null && !isObj(raw[k]) && !Array.isArray(raw[k])) return { ok: false, error: `${k} must be an object/array` };
  }
  let bytes = 0;
  try { bytes = Buffer.byteLength(JSON.stringify(raw), "utf8"); } catch { return { ok: false, error: "data is not serializable" }; }
  if (bytes > MAX_BYTES) return { ok: false, error: `template too large (max ${MAX_BYTES / 1024} KB)` };
  return { ok: true, data: raw };
}
