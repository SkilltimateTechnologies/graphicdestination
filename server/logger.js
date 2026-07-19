/*
 * Zero-dependency structured logger (JSON lines to stdout/stderr).
 *
 * The project deliberately hand-rolls small infra instead of pulling deploy-
 * critical dependencies (see ratelimit.js, db.js) — a logger is no different.
 * One JSON object per line is trivially ingestable by any log platform
 * (Datadog, Loki, CloudWatch, Railway's log drain) and greppable locally.
 *
 * Secrets are redacted by key name so a stray `logger.info("x", req.body)`
 * can never leak a password, token, or asset payload.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const DEFAULT_LEVEL = "info";

/** Field names whose values are replaced with "[redacted]" wherever they appear. */
export const REDACT_KEYS = new Set([
  "password",
  "newPassword",
  "password_hash",
  "passwordHash",
  "token",
  "authToken",
  "auth_token",
  "jwt",
  "cookie",
  "authorization",
  "dataUrl",
  "data", // project/asset JSON blobs — noisy and potentially sensitive
  "json", // user_settings document
  "secret",
]);

/** Depth-bounded redaction; returns a new object, never mutates the input. */
export function redact(value, depth = 0) {
  if (depth > 6 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT_KEYS.has(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

/** Build the single JSON line for a log record (exported for testing). */
export function formatLine(level, msg, fields, now) {
  const record = { t: now, level, msg, ...redact(fields || {}) };
  // Never let a circular/BigInt field throw inside the logger itself.
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({ t: now, level, msg, _logError: "unserializable fields" });
  }
}

function makeLogger(baseFields = {}) {
  const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS[DEFAULT_LEVEL];

  const emit = (level, msg, fields) => {
    if (LEVELS[level] < threshold) return;
    const line = formatLine(level, msg, { ...baseFields, ...fields }, new Date().toISOString());
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
  };

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    /** Returns a logger that stamps `fields` onto every record (e.g. a request id). */
    child: (fields) => makeLogger({ ...baseFields, ...fields }),
  };
}

export const logger = makeLogger();
