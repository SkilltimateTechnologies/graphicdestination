/*
 * Optional, gracefully-degrading error tracking.
 *
 * Mirrors how this repo treats other heavy/optional deps (hyperframes): the
 * `@sentry/node` package is NOT a declared dependency, so a plain install adds
 * nothing and no lockfile/vendored-tarball changes are needed (AGENTS.md #5).
 *
 * Error tracking activates ONLY when both are true:
 *   1. SENTRY_DSN is set in the environment, AND
 *   2. `@sentry/node` resolves (someone ran `npm install @sentry/node`).
 * Otherwise every function here is a safe no-op — the app runs identically.
 *
 * To enable in a deployment:
 *   cd server && npm install @sentry/node
 *   # set SENTRY_DSN=... in the environment
 */

let sentry = null;
let status = { enabled: false, reason: "not initialized" };

/**
 * Initialize error tracking. Async (dynamic import); call once at boot.
 * Never throws — a tracking failure must never take down the app.
 * @returns {Promise<{enabled: boolean, reason?: string}>}
 */
export async function initErrorTracking(env = process.env) {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    status = { enabled: false, reason: "SENTRY_DSN not set" };
    return status;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: env.NODE_ENV || "development",
      release: env.RELEASE || undefined,
      // Errors only by default; turn tracing on deliberately via env later.
      tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE) || 0,
    });
    sentry = Sentry;
    status = { enabled: true };
    return status;
  } catch (err) {
    status = { enabled: false, reason: `@sentry/node unavailable: ${String(err?.message || err)}` };
    return status;
  }
}

/** Current tracking status (for /api/ready or logging). */
export function errorTrackingStatus() {
  return status;
}

/**
 * Report an exception. Safe no-op when tracking is disabled. Never throws.
 * @param {unknown} err
 * @param {Record<string, unknown>} [context] extra fields (redact upstream)
 */
export function captureError(err, context) {
  if (!sentry) return;
  try {
    sentry.captureException(err instanceof Error ? err : new Error(String(err)), context ? { extra: context } : undefined);
  } catch {
    /* tracking must never crash the caller */
  }
}
