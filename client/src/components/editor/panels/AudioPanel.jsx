/* audio drawer: upload + attached track + reusable audio assets — extracted VERBATIM from GraphicDestinationMotion.jsx */
import { C, sectionLabel, chipStyle } from "../model";
import { NoteIcon } from "../ui";

export default function AudioPanel({ audioFileRef, audioUploading, audioErr, audioTrack, detachAudio, assets, assetsBusy, assetErr, refreshAssets, audioAssets, attachAudioAsset, onDeleteAudioAsset, fmtBytes, fmt }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <button className="gd-btn-accent" onClick={() => audioFileRef.current?.click()} disabled={audioUploading}
              style={{ width: "100%", background: C.amber, color: "#1A1405", border: "none", borderRadius: 6, padding: "8px 0", cursor: audioUploading ? "default" : "pointer", fontWeight: 700, fontSize: 12.5, opacity: audioUploading ? 0.65 : 1 }}>
              {audioUploading ? "Uploading…" : "Upload audio"}
            </button>
            <div style={{ color: C.faint, fontSize: 10.5, marginTop: 6, lineHeight: 1.5 }}>MP3, WAV, OGG, M4A or AAC · 5 MB max</div>
            {audioErr && <div style={{ color: C.danger, fontSize: 11.5, lineHeight: 1.5, marginTop: 9 }}>{audioErr}</div>}

            <div style={{ ...sectionLabel, margin: "13px 0 8px" }}>Attached track</div>
            {audioTrack ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg1, border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 9px" }}>
                <NoteIcon size={15} color={C.amber} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div title={audioTrack.name} style={{ fontSize: 12, fontWeight: 700, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{audioTrack.name}</div>
                  <div style={{ fontSize: 10, color: C.faint, fontFamily: "'JetBrains Mono'", fontVariantNumeric: "tabular-nums" }}>starts {fmt(audioTrack.startT)} · vol {audioTrack.volume.toFixed(2)}</div>
                </div>
                <button title="Detach audio from this project" aria-label="Detach audio" onClick={detachAudio}
                  style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(10,12,16,0.88)", border: `1px solid ${C.lineStrong}`, color: C.dim, fontSize: 11, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>×</button>
              </div>
            ) : (
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>Nothing attached — upload a track or pick one below.</div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "13px 0 8px" }}>
              <div style={sectionLabel}>Your audio</div>
              {assetsBusy && <div style={{ fontSize: 10.5, color: C.faint }}>Loading…</div>}
            </div>
            {assets === null ? (
              assetErr
                ? <button className="gd-btn" onClick={refreshAssets} style={{ ...chipStyle, cursor: "pointer" }}>Retry</button>
                : <div style={{ color: C.faint, fontSize: 12 }}>Loading…</div>
            ) : audioAssets.length === 0 ? (
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>No audio uploaded yet — it will appear here to reuse across projects.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {audioAssets.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg1, border: `1px solid ${audioTrack?.src === a.url ? C.amber : C.line}`, borderRadius: 8, padding: "7px 9px" }}>
                    <NoteIcon size={14} color={audioTrack?.src === a.url ? C.amber : C.faint} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={a.name} style={{ fontSize: 11.5, fontWeight: 600, color: C.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                      <div style={{ fontSize: 9.5, color: C.faint }}>{fmtBytes(a.size)}</div>
                    </div>
                    <button className="gd-btn" onClick={() => attachAudioAsset(a)} disabled={audioTrack?.src === a.url}
                      style={{ ...chipStyle, cursor: audioTrack?.src === a.url ? "default" : "pointer", padding: "3px 9px", fontSize: 10.5, flexShrink: 0, borderColor: audioTrack?.src === a.url ? C.amber : C.line, color: audioTrack?.src === a.url ? C.amber : C.dim }}>
                      {audioTrack?.src === a.url ? "Attached" : "Attach"}
                    </button>
                    <button title={`Delete ${a.name}`} aria-label={`Delete ${a.name}`} onClick={() => onDeleteAudioAsset(a)}
                      style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(10,12,16,0.88)", border: `1px solid ${C.lineStrong}`, color: C.dim, fontSize: 10, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
  );
}
