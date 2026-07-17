import { Link } from "react-router-dom";

const FEATURES = [
  { icon: "◆", title: "Real keyframe editor", body: "Drag, resize, and rotate directly on the canvas — every gesture records a keyframe with nine easing curves, including Apple-style spring motion." },
  { icon: "◎", title: "Shape morphing", body: "Any shape morphs into any other. Circles become stars become hearts, mid-flight, with full easing control." },
  { icon: "▣", title: "Clips & scenes", body: "Group layers into clips with their own nested timeline, background, speed, and in/out transitions — build multi-scene sequences on one track." },
  { icon: "🌐", title: "Real geography", body: "177 real countries, continent maps, and a world map with timed reveals and an automatic documentary-style zoom camera." },
  { icon: "▤", title: "Live charts", body: "Bar, line, and donut charts that animate in from typed data — no manual keyframing required." },
  { icon: "✎", title: "Motion paths & type", body: "Draw a path, morph it into a circle, and send text or shapes flowing along it. Full font, color-keyframe, and box-styling control." },
];

export default function Landing() {
  return (
    <div style={styles.page}>
      <style>{FONT_IMPORT}</style>
      <header style={styles.nav}>
        <div style={styles.logo}>
          Graphic<span style={{ color: "#FFB224" }}>Destination</span>
        </div>
        <Link to="/login" style={styles.navBtn}>Sign in</Link>
      </header>

      <section style={styles.hero}>
        <div style={styles.heroBadge}>MOTION GRAPHICS · IN THE BROWSER</div>
        <h1 style={styles.h1}>
          A lightweight <span style={{ color: "#FFB224" }}>After Effects</span>,
          <br />built for the web.
        </h1>
        <p style={styles.sub}>
          Keyframes, shape morphing, real maps, live charts, and multi-scene clips —
          all in a single editor with no install and no render farm.
        </p>
        <Link to="/login" style={styles.cta}>Sign in to open the editor →</Link>
      </section>

      <section style={styles.grid}>
        {FEATURES.map((f) => (
          <div key={f.title} style={styles.card}>
            <div style={styles.cardIcon}>{f.icon}</div>
            <div style={styles.cardTitle}>{f.title}</div>
            <div style={styles.cardBody}>{f.body}</div>
          </div>
        ))}
      </section>

      <footer style={styles.footer}>Graphic Destination Motion — internal tool</footer>
    </div>
  );
}

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');`;

const styles = {
  page: { minHeight: "100vh", background: "#0F1116", color: "#E9EBF2", fontFamily: "'Inter', system-ui, sans-serif" },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 48px" },
  logo: { fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 18 },
  navBtn: { background: "#1C2029", border: "1px solid #2B3140", color: "#E9EBF2", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13.5, textDecoration: "none" },
  hero: { textAlign: "center", padding: "90px 24px 70px", maxWidth: 780, margin: "0 auto" },
  heroBadge: { display: "inline-block", color: "#FFB224", fontSize: 11.5, fontWeight: 700, letterSpacing: 1.5, border: "1px solid #FFB22455", borderRadius: 999, padding: "5px 14px", marginBottom: 26 },
  h1: { fontFamily: "'Space Grotesk'", fontSize: 52, fontWeight: 700, lineHeight: 1.12, margin: "0 0 22px" },
  sub: { fontSize: 17, color: "#98A0B4", lineHeight: 1.6, maxWidth: 560, margin: "0 auto 36px" },
  cta: { display: "inline-block", background: "#FFB224", color: "#1a1405", fontWeight: 700, fontSize: 15, borderRadius: 10, padding: "14px 30px", textDecoration: "none" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 1100, margin: "0 auto", padding: "0 48px 100px" },
  card: { background: "#151820", border: "1px solid #2B3140", borderRadius: 16, padding: "26px 24px" },
  cardIcon: { color: "#FFB224", fontSize: 22, marginBottom: 14 },
  cardTitle: { fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 16.5, marginBottom: 9 },
  cardBody: { color: "#8B93A7", fontSize: 13.5, lineHeight: 1.6 },
  footer: { textAlign: "center", color: "#5A6175", fontSize: 12.5, padding: "0 0 40px" },
};
