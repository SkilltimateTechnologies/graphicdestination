/* ============================================================
   ENGINE · text/number/confetti/chart/map FX + camera (pure, deterministic)
   Extracted VERBATIM from components/GraphicDestinationMotion.jsx
   (zero-behavior-change refactor — pure engine code only).
   ============================================================ */

import { EASE, clamp01 } from "./easing.js";
import { mulberry32 } from "./random.js";
import { WORLD_H, WORLD_EXT, normHi, worldZoomWindow } from "./maps.js";

export const SWATCHES = ["#FFB224", "#FF6B6B", "#5B8CFF", "#6EE7B7", "#C084FC", "#F9F9F9", "#0F1116"];

export const FONT_IMPORT = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Bebas+Neue&family=Montserrat:wght@400;600;700;800&family=Oswald:wght@400;600;700&family=Playfair+Display:wght@400;600;700;800&family=Archivo+Black&family=Pacifico&family=Caveat:wght@400;600;700&display=swap";

/* ============================================================
   TEXT FX — per-character, deterministic
   ============================================================ */
export const FX_STAG = 45, FX_CDUR = 480;
const SCRAM = "ABCDEFGHIJKLMNPQRSTUVWXYZ#@$%&*";
export function charFx(fx, i, n, time, ch) {
  const spd = fx.speed || 1;
  const STAG = FX_STAG / spd, CDUR = FX_CDUR / spd;
  const local = time - fx.start;
  const u = clamp01((local - i * STAG) / CDUR);
  switch (fx.type) {
    case "typewriter": return { o: local >= i * (STAG + 25 / spd) ? 1 : 0, dy: 0, s: 1, dx: 0, ch };
    case "rise": return { o: clamp01(u * 1.6), dy: (1 - EASE.easeOutCubic(u)) * 34, s: 1, dx: 0, ch };
    case "pop": return { o: clamp01(u * 2), dy: 0, s: EASE.easeOutBack(u), dx: 0, ch };
    case "fall": return { o: clamp01(u * 2.5), dy: (EASE.easeOutBounce(u) - 1) * 70, s: 1, dx: 0, ch };
    case "tracking": { const U = clamp01(local / (CDUR * 2)); return { o: clamp01(U * 1.4), dy: 0, s: 1, dx: (i - (n - 1) / 2) * (1 - EASE.easeOutCubic(U)) * 20, ch }; }
    case "scramble": {
      if (u >= 1 || ch === " ") return { o: 1, dy: 0, s: 1, dx: 0, ch };
      if (local < i * STAG) return { o: 0.15, dy: 0, s: 1, dx: 0, ch: SCRAM[Math.floor(mulberry32(fx.seed + i * 101)() * SCRAM.length)] };
      const cyc = Math.floor((local * spd) / 55);
      return { o: 0.9, dy: 0, s: 1, dx: 0, ch: SCRAM[Math.floor(mulberry32(fx.seed + i * 101 + cyc * 7919)() * SCRAM.length)] };
    }
    case "wave": return { o: 1, dy: Math.sin((time * spd) / 260 + i * 0.55) * 7, s: 1, dx: 0, ch };
    default: return { o: 1, dy: 0, s: 1, dx: 0, ch };
  }
}

/* ============================================================
   NUMBER ROLLERS (mechanical odometer cascade)
   ------------------------------------------------------------
   MODES (props.mode — optional; ABSENT = "countup", so projects
   saved before modes existed render byte-identical):
     "countup"   current behavior — value eases from → to
     "countdown" same setup played end → start (from=0,to=10 ⇒ 10 → 0)
     "odometer"  slot-machine digit roll settling left → right
                 (extends the existing "slot" column machinery)
   ============================================================ */
export function numMode(P) {
  return P && (P.mode === "countdown" || P.mode === "odometer") ? P.mode : "countup";
}
export function numberValue(P, time) {
  const u = clamp01((time - P.start) / P.dur);
  const e = (EASE[P.numEase] || EASE.easeOutCubic)(u);
  if (P.mode === "countdown") return P.to + (P.from - P.to) * e;
  return P.from + (P.to - P.from) * e;
}
export function numberColumns(P, time) {
  const dec = P.decimals;
  const target = Math.max(Math.abs(P.from), Math.abs(P.to));
  const intDigits = Math.max(1, String(Math.floor(target)).length);
  const totalDigits = intDigits + dec;
  const v = Math.max(0, numberValue(P, time));
  const W = v * Math.pow(10, dec);
  /* units wheel spins continuously; each higher wheel turns only
     while the wheel below sweeps 9→0 (carry cascades) */
  const digits = new Array(totalDigits);
  let prev = 0;
  for (let p = 0; p < totalDigits; p++) {
    const d = p === 0 ? ((W % 10) + 10) % 10 : (Math.floor(W / Math.pow(10, p)) % 10) + Math.max(0, prev - 9);
    digits[p] = Math.min(10, d);
    prev = d;
  }
  const cols = [];
  for (let j = 0; j < totalDigits; j++) {
    const p = totalDigits - 1 - j;
    if (dec > 0 && j === intDigits) cols.push({ ch: "." });
    if (P.style === "slot" || P.mode === "odometer") {
      /* slot-machine roll (also the "odometer" MODE): wheels spin fast then
         settle left → right on the final digits — deterministic, no RNG */
      const cu = clamp01((time - P.start - j * 130) / Math.max(300, P.dur * 0.75));
      const finalW = Math.max(0, P.mode === "countdown" ? P.from : P.to) * Math.pow(10, dec);
      const fd = Math.floor(finalW / Math.pow(10, p)) % 10;
      const spin = (1 - EASE.easeOutCubic(cu)) * (22 + j * 9);
      cols.push({ d: (fd + spin) % 10, dim: false });
    } else {
      cols.push({ d: digits[p], dim: v < Math.pow(10, p - dec) && p - dec > 0 });
    }
  }
  return cols;
}

/* ============================================================
   NUMBER FORMATS (pure) — props.format, optional, default "plain".
   "plain" is EXACTLY the legacy count rendering (toFixed(decimals)),
   so absent format ⇒ old projects render unchanged. Non-plain formats
   force the plain-text render path (they can't be column-rolled).
   ============================================================ */
export const NUM_FORMATS = [
  { id: "plain", name: "Plain" },
  { id: "compact", name: "Compact" },
  { id: "currency", name: "Currency" },
  { id: "percent", name: "Percent" },
  { id: "time", name: "Time" },
];
export function formatNumber(value, format = "plain", decimals = 0) {
  const v = Number.isFinite(value) ? value : 0;
  const dec = Math.max(0, decimals | 0);
  if (format === "compact") {
    /* 12.4K / 3.2M / 2.5B — one decimal, trailing ".0" trimmed */
    const a = Math.abs(v), sign = v < 0 ? "-" : "";
    const trim = (n) => { const s = n.toFixed(1); return s.endsWith(".0") ? s.slice(0, -2) : s; };
    if (a >= 1e9) return sign + trim(a / 1e9) + "B";
    if (a >= 1e6) return sign + trim(a / 1e6) + "M";
    if (a >= 1e3) return sign + trim(a / 1e3) + "K";
    return v.toFixed(dec);
  }
  if (format === "currency") {
    /* $1,234 — manual thousands grouping (deterministic, locale-free) */
    const parts = Math.abs(v).toFixed(dec).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "-$" : "$") + parts.join(".");
  }
  if (format === "percent") return v.toFixed(dec) + "%";
  if (format === "time") {
    /* mm:ss from seconds — pairs naturally with countdown mode */
    const s = Math.max(0, Math.round(v));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  return v.toFixed(dec); /* "plain" + unknown formats → legacy */
}

/* ============================================================
   COUNTDOWN VISUAL STYLES (props.cdStyle) — rich renders for
   countdown-MODE number layers. Pure style variants, deterministic,
   export-safe (components/StageObject.jsx is the single render point
   shared by preview + export). ABSENT/unknown cdStyle ⇒ "digits" ⇒
   the legacy render path, so old projects stay byte-identical.
   ============================================================ */
export const CD_STYLES = [
  { id: "digits", name: "Digits" },     /* current plain digits (legacy) */
  { id: "flip", name: "Flip cards" },   /* digit on a dark card, center split line */
  { id: "ring", name: "Progress ring" },/* remaining fraction as an arc around the number */
  { id: "bar", name: "Progress bar" },  /* number + remaining-fraction bar under it */
  { id: "boxed", name: "LED boxes" },   /* each digit in its own mono box, LED glow */
];
export const cdStyleOf = (P) => (P && P.mode === "countdown" && CD_STYLES.some((s) => s.id === P.cdStyle) ? P.cdStyle : "digits");

/* Remaining share of a countdown run: 1 at the start, 0 at the end.
   VALUE-based (via numberValue, so the arc/bar tracks the digits exactly
   under any numEase): distance from the run's END value over the full
   sweep. Countdown mode plays to→from, so this is (v − from)/(to − from)
   = 1 − eased u; for other modes it's the distance to the target. */
export function countdownFraction(P, time) {
  const a = P.from, b = P.to;
  if (!(Math.abs(b - a) > 0)) return 0;
  const v = numberValue(P, time);
  const endV = P.mode === "countdown" ? a : b;
  const startV = P.mode === "countdown" ? b : a;
  return clamp01((v - endV) / (startV - endV));
}

/* pill-preset contrast ink: dark text on light pill backgrounds
   (amber pill ⇒ dark digits), light text on dark pills. Pure WCAG
   relative-luminance on #rrggbb / #rgb — identical in editor + export. */
export function contrastOn(bg) {
  let h = String(bg || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length < 6) return "#F9F9F9";
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = lin(parseInt(h.slice(0, 2), 16) / 255), g = lin(parseInt(h.slice(2, 4), 16) / 255), b = lin(parseInt(h.slice(4, 6), 16) / 255);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.35 ? "#1A1405" : "#F9F9F9";
}

/* ============================================================
   CONFETTI (seeded) — 8 emission styles. Missing/unknown
   props.style falls back to "burst", the original upward
   fountain, so projects saved before styles existed render
   EXACTLY as before (same rng order, same particle fields).
   All math is pure/deterministic (mulberry32) — the renderer
   (components/StageObject.jsx) only plays the kinematics back.
   ============================================================ */
export const CONFETTI_LIFE = 2400;
/* per-style particle lifetime (ms) — the renderer's active window */
const CONFETTI_LIVES = { burst: CONFETTI_LIFE, rain: 3400, cannonL: 2600, cannonR: 2600, firework: 2800, spiral: 2600, snow: 6500, pop: 700 };
export const CONFETTI_STYLES = [
  { id: "burst", name: "Burst", glyph: "🎉" },
  { id: "rain", name: "Rain", glyph: "🌧" },
  { id: "cannonL", name: "Cannon L", glyph: "◣" },
  { id: "cannonR", name: "Cannon R", glyph: "◢" },
  { id: "firework", name: "Firework", glyph: "🎆" },
  { id: "spiral", name: "Spiral", glyph: "🌀" },
  { id: "snow", name: "Snow", glyph: "❄" },
  { id: "pop", name: "Pop", glyph: "💥" },
];
export const confettiStyleOf = (P) => (P && CONFETTI_LIVES[P.style] ? P.style : "burst");
export function confettiLife(style) { return CONFETTI_LIVES[style] || CONFETTI_LIFE; }
export function confettiParticles(obj) {
  const P = obj.props;
  const style = confettiStyleOf(P);
  const rng = mulberry32(P.seed);
  const power = P.power || 1;
  const out = [];
  if (style === "burst") {
    /* original upward fountain — unchanged field set + rng consumption order */
    for (let i = 0; i < P.count; i++) {
      const ang = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 1.1;
      const speed = (0.55 + rng() * 0.9) * power;
      out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 5 + rng() * 9, color: SWATCHES[Math.floor(rng() * 5)], spin: (rng() - 0.5) * 1400, round: rng() > 0.6, drift: (rng() - 0.5) * 60, wob: rng() * Math.PI * 2 });
    }
    return out;
  }
  if (style === "rain") {
    /* spawn across a wide band above the anchor, fall with a sine sway */
    for (let i = 0; i < P.count; i++) {
      out.push({
        ox: (rng() - 0.5) * 620, vy: (0.3 + rng() * 0.45) * power,
        size: 5 + rng() * 8, color: SWATCHES[Math.floor(rng() * 5)],
        spin: (rng() - 0.5) * 700, round: rng() > 0.55,
        swayA: 12 + rng() * 26, swayF: 2.2 + rng() * 2.6, wob: rng() * Math.PI * 2,
      });
    }
    return out;
  }
  if (style === "cannonL" || style === "cannonR") {
    /* corner cannon: strong upward velocity angled into the stage (dir flips the side) */
    const dir = style === "cannonL" ? 1 : -1;
    for (let i = 0; i < P.count; i++) {
      const vx = dir * (0.5 + rng() * 0.8) * power;
      const vy = -(0.95 + rng() * 0.8) * power;
      out.push({ vx, vy, size: 5 + rng() * 8, color: SWATCHES[Math.floor(rng() * 5)], spin: (rng() - 0.5) * 1200, round: rng() > 0.6, drift: (rng() - 0.5) * 46, wob: rng() * Math.PI * 2 });
    }
    return out;
  }
  if (style === "firework") {
    /* radial explosion from the anchor — twk drives the twinkle frequency */
    for (let i = 0; i < P.count; i++) {
      const ang = rng() * Math.PI * 2;
      const speed = (0.35 + rng() * 0.85) * power;
      out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 3.5 + rng() * 4.5, color: SWATCHES[Math.floor(rng() * 5)], spin: (rng() - 0.5) * 500, round: true, drift: (rng() - 0.5) * 26, wob: rng() * Math.PI * 2, twk: 6 + rng() * 9 });
    }
    return out;
  }
  if (style === "spiral") {
    /* particles wind outward: radius grows at vr px/s while the angle sweeps at om rad/s */
    for (let i = 0; i < P.count; i++) {
      out.push({
        th0: rng() * Math.PI * 2, om: (2.2 + rng() * 2.8) * (rng() > 0.85 ? -1 : 1),
        r0: 6 + rng() * 26, vr: (90 + rng() * 170) * power,
        size: 4 + rng() * 7, color: SWATCHES[Math.floor(rng() * 5)],
        spin: (rng() - 0.5) * 900, round: rng() > 0.5, wob: rng() * Math.PI * 2,
      });
    }
    return out;
  }
  if (style === "snow") {
    /* slow gentle fall — small round white flakes, extra-long life */
    for (let i = 0; i < P.count; i++) {
      const shade = rng();
      out.push({
        ox: (rng() - 0.5) * 720, vy: (0.075 + rng() * 0.1) * power,
        size: 3 + rng() * 4, color: shade > 0.82 ? SWATCHES[3] : shade > 0.7 ? SWATCHES[2] : "#F9F9F9",
        spin: 0, round: true,
        swayA: 16 + rng() * 30, swayF: 0.9 + rng() * 1.2, wob: rng() * Math.PI * 2,
      });
    }
    return out;
  }
  /* pop — fast short ring: even angular spread + slight jitter, renderer eases out + fades fast */
  for (let i = 0; i < P.count; i++) {
    const ang = (i / Math.max(1, P.count)) * Math.PI * 2 + (rng() - 0.5) * 0.24;
    const speed = (0.9 + rng() * 0.5) * power;
    out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 4 + rng() * 5, color: SWATCHES[Math.floor(rng() * 5)], spin: (rng() - 0.5) * 900, round: rng() > 0.5 });
  }
  return out;
}

export function parseChart(str) {
  return (str || "").split(/\n+/).map((l) => {
    const m = l.split(/[,:]/);
    if (m.length < 2) return null;
    const v = parseFloat(m[m.length - 1]);
    if (isNaN(v)) return null;
    return { l: m.slice(0, -1).join(":").trim(), v: Math.max(0, v) };
  }).filter(Boolean).slice(0, 10);
}

/* deterministic per-country flicker for the "Electric" reveal style — same
   sequence every playback, shared by both world and continent maps */
export function highlightFlick(u, seed) {
  if (u <= 0) return 0;
  if (u >= 0.8) return 1;
  const fi = Math.floor(u * 16) + seed;
  return ((Math.imul(fi ^ 0x9e37, 2654435761) >>> 0) / 4294967296) > 0.45 ? 1 : 0;
}

/* Automatic documentary-style camera for the world map.
   Each zoom-enabled country contributes a smooth 0->1 weight envelope over
   its own active window (appear -> hide, or a default hold if no hide is
   set). The camera targets a weighted blend of active countries, so
   overlapping or back-to-back countries produce a natural pan/push instead
   of a hard cut back to the overview between them. */
export function worldCameraAt(P, time, fallbackCenter) {
  const his = normHi(P.hi).filter((h) => h.zoom !== false && WORLD_EXT[h.cc]);
  const trans = Math.max(80, P.zoomTransMs || 550);
  let wsum = 0, cx = 0, cy = 0, wmax = 0;
  his.forEach((h) => {
    const { zin, zout } = worldZoomWindow(h, P);
    let w = 0;
    if (time < zin - trans || time > zout + trans) w = 0;
    else if (time < zin) w = EASE.easeInOutSine(clamp01((time - (zin - trans)) / trans));
    else if (time <= zout) w = 1;
    else w = 1 - EASE.easeInOutSine(clamp01((time - zout) / trans));
    if (w <= 0.002) return;
    const e = WORLD_EXT[h.cc];
    const ex = (e[0] + e[2]) / 2, ey = (e[1] + e[3]) / 2;
    wsum += w; cx += ex * w; cy += ey * w; wmax = Math.max(wmax, w);
  });
  const fb = fallbackCenter || { cx: 100, cy: WORLD_H / 2 };
  if (wsum < 0.002) return { focus: 0, cx: fb.cx, cy: fb.cy };
  return { focus: clamp01(wmax), cx: cx / wsum, cy: cy / wsum };
}
