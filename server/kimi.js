/*
 * Kimi 3 (Moonshot AI) provider — SERVER-SIDE ONLY. The API key lives in the
 * environment (KIMI_API_KEY, or MOONSHOT_API_KEY) and NEVER reaches the
 * client: the browser talks to /api/ai/*, this module is the only outbound
 * caller. Cost/abuse guardrails:
 *   · per-user sliding window (GD_AI_PER_HOUR, default 10 analyses/hour)
 *   · app-wide daily cap (GD_AI_PER_DAY, default 300 analyses/day across all
 *     users — the budget ceiling; counters are in-memory per process, which
 *     matches the single-process deploy; they reset on restart)
 *   · 20s outbound timeout
 * When no key is configured the route degrades to a DETERMINISTIC fallback
 * spec (provider: "fallback") so dev/CI/exploration keeps working without
 * burning tokens — the response always names its provider.
 */

const API_BASE = (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/+$/, "");
const API_KEY = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
const MODEL_VISION = process.env.KIMI_VISION_MODEL || "kimi-k2.5";
const MODEL_TEXT = process.env.KIMI_TEXT_MODEL || "kimi-k2.5";
const TIMEOUT_MS = 20_000;

export const kimiConfigured = () => !!API_KEY;

/* ---------------- usage/cost guard ---------------- */
const PER_HOUR = Math.max(1, Number.parseInt(process.env.GD_AI_PER_HOUR || "10", 10) || 10);
const PER_DAY = Math.max(1, Number.parseInt(process.env.GD_AI_PER_DAY || "300", 10) || 300);
const hourHits = new Map(); /* userId -> number[] timestamps */
let dayStart = Date.now();
let dayCount = 0;

/** @returns null when allowed, else { status, error, retryAfter } */
export function aiUsageGate(userId) {
  const now = Date.now();
  if (now - dayStart >= 24 * 60 * 60 * 1000) { dayStart = now; dayCount = 0; }
  if (dayCount >= PER_DAY) return { status: 429, error: "Daily AI budget reached for the app — try again tomorrow.", retryAfter: Math.ceil((dayStart + 86400000 - now) / 1000) };
  let arr = hourHits.get(userId) || [];
  arr = arr.filter((t) => now - t < 3600000);
  if (arr.length >= PER_HOUR) return { status: 429, error: `AI rate limit — max ${PER_HOUR} analyses per hour.`, retryAfter: Math.ceil((arr[0] + 3600000 - now) / 1000) };
  arr.push(now);
  hourHits.set(userId, arr);
  dayCount++;
  return null;
}
/* test hook: reset the in-memory counters */
export const _resetAiUsage = () => { hourHits.clear(); dayStart = Date.now(); dayCount = 0; };

/* ---------------- outbound call ---------------- */
async function chat(messages, { model = MODEL_TEXT, temperature = 0.2, maxTokens = 800 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error?.message || `Kimi API HTTP ${r.status}`);
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("Kimi returned an empty response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/* pull the first balanced {...} block out of a model reply */
export function extractJson(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (!depth) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

const MOTION_PROMPT = `You design micro-animations for a motion-graphics app. Given a reference image, return ONLY a JSON motion spec (no prose, no markdown) of this exact shape:
{"dur":3000,"size":220,"intro":{"type":"pop","dur":470},"hold":{"type":"bob","amp":8,"period":900},"outro":{"type":"whip","dur":560}}
Rules:
- intro.type: one of pop, fade, rise, none. intro.dur 200..1200.
- hold.type: bob (gentle up/down), pulse (scale breathe), spin (full rotation), rock (small tilt), heartbeat (double-thump), float (slow drift), none.
- hold.amp 1..24, hold.period 400..4000.
- outro.type: whip (accelerate away), fade, none. outro.dur 0..1200.
- dur 1500..8000 (the loop length), size 80..400 (insert px).
Pick what suits the subject: bouncy/playful for mascots and icons, calm for logos and badges.`;

/**
 * Analyze a reference image and suggest a motion spec (Route A, image-base).
 * @returns {Promise<{ spec: object|null, provider: "kimi"|"fallback", raw?: string, error?: string }>}
 */
export async function kimiAnalyzeMotion({ imageDataUrl, note = "" }) {
  if (!kimiConfigured()) {
    return { spec: null, provider: "fallback" };
  }
  const messages = [
    { role: "system", content: MOTION_PROMPT },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageDataUrl } },
        { type: "text", text: note ? `Design note from the user: ${note}\nReturn the JSON spec now.` : "Return the JSON spec now." },
      ],
    },
  ];
  try {
    const raw = await chat(messages, { model: MODEL_VISION });
    const json = extractJson(raw);
    if (!json) return { spec: null, provider: "kimi", raw, error: "Kimi returned no JSON block" };
    return { spec: json, provider: "kimi", raw };
  } catch (e) {
    return { spec: null, provider: "kimi", error: e.message };
  }
}

/**
 * Refine an existing spec from a chat instruction (phase 2). The model gets
 * the current spec + instruction and must return the PATCHED full spec.
 */
export async function kimiRefineSpec({ spec, instruction }) {
  if (!kimiConfigured()) return { spec: null, provider: "fallback" };
  const messages = [
    { role: "system", content: MOTION_PROMPT },
    { role: "user", content: `Current spec: ${JSON.stringify(spec)}\nInstruction: ${instruction}\nReturn the FULL patched spec as JSON only.` },
  ];
  try {
    const raw = await chat(messages, { model: MODEL_TEXT });
    const json = extractJson(raw);
    if (!json) return { spec: null, provider: "kimi", raw, error: "Kimi returned no JSON block" };
    return { spec: json, provider: "kimi", raw };
  } catch (e) {
    return { spec: null, provider: "kimi", error: e.message };
  }
}
