/**
 * frameRenderer.js — paints one exact frame of a Graphic Destination project
 * into a 2D canvas context at a given timeline time (ms).
 *
 * HOW IT WORKS
 * ------------
 * The editor stage is DOM/SVG (see StageObject in GraphicDestinationMotion.jsx),
 * so instead of re-implementing every layer type on a 2D canvas (which would
 * inevitably drift from the preview), we render the frame with the SAME React
 * component the editor uses — <StageObject interactive={false}> — into an
 * offscreen host div at exact export resolution, serialize the subtree with
 * XMLSerializer, wrap it in <svg><foreignObject>, and draw the resulting SVG
 * image onto the target canvas. One render path = preview/export parity.
 *
 * Determinism: frame content depends only on the time argument. All randomness
 * in the engine is seeded (mulberry32), all FX are time-parametrized, and no
 * wall-clock value leaks into the rendered DOM.
 *
 * Browser support: foreignObject rasterization without canvas tainting works
 * in Chromium (and usually Safari). Firefox taints canvases drawn from
 * foreignObject SVGs — exportWebm.js surfaces that as a handled failure.
 *
 * Isolated per-layer failures (a layer type that throws during render) are
 * caught by an error boundary, skipped, and reported through warn() — an
 * export never crashes on a single bad layer.
 */

import { Component, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { StageObject, FONT_IMPORT } from "../components/GraphicDestinationMotion.jsx";

/* ---------- small utils ---------- */

const xmlEscape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(rd.result);
    rd.onerror = () => reject(new Error("read failed"));
    rd.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("SVG frame image failed to decode"));
    img.src = src;
  });
}

/* ---------- web font embedding ----------
 * An SVG loaded via <img>/blob URL renders in an isolated document: web fonts
 * loaded by the host page do NOT apply inside it. The standard fix (same one
 * html-to-image uses) is to inline the Google Fonts stylesheet with every
 * font file converted to a data: URL. Done once per session and cached. */
let _fontCssPromise = null;
function getWebFontCss() {
  if (!_fontCssPromise) {
    _fontCssPromise = (async () => {
      const res = await fetch(FONT_IMPORT);
      if (!res.ok) throw new Error("font css " + res.status);
      let css = await res.text();
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      const dataUrls = await Promise.all(
        urls.map(async (u) => {
          const r = await fetch(u);
          if (!r.ok) throw new Error("font file " + r.status);
          return blobToDataURL(await r.blob());
        })
      );
      urls.forEach((u, i) => { css = css.split(u).join(dataUrls[i]); });
      return css;
    })().catch(() => ""); // caller turns "" into a warning
  }
  return _fontCssPromise;
}

/* ---------- remote image inlining ----------
 * <img src="https://..."> inside foreignObject would taint (or fail to load
 * in) the SVG rasterization. Data URLs are safe, and uploaded images are
 * already stored as data URLs in this app. Remote URLs are fetched once and
 * swapped in on a CLONE of the project — the caller's object is never
 * mutated. CORS failures become warnings, not crashes. */
async function inlineRemoteImages(layers, warn) {
  for (const o of layers || []) {
    if (o.type === "clip") {
      await inlineRemoteImages(o.children, warn);
    } else if (o.type === "image" && /^https?:/i.test(o.props?.src || "")) {
      try {
        const res = await fetch(o.props.src, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error("http " + res.status);
        o.props = { ...o.props, src: await blobToDataURL(await res.blob()) };
      } catch {
        warn(`Image layer "${o.name}": remote image could not be fetched (CORS/network) — it may render blank in the export.`);
      }
    }
  }
}

/* ---------- per-layer error boundary ---------- */
class LayerBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err) {
    const l = this.props.layer;
    this.props.onLayerError?.(l, err);
  }
  render() {
    return this.state.err ? null : this.props.children;
  }
}

/**
 * createFrameRenderer({ project, ctx, width, height, warn })
 *   ctx    — 2D context of the export canvas (already sized width×height)
 *   warn   — fn(message) for user-visible warnings (deduped by caller)
 * Returns { renderFrame(timeMs), dispose() }.
 */
export async function createFrameRenderer({ project, ctx, width, height, warn }) {
  const stage = { w: width, h: height };
  const bg = project?.stage?.bg || "#101218";
  const cloned = JSON.parse(JSON.stringify(project || {}));
  const objects = Array.isArray(cloned.objects) ? cloned.objects : [];

  await inlineRemoteImages(objects, warn);
  const fontCss = await getWebFontCss();
  if (!fontCss) warn("Web fonts could not be embedded — text in the video will fall back to system fonts.");
  const styleTag = fontCss ? `<style xmlns="http://www.w3.org/1999/xhtml">${xmlEscape(fontCss)}</style>` : "";

  const layerErrors = new Set();
  const onLayerError = (layer, err) => {
    if (layerErrors.has(layer.id)) return;
    layerErrors.add(layer.id);
    warn(`Layer "${layer.name}" (${layer.type}) failed to render and was skipped: ${err?.message || err}`);
  };

  /* offscreen host — in the DOM (needs layout) but far off-screen */
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);

  /* NOTE: plain createElement (no JSX) — this file is .js by contract, and
     the build only enables JSX for .jsx/.tsx. */
  const frame = (time) =>
    h(
      "div",
      {
        xmlns: "http://www.w3.org/1999/xhtml",
        style: {
          width, height, position: "relative", overflow: "hidden",
          background: bg, fontFamily: "'Inter', system-ui, sans-serif",
          textRendering: "optimizeLegibility",
        },
      },
      objects.map((o) =>
        h(LayerBoundary, { key: o.id, layer: o, onLayerError },
          h(StageObject, { obj: o, time, stage, selected: false, interactive: false }))
      )
    );

  async function renderFrame(timeMs) {
    flushSync(() => root.render(frame(timeMs)));
    const node = host.firstChild;
    if (!node) throw new Error("frame host is empty");
    const xhtml = new XMLSerializer().serializeToString(node);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject x="0" y="0" width="${width}" height="${height}">${styleTag}${xhtml}</foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    let img;
    try {
      img = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  }

  function dispose() {
    try { root.unmount(); } catch { /* already gone */ }
    host.remove();
  }

  return { renderFrame, dispose };
}
