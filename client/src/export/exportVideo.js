/**
 * exportVideo.js — one entry point for client-side video export.
 *
 * exportProject({ project, width, height, fps, videoBitsPerSecond,
 *                 onProgress, signal, prefer })
 *   → Promise<{ blob, warnings, format: "mp4" | "webm" }>
 *
 *   prefer "mp4" (default): MP4/H.264 via WebCodecs when supported
 *     (isMp4ExportSupported), otherwise automatic WebM fallback.
 *   prefer "webm": explicit WebM path (MediaRecorder), no MP4 attempt.
 *
 * WebM post-processing: MediaRecorder files carry no Duration element (and
 * no cues), so players can't show a length or seek. When a WebM is produced
 * we repair it with ts-ebml (decode → read metadata/cues → rewrite a
 * seekable header via tools.makeMetadataSeekable). ts-ebml is a node-style
 * CJS lib that expects a global Buffer, so a minimal Uint8Array-backed shim
 * is installed first (only the APIs ts-ebml actually calls). Any failure in
 * this post-step is NON-fatal: the original blob is returned with a warning.
 *
 * Audio: when project.audio is set ({ src, startT, volume, fadeIn, fadeOut
 * } — see audioMix.js), both paths mux an audio track (MP4: AAC via
 * WebCodecs; WebM: Opus via MediaRecorder). Audio failures never crash an
 * export: both exporters fall back to silent video and surface the reason
 * in the returned warnings[], which this router passes through unchanged.
 */

import { exportProjectToMp4, isMp4ExportSupported } from "./exportMp4.js";
import { exportProjectToWebM } from "./exportWebm.js";

/* ---------- minimal Buffer shim (browser only, ts-ebml runtime path) ----------
 * Covers exactly what ts-ebml's lib calls: Buffer.from/alloc/concat/isBuffer
 * plus the big-endian read/write methods, slice (view), and hex toString.
 * ebml/int64-buffer ship their own buffer handling; ts-ebml's own files
 * reference the global directly. */
function ensureBufferShim() {
  if (typeof globalThis.Buffer !== "undefined") return;
  class MiniBuffer extends Uint8Array {
    #dv(off, len) { return new DataView(this.buffer, this.byteOffset + off, len); }
    readUIntBE(off, len) { let v = 0; for (let i = 0; i < len; i++) v = v * 256 + this[off + i]; return v; }
    readIntBE(off, len) {
      const v = this.readUIntBE(off, len);
      const sign = 2 ** (len * 8 - 1);
      return v >= sign ? v - sign * 2 : v;
    }
    writeUIntBE(v, off, len) { for (let i = len - 1; i >= 0; i--) { this[off + i] = v % 256; v = Math.floor(v / 256); } return off + len; }
    writeIntBE(v, off, len) { return this.writeUIntBE(v < 0 ? v + 2 ** (len * 8) : v, off, len); }
    readUInt8(off = 0) { return this[off]; }
    readInt8(off = 0) { const v = this[off]; return v >= 128 ? v - 256 : v; }
    readUInt16BE(off = 0) { return this.#dv(off, 2).getUint16(0, false); }
    readUInt16LE(off = 0) { return this.#dv(off, 2).getUint16(0, true); }
    readInt16BE(off = 0) { return this.#dv(off, 2).getInt16(0, false); }
    readInt16LE(off = 0) { return this.#dv(off, 2).getInt16(0, true); }
    readUInt32BE(off = 0) { return this.#dv(off, 4).getUint32(0, false); }
    readUInt32LE(off = 0) { return this.#dv(off, 4).getUint32(0, true); }
    readInt32BE(off = 0) { return this.#dv(off, 4).getInt32(0, false); }
    readInt32LE(off = 0) { return this.#dv(off, 4).getInt32(0, true); }
    readFloatBE(off = 0) { return this.#dv(off, 4).getFloat32(0, false); }
    readFloatLE(off = 0) { return this.#dv(off, 4).getFloat32(0, true); }
    readDoubleBE(off = 0) { return this.#dv(off, 8).getFloat64(0, false); }
    readDoubleLE(off = 0) { return this.#dv(off, 8).getFloat64(0, true); }
    writeUInt8(v, off = 0) { this[off] = v & 0xff; return off + 1; }
    writeInt8(v, off = 0) { this[off] = v & 0xff; return off + 1; }
    writeUInt16BE(v, off = 0) { this.#dv(off, 2).setUint16(0, v, false); return off + 2; }
    writeUInt16LE(v, off = 0) { this.#dv(off, 2).setUint16(0, v, true); return off + 2; }
    writeInt16BE(v, off = 0) { this.#dv(off, 2).setInt16(0, v, false); return off + 2; }
    writeInt16LE(v, off = 0) { this.#dv(off, 2).setInt16(0, v, true); return off + 2; }
    writeUInt32BE(v, off = 0) { this.#dv(off, 4).setUint32(0, v, false); return off + 4; }
    writeUInt32LE(v, off = 0) { this.#dv(off, 4).setUint32(0, v, true); return off + 4; }
    writeInt32BE(v, off = 0) { this.#dv(off, 4).setInt32(0, v, false); return off + 4; }
    writeInt32LE(v, off = 0) { this.#dv(off, 4).setInt32(0, v, true); return off + 4; }
    writeFloatBE(v, off = 0) { this.#dv(off, 4).setFloat32(0, v, false); return off + 4; }
    writeFloatLE(v, off = 0) { this.#dv(off, 4).setFloat32(0, v, true); return off + 4; }
    writeDoubleBE(v, off = 0) { this.#dv(off, 8).setFloat64(0, v, false); return off + 8; }
    writeDoubleLE(v, off = 0) { this.#dv(off, 8).setFloat64(0, v, true); return off + 8; }
    slice(start, end) { return this.subarray(start, end); } // node Buffer.slice is a view, like subarray
    toString(enc) {
      if (enc === "hex") return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
      return new TextDecoder().decode(this);
    }
  }
  const Buffer = function (arg) { // legacy `new Buffer(n)` (int64-buffer)
    if (typeof arg === "number") return new MiniBuffer(arg);
    return Buffer.from(arg);
  };
  Buffer.from = (src, offsetOrEnc, length) => {
    if (typeof src === "string") {
      if (offsetOrEnc === "hex") {
        const out = new MiniBuffer(src.length >> 1);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(src.substr(i * 2, 2), 16);
        return out;
      }
      return MiniBuffer.from(new TextEncoder().encode(src));
    }
    if (src instanceof ArrayBuffer) return new MiniBuffer(src, offsetOrEnc || 0, length);
    if (ArrayBuffer.isView(src)) return new MiniBuffer(src.buffer, src.byteOffset + (offsetOrEnc || 0), length ?? src.byteLength - (offsetOrEnc || 0));
    return MiniBuffer.from(src); // plain array / iterable
  };
  Buffer.alloc = (n, fill = 0) => { const b = new MiniBuffer(n); if (fill) b.fill(fill); return b; };
  Buffer.allocUnsafe = (n) => new MiniBuffer(n);
  Buffer.concat = (list) => {
    const total = list.reduce((n, b) => n + b.length, 0);
    const out = new MiniBuffer(total);
    let off = 0;
    for (const b of list) { out.set(b, off); off += b.length; }
    return out;
  };
  Buffer.isBuffer = (b) => b instanceof Uint8Array;
  Buffer.isView = (b) => ArrayBuffer.isView(b);
  globalThis.Buffer = Buffer;
}

/**
 * Rewrite a MediaRecorder WebM blob with a proper Duration element, seek
 * head and cues (ts-ebml's documented metadata-rewrite recipe).
 * @returns {Promise<Blob>} repaired blob, or the original on any failure.
 */
async function repairWebmDuration(blob, warn) {
  try {
    ensureBufferShim();
    const { Decoder, Reader, tools } = await import("ts-ebml");
    const decoder = new Decoder();
    const reader = new Reader();
    reader.logging = false;
    reader.drop_default_duration = false; // count the last frame's duration too
    const buf = await blob.arrayBuffer();
    for (const elm of decoder.decode(buf)) reader.read(elm);
    reader.stop();
    if (!Number.isFinite(reader.duration) || reader.duration <= 0) {
      throw new Error("no duration could be computed");
    }
    const refinedMeta = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues);
    const body = buf.slice(reader.metadataSize);
    const repaired = new Blob([refinedMeta, body], { type: blob.type || "video/webm" });
    if (repaired.size <= body.byteLength) throw new Error("rewritten header is empty");
    return repaired;
  } catch (err) {
    warn(`WebM duration metadata could not be repaired — some players may not show the clip length (${err?.message || err}).`);
    return blob;
  }
}

/**
 * @param {object} opts
 * @param {object} opts.project  project JSON
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.fps]
 * @param {number} [opts.videoBitsPerSecond]
 * @param {(fraction:number)=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {"mp4"|"webm"} [opts.prefer="mp4"]
 * @returns {Promise<{blob: Blob, warnings: string[], format: "mp4"|"webm"}>}
 */
export async function exportProject({ prefer = "mp4", ...opts }) {
  if (prefer !== "webm" && (await isMp4ExportSupported())) {
    const { blob, warnings } = await exportProjectToMp4(opts);
    return { blob, warnings, format: "mp4" };
  }
  const { blob, warnings } = await exportProjectToWebM(opts);
  const seen = new Set(warnings);
  const repaired = await repairWebmDuration(blob, (m) => { if (!seen.has(m)) { seen.add(m); warnings.push(m); } });
  return { blob: repaired, warnings, format: "webm" };
}
