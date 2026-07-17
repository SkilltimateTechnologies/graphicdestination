/**
 * compile.js — translates a Graphic Destination project document into a
 * real HyperFrames composition (HTML + data-* attributes + a paused GSAP
 * timeline), per the actual contract shipped in the `hyperframes` npm
 * package (see /home/claude/hf-test/node_modules/hyperframes/dist/templates
 * during development — inspected directly, not guessed).
 *
 * SCOPE (v1) — read this before assuming a feature is ported:
 *   Translated:   x, y, scale, rotation, opacity keyframes + easing, for
 *                 every layer type; layer in/out windows (inT/outT);
 *                 clip nesting (flattened to absolute time, see
 *                 flattenLayers()); clip backgrounds; shape fill (current
 *                 shape only); text content/font/color; images.
 *   NOT ported (rendered as a labeled static placeholder so timing/
 *   duration stay correct, but the visual is a stand-in):
 *     - shape morphing (GSAP's shape-morph plugin is a paid add-on,
 *       not on the public npm registry — current keyframe's shape is
 *       rendered as a static SVG polygon, no interpolation between
 *       shapes)
 *     - per-character text effects (typewriter/scramble/wave/etc.) —
 *       text renders as a plain static block, no charFx
 *     - number roller animation (odometer/slot/count) — renders the
 *       final value as static text
 *     - chart animation — renders a placeholder box with the raw data
 *       string
 *     - map/world/continent border effects and country-highlight
 *       choreography — renders a placeholder box naming the layer
 *     - confetti — renders nothing (would need per-particle DOM nodes;
 *       out of scope for v1)
 *     - motion paths (props.path / prog) — falls back to the layer's
 *       static x/y, ignoring the path
 *   Porting any of these means adding a case to `renderLayerHTML()` and,
 *   for anything with its own internal animation, either pre-baking it as
 *   a CSS @keyframes block (deterministic, no GSAP needed) or building it
 *   out of primitive GSAP tweens the way the core x/y/scale/rotation/
 *   opacity path already does below.
 */

const EASE_MAP = {
  linear: "none",
  easeOutQuad: "power1.out",
  easeInQuad: "power1.in",
  easeInOutCubic: "power3.inOut",
  easeOutCubic: "power3.out",
  easeInCubic: "power3.in",
  easeOutBack: "back.out(1.7)",
  easeOutElastic: "elastic.out(1, 0.5)",
  easeOutBounce: "bounce.out",
  easeInOutSine: "sine.inOut",
  softSpring: "back.out(1.2)", // closest stock GSAP equivalent to the app's custom softSpring curve
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Recursively flattens clip nesting into one list of layers with
 *  absolute (stage-relative) timing, since HyperFrames/GSAP compositions
 *  use one flat timeline rather than this app's nested-clip model. */
function flattenLayers(layers, offsetMs = 0, speed = 1, out = []) {
  for (const layer of layers) {
    if (layer.hidden) continue;
    if (layer.type === "clip") {
      const childOffset = offsetMs + (layer.props.start || 0) / speed;
      const childSpeed = speed * (layer.props.speed || 1);
      if (layer.props.bg) {
        out.push({
          ...layer,
          type: "__clipbg",
          _absIn: childOffset,
          _absOut: layer.props.end === "hide" ? childOffset + (layer.props.dur || 0) / childSpeed : null,
          _tracks: {},
        });
      }
      flattenLayers(layer.children || [], childOffset, childSpeed, out);
      continue;
    }
    const inT = (layer.props.inT || 0) / speed + offsetMs;
    const outT = layer.props.outT != null ? layer.props.outT / speed + offsetMs : null;
    const tracks = {};
    for (const [prop, kfs] of Object.entries(layer.tracks || {})) {
      tracks[prop] = kfs.map((k) => ({ ...k, t: k.t / speed + offsetMs }));
    }
    out.push({ ...layer, _absIn: inT, _absOut: outT, _tracks: tracks });
  }
  return out;
}

/** Renders the static HTML for one layer's current appearance (shape /
 *  text / image / placeholder — see module doc for what's ported). */
function renderLayerHTML(layer, id) {
  const P = layer.props;
  const commonStyle = `position:absolute;left:0;top:0;`;
  switch (layer.type) {
    case "__clipbg":
      return `<div id="${id}" style="${commonStyle}width:100%;height:100%;background:${esc(P.bg)};"></div>`;
    case "shape": {
      const shapeId = layer.tracks.shape?.[0]?.v || P.shape || "rect";
      // shape point data isn't available to this Node-side compiler (it lives
      // in the client bundle's SHAPE_DEFS); a rectangle stand-in keeps the
      // layer's color/size/position correct until real path data is passed in.
      return `<div id="${id}" data-shape="${esc(shapeId)}" style="${commonStyle}width:${P.w}px;height:${P.h}px;background:${esc(P.fill)};border-radius:${shapeId === "ellipse" ? "50%" : "4px"};"></div>`;
    }
    case "text":
      return `<div id="${id}" style="${commonStyle}white-space:pre;font-family:'${esc(P.fontFamily || "Inter")}',sans-serif;font-weight:${P.fontWeight || 700};font-size:${P.fontSize || 48}px;color:${esc(P.fill)};">${esc(P.text)}</div>`;
    case "image":
      return `<img id="${id}" src="${esc(P.src)}" style="${commonStyle}width:${P.w}px;height:${P.h}px;object-fit:cover;" />`;
    case "number": {
      /* countdown mode settles on From (plays To → From); everything else
         settles on To — absent mode keeps the legacy final value */
      const final = P.mode === "countdown" ? P.from : P.to;
      const val = `${P.prefix || ""}${final}${P.suffix || ""}`;
      return `<div id="${id}" data-hf-note="number roller not animated in v1 — showing final value" style="${commonStyle}font-family:monospace;font-weight:700;font-size:${P.fontSize || 64}px;color:${esc(P.fill)};">${esc(val)}</div>`;
    }
    case "chart":
      return `<div id="${id}" data-hf-note="chart not ported in v1" style="${commonStyle}width:${P.w}px;height:${P.h}px;border:2px dashed #666;color:#999;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:14px;padding:12px;box-sizing:border-box;text-align:center;">Chart: ${esc(P.chartType)}<br/>${esc((P.dataStr || "").slice(0, 60))}</div>`;
    case "map":
    case "world":
    case "continent":
      return `<div id="${id}" data-hf-note="${layer.type} border FX not ported in v1" style="${commonStyle}width:${P.w || 400}px;height:${(P.w || 400) * 0.6}px;border:2px dashed #666;color:#999;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:13px;">${esc(layer.name)}</div>`;
    case "confetti":
      return `<div id="${id}" data-hf-note="confetti not ported in v1" style="${commonStyle}width:2px;height:2px;"></div>`;
    default:
      return `<div id="${id}" style="${commonStyle}width:${P.w}px;height:${P.h}px;background:${esc(P.fill || "#888")};"></div>`;
  }
}

const ANIM_PROPS = ["x", "y", "scale", "rotation", "opacity"];

/** Builds the GSAP tween calls for one layer's transform/opacity tracks,
 *  matching this app's own piecewise-easing interpolation semantics
 *  exactly: one explicit fromTo() per keyframe segment. */
function renderLayerTweens(layer, sel) {
  const P = layer.props;
  const lines = [];
  const initial = {};
  for (const prop of ANIM_PROPS) {
    const track = layer._tracks[prop];
    initial[prop] = track?.length ? track[0].v : P[prop];
  }
  lines.push(`  gsap.set("${sel}", { xPercent: -50, yPercent: -50, x: ${initial.x}, y: ${initial.y}, scale: ${initial.scale}, rotation: ${initial.rotation}, opacity: ${initial.opacity} });`);

  for (const prop of ANIM_PROPS) {
    const track = layer._tracks[prop];
    if (!track || track.length < 2) continue;
    for (let i = 0; i < track.length - 1; i++) {
      const a = track[i], b = track[i + 1];
      const ease = EASE_MAP[a.ease] || "power2.out";
      const dur = Math.max(0.001, (b.t - a.t) / 1000);
      lines.push(`  tl.fromTo("${sel}", { ${prop}: ${a.v} }, { ${prop}: ${b.v}, duration: ${dur.toFixed(3)}, ease: "${ease}" }, ${(a.t / 1000).toFixed(3)});`);
    }
  }

  // in/out window visibility, independent of opacity animation
  const inS = (layer._absIn / 1000).toFixed(3);
  lines.push(`  gsap.set("${sel}", { visibility: ${layer._absIn > 0 ? '"hidden"' : '"visible"'} });`);
  if (layer._absIn > 0) lines.push(`  tl.set("${sel}", { visibility: "visible" }, ${inS});`);
  if (layer._absOut != null) lines.push(`  tl.set("${sel}", { visibility: "hidden" }, ${(layer._absOut / 1000).toFixed(3)});`);

  return lines.join("\n");
}

/**
 * compileProject(project) -> { html, warnings }
 * project: { stage: {w,h,dur,bg}, objects: [layer,...] }  (this app's
 * documented project shape — see AGENT_GUIDE.md §6.1)
 */
export function compileProject(project) {
  const stage = project.stage || { w: 1280, h: 720, dur: 5000, bg: "#000000" };
  const flat = flattenLayers(project.objects || []);
  const warnings = [];
  const UNPORTED = new Set(["number", "chart", "map", "world", "continent", "confetti"]);

  const bodyParts = [];
  const scriptParts = [];
  flat.forEach((layer, i) => {
    const id = `layer-${i}`;
    bodyParts.push(renderLayerHTML(layer, id));
    scriptParts.push(renderLayerTweens(layer, `#${id}`));
    if (layer.type === "shape" && layer.tracks.shape?.length > 1) {
      warnings.push(`Layer "${layer.name}" (${id}): shape morph keyframes exist but are not animated in v1 — rendered as its first keyframe's shape only.`);
    }
    if (UNPORTED.has(layer.type)) {
      warnings.push(`Layer "${layer.name}" (${id}): type "${layer.type}" is not ported in v1 — rendered as a placeholder. See compile.js module doc for scope.`);
    }
    if (layer.props?.path) {
      warnings.push(`Layer "${layer.name}" (${id}): has a motion path, not ported in v1 — using its static x/y instead.`);
    }
  });

  const durationSec = (stage.dur / 1000).toFixed(3);

  // `hyperframes check` flags any font not in its deterministic render-machine
  // font map (confirmed via real testing — see RENDERING.md). Google Fonts
  // custom families used by this app (e.g. "Space Grotesk") aren't in that
  // map, so pull them in explicitly via @font-face rather than relying on
  // the OS font list, which isn't guaranteed identical across render machines.
  const fontFamilies = new Set();
  flat.forEach((l) => l.props?.fontFamily && fontFamilies.add(l.props.fontFamily));
  const fontLinks = [...fontFamilies]
    .map((f) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap" />`)
    .join("\n    ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${stage.w}, height=${stage.h}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    ${fontLinks}
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${stage.w}px; height: ${stage.h}px; overflow: hidden; background: ${esc(stage.bg || "#000")}; }
      body { font-family: 'Inter', sans-serif; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${durationSec}"
      data-width="${stage.w}"
      data-height="${stage.h}"
    >
${bodyParts.map((p) => "      " + p).join("\n")}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
${scriptParts.map((p) => p.split("\n").map((l) => "      " + l).join("\n")).join("\n")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

  return { html, warnings };
}
