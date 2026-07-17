/* ============================================================
   IMAGE PREP — normalize a picked image file before it goes to
   the asset library (POST /api/assets {name, mime, dataUrl}).

   prepareImageFile(file) is browser-only (FileReader, canvas,
   createImageBitmap). The pure helpers below it are exported so
   node checks can exercise the decision logic without a DOM.
   ============================================================ */

export const MAX_SIDE = 1600;            /* px — longest side after downscale */
export const MAX_BYTES = 3 * 1024 * 1024; /* final decoded ceiling (3 MB) */
export const JPEG_QUALITY = 0.85;

const SUPPORTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const isSupportedMime = (mime) => SUPPORTED.has((mime || "").toLowerCase());

/* Fit width×height within maxSide on the longest side. Never upscales. */
export function fitSize(width, height, maxSide = MAX_SIDE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scaled: s < 1 };
}

/* Re-encode target: PNG keeps its (meaningful) alpha channel — only PNG
   sources carry one worth preserving here; everything else flattens to JPEG. */
export const pickEncodeMime = (srcMime) => ((srcMime || "").toLowerCase() === "image/png" ? "image/png" : "image/jpeg");

/* Decoded byte size of a base64 data URL payload. */
export function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf("base64,");
  if (i < 0) return dataUrl.length;
  const b64 = dataUrl.slice(i + "base64,".length);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(rd.result);
    rd.onerror = () => reject(new Error("Couldn't read that file — try picking it again."));
    rd.readAsDataURL(file);
  });
}

/* Decode the file to something drawImage() accepts. createImageBitmap is
   preferred (no DOM node, handles EXIF orientation); fall back to <img>. */
async function decodeSource(file, dataUrl) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close && bmp.close() };
    } catch { /* fall through to <img> decode */ }
  }
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't decode that image — the file may be corrupt. Try a different one."));
    el.src = dataUrl;
  });
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
}

/**
 * prepareImageFile(file) → Promise<{name, mime, dataUrl, width, height}>
 * - rejects non png/jpeg/webp/gif
 * - downscales so the longest side ≤ MAX_SIDE
 * - re-encodes PNG (alpha sources) or JPEG q0.85, unless the re-encode
 *   would be larger than the original file — then the original is kept
 * - final decoded size must be ≤ MAX_BYTES
 */
export async function prepareImageFile(file) {
  const srcMime = (file?.type || "").toLowerCase();
  if (!isSupportedMime(srcMime)) {
    throw new Error("That file type isn't supported — please choose a PNG, JPEG, WebP or GIF image.");
  }
  const originalUrl = await readAsDataURL(file);
  const dec = await decodeSource(file, originalUrl);
  try {
    const { width, height } = fitSize(dec.width, dec.height);
    const encMime = pickEncodeMime(srcMime);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (encMime === "image/jpeg") { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(dec.source, 0, 0, width, height);
    const reencoded = canvas.toDataURL(encMime, JPEG_QUALITY);

    const keepOriginal = dataUrlBytes(reencoded) > dataUrlBytes(originalUrl);
    const out = {
      name: file.name || "image",
      mime: keepOriginal ? srcMime : encMime,
      dataUrl: keepOriginal ? originalUrl : reencoded,
      width: keepOriginal ? dec.width : width,
      height: keepOriginal ? dec.height : height,
    };
    if (dataUrlBytes(out.dataUrl) > MAX_BYTES) {
      throw new Error("That image is over 3 MB even after resizing — please use a smaller image.");
    }
    return out;
  } finally {
    dec.close();
  }
}
