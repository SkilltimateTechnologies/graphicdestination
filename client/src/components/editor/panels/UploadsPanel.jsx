/* Uploads hub — ONE home for media: images + audio (video later), replacing
   the standalone Image / Audio rail panels. Kind chips filter the grid; the
   dropzone uploads (the SERVER verifies magic bytes + caps — the panel just
   routes by declared MIME for a good error message). Assets are PROJECT-
   SCOPED by default when the host editor carries a project id (uploads from
   this editor land in this project; ?project=<id> list), with a cross-project
   search over the whole owner library. Clicking an image inserts it BY
   REFERENCE (/api/assets/:id — no duplicate bytes); clicking an audio asset
   attaches it as the project track. */
import { useMemo, useState } from "react";
import { C, sectionLabel, inputStyle, chipStyle } from "../model";
import { NoteIcon } from "../ui";

const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function UploadsPanel({
  projectId, assets, assetsBusy, assetErr, uploading, uploadErr,
  scope, setScope, onUploadFiles, addAssetLayer, attachAudioAsset, onDeleteAsset, refreshAssets,
}) {
  const [kind, setKind] = useState("All"); /* All · Images · Audio */
  const [q, setQ] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (assets || []).filter((a) =>
      (kind === "All" || a.kind === kind.toLowerCase().slice(0, -1)) &&
      (!s || a.name.toLowerCase().includes(s)));
  }, [assets, kind, q]);

  const drop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) onUploadFiles(files);
  };

  return (
    <div className="gd-panel" data-uploads-panel style={{ position: "absolute", left: 84, top: 12, width: 268, maxHeight: "calc(100% - 24px)", display: "flex", flexDirection: "column", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={sectionLabel}>Uploads</span>
        <span style={{ fontSize: 9, color: C.dim }}>{assets ? `${assets.length} asset${assets.length === 1 ? "" : "s"}` : assetsBusy ? "loading…" : ""}</span>
      </div>

      {/* dropzone — routes by MIME; the server magic-byte-verifies anyway */}
      <div data-upload-dropzone
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={drop}
        style={{ border: `1.5px dashed ${dragOver ? C.amber : C.lineStrong}`, borderRadius: 8, padding: "14px 10px", textAlign: "center", background: dragOver ? "rgba(245,165,36,.06)" : C.bg1, marginBottom: 10, transition: "border-color 120ms" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: dragOver ? C.amber : C.dim }}>{uploading ? "Uploading…" : "Drop images or audio here"}</div>
        <div style={{ fontSize: 9.5, color: C.faint, marginTop: 3 }}>PNG · JPG · WebP · GIF · MP3 · WAV · OGG · M4A — max 3 MB / 5 MB</div>
      </div>
      {uploadErr && <div style={{ color: C.danger, fontSize: 10.5, lineHeight: 1.5, marginBottom: 8 }}>{uploadErr}</div>}

      {/* scope: this project vs the whole library */}
      {projectId != null && (
        <div style={{ display: "flex", background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 7, padding: 2, gap: 2, marginBottom: 8 }}>
          {[["project", "This project"], ["all", "All projects"]].map(([v, label]) => (
            <button key={v} data-uploads-scope={v} onClick={() => setScope(v)}
              style={{ flex: 1, padding: "0 8px", height: 24, borderRadius: 5, border: "none", cursor: "pointer", fontSize: 10, fontWeight: scope === v ? 700 : 500, background: scope === v ? C.amber : "transparent", color: scope === v ? "#1A1405" : C.dim }}>{label}</button>
          ))}
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={scope === "all" ? "Search all my uploads…" : "Search uploads…"}
        style={{ ...inputStyle, marginBottom: 8, padding: "5px 8px", fontSize: 11.5 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {["All", "Images", "Audio"].map((c) => (
          <button key={c} data-uploads-kind={c} onClick={() => setKind(c)}
            style={{ ...chipStyle, cursor: "pointer", padding: "3px 9px", fontSize: 10, borderColor: kind === c ? C.amber : C.line, color: kind === c ? C.amber : C.dim }}>{c}</button>
        ))}
      </div>

      {assets === null ? (
        assetErr
          ? <button className="gd-btn" onClick={refreshAssets} style={{ ...chipStyle, cursor: "pointer" }}>Retry</button>
          : <div style={{ color: C.faint, fontSize: 12 }}>Loading…</div>
      ) : !list.length ? (
        <div style={{ color: C.faint, fontSize: 11, lineHeight: 1.6, textAlign: "center", padding: "12px 4px" }}>
          {q ? `No ${scope === "all" ? "library" : "project"} uploads match “${q}”.` : scope === "project" ? "Nothing uploaded to this project yet — drop a file above." : "Your library is empty — drop a file above."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", gap: 7, overflowY: "auto", paddingRight: 3 }}>
          {list.map((a) => (
            <div key={a.id} style={{ position: "relative" }}>
              <button className="gd-asset" data-upload-card={a.id}
                title={a.kind === "audio" ? `${a.name} · ${fmtBytes(a.size)} — click to attach as the project audio` : `${a.name} · ${fmtBytes(a.size)} — click to insert`}
                onClick={() => (a.kind === "audio" ? attachAudioAsset(a) : addAssetLayer(a))}
                style={{ width: "100%", aspectRatio: "1", padding: 0, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 7, cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {a.kind === "audio"
                  ? <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, pointerEvents: "none" }}><NoteIcon size={18} color={C.amber} /><span style={{ fontSize: 7.5, color: C.dim, maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span></span>
                  : <img src={a.url} alt={a.name} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />}
              </button>
              <button title={`Delete ${a.name}`} aria-label={`Delete ${a.name}`} onClick={() => onDeleteAsset(a)}
                style={{ position: "absolute", top: 2, right: 2, width: 15, height: 15, borderRadius: "50%", background: "rgba(10,12,16,0.88)", border: `1px solid ${C.lineStrong}`, color: C.dim, fontSize: 10, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
