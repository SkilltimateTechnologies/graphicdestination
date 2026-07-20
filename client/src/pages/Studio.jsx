/* AI Asset Studio (Route A) — upload a reference → Kimi 3 suggests a motion
   spec (server-proxied, key never leaves the server) → the SAME spec drives a
   live preview built by engine/aiRecipe.js from existing primitives. Everything
   here is authoring-time: the baked clip is pure keyframes, so export
   re-renders byte-identically. Phase 1 spike: upload → analyze → preview.
   Phase 2 adds direct controls + chat refine; phase 3 saves to Templates. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { buildAiClip, validateAiSpec } from "../engine/aiRecipe.js";
import { StageObject } from "../components/StageObject.jsx";
import { C } from "../components/editor/model.js";

const STAGE = { w: 1280, h: 720 };
const inputDark = { background: "#171B24", border: "1px solid #232936", borderRadius: 6, color: "#E9ECF3", padding: "7px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

export default function Studio() {
  const [asset, setAsset] = useState(null); /* { id, url, name, mime } */
  const [uploadErr, setUploadErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [result, setResult] = useState(null); /* { spec, provider, clamped } */
  const [spec, setSpec] = useState(null); /* the working spec (controls + chat patch THIS) */
  const [history, setHistory] = useState([]); /* spec stack for undo */
  const [chatLog, setChatLog] = useState([]); /* [{ who, text }] */
  const [instruction, setInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const fileRef = useRef(null);

  /* apply a (raw) spec through the validator, pushing the previous one on the
     undo stack — THE single patch path for knobs, chat and generation */
  const applySpec = (raw, undo = true) => {
    const v = validateAiSpec(raw);
    if (!v.ok) return;
    if (undo && spec) setHistory((h) => [...h.slice(-19), spec]);
    setSpec(v.spec);
  };

  const clip = useMemo(() => {
    if (!spec || !asset) return null;
    return buildAiClip(spec, { src: asset.url, name: asset.name || "AI asset" });
  }, [spec, asset]);

  /* preview player — a plain rAF-ish ticker on the preview only (never on a
     render path; the baked clip itself is pure f(t)) */
  useEffect(() => {
    if (!playing || !clip) return undefined;
    const iv = setInterval(() => setTime((t) => (t + 100) % (clip.props.dur || 3000)), 100);
    return () => clearInterval(iv);
  }, [playing, clip]);

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploadErr(""); setGenErr(""); setResult(null); setAsset(null); setSpec(null); setHistory([]); setChatLog([]);
    setUploading(true);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res(rd.result);
        rd.onerror = () => rej(new Error("Couldn't read that file."));
        rd.readAsDataURL(f);
      });
      /* uploads go through the SAME hardened gate as any user upload
         (magic-byte sniff + caps) before the model ever sees them */
      const a = await api.uploadAsset({ name: f.name, mime: f.type, dataUrl });
      setAsset(a);
    } catch (err) { setUploadErr(err.message); }
    finally { setUploading(false); }
  };

  const generate = async () => {
    if (!asset || busy) return;
    setBusy(true); setGenErr(""); setResult(null);
    try {
      const r = await fetch("/api/ai/analyze-motion", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, note }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setResult(body);
      setSpec(null);
      applySpec(body.spec, false);
      setTime(0);
    } catch (err) { setGenErr(err.message); }
    finally { setBusy(false); }
  };

  const refine = async () => {
    const text = instruction.trim();
    if (!text || !spec || refining) return;
    setRefining(true);
    setChatLog((l) => [...l, { who: "you", text }]);
    setInstruction("");
    try {
      const r = await fetch("/api/ai/refine", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, instruction: text }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      applySpec(body.spec);
      setChatLog((l) => [...l, { who: "studio", text: body.provider === "kimi" ? `Patched the spec${body.clamped?.length ? ` (${body.clamped.length} values clamped)` : ""}.` : "No API key configured — the spec is unchanged; use the knobs below." }]);
    } catch (err) {
      setChatLog((l) => [...l, { who: "studio", text: `Refine failed — ${err.message}` }]);
    } finally { setRefining(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg0, color: C.txt, fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: 56, borderBottom: `1px solid ${C.line}` }}>
        <Link to="/dashboard" style={{ color: C.dim, fontSize: 13, textDecoration: "none" }}>← Dashboard</Link>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" }}>AI Asset Studio <span style={{ color: C.faint, fontWeight: 500, fontSize: 11 }}>· reference → animated asset (Route A, engine recipe)</span></div>
      </div>
      <div style={{ flex: 1, display: "flex", gap: 20, padding: "24px 20px", maxWidth: 1160, width: "100%", margin: "0 auto", boxSizing: "border-box", flexWrap: "wrap" }}>
        {/* left: reference + generate */}
        <div style={{ width: 340, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.faint, marginBottom: 8 }}>1 · Reference</div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={pickFile} />
          <div onClick={() => fileRef.current?.click()} style={{ border: `1.5px dashed ${C.lineStrong}`, borderRadius: 10, minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg1, cursor: "pointer", overflow: "hidden", marginBottom: 10 }}>
            {asset
              ? <img src={asset.url} alt={asset.name} style={{ maxWidth: "100%", maxHeight: 220, display: "block" }} />
              : <div style={{ color: C.dim, fontSize: 12.5, textAlign: "center", padding: 20 }}>{uploading ? "Uploading…" : "Click to upload a logo, icon or character"}</div>}
          </div>
          {uploadErr && <div style={{ color: C.danger, fontSize: 11.5, marginBottom: 10 }}>{uploadErr}</div>}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.faint, marginBottom: 8 }}>2 · Design note (optional)</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. playful mascot, keep it bouncy" style={{ ...inputDark, width: "100%", marginBottom: 14 }} />
          <button onClick={generate} disabled={!asset || busy} data-studio-generate
            style={{ width: "100%", background: busy || !asset ? C.bg3 : C.amber, color: busy || !asset ? C.faint : "#1A1405", border: "none", borderRadius: 7, padding: "11px 0", fontSize: 13.5, fontWeight: 800, cursor: !asset || busy ? "default" : "pointer", fontFamily: "inherit" }}>
            {busy ? "Analyzing…" : "Generate motion"}
          </button>
          {genErr && <div style={{ color: C.danger, fontSize: 11.5, marginTop: 10 }}>{genErr}</div>}
          {result && spec && (
            <div style={{ marginTop: 14, background: C.bg1, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.amber }}>Spec</span>
                <span data-studio-provider style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: result.provider === "kimi" ? "rgba(110,231,183,.12)" : "rgba(91,141,255,.12)", color: result.provider === "kimi" ? "#6EE7B7" : C.info }}>
                  {result.provider === "kimi" ? "Kimi 3" : "Fallback (no API key)"}
                </span>
                {!!result.clamped?.length && <span title={result.clamped.join("\n")} style={{ fontSize: 9.5, color: C.faint }}>{result.clamped.length} clamped</span>}
                <span style={{ flex: 1 }} />
                <button onClick={() => { const prev = history[history.length - 1]; if (prev) { setHistory((h) => h.slice(0, -1)); setSpec(prev); } }} disabled={!history.length} data-studio-undo
                  style={{ background: "transparent", border: `1px solid ${C.line}`, color: history.length ? C.dim : C.faint, borderRadius: 5, padding: "2px 9px", fontSize: 10, fontWeight: 700, cursor: history.length ? "pointer" : "default", fontFamily: "inherit" }}>↩ Undo</button>
              </div>
              {/* direct controls — every change patches the same validated spec */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <label style={{ fontSize: 10, color: C.faint, display: "flex", flexDirection: "column", gap: 3 }}>Motion
                  <select value={spec.hold.type} data-studio-hold onChange={(e) => applySpec({ ...spec, hold: { ...spec.hold, type: e.target.value } })} style={{ ...inputDark, padding: "4px 6px", fontSize: 11.5 }}>
                    {[["bob", "Bob"], ["pulse", "Pulse"], ["spin", "Spin"], ["rock", "Rock"], ["heartbeat", "Heartbeat"], ["float", "Float"], ["none", "None"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 10, color: C.faint, display: "flex", flexDirection: "column", gap: 3 }}>Intro
                  <select value={spec.intro.type} onChange={(e) => applySpec({ ...spec, intro: { ...spec.intro, type: e.target.value } })} style={{ ...inputDark, padding: "4px 6px", fontSize: 11.5 }}>
                    {[["pop", "Pop"], ["fade", "Fade"], ["rise", "Rise"], ["none", "None"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 10, color: C.faint, display: "flex", flexDirection: "column", gap: 3 }}>Outro
                  <select value={spec.outro.type} onChange={(e) => applySpec({ ...spec, outro: { ...spec.outro, type: e.target.value } })} style={{ ...inputDark, padding: "4px 6px", fontSize: 11.5 }}>
                    {[["whip", "Whip"], ["fade", "Fade"], ["none", "None"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 10, color: C.faint, display: "flex", flexDirection: "column", gap: 3 }}>Loop · {(spec.dur / 1000).toFixed(1)}s
                  <input type="range" min={1500} max={8000} step={100} value={spec.dur} onChange={(e) => applySpec({ ...spec, dur: Number(e.target.value) })} />
                </label>
                <label style={{ fontSize: 10, color: C.faint, display: "flex", flexDirection: "column", gap: 3 }}>Amplitude · {spec.hold.amp}
                  <input type="range" min={1} max={24} value={spec.hold.amp} onChange={(e) => applySpec({ ...spec, hold: { ...spec.hold, amp: Number(e.target.value) } })} />
                </label>
                <label style={{ fontSize: 10, color: C.faint, display: "flex", flexDirection: "column", gap: 3 }}>Size · {spec.size}px
                  <input type="range" min={80} max={400} step={10} value={spec.size} onChange={(e) => applySpec({ ...spec, size: Number(e.target.value) })} />
                </label>
              </div>
              {/* chat refine — same spec, patched server-side through the validator */}
              <div style={{ display: "flex", gap: 6, marginBottom: chatLog.length ? 8 : 0 }}>
                <input value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") refine(); }}
                  placeholder="Refine: slower, gentler, make it spin…" style={{ ...inputDark, flex: 1, padding: "6px 9px", fontSize: 11.5 }} />
                <button onClick={refine} disabled={refining || !instruction.trim()} data-studio-refine
                  style={{ background: C.amber, color: "#1A1405", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11.5, fontWeight: 800, cursor: instruction.trim() ? "pointer" : "default", fontFamily: "inherit", opacity: instruction.trim() ? 1 : 0.6 }}>
                  {refining ? "…" : "Refine"}
                </button>
              </div>
              {!!chatLog.length && (
                <div style={{ maxHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
                  {chatLog.map((m, i) => (
                    <div key={i} style={{ fontSize: 10.5, lineHeight: 1.45, color: m.who === "you" ? C.txt : C.dim }}>
                      <b style={{ color: m.who === "you" ? C.amber : C.info, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.who === "you" ? "You" : "Studio"}</b> · {m.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* right: preview */}
        <div style={{ flex: 1, minWidth: 380 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.faint }}>3 · Preview (loops)</div>
            {clip && (
              <button onClick={() => setPlaying((p) => !p)} style={{ background: C.bg1, border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
            )}
          </div>
          <div data-studio-preview style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#101218", borderRadius: 10, border: `1px solid ${C.line}`, overflow: "hidden" }}>
            {clip ? (
              <div style={{ position: "absolute", inset: 0, transform: `scale(${Math.min(1, 720 / STAGE.h)})`, transformOrigin: "0 0", width: STAGE.w, height: STAGE.h }}>
                <StageObject obj={clip} time={time} stage={STAGE} selected={false} interactive={false} />
              </div>
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 13, textAlign: "center", padding: 30 }}>
                Upload a reference and hit <b>&nbsp;Generate motion&nbsp;</b> — the spec plays here instantly.
              </div>
            )}
          </div>
          <div style={{ color: C.faint, fontSize: 11, lineHeight: 1.6, marginTop: 12 }}>
            The preview is the app's own renderer — what you see is exactly what a saved template + an export will render. Everything is keyframes: deterministic, export-identical.
          </div>
        </div>
      </div>
    </div>
  );
}
