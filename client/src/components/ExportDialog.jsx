/**
 * ExportDialog.jsx — export modal for Graphic Destination Motion.
 *
 * Three paths, per design/design.md "Export UX":
 *   · MP4 (H.264) — instant, in-browser (RECOMMENDED): deterministic
 *     client-side export via exportProject({ prefer: "mp4" }) — WebCodecs +
 *     mp4-muxer, plays everywhere (QuickTime/WMP/phones). Falls back to WebM
 *     automatically when WebCodecs H.264 is unavailable.
 *   · WebM — fallback: explicit MediaRecorder WebM export (VP9/VP8), with
 *     duration metadata repaired via ts-ebml.
 *   · MP4 — server render (BETA): POST /api/projects/:id/render and download
 *     the streamed mp4. (api.js has no render helper yet, so this calls the
 *     endpoint with the same BASE/credentials conventions as api.js.)
 *
 * Props: { open, onClose, project, projectId, projectName }
 * Self-contained: inline styles + design tokens from design.md.
 */

import { useEffect, useRef, useState } from "react";
import { exportProject } from "../export/exportVideo.js";
import { isMp4ExportSupported } from "../export/exportMp4.js";
import { downloadBlob, isWebmExportSupported } from "../export/exportWebm.js";

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  success: "#3FB68B", danger: "#E5636A", info: "#5B8DEF",
};

const API_BASE = import.meta.env.VITE_API_BASE || "";

const FPS_OPTIONS = [24, 30, 60];
const QUALITY_STOPS = [
  { id: "low", label: "Low", bps: 2_500_000 },
  { id: "medium", label: "Medium", bps: 5_000_000 },
  { id: "high", label: "High", bps: 8_000_000 },
];

function safeName(projectName) {
  const base = (projectName || "project").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "project";
}

function fmtBytes(n) {
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

function Badge({ color, bg, children }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      color, background: bg, borderRadius: 4, padding: "2px 6px", flexShrink: 0,
    }}>{children}</span>
  );
}

function FormatCard({ selected, disabled, badge, title, desc, note, icon, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, background: disabled ? T.panel : selected ? T.raised : hover ? T.hover : T.raised,
        border: `1px solid ${selected ? T.accent : T.border}`,
        borderRadius: 8, padding: "12px 13px", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1, transition: "background 120ms ease-out, border-color 120ms ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color: selected ? T.accent : T.dim, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>{title}</span>
        {badge}
      </div>
      <div style={{ fontSize: 11.5, color: T.dim, lineHeight: 1.5 }}>{desc}</div>
      {note && <div style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.45, marginTop: 6 }}>{note}</div>}
    </div>
  );
}

export default function ExportDialog({ open, onClose, project, projectId, projectName }) {
  const [format, setFormat] = useState("mp4"); // "mp4" | "webm" | "server"
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState("high");
  const [phase, setPhase] = useState("idle"); // idle | running | done | error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // { filename, size, warnings }
  const [error, setError] = useState(null);   // { message, hint }
  const [mp4Ok, setMp4Ok] = useState(false);
  const abortRef = useRef(null);
  const lastBlobRef = useRef(null);

  const webmOk = isWebmExportSupported();
  const mp4Missing = !projectId;
  const busy = phase === "running";

  useEffect(() => {
    if (!open) return;
    setPhase("idle"); setProgress(0); setResult(null); setError(null);
    setFps(30); setQuality("high");
    lastBlobRef.current = null;
    /* Probe WebCodecs H.264 support (async, cached) and pick the default
       format: MP4 when encodable here, WebM otherwise. */
    let live = true;
    isMp4ExportSupported().then((ok) => {
      if (!live) return;
      setMp4Ok(ok);
      setFormat(ok ? "mp4" : "webm");
    });
    return () => { live = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const stageW = project?.stage?.w || 1280;
  const stageH = project?.stage?.h || 720;
  const durationMs = Number(project?.stage?.dur) || 5000;
  const q = QUALITY_STOPS.find((s) => s.id === quality) || QUALITY_STOPS[2];
  const filename = (ext) => `graphicdestination-${safeName(projectName)}.${ext}`;

  const startExport = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("running"); setProgress(0); setError(null); setResult(null);
    try {
      if (format !== "server") {
        /* In-browser path: MP4/H.264 when supported (prefer "mp4"), else the
           WebM fallback; prefer "webm" forces the explicit WebM path. The
           returned format is authoritative — name the file after it. */
        const { blob, warnings, format: used } = await exportProject({
          project, width: stageW, height: stageH, fps,
          videoBitsPerSecond: q.bps,
          onProgress: setProgress,
          signal: controller.signal,
          prefer: format,
        });
        const name = filename(used);
        lastBlobRef.current = blob;
        downloadBlob(blob, name); // auto-download on completion
        setResult({ filename: name, size: blob.size, warnings });
        setPhase("done");
      } else {
        setProgress(-1); // indeterminate — server render gives no frame progress
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/render`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fps, quality }),
          signal: controller.signal,
        });
        if (!res.ok) {
          let msg = `Server error (${res.status})`;
          try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* not json */ }
          throw new Error(msg);
        }
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("video/mp4")) {
          const j = await res.json().catch(() => ({}));
          const err = new Error(j.error || j.reason || "Server could not render MP4.");
          err.hint = j.hint;
          throw err;
        }
        const blob = await res.blob();
        const name = filename("mp4");
        lastBlobRef.current = blob;
        downloadBlob(blob, name);
        setResult({ filename: name, size: blob.size, warnings: [] });
        setPhase("done");
      }
    } catch (err) {
      if (controller.signal.aborted || err?.message === "Export cancelled") {
        setPhase("idle"); setProgress(0); // cancelled → back to options
        return;
      }
      setError({ message: err?.message || "Export failed.", hint: err?.hint });
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();
  const pct = Math.round(progress * 100);

  return (
    <div
      onPointerDown={() => { if (!busy) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "rgba(10,12,16,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', system-ui, sans-serif", color: T.text,
      }}
    >
      <style>{`
        @keyframes gdExportIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gdExportBar { from { background-position: 0 0; } to { background-position: 28px 0; } }
      `}</style>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: "94vw", background: T.raised, border: `1px solid ${T.border}`,
          borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: 20,
          animation: "gdExportIn 160ms ease-out",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>Export video</div>
          <button
            onClick={() => { if (!busy) onClose?.(); }}
            title={busy ? "Cancel the export first" : "Close"}
            style={{
              marginLeft: "auto", background: "none", border: "none", color: busy ? T.faint : T.dim,
              cursor: busy ? "not-allowed" : "pointer", fontSize: 16, lineHeight: 1, padding: 2,
            }}
          >✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>
          {stageW}×{stageH} · {fps}fps · {(durationMs / 1000).toFixed(1)}s · {project?.objects?.length || 0} layers
        </div>

        {(phase === "idle" || phase === "error") && (
          <>
            {/* format cards */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <FormatCard
                selected={format === "mp4"}
                disabled={!mp4Ok}
                onClick={() => setFormat("mp4")}
                badge={<Badge color={T.accent} bg={T.accentSoft}>Recommended</Badge>}
                title="MP4 (H.264)"
                desc="Instant, in-browser. Every frame rendered locally from the same engine as the preview — plays everywhere, duration intact."
                note={mp4Ok ? "H.264 · QuickTime / Windows / phones · .mp4" : "MP4 export needs Chrome/Edge — using WebM"}
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.8 1.5 3.5 9h3.3l-1 5.5L11.5 7H8.1l.7-5.5z" /></svg>}
              />
              <FormatCard
                selected={format === "webm"}
                disabled={!webmOk}
                onClick={() => setFormat("webm")}
                badge={<Badge color={T.dim} bg="rgba(147,155,173,0.12)">Fallback</Badge>}
                title="WebM"
                desc="Instant, in-browser. For browsers without H.264 encoding — some players (QuickTime, WMP) can't open WebM."
                note={webmOk ? "VP9/VP8 · downloads as .webm" : "Not supported by this browser — use a Chromium-based browser."}
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.2" /><path d="M6.5 5.4v5.2l4.4-2.6z" fill="currentColor" stroke="none" /></svg>}
              />
              <FormatCard
                selected={format === "server"}
                disabled={mp4Missing}
                onClick={() => setFormat("server")}
                badge={<Badge color={T.info} bg="rgba(91,141,239,0.12)">Beta</Badge>}
                title="MP4"
                desc="Server render. Uploads the saved project and renders it to H.264 — best compatibility, slower."
                note={mp4Missing ? "Requires a saved cloud project." : "Rendered on the server · downloads as .mp4"}
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2.5" width="12" height="4.5" rx="1.2" /><rect x="2" y="9" width="12" height="4.5" rx="1.2" /><path d="M4.5 4.75h.01M4.5 11.25h.01" /></svg>}
              />
            </div>

            {/* fps selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ width: 72, fontSize: 11, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>FPS</span>
              <div style={{ display: "flex", gap: 6 }}>
                {FPS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFps(f)}
                    style={{
                      background: fps === f ? T.accentSoft : T.panel,
                      border: `1px solid ${fps === f ? T.accent : T.border}`,
                      color: fps === f ? T.accent : T.dim,
                      borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", transition: "background 120ms ease-out, border-color 120ms ease-out",
                      fontFamily: "inherit",
                    }}
                  >{f}</button>
                ))}
              </div>
            </div>

            {/* quality selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <span style={{ width: 72, fontSize: 11, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quality</span>
              <div style={{ flex: 1 }}>
                <input
                  type="range" min={0} max={2} step={1}
                  value={Math.max(0, QUALITY_STOPS.findIndex((s) => s.id === quality))}
                  onChange={(e) => setQuality(QUALITY_STOPS[Number(e.target.value)].id)}
                  style={{ width: "100%", accentColor: T.accent, cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: T.faint, marginTop: 2 }}>
                  {QUALITY_STOPS.map((s) => (
                    <span key={s.id} style={{ color: quality === s.id ? T.accent : T.faint, fontWeight: quality === s.id ? 700 : 500 }}>{s.label}</span>
                  ))}
                </div>
              </div>
            </div>

            {phase === "error" && (
              <div style={{ background: "rgba(229,99,106,0.08)", border: `1px solid rgba(229,99,106,0.35)`, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.danger }}>{error?.message}</div>
                {error?.hint && <div style={{ fontSize: 11, color: T.dim, marginTop: 4, lineHeight: 1.5 }}>{error.hint}</div>}
              </div>
            )}

            <button
              onClick={startExport}
              disabled={format === "server" ? mp4Missing : format === "webm" ? !webmOk : !mp4Ok}
              style={{
                width: "100%", background: T.accent, color: "#1A1405", border: "none", borderRadius: 8,
                padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
                transition: "background 120ms ease-out", fontFamily: "inherit",
                opacity: (format === "server" ? mp4Missing : format === "webm" ? !webmOk : !mp4Ok) ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.accentDim; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; }}
            >
              Export {format === "webm" ? "WebM" : "MP4"} · {fps} fps · {q.label}
            </button>
          </>
        )}

        {phase === "running" && (
          <div style={{ padding: "6px 0 2px" }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {format === "server" ? "Rendering on the server…" : "Rendering frames in your browser…"}
              </div>
              <div style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: T.accent, fontVariantNumeric: "tabular-nums" }}>
                {progress < 0 ? "" : `${pct}%`}
              </div>
            </div>
            <div style={{ height: 6, background: T.panel, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
              {progress < 0 ? (
                <div style={{
                  height: "100%", width: "40%", borderRadius: 3,
                  background: `repeating-linear-gradient(45deg, ${T.accent} 0 10px, ${T.accentDim} 10px 20px)`,
                  backgroundSize: "28px 100%", animation: "gdExportBar 700ms linear infinite",
                }} />
              ) : (
                <div style={{ height: "100%", width: `${pct}%`, background: T.accent, borderRadius: 3, transition: "width 120ms ease-out" }} />
              )}
            </div>
            <div style={{ fontSize: 11, color: T.faint, lineHeight: 1.5, marginBottom: 14 }}>
              {format === "server"
                ? "This can take a minute depending on the render queue. The download starts automatically."
                : format === "webm"
                  ? "Keep this tab in the foreground — export runs at about real-time speed. The download starts automatically."
                  : "Encoded as fast as your machine goes — usually quicker than real time. The download starts automatically."}
            </div>
            <button
              onClick={cancel}
              style={{
                width: "100%", background: "transparent", border: `1px solid ${T.borderStrong}`, color: T.text,
                borderRadius: 8, padding: "9px 0", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                transition: "background 120ms ease-out", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >Cancel</button>
          </div>
        )}

        {phase === "done" && result && (
          <div style={{ textAlign: "center", padding: "8px 0 2px" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", background: "rgba(63,182,139,0.12)",
              border: "1.5px solid rgba(63,182,139,0.45)", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 12px",
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={T.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.5 15 16 6" /></svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Export complete</div>
            <div style={{ fontSize: 12, color: T.dim, marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: T.text }}>{result.filename}</span> · {fmtBytes(result.size)}
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginBottom: result.warnings?.length ? 10 : 16 }}>Download started automatically.</div>
            {result.warnings?.length > 0 && (
              <div style={{ textAlign: "left", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 11px", marginBottom: 14, maxHeight: 110, overflowY: "auto" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.accent, marginBottom: 5 }}>
                  {result.warnings.length} warning{result.warnings.length > 1 ? "s" : ""}
                </div>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, marginBottom: 3 }}>• {w}</div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => lastBlobRef.current && downloadBlob(lastBlobRef.current, result.filename)}
                style={{
                  flex: 1, background: T.panel, border: `1px solid ${T.borderStrong}`, color: T.text,
                  borderRadius: 8, padding: "9px 0", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  transition: "background 120ms ease-out", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.panel; }}
              >Download again</button>
              <button
                onClick={() => onClose?.()}
                style={{
                  flex: 1, background: T.accent, color: "#1A1405", border: "none", borderRadius: 8,
                  padding: "9px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                  transition: "background 120ms ease-out", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentDim; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.accent; }}
              >Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
