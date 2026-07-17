/* images drawer: upload + your asset library — extracted VERBATIM from GraphicDestinationMotion.jsx */
import { C, sectionLabel, chipStyle } from "../model";

export default function ImagePanel({ assetFileRef, assetUploading, assetErr, assets, assetsBusy, refreshAssets, addAssetLayer, onDeleteAsset }) {
  return (
          <div className="gd-panel" style={{ position: "absolute", left: 84, top: 12, width: 240, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, zIndex: 30, boxShadow: "0 12px 40px rgba(0,0,0,.5)" }}>
            <button className="gd-btn-accent" onClick={() => assetFileRef.current?.click()} disabled={assetUploading}
              style={{ width: "100%", background: C.amber, color: "#1A1405", border: "none", borderRadius: 6, padding: "8px 0", cursor: assetUploading ? "default" : "pointer", fontWeight: 700, fontSize: 12.5, opacity: assetUploading ? 0.65 : 1 }}>
              {assetUploading ? "Uploading…" : "Upload image"}
            </button>
            {assetErr && <div style={{ color: C.danger, fontSize: 11.5, lineHeight: 1.5, marginTop: 9 }}>{assetErr}</div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "13px 0 8px" }}>
              <div style={sectionLabel}>Your assets</div>
              {assetsBusy && <div style={{ fontSize: 10.5, color: C.faint }}>Loading…</div>}
            </div>
            {assets === null ? (
              assetErr
                ? <button className="gd-btn" onClick={refreshAssets} style={{ ...chipStyle, cursor: "pointer" }}>Retry</button>
                : <div style={{ color: C.faint, fontSize: 12 }}>Loading…</div>
            ) : assets.length === 0 ? (
              <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>Upload your logo or image to use it in videos</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 48px)", gap: 8, maxHeight: 264, overflowY: "auto" }}>
                {assets.map((a) => (
                  <div key={a.id} style={{ position: "relative", width: 48, height: 48 }}>
                    <button className="gd-asset" title={`${a.name} — click to add`} onClick={() => addAssetLayer(a)}
                      style={{ width: 48, height: 48, padding: 0, background: C.bg3, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", overflow: "hidden", display: "block" }}>
                      <img src={a.url} alt={a.name} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
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
