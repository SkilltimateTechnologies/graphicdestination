/*
 * Magic-byte sniffing for uploaded assets — the client-declared mime is a
 * HINT, never trusted (any string can be sent over the wire). The decoded
 * bytes must carry a known signature; the STORED mime is the sniffed
 * canonical one, so a mislabeled upload is either corrected within its own
 * family or rejected. Nothing else about the pipeline changes: image/audio
 * families, size caps and the quota still apply.
 *
 *   images: png · jpeg · webp · gif
 *   audio:  wav (RIFF/WAVE) · mpeg (ID3 or frame sync) · ogg (OggS) ·
 *           aac (ADTS sync) · mp4/m4a (…ftyp) · webm (EBML)
 */

const ascii = (buf, off, str) => buf.length >= off + str.length && buf.toString("latin1", off, off + str.length) === str;

/** @returns the canonical sniffed mime, or null when no signature matches */
export function sniffAssetMime(buf) {
  if (!buf || buf.length < 4) return null;
  /* images */
  if (buf[0] === 0x89 && ascii(buf, 1, "PNG")) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (ascii(buf, 0, "GIF87a") || ascii(buf, 0, "GIF89a")) return "image/gif";
  if (ascii(buf, 0, "RIFF") && ascii(buf, 8, "WEBP")) return "image/webp";
  /* audio */
  if (ascii(buf, 0, "RIFF") && ascii(buf, 8, "WAVE")) return "audio/wav";
  if (ascii(buf, 4, "ftyp")) return "audio/mp4"; /* mp4/m4a container */
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return "audio/aac"; /* ADTS sync (before mp3 — they overlap) */
  if (ascii(buf, 0, "ID3") || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return "audio/mpeg"; /* ID3 tag or 11-bit frame sync (ADTS already caught above) */
  if (ascii(buf, 0, "OggS")) return "audio/ogg";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "audio/webm"; /* EBML header */
  return null;
}

/** family of a mime string: "image" | "audio" | null */
export const mimeFamily = (mime) =>
  String(mime).startsWith("image/") ? "image" : String(mime).startsWith("audio/") ? "audio" : null;
