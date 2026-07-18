import { Link } from "react-router-dom";

/* ============================================================
   LANDING — Zwoosh (design/design.md v1.0)
   Dark, cinematic, Linear-grade. Pure-CSS animated editor mock.
   ============================================================ */

const T = {
  canvas: "#0A0C10", panel: "#10131A", raised: "#171B24", hover: "#1E2330",
  border: "#232936", borderStrong: "#2E3546",
  text: "#E9ECF3", dim: "#939BAD", faint: "#5D667A",
  accent: "#F5A524", accentDim: "#B87A18", accentSoft: "rgba(245,165,36,0.12)",
  success: "#3FB68B", info: "#5B8DEF",
};

const CSS = `
  html { scroll-behavior: smooth; }
  .lp-navlink { color: ${T.dim}; text-decoration: none; font-size: 13.5px; font-weight: 500; transition: color 120ms ease-out; }
  .lp-navlink:hover { color: ${T.text}; }
  .lp-cta { background: ${T.accent}; color: #1A1405; text-decoration: none; font-weight: 700; transition: background 120ms ease-out; }
  .lp-cta:hover { background: ${T.accentDim}; }
  .lp-ghost { border: 1px solid ${T.borderStrong}; color: ${T.text}; text-decoration: none; font-weight: 600; transition: background 120ms ease-out, border-color 120ms ease-out; }
  .lp-ghost:hover { background: ${T.hover}; }
  .lp-card { transition: border-color 120ms ease-out, transform 120ms ease-out; }
  .lp-card:hover { border-color: ${T.borderStrong}; transform: translateY(-2px); }

  /* ---- editor mock: transform/opacity only, 60fps ---- */
  @keyframes lpPlayhead { from { transform: translateX(0); } to { transform: translateX(440px); } }
  @keyframes lpDotPath {
    0% { transform: translate(0px, 60px); opacity: 0; }
    8% { opacity: 1; }
    50% { transform: translate(180px, -46px); }
    92% { opacity: 1; }
    100% { transform: translate(360px, 60px); opacity: 0; }
  }
  @keyframes lpPulse {
    0%, 100% { transform: scale(0.82); opacity: 0.85; }
    50% { transform: scale(1.08); opacity: 1; }
  }
  @keyframes lpSpin { from { transform: rotate(45deg); } to { transform: rotate(405deg); } }
  @keyframes lpRise {
    0% { transform: translateY(26px); opacity: 0; }
    14% { transform: translateY(0); opacity: 1; }
    82% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(-14px); opacity: 0; }
  }
  @keyframes lpCrossA { 0%, 44% { opacity: 1; transform: scale(1); } 50%, 94% { opacity: 0; transform: scale(0.6); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes lpCrossB { 0%, 44% { opacity: 0; transform: scale(0.6); } 50%, 94% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.6); } }
  @keyframes lpBarGlow { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  @keyframes lpKf { 0%, 100% { transform: translate(-50%, -50%) rotate(45deg) scale(1); } 50% { transform: translate(-50%, -50%) rotate(45deg) scale(1.35); } }
  .lp-playhead { animation: lpPlayhead 6s linear infinite; }
  .lp-dot { animation: lpDotPath 6s cubic-bezier(.45,.05,.35,1) infinite; }
  .lp-pulse { animation: lpPulse 3s ease-in-out infinite; }
  .lp-spin { animation: lpSpin 12s linear infinite; }
  .lp-rise { animation: lpRise 6s ease-out infinite; }
  .lp-crossA { animation: lpCrossA 4s ease-in-out infinite; }
  .lp-crossB { animation: lpCrossB 4s ease-in-out infinite; }
  .lp-barglow { animation: lpBarGlow 2.4s ease-in-out infinite; }
  .lp-kf { animation: lpKf 2s ease-in-out infinite; }
`;

/* ---- 1.5px-stroke feature icons ---- */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
const IconKeyframe = (
  <svg width="22" height="22" viewBox="0 0 22 22" {...stroke}><path d="M3 17.5c4.5-9 9.5-13 16-13" /><rect x="8.2" y="8.2" width="5.6" height="5.6" rx="1" transform="rotate(45 11 11)" /><circle cx="4" cy="16.5" r="1.4" /><circle cx="18" cy="4.5" r="1.4" /></svg>
);
const IconMorph = (
  <svg width="22" height="22" viewBox="0 0 22 22" {...stroke}><circle cx="6.5" cy="11" r="3.6" /><rect x="12.9" y="7.4" width="7.2" height="7.2" rx="1.2" /><path d="M10.6 11h1.2" /></svg>
);
const IconText = (
  <svg width="22" height="22" viewBox="0 0 22 22" {...stroke}><path d="M5.5 6.5V5h11v1.5M11 5v12M8.5 17h5" /><path d="M17.8 13.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" /></svg>
);
const IconCloud = (
  <svg width="22" height="22" viewBox="0 0 22 22" {...stroke}><path d="M6.5 16.5h9.7a3.3 3.3 0 0 0 .6-6.5 4.6 4.6 0 0 0-9-1.3 3.9 3.9 0 0 0-1.3 7.8z" /><path d="M9 12.6l2 2 3.2-3.4" /></svg>
);
const IconExport = (
  <svg width="22" height="22" viewBox="0 0 22 22" {...stroke}><path d="M11 3.5v10M7.8 10.4L11 13.6l3.2-3.2" /><path d="M4.5 14.5v2.6a1.4 1.4 0 0 0 1.4 1.4h10.2a1.4 1.4 0 0 0 1.4-1.4v-2.6" /></svg>
);
const IconPreview = (
  <svg width="22" height="22" viewBox="0 0 22 22" {...stroke}><rect x="3" y="4.5" width="16" height="13" rx="2" /><path d="M9.5 8.6v4.8c0 .5.5.8.9.5l3.8-2.4c.4-.2.4-.8 0-1l-3.8-2.4c-.4-.3-.9 0-.9.5z" /></svg>
);

const FEATURES = [
  { icon: IconKeyframe, title: "Keyframe animation", body: "Every property is animatable. Drag directly on the stage and Autokey records position, scale, rotation and opacity — with nine easing curves, from snappy cubic to Apple-soft sine." },
  { icon: IconMorph, title: "Shape morphing", body: "Circles become stars become hearts, mid-flight. Every shape is sampled to the same 64 points, so any-to-any morphs are true point interpolation — never a crossfade hack." },
  { icon: IconText, title: "Text effects", body: "Typewriter, rise, scramble, wave — per-character text FX driven by seeded randomness. The preview you scrub is frame-identical to the file you export." },
  { icon: IconCloud, title: "Cloud projects", body: "Compositions save to your account and open on any machine. Structured JSON under the hood — easy to version, diff and hand to a teammate." },
  { icon: IconExport, title: "One-click export", body: "WebM renders instantly in your browser from the same engine that drives the preview. MP4 server render is in beta. No queue, no render farm, no waiting." },
  { icon: IconPreview, title: "Real-time preview", body: "A 60 fps stage over a real timeline: trim bars, retime keyframes, right-click any segment to change its easing. What you scrub is exactly what you ship." },
];

const STEPS = [
  { n: "01", title: "Compose on the stage", body: "Drop shapes, text, maps and live charts onto the canvas. Autokey records every drag as a keyframe, so motion happens as fast as you can move your mouse." },
  { n: "02", title: "Refine on the timeline", body: "Trim layers, nudge keyframes, set easing per segment. Group layers into clips with their own nested timelines to build multi-scene sequences." },
  { n: "03", title: "Export and ship", body: "Hit Export. WebM renders in-browser at full resolution and downloads automatically — ready for your edit, your CMS, or the social cut." },
];

function Logo() {
  return (
    <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="#1A1405" /></svg>
      </span>
      <span style={{ color: T.text, fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>Zwoosh</span>
      <span style={{ color: T.accent, background: T.accentSoft, border: `1px solid rgba(245,165,36,0.28)`, borderRadius: 5, padding: "2px 7px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>beta</span>
    </Link>
  );
}

/* ---- CSS-composed animated editor mock ---- */
function EditorMock() {
  const bars = [
    { left: "6%", width: "52%", color: "#303F66", delay: "0s" },
    { left: "30%", width: "40%", color: "#3F2E66", delay: "0.5s" },
    { left: "58%", width: "36%", color: "#4A3B0C", delay: "1s" },
  ];
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, background: T.panel, boxShadow: "0 30px 90px rgba(0,0,0,0.55)", overflow: "hidden", textAlign: "left" }}>
      {/* window bar */}
      <div style={{ height: 38, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderBottom: `1px solid ${T.border}`, background: T.panel }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: T.accent }} />
        <span style={{ color: T.dim, fontSize: 11.5, fontWeight: 600 }}>launch-teaser · 1280×720</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: T.faint, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>0:03.2 / 0:06.0</span>
        <span style={{ background: T.accent, color: "#1A1405", borderRadius: 6, padding: "3px 10px", fontSize: 10.5, fontWeight: 700 }}>Export</span>
      </div>
      <div style={{ display: "flex", minHeight: 320 }}>
        {/* rail */}
        <div style={{ width: 44, borderRight: `1px solid ${T.border}`, background: T.panel, display: "flex", flexDirection: "column", alignItems: "center", gap: 9, paddingTop: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 6, background: i === 1 ? T.hover : T.raised, border: `1px solid ${i === 1 ? T.accent : T.border}`, opacity: i > 2 ? 0.55 : 1 }} />)}
        </div>
        {/* stage */}
        <div style={{ flex: 1, position: "relative", background: T.canvas, overflow: "hidden", backgroundImage: "radial-gradient(rgba(233,236,243,0.05) 1px, transparent 1px)", backgroundSize: "28px 28px" }}>
          {/* safe margins */}
          <div style={{ position: "absolute", inset: "10%", border: "1px dashed rgba(245,165,36,0.22)", borderRadius: 2 }} />
          {/* travelling dot on a motion path */}
          <div className="lp-dot" style={{ position: "absolute", left: "14%", top: "38%", width: 14, height: 14, borderRadius: "50%", background: T.accent, boxShadow: "0 0 18px rgba(245,165,36,0.55)" }} />
          {/* pulsing ellipse */}
          <div className="lp-pulse" style={{ position: "absolute", right: "16%", top: "22%", width: 64, height: 64, borderRadius: "50%", background: "rgba(91,141,239,0.16)", border: `1.5px solid ${T.info}` }} />
          {/* rotating diamond */}
          <div className="lp-spin" style={{ position: "absolute", left: "12%", bottom: "18%", width: 34, height: 34, borderRadius: 7, background: T.raised, border: `1.5px solid ${T.borderStrong}` }} />
          {/* crossfading morph pair */}
          <div style={{ position: "absolute", right: "20%", bottom: "16%", width: 44, height: 44 }}>
            <div className="lp-crossA" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: T.accentSoft, border: `1.5px solid ${T.accent}` }} />
            <div className="lp-crossB" style={{ position: "absolute", inset: 0, borderRadius: 8, background: T.accentSoft, border: `1.5px solid ${T.accent}` }} />
          </div>
          {/* rising headline */}
          <div className="lp-rise" style={{ position: "absolute", left: 0, right: 0, top: "44%", textAlign: "center" }}>
            <div style={{ color: T.text, fontWeight: 800, fontSize: 30, letterSpacing: "-0.02em" }}>MOTION, MADE IN THE BROWSER</div>
            <div style={{ color: T.faint, fontSize: 12, marginTop: 7, letterSpacing: "0.14em", fontWeight: 600 }}>KEYFRAMES · MORPHS · TEXT FX · EXPORT</div>
          </div>
        </div>
        {/* inspector */}
        <div style={{ width: 132, borderLeft: `1px solid ${T.border}`, background: T.panel, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
          {["Position X", "Scale", "Opacity"].map((l, i) => (
            <div key={l}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint }}>{l}</span>
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: T.dim, fontVariantNumeric: "tabular-nums" }}>{["640.0", "1.20", "0.86"][i]}</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: T.border, position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${[58, 76, 40][i]}%`, background: T.accent, borderRadius: 2 }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 2, height: 52, borderRadius: 6, border: `1px solid ${T.border}`, background: T.raised, position: "relative", overflow: "hidden" }}>
            <svg width="100%" height="100%" viewBox="0 0 110 52" preserveAspectRatio="none"><polyline points="8,44 34,40 52,20 70,10 102,8" fill="none" stroke={T.accent} strokeWidth="1.5" /></svg>
          </div>
        </div>
      </div>
      {/* timeline */}
      <div style={{ borderTop: `1px solid ${T.border}`, background: T.panel, padding: "10px 14px 12px", position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((s) => <span key={s} style={{ fontSize: 8.5, color: T.faint, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{s}.0s</span>)}
        </div>
        <div style={{ position: "relative" }}>
          {bars.map((b, i) => (
            <div key={i} className="lp-barglow" style={{ position: "relative", height: 14, borderRadius: 4, marginBottom: 5, marginLeft: b.left, width: b.width, background: b.color, border: "1px solid rgba(255,255,255,0.14)", animationDelay: b.delay }} />
          ))}
          {/* keyframes */}
          {[18, 46, 74].map((x, i) => (
            <span key={i} className="lp-kf" style={{ position: "absolute", left: `${x}%`, top: "50%", width: 7, height: 7, background: T.accent, borderRadius: 1.5, animationDelay: `${i * 0.4}s` }} />
          ))}
          {/* playhead */}
          <div className="lp-playhead" style={{ position: "absolute", top: -18, bottom: -4, left: "6%", width: 1.5, background: T.accent, boxShadow: "0 0 10px rgba(245,165,36,0.5)" }}>
            <div style={{ position: "absolute", top: -1, left: -4.5, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `6px solid ${T.accent}` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", background: T.canvas, color: T.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{CSS}</style>

      {/* ============ NAV — permanently fixed, always in its scrolled treatment
          (opaque blur bg + border) so it never hides/changes on scroll ============ */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(10,12,16,0.9)",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", gap: 28 }}>
          <Logo />
          <nav style={{ display: "flex", gap: 24, marginLeft: 12 }}>
            <a href="#features" className="lp-navlink">Features</a>
            <a href="#workflow" className="lp-navlink">Workflow</a>
            <a href="#pricing" className="lp-navlink">Pricing</a>
          </nav>
          <div style={{ flex: 1 }} />
          <Link to="/login" className="lp-navlink" style={{ fontWeight: 600 }}>Sign in</Link>
          <Link to="/dashboard" className="lp-cta" style={{ borderRadius: 6, padding: "8px 16px", fontSize: 13 }}>Start creating</Link>
        </div>
      </header>

      {/* ============ HERO (top padding clears the permanently-fixed 60px nav) ============ */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "140px 24px 0", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.accent, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid rgba(245,165,36,0.28)", background: T.accentSoft, borderRadius: 999, padding: "6px 15px", marginBottom: 30 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, boxShadow: "0 0 8px rgba(245,165,36,0.8)" }} />
          Browser-native motion studio
        </div>
        <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.06, letterSpacing: "-0.02em", margin: "0 auto 22px", maxWidth: 780 }}>
          After Effects-grade motion graphics. <span style={{ color: T.accent }}>In your browser.</span>
        </h1>
        <p style={{ fontSize: 17, color: T.dim, lineHeight: 1.65, maxWidth: 600, margin: "0 auto 38px" }}>
          Keyframes, shape morphing, text effects and instant export — a full motion
          studio that runs in a tab. No install, no plugins, no render farm.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 84 }}>
          <Link to="/dashboard" className="lp-cta" style={{ borderRadius: 6, padding: "13px 28px", fontSize: 15 }}>Start creating free</Link>
          <a href="#workflow" className="lp-ghost" style={{ borderRadius: 6, padding: "12px 24px", fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 12 12"><path d="M3 2.2v7.6c0 .7.8 1.1 1.4.7l6-3.8c.5-.3.5-1 0-1.4l-6-3.8c-.6-.3-1.4.1-1.4.7z" fill="currentColor" /></svg>
            Watch it work
          </a>
        </div>
        <EditorMock />
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" style={{ maxWidth: 1120, margin: "0 auto", padding: "120px 24px 0", scrollMarginTop: 72 }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ color: T.faint, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Features</div>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 16px" }}>A real editor, not a template toy</h2>
          <p style={{ color: T.dim, fontSize: 15, lineHeight: 1.65, maxWidth: 560, margin: "0 auto" }}>
            Everything is computed from keyframes and easing — the same math drives
            your live preview and your final export.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-card" style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: "24px 22px" }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: T.accentSoft, border: "1px solid rgba(245,165,36,0.22)", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em", marginBottom: 8 }}>{f.title}</div>
              <div style={{ color: T.dim, fontSize: 13.5, lineHeight: 1.65 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ WORKFLOW ============ */}
      <section id="workflow" style={{ maxWidth: 1120, margin: "0 auto", padding: "120px 24px 0", scrollMarginTop: 72 }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ color: T.faint, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Workflow</div>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>How it works</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ position: "relative", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "26px 24px" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", color: T.accent, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em", marginBottom: 10 }}>{s.title}</div>
              <div style={{ color: T.dim, fontSize: 13.5, lineHeight: 1.65 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" style={{ maxWidth: 1120, margin: "0 auto", padding: "120px 24px 0", scrollMarginTop: 72 }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ color: T.faint, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Pricing</div>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 16px" }}>Start free. Upgrade when you ship.</h2>
          <p style={{ color: T.dim, fontSize: 15, maxWidth: 520, margin: "0 auto", lineHeight: 1.65 }}>The full editor is free while we&apos;re in beta — Pro adds team scale and render capacity.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 760, margin: "0 auto" }}>
          {/* Free */}
          <div className="lp-card" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "28px 26px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.dim, marginBottom: 10 }}>Free</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 18 }}>
              <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>$0</span>
              <span style={{ color: T.faint, fontSize: 13 }}>/ forever</span>
            </div>
            <ul style={{ listStyle: "none", margin: "0 0 24px", padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
              {["Full editor — keyframes, morphs, text FX", "3 cloud projects", "720p WebM export, in-browser", "Community support"].map((li) => (
                <li key={li} style={{ display: "flex", gap: 9, color: T.dim, fontSize: 13.5, lineHeight: 1.5 }}>
                  <svg width="15" height="15" viewBox="0 0 15 15" style={{ flexShrink: 0, marginTop: 2 }}><path d="M3 8l3 3 6-6.5" fill="none" stroke={T.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>{li}
                </li>
              ))}
            </ul>
            <Link to="/dashboard" className="lp-ghost" style={{ display: "block", textAlign: "center", borderRadius: 6, padding: "10px 0", fontSize: 13.5 }}>Start creating free</Link>
          </div>
          {/* Pro */}
          <div className="lp-card" style={{ background: T.raised, border: "1px solid rgba(245,165,36,0.4)", borderRadius: 8, padding: "28px 26px", position: "relative" }}>
            <div style={{ position: "absolute", top: -10, right: 20, background: T.accent, color: "#1A1405", borderRadius: 999, padding: "3px 11px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>Most popular</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 10 }}>Pro</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 18 }}>
              <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>$12</span>
              <span style={{ color: T.faint, fontSize: 13 }}>/ seat / month</span>
            </div>
            <ul style={{ listStyle: "none", margin: "0 0 24px", padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
              {["Unlimited projects and versions", "1080p WebM + MP4 render queue", "Brand kits and shared team libraries", "Priority support"].map((li) => (
                <li key={li} style={{ display: "flex", gap: 9, color: T.dim, fontSize: 13.5, lineHeight: 1.5 }}>
                  <svg width="15" height="15" viewBox="0 0 15 15" style={{ flexShrink: 0, marginTop: 2 }}><path d="M3 8l3 3 6-6.5" fill="none" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>{li}
                </li>
              ))}
            </ul>
            <Link to="/dashboard" className="lp-cta" style={{ display: "block", textAlign: "center", borderRadius: 6, padding: "11px 0", fontSize: 13.5 }}>Go Pro</Link>
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "120px 24px 0", textAlign: "center" }}>
        <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 16px" }}>Your next animation is a tab away.</h2>
        <p style={{ color: T.dim, fontSize: 15, margin: "0 0 32px" }}>Open the studio, drag a shape, and watch Autokey do the rest.</p>
        <Link to="/dashboard" className="lp-cta" style={{ borderRadius: 6, padding: "13px 30px", fontSize: 15 }}>Start creating free</Link>
      </section>

      {/* ============ FOOTER ============ */}
      <footer style={{ maxWidth: 1120, margin: "110px auto 0", padding: "26px 24px 40px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 20 }}>
        <Logo />
        <span style={{ flex: 1 }} />
        <a href="#features" className="lp-navlink" style={{ fontSize: 12.5 }}>Features</a>
        <a href="#workflow" className="lp-navlink" style={{ fontSize: 12.5 }}>Workflow</a>
        <a href="#pricing" className="lp-navlink" style={{ fontSize: 12.5 }}>Pricing</a>
        <span style={{ color: T.faint, fontSize: 12.5 }}>© 2026 Zwoosh</span>
      </footer>
    </div>
  );
}
