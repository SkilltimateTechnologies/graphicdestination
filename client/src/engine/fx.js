/* ============================================================
   ENGINE · text/number/confetti/chart/map FX + camera (pure, deterministic)
   Extracted VERBATIM from components/GraphicDestinationMotion.jsx
   (zero-behavior-change refactor — pure engine code only).
   ============================================================ */

import { EASE, clamp01 } from "./easing.js";
import { mulberry32 } from "./random.js";
import { WORLD_H, WORLD_EXT, normHi, worldZoomWindow, arcPath } from "./maps.js";

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
   COUNTER STYLES (props.style) — 6 Jitter-grade counter renders for
   number layers, frame-by-frame matches of the Jitter.video counters:
     "bold"         countdown-bold: every digit change is a poster scene —
                    huge digit springs in (easeOutBack overshoot ≈
                    cubic-bezier(.34,1.56,.64,1)), holds, accelerates out;
                    2 wave-echo ghosts of the previous digit scale up +
                    fade behind on each change.
     "blur"         digit changes ride a blur ramp — outgoing blurs
                    0 → 24px while fading, incoming blurs 24 → 0.
     "dotted"       digits slide-swap vertically (out up, in from below,
                    accent-tinted), wrapped by a dotted circle whose conic
                    pie sweep fills per unit time.
     "poster"       Swiss counter: linear count, huge tabular numerals,
                    thin rule draw-on, small-caps caption + index marker;
                    easeOutBack only on the scene entrance.
     "pixel"        3×5 rect-composed pixel digits + seeded glitch slices
                    (2-3 horizontal slice offsets, color-split ghosts) on
                    digit change.
     "progressring" expo-out count (0 → 99 default) with a synced arc
                    sweeping 0 → 354°, glow dot trailing the tip, snap/reset
                    accent at the loop point (state at t ≥ end ≡ t ≤ start).
   Pure functions of (props, timeline time) — no wall clock, no RNG beyond
   seeded mulberry32 — so editor preview, SSR checks and the export frame
   renderer produce identical frames. New style ids only: odometer/count/
   slot and every countdown variant fall through to their legacy paths
   byte-identical (counterStyleOf → null).
   ============================================================ */
export const COUNTER_STYLES = [
  { id: "bold", name: "Bold scenes" },
  { id: "blur", name: "Blur swap" },
  { id: "dotted", name: "Dotted ring" },
  { id: "poster", name: "Swiss poster" },
  { id: "pixel", name: "Pixel glitch" },
  { id: "progressring", name: "Progress 0→99" },
];
export const counterStyleOf = (P) => (P && COUNTER_STYLES.some((s) => s.id === P.style) ? P.style : null);

/* 3×5 pixel bitmap font (rows of "1"/"0") — digits + the punctuation the
   number formats emit. Rect-composed in the renderer (crispEdges). */
export const PIXEL_FONT = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ".": ["000", "000", "000", "000", "010"],
  ",": ["000", "000", "000", "010", "100"],
  ":": ["000", "010", "000", "010", "000"],
  "-": ["000", "000", "111", "000", "000"],
  "+": ["000", "010", "111", "010", "000"],
  "%": ["101", "001", "010", "100", "101"],
  "/": ["001", "001", "010", "100", "100"],
  " ": ["000", "000", "000", "000", "000"],
};

/* model rounding — 3dp, −0 → 0 (equal states serialize byte-identical) */
const csR = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? 0 : r; };
/* expo-out (0→99 progress-ring count): fast rise, long asymptotic settle */
const easeOutExpo = (x) => { const u = clamp01(x); return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u); };

/* the full display string at a time (affixes included — constant, so they
   never trigger change detection themselves) */
export function counterText(P, time) {
  return (P.prefix || "") + formatNumber(Math.max(0, numberValue(P, time)), P.format || "plain", P.decimals) + (P.suffix || "");
}

/* counterEpoch — the current "value epoch": t0 = the most recent time ≤ time
   when the display string changed (null before the first change), t1 = the
   next time it will change (null when never), plus the current/previous
   strings. Pure sampling scan (adaptive step + 12× bisection, sub-ms
   resolution) of the same numberValue/formatNumber the plain path renders —
   deterministic, no wall clock. */
export function counterEpoch(P, time) {
  const start = Number(P.start) || 0;
  const dur = Math.max(1, Number(P.dur) || 1);
  const end = start + dur;
  const t = Number(time) || 0;
  const txt = counterText(P, t);
  const step = Math.max(2, Math.min(16, dur / 400));
  let t0 = null, prevTxt = null;
  for (let s = t - step, lo = Math.max(start - 1, t - 9000); s >= lo; s -= step) {
    if (counterText(P, s) !== txt) {
      let a = s, b = s + step; /* a differs, b === txt → boundary in (a, b] */
      for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (counterText(P, m) === txt) b = m; else a = m; }
      t0 = b; prevTxt = counterText(P, a);
      break;
    }
  }
  let t1 = null;
  for (let s = t + step, hi = Math.min(end + 1, t + 9000); s <= hi; s += step) {
    if (counterText(P, s) !== txt) {
      let a = t, b = s; /* a === txt, b differs → boundary in (a, b] */
      for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (counterText(P, m) === txt) a = m; else b = m; }
      t1 = b;
      break;
    }
  }
  /* the visual scene starts at the last real change, or at the run's start
     for the initial value (digits spring/blur/slide in at start) */
  return { t0, t1, txt, prevTxt, epochStart: t0 == null ? start : t0 };
}

/* counterModel(P, time) → plain-data frame description for the 6 counter
   styles (null for legacy styles). StageObject.jsx maps it 1:1 to DOM/SVG —
   the single shared render point, exactly like chartModel for charts. All
   numbers pre-rounded (3dp); `txt`/`prevTxt` carry the SAME strings the
   plain path would show. */
export function counterModel(P, time) {
  const style = counterStyleOf(P);
  if (!style) return null;
  const t = Number(time) || 0;
  const start = Number(P.start) || 0;
  const dur = Math.max(1, Number(P.dur) || 1);

  if (style === "progressring") {
    /* 0 → 99 expo-out count, synced 0 → 354° arc, glow dot on the tip.
       Snap/reset at the loop point: t ≥ start+dur ≡ t ≤ start (p 0, arc 0),
       so a comp whose length matches the run loops cleanly. The flash ring
       accents the snap over the last 180 ms before the reset. */
    const u = clamp01((t - start) / dur);
    const p = t >= start + dur ? 0 : easeOutExpo(u);
    const v = (Number(P.from) || 0) + ((Number(P.to) || 0) - (Number(P.from) || 0)) * p;
    return {
      style,
      txt: formatNumber(Math.max(0, v), P.format || "plain", P.decimals),
      p: csR(p), arc: csR(354 * p), dotA: csR(-90 + 354 * p),
      flash: csR(t < start + dur ? clamp01((t - (start + dur - 180)) / 180) : 0),
      op: csR(clamp01((t - start) / 140)),
    };
  }

  const ep = counterEpoch(P, t);
  const sceneT = t - ep.epochStart;

  if (style === "bold") {
    /* each digit change = one poster scene: spring in (190 ms, overshoot),
       hold, accelerate out over the 150 ms before the next change; two
       wave-echo ghosts of the previous digit scale up + fade behind. */
    const IN = 190, OUT = 150;
    const ein = clamp01(sceneT / IN);
    let s = 0.3 + 0.7 * EASE.easeOutBack(ein);
    let op = clamp01(ein * 2);
    const eout = ep.t1 == null ? 0 : clamp01((OUT - (ep.t1 - t)) / OUT);
    s *= 1 + 0.14 * EASE.easeInCubic(eout);
    op *= 1 - EASE.easeInCubic(eout);
    const echoes = [];
    if (ep.prevTxt != null && sceneT < 900) {
      const e1 = clamp01(sceneT / 620), e2 = clamp01(sceneT / 880);
      echoes.push({ txt: ep.prevTxt, scale: csR(1 + 0.42 * EASE.easeOutCubic(e1)), op: csR((1 - e1) * 0.34), accent: false });
      echoes.push({ txt: ep.prevTxt, scale: csR(1 + 0.85 * EASE.easeOutCubic(e2)), op: csR((1 - e2) * 0.2), accent: true });
    }
    return { style, txt: ep.txt, scale: csR(s), op: csR(clamp01(op)), echoes: echoes.filter((e) => e.op > 0.02) };
  }

  if (style === "blur") {
    /* change crossfade (260 ms): outgoing blurs 0 → 24px while fading,
       incoming blurs 24 → 0; the initial scene blurs in at start. */
    const TR = 260;
    const iu = clamp01(sceneT / TR);
    return {
      style,
      txt: ep.txt,
      in: { txt: ep.txt, blur: csR(24 * (1 - iu)), op: csR(iu) },
      out: ep.t0 != null && sceneT < TR ? { txt: ep.prevTxt, blur: csR(24 * iu), op: csR(1 - iu) } : null,
    };
  }

  if (style === "dotted") {
    /* per-char vertical slide-swap (240 ms): changed chars slide the old
       glyph up (accelerating) while the new one rises from below in the
       accent color (settling to the fill); unchanged chars stay put. The
       dotted ring's conic pie sweep fills linearly per unit time. */
    const u = clamp01((t - start) / dur);
    const su = clamp01(sceneT / 240);
    const n = ep.txt.length, m = ep.prevTxt ? ep.prevTxt.length : 0, shift = m - n;
    const chars = [];
    for (let i = 0; i < n; i++) {
      const pc = ep.prevTxt == null ? null : (i + shift >= 0 && i + shift < m ? ep.prevTxt[i + shift] : null);
      const changed = ep.txt[i] !== pc;
      chars.push({
        ch: ep.txt[i], prevCh: ep.t0 == null ? null : pc, changed,
        su: csR(su),
        outDy: csR(-1.05 * EASE.easeInCubic(su)), outOp: csR(1 - su),
        inDy: csR(1.05 * (1 - EASE.easeOutCubic(su))), inOp: csR(su), mix: csR(1 - su),
      });
    }
    return { style, chars, pie: csR(359.9 * u), u: csR(u) };
  }

  if (style === "poster") {
    /* Swiss counter: the count itself is the motion (numEase — linear by
       default at insert), thin rules draw on over the first 38%, the whole
       block enters with easeOutBack (320 ms) and accelerates off over the
       last 18% (opacity 0 at both bounds). */
    const iu = clamp01((t - start) / 320);
    let op = clamp01(iu * 1.6);
    const ou = clamp01((t - (start + dur * 0.82)) / (dur * 0.18));
    op *= 1 - EASE.easeInCubic(ou);
    const v = Math.max(0, numberValue(P, t));
    return {
      style,
      txt: formatNumber(v, P.format || "plain", P.decimals),
      caption: (P.suffix || "COUNT").toUpperCase(),
      idx: "N." + String(Math.min(99, Math.max(0, Math.round(v)))).padStart(2, "0"),
      scale: csR(0.92 + 0.08 * EASE.easeOutBack(iu)),
      op: csR(op),
      dy: csR(-16 * EASE.easeInCubic(ou)),
      rule: csR(EASE.easeOutCubic(clamp01((t - start) / (dur * 0.38)))),
    };
  }

  /* pixel — 3×5 rect-composed digits, per-digit pop-in stagger, and on each
     digit change a seeded (72% of changes) glitch: 2-3 horizontal slice
     ghosts, color-split, offset ±12px, for 200 ms. */
  const chars = ep.txt.split("").map((ch, i) => ({
    ch, bmp: PIXEL_FONT[ch] || null,
    pop: csR(EASE.easeOutBack(clamp01((sceneT - i * 45) / 200))),
  }));
  let ghosts = [];
  if (ep.t0 != null && sceneT < 200) {
    const seed = (Math.round(ep.t0 * 13) + Math.round((Number(P.to) || 0) * 7) + Math.round(start * 3) + Math.round((Number(P.from) || 0) * 5) + ep.txt.length * 11) >>> 0;
    const rng = mulberry32(seed);
    if (rng() < 0.72) {
      const nG = rng() < 0.45 ? 3 : 2;
      const cols = [P.ringC || "#FFB224", "#5B8CFF", "#FF6B6B"];
      const bands = [[6, 58], [56, 8], [30, 34]]; /* clip-inset top/bottom % per ghost */
      ghosts = [];
      for (let i = 0; i < nG; i++) {
        ghosts.push({
          dx: csR((rng() * 2 - 1) * 12),
          top: csR(bands[i][0] + (rng() * 2 - 1) * 5),
          bot: csR(bands[i][1] + (rng() * 2 - 1) * 5),
          color: cols[i], op: csR(0.5 + rng() * 0.25),
        });
      }
    }
  }
  return { style, txt: ep.txt, chars, ghosts };
}

/* ============================================================
   CONFETTI (seeded) — 17 emission styles. Missing/unknown
   props.style falls back to "burst", the original upward
   fountain, so projects saved before styles existed render
   EXACTLY as before (same rng order, same particle fields).
   All math is pure/deterministic (mulberry32) — the renderer
   (components/StageObject.jsx) only plays the kinematics back.

   MOTION FAMILIES — the renderer's kinematics player is selected
   by the NORMALIZED style (confettiStyleOf). Nine newer styles
   reuse an existing player family but generate their own particle
   fields (below), so the shared renderer needed no changes:
     streamers → "rain" player (top-fall + sine sway)
     tornado   → "spiral" player (radial vortex)
     popring   → "pop" player (eased radial ring)
     drift     → "snow" player (slow ambient fall)
   The remaining new styles (cannons/fountain/celebration/
   patriotic/mono) play the default burst kinematics with their
   own field recipes. Family entries carry the SAME lifetime as
   their player family, so confettiLife(raw) ≡ confettiLife(
   normalized) no matter which id is looked up.
   ============================================================ */
export const CONFETTI_LIFE = 2400;
/* per-style particle lifetime (ms) — the renderer's active window */
const CONFETTI_LIVES = {
  burst: CONFETTI_LIFE, rain: 3400, cannonL: 2600, cannonR: 2600, firework: 2800, spiral: 2600, snow: 6500, pop: 700,
  cannons: CONFETTI_LIFE, fountain: CONFETTI_LIFE, celebration: CONFETTI_LIFE, patriotic: CONFETTI_LIFE, mono: CONFETTI_LIFE,
  streamers: 3400 /* = rain */, tornado: 2600 /* = spiral */, popring: 700 /* = pop */, drift: 6500 /* = snow */,
};
/* new style id → renderer kinematics family (confettiStyleOf applies it);
   anything NOT listed here plays under its own id (default burst player) */
const CONFETTI_FAMILY = { streamers: "rain", tornado: "spiral", popring: "pop", drift: "snow" };
export const CONFETTI_STYLES = [
  { id: "burst", name: "Burst", glyph: "🎉", hint: "Classic upward fountain" },
  { id: "cannons", name: "Cross Cannons", glyph: "🎊", hint: "Twin angled streams crossing overhead" },
  { id: "celebration", name: "Celebration", glyph: "🥳", hint: "Rich radial mix, all hues + white" },
  { id: "rain", name: "Rain", glyph: "🌧", hint: "Steady top fall with sway" },
  { id: "streamers", name: "Streamers", glyph: "🎗", hint: "Long ribbons curling down" },
  { id: "drift", name: "Drift", glyph: "🍃", hint: "Slow ambient fall, long loop" },
  { id: "fountain", name: "Fountain", glyph: "⛲", hint: "Tall narrow plume, gravity falloff" },
  { id: "cannonL", name: "Cannon L", glyph: "◣", hint: "Bottom-left corner blast" },
  { id: "cannonR", name: "Cannon R", glyph: "◢", hint: "Bottom-right corner blast" },
  { id: "firework", name: "Firework", glyph: "🎆", hint: "Radial shell + twinkle" },
  { id: "tornado", name: "Tornado", glyph: "🌪", hint: "One-way vortex around center" },
  { id: "spiral", name: "Spiral", glyph: "🌀", hint: "Two-way outward swirl" },
  { id: "patriotic", name: "Patriotic", glyph: "★", hint: "Red / white / blue radial pop" },
  { id: "mono", name: "Mono", glyph: "◆", hint: "Single-hue brand shades" },
  { id: "snow", name: "Snow", glyph: "❄", hint: "Gentle white flakes" },
  { id: "pop", name: "Pop", glyph: "💥", hint: "Quick jittered ring burst" },
  { id: "popring", name: "Pop Ring", glyph: "◎", hint: "Crisp two-tone even ring" },
];
/* raw validity (field generation + fallback) — NEVER family-mapped, so an
   unknown/absent style still generates EXACTLY the legacy burst fields */
const confettiRawStyleOf = (P) => (P && CONFETTI_LIVES[P.style] ? P.style : "burst");
export const confettiStyleOf = (P) => { const s = confettiRawStyleOf(P); return CONFETTI_FAMILY[s] || s; };
export function confettiLife(style) { return CONFETTI_LIVES[style] || CONFETTI_LIFE; }

/* ============================================================
   CONFETTI DURATION (props.dur, ms — optional) — the burst plays
   for EXACTLY this long (burst + settle), independent of how much
   timeline remains. ABSENT/invalid ⇒ the per-style default life
   (confettiLife), so projects saved before the prop existed render
   byte-identical. The renderer scales the whole fade grammar with
   it (StageObject confettiMotion) — pieces always live out their
   full styled motion inside the window.
   ============================================================ */
export const CONFETTI_DUR_MIN = 300, CONFETTI_DUR_MAX = 15000;
export function confettiDurMs(P) {
  const d = P ? Number(P.dur) : NaN;
  if (Number.isFinite(d) && d > 0) return Math.min(CONFETTI_DUR_MAX, Math.max(CONFETTI_DUR_MIN, d));
  return confettiLife(confettiStyleOf(P));
}

/* fitDurForConfetti(project, confettiObj) → newDur — PURE timeline
   auto-extend contract for the shell (GraphicDestinationMotion):
   when a confetti's full span (burst + duration) runs past the end
   of the project, the project timeline extends AT THE END to fit.
     · pure — never mutates `project`/`confettiObj`, returns a number
     · monotonic — the result is NEVER smaller than the current
       project.stage.dur (extending only ever grows the timeline;
       nothing else on the timeline moves)
     · contract for the shell wave: after inserting a confetti or
       editing its burst/duration, set
         compDur = fitDurForConfetti(projectWithStageDur, confettiObj)
       and leave every layer's inT/outT untouched. stage.dur is the
       serialized project length (see the v5 project JSON). */
export function fitDurForConfetti(project, confettiObj) {
  const cur = Math.max(0, Number(project && project.stage && project.stage.dur) || 0);
  if (!confettiObj || typeof confettiObj !== "object") return cur; /* no confetti ⇒ no extension */
  const P = confettiObj.props || {};
  const start = Math.max(0, Number(P.burst) || 0);
  return Math.max(cur, Math.ceil(start + confettiDurMs(P)));
}

/* #rrggbb → [h 0..360, s 0..100, l 0..100] (pure — mono's brand-hue shades) */
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); }
  if (h < 0) h += 360;
  const l = (mx + mn) / 2;
  return [h, d ? (d / (1 - Math.abs(2 * l - 1))) * 100 : 0, l * 100];
}
/* [h, s, l] → #rrggbb (inverse of the above; Math.round keeps it deterministic) */
function hslToHex(h, s, l) {
  const sn = Math.max(0, Math.min(100, s)) / 100, ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = ln - c / 2;
  const seg = ((h % 360) + 360) % 360 / 60 | 0;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}
export function confettiParticles(obj) {
  const P = obj.props;
  const style = confettiRawStyleOf(P); /* raw id — family styles generate their OWN fields */
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
  if (style === "cannons") {
    /* dual angled cannon streams (default burst player): alternating ±vx blasts
       fired upward so the two streams cross over the stage in gravity arcs */
    for (let i = 0; i < P.count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const vx = side * (0.55 + rng() * 0.75) * power;
      const vy = -(1.05 + rng() * 0.75) * power;
      out.push({ vx, vy, size: 5 + rng() * 8, color: SWATCHES[Math.floor(rng() * 5)], spin: (rng() - 0.5) * 1500, round: rng() > 0.55, drift: (rng() - 0.5) * 40, wob: rng() * Math.PI * 2 });
    }
    return out;
  }
  if (style === "fountain") {
    /* tall narrow plume (default burst player): tight angle around straight-up,
       wide speed range so pieces rain back continuously — gravity falloff */
    for (let i = 0; i < P.count; i++) {
      const ang = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 0.34;
      const speed = (0.85 + rng() * 1.15) * power;
      out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 4 + rng() * 7, color: SWATCHES[Math.floor(rng() * 5)], spin: (rng() - 0.5) * 1100, round: rng() > 0.5, drift: (rng() - 0.5) * 90, wob: rng() * Math.PI * 2 });
    }
    return out;
  }
  if (style === "celebration") {
    /* rich mixed burst (default burst player): full radial spread, mixed
       circles/rects with a few oversized statement pieces, 5 hues + white */
    for (let i = 0; i < P.count; i++) {
      const ang = rng() * Math.PI * 2;
      const speed = (0.4 + rng() * 1.05) * power;
      const big = rng() > 0.72;
      out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 0.25 * power, size: big ? 9 + rng() * 8 : 3.5 + rng() * 5.5, color: SWATCHES[Math.floor(rng() * 6)], spin: (rng() - 0.5) * 1600, round: rng() > 0.45, drift: (rng() - 0.5) * 70, wob: rng() * Math.PI * 2 });
    }
    return out;
  }
  if (style === "patriotic") {
    /* red/white/blue radial burst (default burst player) — palette pinned to
       the red, white and blue swatches */
    const RWB = [SWATCHES[1], SWATCHES[5], SWATCHES[2]];
    for (let i = 0; i < P.count; i++) {
      const ang = rng() * Math.PI * 2;
      const speed = (0.45 + rng() * 0.95) * power;
      out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 0.2 * power, size: 4 + rng() * 7, color: RWB[Math.floor(rng() * 3)], spin: (rng() - 0.5) * 1300, round: rng() > 0.5, drift: (rng() - 0.5) * 50, wob: rng() * Math.PI * 2 });
    }
    return out;
  }
  if (style === "mono") {
    /* single-hue brandable burst (default burst player): every piece is a
       lightness shade of ONE hue — the object's own fill (accent prop) when
       it's a valid #rrggbb, else the theme amber (SWATCHES[0]) */
    const accent = /^#[0-9a-f]{6}$/i.test(P.fill || "") ? P.fill : SWATCHES[0];
    const [h, s] = hexToHsl(accent);
    for (let i = 0; i < P.count; i++) {
      const ang = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 1.3;
      const speed = (0.5 + rng() * 0.95) * power;
      const l = 42 + rng() * 34; /* same hue+sat, fanned lightness */
      out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 4.5 + rng() * 8, color: hslToHex(h, s, l), spin: (rng() - 0.5) * 1300, round: rng() > 0.5, drift: (rng() - 0.5) * 55, wob: rng() * Math.PI * 2 });
    }
    return out;
  }
  if (style === "streamers") {
    /* curling ribbon streamers (rain player): long non-round pieces tumbling
       fast with a wide slow-ish sway as they fall — the sine sway plays back
       as the ribbon's S-curve */
    for (let i = 0; i < P.count; i++) {
      out.push({
        ox: (rng() - 0.5) * 660, vy: (0.22 + rng() * 0.3) * power,
        size: 7 + rng() * 11, color: SWATCHES[Math.floor(rng() * 5)],
        spin: (rng() - 0.5) * 1500, round: false,
        swayA: 22 + rng() * 40, swayF: 1.6 + rng() * 2.4, wob: rng() * Math.PI * 2,
      });
    }
    return out;
  }
  if (style === "tornado") {
    /* vortex (spiral player): every particle sweeps the SAME direction (om
       always positive — a true funnel, unlike spiral's two-way mix) from a
       tight core, fast */
    for (let i = 0; i < P.count; i++) {
      out.push({
        th0: rng() * Math.PI * 2, om: 4.5 + rng() * 3.5,
        r0: 4 + rng() * 20, vr: (60 + rng() * 130) * power,
        size: 3.5 + rng() * 6, color: SWATCHES[Math.floor(rng() * 5)],
        spin: (rng() - 0.5) * 1100, round: rng() > 0.5, wob: rng() * Math.PI * 2,
      });
    }
    return out;
  }
  if (style === "popring") {
    /* crisp radial ring (pop player): perfectly even angular spread with no
       jitter, uniform speed+size, two alternating hues — a clean expanding ring */
    for (let i = 0; i < P.count; i++) {
      const ang = (i / Math.max(1, P.count)) * Math.PI * 2;
      const speed = (1.02 + rng() * 0.06) * power;
      out.push({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, size: 5 + rng() * 2, color: SWATCHES[i % 2 === 0 ? 0 : 2], spin: (rng() - 0.5) * 300, round: true });
    }
    return out;
  }
  if (style === "drift") {
    /* slow ambient fall (snow player): colored pieces, very low velocity,
       gentle wide sway, extra-long life — loops gracefully */
    for (let i = 0; i < P.count; i++) {
      out.push({
        ox: (rng() - 0.5) * 740, vy: (0.05 + rng() * 0.085) * power,
        size: 4 + rng() * 5.5, color: SWATCHES[Math.floor(rng() * 5)],
        spin: 0, round: rng() > 0.4,
        swayA: 20 + rng() * 42, swayF: 0.5 + rng() * 1.1, wob: rng() * Math.PI * 2,
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

/* multi-series row parser: "Q1, 12, 20" → { l:"Q1", vals:[12,20] } (≤4 series,
   ≤10 rows). The LAST field is always a value (legacy rule); additional
   strictly-numeric fields before it become extra series (grouped/stacked). */
export function parseChartRows(str) {
  const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
  return (str || "").split(/\n+/).map((l) => {
    const m = l.split(/[,:]/);
    if (m.length < 2) return null;
    const v = parseFloat(m[m.length - 1]);
    if (isNaN(v)) return null;
    const vals = [Math.max(0, v)];
    let i = m.length - 2;
    while (i >= 1 && NUM.test(m[i].trim())) { vals.unshift(Math.max(0, parseFloat(m[i]))); i--; }
    return { l: m.slice(0, i + 1).join(":").trim(), vals: vals.slice(0, 4) };
  }).filter(Boolean).slice(0, 10);
}
/* legacy single-series view — reads the LAST value of each row, byte-identical
   output to the pre-multi-series parser (old projects see the same numbers) */
export function parseChart(str) {
  return parseChartRows(str).map((r) => ({ l: r.l, v: r.vals[r.vals.length - 1] }));
}

/* ============================================================
   CHARTS — Jitter-grade animated charts (pure, deterministic)
   ------------------------------------------------------------
   chartModel(P, time) → a plain-data frame description; StageObject.jsx maps
   it 1:1 to SVG (the single shared render point → editor preview, SSR checks
   and the export frame renderer produce identical frames). No wall-clock, no
   Math.random — a pure function of (props, timeline time).

   ANIMATION GRAMMAR — in → hold → out over [start, start+dur] (NO ping-pong):
     · IN    overshoot spring (EASE.easeOutBack ≈ cubic-bezier(.34,1.56,.64,1))
             with a 50–100 ms per-element stagger — bars rise past their final
             height and settle, labels pop, the line draws on, donuts sweep
             while the whole dial rotates −180° → 0.
     · HOLD  fully static — every eased term saturates to exactly 1/0, so any
             two hold frames are byte-identical.
     · OUT   everything accelerates off with ease-in (cubic), staggered,
             ending exactly at start+dur.
   SEAMLESS LOOP — the zero state at t ≤ start is byte-identical to the zero
   state at t ≥ start+dur (opacities 0, scales 0, counts "0", dial rotation
   normalized), so a comp whose length matches the chart window loops cleanly.

   MODEL — { type, w, h, grads, items, meta }; items:
     line   { k, role, x1, y1, x2, y2, stroke, sw, dash?, cap?, op }
     path   { k, role, d, fill?|grad?, stroke?, sw?, dash?, off?, plen?, cap?, op, tr?, glow? }
     circle { k, role, cx, cy, r, fill?, stroke?, sw?, op, tr? }
     text   { k, role, x, y, s, fill, size, fam, wt, anchor?, ls?, tnum?, op, tr? }
   All numbers are pre-rounded (2dp, opacities 3dp) so equal states serialize
   byte-identical. `role` tags semantics (grid/bar/seg/slice/stem/head/pt/
   line/area/arc/track/val/axis/legend/cap) for tests — never rendered.
   ============================================================ */
export const CHART_TYPES = [
  { id: "bar", name: "Bars" },
  { id: "grouped", name: "Grouped bars" },
  { id: "hbar", name: "Horizontal bars" },
  { id: "stacked", name: "Stacked bars" },
  { id: "line", name: "Line" },
  { id: "area", name: "Area" },
  { id: "donut", name: "Donut" },
  { id: "pie", name: "Pie" },
  { id: "ring", name: "Progress ring" },
  { id: "lollipop", name: "Lollipop" },
  { id: "gauge", name: "Gauge" },
];
export const chartTypeOf = (P) => (P && CHART_TYPES.some((c) => c.id === P.chartType) ? P.chartType : "bar");

/* the in → hold → out window.
   PLACEMENT-DRIVEN LIFECYCLE (props.outT set — every layer inserted after
   the timeline-window model): the chart plays WHATEVER span the layer
   occupies on the timeline. The entrance plays ONCE from the layer's inT
   over the first 45% of the visible span (capped at CHART_IN_CAP ms so very
   long holds stay snappy), the chart holds fully static, then an ANIMATED
   EXIT — mirror of the entrance: staggered, accelerating off with ease-in —
   plays over the last 32% (capped at CHART_OUT_CAP ms), ending exactly at
   the layer's outT. Resizing/retiming the layer's timeline bar re-maps the
   whole grammar automatically (window = f(inT, outT) only — the legacy
   start/dur props are ignored while outT is set).
   LEGACY WINDOW (outT absent — projects saved before outT existed): the
   authored start/dur window, byte-identical to the pre-lifecycle engine.
   SEAMLESS LOOP: the zero state at t ≤ start is byte-identical to the zero
   state at t ≥ end (opacities 0, scales 0, counts "0", dial rotation
   normalized), so a comp whose length matches the chart window loops cleanly. */
export const CHART_IN_FRAC = 0.45, CHART_OUT_FRAC = 0.32;
export const CHART_IN_CAP = 1400, CHART_OUT_CAP = 1100, CHART_MIN_SPAN = 600;
export function chartWindows(P) {
  const outN = P && P.outT != null ? Number(P.outT) : NaN;
  if (Number.isFinite(outN)) {
    const start = Math.max(0, Number(P.inT) || 0);
    const end = Math.max(start + CHART_MIN_SPAN, outN);
    const dur = end - start;
    const inDur = Math.min(dur * CHART_IN_FRAC, CHART_IN_CAP), outDur = Math.min(dur * CHART_OUT_FRAC, CHART_OUT_CAP);
    return { start, dur, inDur, outDur, holdStart: start + inDur, outStart: end - outDur, end };
  }
  const start = Math.max(0, Number(P && P.start) || 0);
  const dur = Math.max(1, Number(P && P.dur) || 1400);
  const inDur = dur * 0.45, outDur = dur * 0.32;
  return { start, dur, inDur, outDur, holdStart: start + inDur, outStart: start + dur - outDur, end: start + dur };
}
/* per-element animation state: u = entrance 0→1 (staggered, overshoot via
   grow), v = exit 0→1 (staggered, accelerate via easeInCubic). scale/cnt/op
   are exactly 0 at both zero states and saturate during the hold. */
export function chartProgress(P, time, i = 0, n = 1) {
  const W = chartWindows(P);
  const t = Number(time) || 0;
  const m = Math.max(1, n - 1);
  const stagI = Math.min(85, (W.inDur * 0.38) / m); /* 50–100 ms class stagger */
  const stagO = Math.min(55, (W.outDur * 0.34) / m);
  const u = clamp01((t - W.start - i * stagI) / Math.max(60, W.inDur - stagI * m));
  const v = clamp01((t - W.outStart - i * stagO) / Math.max(60, W.outDur - stagO * m));
  const grow = EASE.easeOutBack(u), shrink = 1 - EASE.easeInCubic(v);
  /* snap float dust to exact 0 — easeOutBack(0) is ~−2e-16, and the seamless
     loop relies on the two zero states being byte-identical */
  const snap = (x) => (Math.abs(x) < 1e-12 ? 0 : x);
  return { u, v, grow: snap(grow), shrink, scale: snap(grow * shrink), cnt: snap(EASE.easeOutCubic(u) * shrink), op: clamp01(u * 2.4) * (1 - EASE.easeInQuad(v)) };
}

/* model rounding — equal states serialize byte-identical (−0 → 0) */
const r2 = (v) => { const r = Math.round(v * 100) / 100; return r === 0 ? 0 : r; };
const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? 0 : r; };
const CH_INK = "#E9EBF2", CH_DIM = "#98A0B4", CH_GRID = "#FFFFFF";
/* dial rotation normalized to (−180, 180]: entrance starts at −180≡180 and
   the +180 exit spin lands on the same normalized angle → seamless loop */
const normRot = (a) => { const x = ((((a + 180) % 360) + 360) % 360) - 180; return x === -180 ? 180 : x; };

/* rounded-TOP bar silhouette (bottom stays square on the baseline) */
function topBarD(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${r2(x)} ${r2(y + h)}L${r2(x)} ${r2(y + rr)}A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + rr)} ${r2(y)}L${r2(x + w - rr)} ${r2(y)}A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w)} ${r2(y + rr)}L${r2(x + w)} ${r2(y + h)}Z`;
}
/* rounded-RIGHT bar silhouette (horizontal bars) */
function rightBarD(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w, h / 2));
  return `M${r2(x)} ${r2(y)}L${r2(x + w - rr)} ${r2(y)}A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w)} ${r2(y + rr)}L${r2(x + w)} ${r2(y + h - rr)}A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(x + w - rr)} ${r2(y + h)}L${r2(x)} ${r2(y + h)}Z`;
}
/* stroke-only open arc (same geometry as the renderer's arcStrokeD):
   angles in degrees, 0° = +x, positive = clockwise */
function arcStrokeD(cx, cy, r, a0, a1) {
  const rad = (a) => (a * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  const laf = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${laf} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const lastVal = (r) => r.vals[r.vals.length - 1];
const valPopOp = (pr) => r3(clamp01(pr.u * 1.9 - 0.7) * (1 - EASE.easeInQuad(pr.v)));

export function chartModel(P, time) {
  const type = chartTypeOf(P);
  const rows = parseChartRows(P && P.dataStr);
  const n = rows.length;
  const W = Math.max(60, Number(P && P.w) || 560);
  const H = Math.max(60, Number(P && P.h) || 340);
  const showVals = !!(P && P.showVals);
  const Wm = chartWindows(P);
  const all = chartProgress(P, time, 0, 1); /* whole-chart driver (grid/chrome/dial) */
  const grads = [];
  const items = [];
  const lgrad = (x1, y1, x2, y2, stops) => { const id = "g" + grads.length; grads.push({ id, type: "linear", x1, y1, x2, y2, stops }); return id; };
  /* hideLabels (panel thumbnails): suppress ALL chart text — axis/category
     labels, values, legends, captions — for a clean shape-only preview. Off by
     default, so inserted charts on the canvas keep every label unchanged. */
  const hideLabels = !!(P && P.hideLabels);
  const txt = (role, x, y, s, o) => { if (hideLabels) return; items.push({ k: "text", role, x: r2(x), y: r2(y), s: String(s), fill: o.fill || CH_INK, size: o.size || 12.5, fam: o.fam || "'JetBrains Mono'", wt: o.wt || 600, anchor: o.anchor || "middle", ...(o.ls ? { ls: o.ls } : {}), ...(o.tnum === false ? {} : { tnum: true }), op: r3(o.op == null ? 1 : o.op), ...(o.tr ? { tr: o.tr } : {}) }); };
  const axisTxt = (x, y, s, anchor, op) => txt("axis", x, y, String(s).toUpperCase(), { fill: CH_DIM, size: 10, fam: "'Inter'", ls: 1.1, tnum: false, anchor: anchor || "middle", op });
  const scaleTr = (cx, cy, s) => `translate(${r2(cx)} ${r2(cy)}) scale(${r3(s)}) translate(${r2(-cx)} ${r2(-cy)})`;

  /* chrome adapts below ~140px heights so thumbnails/small widgets keep a
     usable plot area; full-size charts (H ≥ 140) are byte-identical */
  const padV = H >= 140 ? 26 : Math.max(9, Math.round(H * 0.16));
  const padT = padV, padB = padV, padL = 16, padR = 16;
  const plotW = W - padL - padR, plotH = H - padT - padB, base = padT + plotH;
  const gridOp = 0.09 * all.op;
  const hGrid = () => { for (let g = 1; g <= 4; g++) { const y = r2(padT + (plotH * g) / 4); items.push({ k: "line", role: "grid", x1: padL, x2: W - padR, y1: y, y2: y, stroke: CH_GRID, sw: 1, dash: "2 6", op: r3(gridOp) }); } };

  if (type === "bar" || type === "grouped" || type === "stacked" || type === "lollipop" || type === "line" || type === "area") hGrid();

  if (type === "bar" && n) {
    const vmax = Math.max(1, ...rows.map(lastVal));
    const slot = plotW / n, bw = Math.min(64, slot * 0.52);
    rows.forEach((row, i) => {
      const v = lastVal(row);
      const pr = chartProgress(P, time, i, n);
      const cx = padL + slot * (i + 0.5);
      const h = Math.max(0, (v / vmax) * plotH * pr.scale);
      items.push({ k: "path", role: "bar", d: topBarD(cx - bw / 2, base - h, bw, h, Math.min(8, bw / 2.6)), fill: SWATCHES[i % 5], op: r3(pr.op) });
      if (showVals) {
        const vy = base - h - 9;
        txt("val", cx, vy, Math.round(v * pr.cnt), { op: valPopOp(pr), tr: scaleTr(cx, vy, Math.max(0, pr.scale)) });
      }
      axisTxt(cx, H - 7, row.l, "middle", 0.92 * all.op);
    });
  }

  if (type === "grouped" && n) {
    const m = Math.max(1, ...rows.map((r) => r.vals.length));
    const vmax = Math.max(1, ...rows.flatMap((r) => r.vals));
    const slot = plotW / n, bw = Math.min(30, (slot * 0.76) / m), gw = bw * m;
    const tot = n * m;
    rows.forEach((row, i) => {
      const gx = padL + slot * (i + 0.5) - gw / 2;
      for (let s = 0; s < m; s++) {
        const v = row.vals[s] || 0;
        const pr = chartProgress(P, time, i * m + s, tot); /* group-then-series stagger */
        const h = Math.max(0, (v / vmax) * plotH * pr.scale);
        items.push({ k: "path", role: "bar", d: topBarD(gx + s * bw, base - h, Math.max(2, bw - 2.5), h, Math.min(6, bw / 3)), fill: SWATCHES[s % 5], op: r3(pr.op) });
        if (showVals && v > 0) txt("val", gx + s * bw + Math.max(2, bw - 2.5) / 2, base - h - 6, Math.round(v * pr.cnt), { size: 9.5, op: valPopOp(pr) });
      }
      axisTxt(padL + slot * (i + 0.5), H - 7, row.l, "middle", 0.92 * all.op);
    });
  }

  if (type === "stacked" && n) {
    const totals = rows.map((r) => r.vals.reduce((a, b) => a + b, 0));
    const vmaxT = Math.max(1, ...totals);
    const slot = plotW / n, bw = Math.min(58, slot * 0.5);
    rows.forEach((row, i) => {
      const pr = chartProgress(P, time, i, n);
      const cx = padL + slot * (i + 0.5);
      let yCur = base;
      row.vals.forEach((v, s) => {
        /* segments grow bottom-up inside their bar's own window (inner stagger) */
        const su = clamp01(pr.u * (row.vals.length + 0.6) - s * 0.8);
        const sv = clamp01(pr.v * (row.vals.length + 0.6) - s * 0.8);
        const sc = EASE.easeOutBack(su) * (1 - EASE.easeInCubic(sv));
        const hh = Math.max(0, (v / vmaxT) * plotH * sc);
        yCur -= hh;
        items.push({ k: "path", role: "seg", d: topBarD(cx - bw / 2, yCur, bw, hh, s === row.vals.length - 1 ? Math.min(8, bw / 2.6) : 0), fill: SWATCHES[s % 5], op: r3(pr.op) });
      });
      if (showVals) {
        const vy = yCur - 9;
        txt("val", cx, vy, Math.round(totals[i] * pr.cnt), { op: valPopOp(pr), tr: scaleTr(cx, vy, Math.max(0, pr.scale)) });
      }
      axisTxt(cx, H - 7, row.l, "middle", 0.92 * all.op);
    });
  }

  if (type === "lollipop" && n) {
    const vmax = Math.max(1, ...rows.map(lastVal));
    const slot = plotW / n;
    rows.forEach((row, i) => {
      const v = lastVal(row);
      const pr = chartProgress(P, time, i, n);
      const cx = padL + slot * (i + 0.5);
      const h = Math.max(0, (v / vmax) * plotH * pr.scale);
      const tip = base - h;
      const col = SWATCHES[i % 5];
      items.push({ k: "line", role: "stem", x1: r2(cx), y1: r2(base), x2: r2(cx), y2: r2(tip), stroke: col, sw: 2.5, cap: "round", op: r3(pr.op) });
      /* head pops with a spring once the stem is ~60% grown */
      const hp = EASE.easeOutBack(clamp01(pr.u * 1.55 - 0.55)) * pr.shrink;
      items.push({ k: "circle", role: "head", cx: r2(cx), cy: r2(tip), r: r2(Math.max(0, 7.2 * hp)), fill: col, stroke: "#0F1116", sw: 2, op: r3(clamp01(pr.u * 2.2 - 0.9) * (1 - EASE.easeInQuad(pr.v))) });
      if (showVals) {
        const vy = tip - 13;
        txt("val", cx, vy, Math.round(v * pr.cnt), { size: 12, op: valPopOp(pr), tr: scaleTr(cx, vy, Math.max(0, pr.scale)) });
      }
      axisTxt(cx, H - 7, row.l, "middle", 0.92 * all.op);
    });
  }

  if ((type === "line" || type === "area") && n > 1) {
    const vmax = Math.max(1, ...rows.map(lastVal));
    const accent = type === "line" ? SWATCHES[2] : SWATCHES[3];
    const pts = rows.map((row, i) => [padL + (plotW * i) / (n - 1), base - (lastVal(row) / vmax) * plotH]);
    const dStr = pts.map((p, i) => (i ? "L" : "M") + r2(p[0]) + " " + r2(p[1])).join("");
    /* draw-on reveal: 0→1 eased, retracts (accelerating) on exit */
    const drawE = EASE.easeInOutCubic(all.u) * all.shrink;
    const gid = lgrad(0, 0, 0, 1, [[0, accent, type === "area" ? 0.4 : 0.18], [1, accent, 0.02]]);
    items.push({ k: "path", role: "area", d: dStr + `L${r2(padL + plotW)} ${r2(base)}L${r2(padL)} ${r2(base)}Z`, grad: gid, op: r3((type === "area" ? 0.95 : 0.6) * drawE) });
    items.push({ k: "path", role: "line", d: dStr, stroke: accent, sw: 3, plen: 100, dash: 100, off: r2(100 * (1 - drawE)), cap: "round", op: 1, glow: `0 0 6px ${accent}66` });
    pts.forEach((p, i) => {
      /* point i pops (spring) as the drawn tip passes it — the tip sweeps
         0 → n so the LAST point also fully pops at drawE = 1 */
      const pu = clamp01((drawE * n - (i + 0.55)) * 2.6);
      items.push({ k: "circle", role: "pt", cx: r2(p[0]), cy: r2(p[1]), r: r2(Math.max(0, 4.2 * EASE.easeOutBack(pu))), fill: "#FFFFFF", stroke: accent, sw: 2.5, op: r3(clamp01(pu * 1.8)) });
      if (showVals) txt("val", p[0], p[1] - 11, Math.round(lastVal(rows[i])), { size: 11.5, op: r3(clamp01(pu * 1.8 - 0.25)) });
      axisTxt(p[0], H - 7, rows[i].l, "middle", 0.92 * all.op);
    });
  }
  if ((type === "line" || type === "area") && n === 1) {
    /* degenerate single reading — one springy dot, no path */
    const accent = type === "line" ? SWATCHES[2] : SWATCHES[3];
    const cx = padL + plotW / 2, cy = base - plotH * 0.5 * clamp01(lastVal(rows[0]) / 100);
    const s = all.grow * all.shrink;
    items.push({ k: "circle", role: "pt", cx: r2(cx), cy: r2(cy), r: r2(Math.max(0, 5 * s)), fill: "#FFFFFF", stroke: accent, sw: 2.5, op: r3(all.op) });
    if (showVals) txt("val", cx, cy - 12, Math.round(lastVal(rows[0]) * all.cnt), { size: 11.5, op: r3(all.op) });
    axisTxt(cx, H - 7, rows[0].l, "middle", 0.92 * all.op);
  }

  if (type === "hbar" && n) {
    const vmax = Math.max(1, ...rows.map(lastVal));
    const gutter = Math.min(96, Math.max(40, Math.round(W * 0.28))), gx = padL + gutter;
    const maxW = Math.max(40, W - gx - padR - (showVals ? 46 : 0));
    const slotH = plotH / n, bh = Math.min(30, slotH * 0.56);
    for (let g = 1; g <= 3; g++) { const x = r2(gx + (maxW * g) / 3); items.push({ k: "line", role: "grid", x1: x, x2: x, y1: padT, y2: r2(base), stroke: CH_GRID, sw: 1, dash: "2 6", op: r3(gridOp) }); }
    rows.forEach((row, i) => {
      const v = lastVal(row);
      const pr = chartProgress(P, time, i, n);
      const w = Math.max(0, (v / vmax) * maxW * pr.scale);
      const y = padT + slotH * (i + 0.5) - bh / 2;
      items.push({ k: "path", role: "bar", d: rightBarD(gx, y, w, bh, Math.min(8, bh / 2.4)), fill: SWATCHES[i % 5], op: r3(pr.op) });
      axisTxt(gx - 10, y + bh / 2 + 3.5, row.l, "end", 0.92 * all.op);
      if (showVals) txt("val", gx + w + 9, y + bh / 2 + 4, Math.round(v * pr.cnt), { size: 11.5, anchor: "start", op: valPopOp(pr) });
    });
  }

  if ((type === "donut" || type === "pie") && n) {
    const vals = rows.map(lastVal);
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const legendW = Math.min(108, Math.max(52, Math.round(W * 0.32)));
    const cx = legendW + (W - legendW) / 2, cy = padT + plotH / 2;
    const R = Math.max(10, Math.min(W - legendW, plotH) / 2 - 4);
    /* arc-sweep reveal (progressive per segment) + whole-dial −180°→0→+180° */
    const sweepAng = 360 * all.cnt;
    const rot = normRot(-180 * (1 - EASE.easeOutCubic(all.u)) + 180 * EASE.easeInCubic(all.v));
    const rotTr = `rotate(${r2(rot)} ${r2(cx)} ${r2(cy)})`;
    const fadeOut = 1 - EASE.easeInQuad(all.v);
    let acc = 0;
    rows.forEach((row, i) => {
      const v = vals[i];
      const a0 = (acc / total) * 360;
      acc += v;
      const a1 = (acc / total) * 360;
      const col = SWATCHES[i % 5];
      const vis = Math.min(a1, sweepAng);
      const sop = r3(clamp01((sweepAng - a0) / 14) * fadeOut);
      if (vis > a0 + 0.01) {
        if (type === "donut") {
          const th = R * 0.34, rArc = R - th / 2;
          const gap = a1 - a0 > 6 ? 1.4 : 0;
          const s0 = -90 + a0 + gap;
          const s1 = Math.max(s0, -90 + vis - (vis >= a1 - 0.01 ? gap : 0));
          items.push({ k: "path", role: "seg", d: arcStrokeD(cx, cy, rArc, s0, s1), stroke: col, sw: r2(th), cap: "round", op: sop, tr: rotTr });
        } else {
          const wu = clamp01((sweepAng - a0) / Math.max(1, a1 - a0));
          const sc = (0.82 + 0.18 * EASE.easeOutBack(wu)) * (1 - 0.18 * EASE.easeInCubic(all.v));
          items.push({ k: "path", role: "slice", d: arcPath(cx, cy, R, -90 + a0, -90 + vis), fill: col, op: sop, tr: rotTr + " " + scaleTr(cx, cy, sc) });
        }
      }
      if (type === "pie" && showVals && v / total >= 0.045) {
        const rad = ((-90 + (a0 + a1) / 2) * Math.PI) / 180;
        txt("val", cx + Math.cos(rad) * R * 0.6, cy + Math.sin(rad) * R * 0.6 + 4, Math.round((v / total) * 100) + "%", { fill: "#10131A", size: 11.5, wt: 700, op: r3(clamp01((sweepAng - a1) / 18) * fadeOut) });
      }
    });
    if (type === "donut") {
      /* center total counts up on entrance, back down on exit */
      txt("cap", cx, cy + R * 0.1, Math.round(total * all.cnt), { size: r2(Math.max(9, R * 0.4)), wt: 700, op: r3(clamp01(all.u * 2) * fadeOut) });
      txt("cap", cx, cy + R * 0.1 + Math.max(8, R * 0.17), "TOTAL", { fill: CH_DIM, size: 9.5, fam: "'Inter'", ls: 2.2, tnum: false, op: r3(clamp01(all.u * 2 - 0.4) * fadeOut) });
    }
    rows.forEach((row, i) => {
      const pr = chartProgress(P, time, i, n); /* legend rows stagger with the sweep */
      const ly = cy - ((n - 1) * 19) / 2 + i * 19;
      items.push({ k: "circle", role: "legend", cx: 12, cy: r2(ly - 3.5), r: 4.2, fill: SWATCHES[i % 5], op: r3(pr.op) });
      txt("legend", 23, ly, row.l.toUpperCase(), { fill: CH_DIM, size: 10, fam: "'Inter'", ls: 0.9, tnum: false, anchor: "start", op: r3(pr.op * 0.95) });
    });
  }

  if (type === "ring" || type === "gauge") {
    const pct = clamp01((n ? lastVal(rows[0]) : 0) / 100);
    const cx = W / 2, cy = padT + plotH / 2;
    const R = Math.max(10, Math.min(W, plotH) / 2 - 6);
    const th = Math.max(10, R * 0.17), rArc = R - th / 2;
    const A0 = type === "ring" ? -90 : 135, SPAN = type === "ring" ? 359.9 : 270;
    const col = SWATCHES[0];
    const prCap = chartProgress(P, time, 1, 2); /* caption trails the dial (stagger) */
    const progE = all.grow * all.shrink; /* overshoots past the target, settles */
    const ang = Math.min(SPAN, SPAN * pct * progE);
    if (type === "ring") items.push({ k: "circle", role: "track", cx: r2(cx), cy: r2(cy), r: r2(rArc), stroke: "#2B3140", sw: r2(th), op: r3(0.9 * all.op) });
    else items.push({ k: "path", role: "track", d: arcStrokeD(cx, cy, rArc, A0, A0 + SPAN), stroke: "#2B3140", sw: r2(th), cap: "round", op: r3(0.9 * all.op) });
    if (ang > 0.8) items.push({ k: "path", role: "arc", d: arcStrokeD(cx, cy, rArc, A0, A0 + ang), stroke: col, sw: r2(th), cap: "round", op: r3(1 - EASE.easeInQuad(all.v)), glow: `0 0 7px ${col}66` });
    txt("cap", cx, cy + R * 0.12, Math.round(pct * 100 * all.cnt) + "%", { size: r2(Math.max(11, R * 0.46)), wt: 700, op: r3(clamp01(all.u * 2) * (1 - EASE.easeInQuad(all.v))) });
    if (n && rows[0].l) txt("cap", cx, cy + R * 0.12 + Math.max(16, R * 0.22), rows[0].l.toUpperCase(), { fill: CH_DIM, size: 11, fam: "'Inter'", ls: 1.4, tnum: false, op: r3(prCap.op) });
  }

  return { type, w: W, h: H, grads, items, meta: { n, start: Wm.start, end: Wm.end, holdStart: Wm.holdStart, outStart: Wm.outStart } };
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
