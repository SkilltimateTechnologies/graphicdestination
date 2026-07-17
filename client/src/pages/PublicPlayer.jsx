/**
 * PublicPlayer.jsx — PUBLIC share-link player (route /p/:token, no auth).
 *
 * Fetches { name, data } from GET /api/share/:token and plays the composition
 * full-viewport on bg-canvas: the stage (project stage size, default
 * 1280×720) is centered and scaled-to-fit with a CSS transform driven by a
 * ResizeObserver, objects render through the same <StageObject> the editor
 * uses (non-interactive: no selection, no pointer handlers), and time is
 * driven by requestAnimationFrame 0 → duration, looping by default.
 *
 * Minimal chrome per design/design.md: top-left "Zwoosh" brand, a bottom
 * control bar (play/pause, JetBrains Mono timecode, loop indicator), and a
 * "Made with Zwoosh — create yours" link to /.
 * Unknown/disabled tokens (404) get a designed error card.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { StageObject, FONT_IMPORT } from "../components/GraphicDestinationMotion";

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  success: "#3FB68B", danger: "#E5636A", info: "#5B8DEF",
};

const DEFAULT_STAGE_W = 1280;
const DEFAULT_STAGE_H = 720;
const DEFAULT_DUR_MS = 6000; // mirrors the engine's default composition duration

/* mm:ss.cs — tabular JetBrains Mono, like the editor's timeline readouts */
function fmtTc(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function BrandMark() {
  return (
    <span style={{ width: 22, height: 22, borderRadius: 8, background: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
    </span>
  );
}

export default function PublicPlayer() {
  const { token } = useParams();
  const [status, setStatus] = useState("loading"); // "loading" | "ready" | "missing" | "error"
  const [proj, setProj] = useState(null);          // { name, data } once loaded

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [scale, setScale] = useState(1);

  const stageAreaRef = useRef(null);
  const timeRef = useRef(0);
  const playingRef = useRef(true);
  const loopRef = useRef(true);

  /* ----- fetch the shared composition (public, no session) ----- */
  const load = useCallback(() => {
    let live = true;
    setStatus("loading");
    setProj(null);
    api.getSharedProject(token)
      .then((p) => {
        if (!live) return;
        if (!p || !p.data || !Array.isArray(p.data.objects)) { setStatus("missing"); return; }
        // Anonymous viewers can't hit the owner-auth'd asset API — rewrite
        // asset refs to the token-scoped public route (server verifies the
        // project actually references each asset before serving it).
        const raw = JSON.stringify(p.data).replace(
          /\/api\/assets\/(\d+)/g,
          `/api/share/${encodeURIComponent(token)}/assets/$1`
        );
        setProj({ ...p, data: JSON.parse(raw) });
        setStatus("ready");
      })
      .catch((err) => {
        if (!live) return;
        setStatus(err?.status === 404 ? "missing" : "error");
      });
    return () => { live = false; };
  }, [token]);

  useEffect(() => load(), [load]);

  /* ----- composition geometry (respect the project's stage field) ----- */
  const stage = proj?.data?.stage || {};
  const stageW = Number(stage.w) > 0 ? Number(stage.w) : DEFAULT_STAGE_W;
  const stageH = Number(stage.h) > 0 ? Number(stage.h) : DEFAULT_STAGE_H;
  const duration = Number(stage.dur) > 0 ? Number(stage.dur) : DEFAULT_DUR_MS;
  const stageBg = typeof stage.bg === "string" ? stage.bg : "#101218";
  const objects = status === "ready" ? proj.data.objects : [];

  /* ----- document title reflects the shared project ----- */
  useEffect(() => {
    if (status === "ready" && proj?.name) {
      document.title = `${proj.name} — Zwoosh`;
      return () => { document.title = "Zwoosh — Motion Studio in Your Browser"; };
    }
    return undefined;
  }, [status, proj]);

  /* ----- scale-to-fit: observe the stage area, resize → CSS transform ----- */
  useEffect(() => {
    if (status !== "ready") return undefined;
    const el = stageAreaRef.current;
    if (!el) return undefined;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setScale(Math.min(r.width / stageW, r.height / stageH));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, stageW, stageH]);

  /* ----- playback clock: rAF, 0 → duration, loop (or hold on last frame) ----- */
  useEffect(() => {
    if (status !== "ready") return undefined;
    playingRef.current = true;
    setPlaying(true);
    timeRef.current = 0;
    setTime(0);
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(now - last, 100); // clamp tab-switch jumps
      last = now;
      if (playingRef.current) {
        let nt = timeRef.current + dt;
        if (nt >= duration) {
          if (loopRef.current) {
            nt = nt % duration;
          } else {
            nt = duration;
            playingRef.current = false;
            setPlaying(false);
          }
        }
        timeRef.current = nt;
        setTime(nt);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, duration]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const next = !p;
      // restarting from a finished non-looping run
      if (next && !loopRef.current && timeRef.current >= duration) { timeRef.current = 0; setTime(0); }
      playingRef.current = next;
      return next;
    });
  }, [duration]);

  const toggleLoop = useCallback(() => {
    setLoop((l) => {
      const next = !l;
      loopRef.current = next;
      return next;
    });
  }, []);

  /* space bar toggles play, like the editor */
  useEffect(() => {
    if (status !== "ready") return undefined;
    const onKey = (e) => {
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, togglePlay]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.canvas, fontFamily: "'Inter', system-ui, sans-serif", color: T.text, overflow: "hidden", position: "relative" }}>
      {/* engine fonts so text/number layers render exactly as authored */}
      <style>{`
        @import url('${FONT_IMPORT}');
        @keyframes gdPlayerIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .gd-player-ctl { transition: background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out; }
        .gd-player-ctl:hover { background: ${T.hover}; }
        .gd-player-footer { transition: color 120ms ease-out; }
        .gd-player-footer:hover { color: ${T.accent}; }
      `}</style>

      {/* top-left brand */}
      <div style={{ position: "absolute", top: 14, left: 16, display: "flex", alignItems: "center", gap: 9, zIndex: 10, pointerEvents: "none" }}>
        <BrandMark />
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: "-0.01em" }}>Zwoosh</span>
      </div>

      {status === "loading" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, letterSpacing: "0.01em" }}>
          Loading animation…
        </div>
      )}

      {(status === "missing" || status === "error") && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{
            width: 400, maxWidth: "94vw", background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: "28px 26px", textAlign: "center",
            animation: "gdPlayerIn 160ms ease-out",
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><BrandMark /></div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
              {status === "missing" ? "This link is invalid or was disabled" : "Couldn't load this animation"}
            </div>
            <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.6, marginBottom: 20 }}>
              {status === "missing"
                ? "The owner may have disabled sharing, or the link was copied incorrectly. Check with whoever sent it to you."
                : "Something went wrong reaching the studio. Check your connection and try again."}
            </div>
            {status === "error" && (
              <button
                onClick={load}
                className="gd-player-ctl"
                style={{
                  background: T.accent, color: "#1A1405", border: "none", borderRadius: 6, padding: "9px 18px",
                  fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 12,
                }}
              >
                Try again
              </button>
            )}
            <div>
              <Link to="/" className="gd-player-footer" style={{ color: T.faint, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                Made with Zwoosh — create yours →
              </Link>
            </div>
          </div>
        </div>
      )}

      {status === "ready" && (
        <>
          {/* stage area — fills the viewport; chrome overlays it */}
          <div ref={stageAreaRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <div
              style={{
                position: "absolute", left: "50%", top: "50%",
                width: stageW, height: stageH,
                transform: `translate(-50%, -50%) scale(${scale})`,
                background: stageBg, borderRadius: 6, overflow: "hidden",
                boxShadow: "0 8px 50px rgba(0,0,0,.55)",
              }}
            >
              {objects.map((obj) => (
                <StageObject key={obj.id} obj={obj} time={time} stage={{ w: stageW, h: stageH }} />
              ))}
            </div>
          </div>

          {/* bottom control bar */}
          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10,
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(16,19,26,0.92)", border: `1px solid ${T.border}`, borderRadius: 10,
            padding: "7px 12px", backdropFilter: "blur(6px)",
          }}>
            <button
              onClick={togglePlay}
              title={playing ? "Pause (space)" : "Play (space)"}
              aria-label={playing ? "Pause" : "Play"}
              className="gd-player-ctl"
              style={{
                width: 30, height: 30, borderRadius: 6, border: `1px solid ${T.borderStrong}`,
                background: T.raised, color: T.text, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", padding: 0,
              }}
            >
              {playing ? (
                <svg width="11" height="11" viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" /><rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="currentColor" /></svg>
              )}
            </button>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontVariantNumeric: "tabular-nums",
              color: T.dim, whiteSpace: "nowrap", userSelect: "none",
            }}>
              <span style={{ color: T.text }}>{fmtTc(time)}</span> / {fmtTc(duration)}
            </span>
            <span style={{ width: 1, height: 16, background: T.borderStrong }} />
            <button
              onClick={toggleLoop}
              title={loop ? "Looping — click to play once" : "Plays once — click to loop"}
              className="gd-player-ctl"
              style={{
                display: "flex", alignItems: "center", gap: 6, borderRadius: 6,
                border: `1px solid ${loop ? "rgba(245,165,36,0.45)" : T.borderStrong}`,
                background: loop ? T.accentSoft : "transparent", color: loop ? T.accent : T.faint,
                cursor: "pointer", padding: "5px 10px", fontSize: 11, fontWeight: 700,
                letterSpacing: "0.04em", fontFamily: "inherit", whiteSpace: "nowrap",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.5 5.5A4.5 4.5 0 0 0 2.6 3.6L1.5 4.7M1.5 6.5a4.5 4.5 0 0 0 7.9 1.9l1.1-1.1" />
                <path d="M1.5 2.7v2h2M10.5 9.3v-2h-2" />
              </svg>
              Loop
            </button>
          </div>

          {/* footer link */}
          <Link
            to="/"
            className="gd-player-footer"
            style={{
              position: "absolute", bottom: 22, right: 18, zIndex: 10,
              color: T.faint, fontSize: 11.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Made with Zwoosh — create yours →
          </Link>
        </>
      )}
    </div>
  );
}
