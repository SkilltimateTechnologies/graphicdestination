/*
 * Centralized, validated configuration. Fail-fast in production.
 *
 * The app already boots with sensible zero-config fallbacks for local dev
 * (ephemeral JWT secret, local SQLite). That convenience must NEVER silently
 * run in production — an ephemeral secret means every restart logs everyone
 * out, and a missing secret is a security hole. This module turns those
 * "warn and continue" cases into "refuse to boot" once NODE_ENV=production.
 *
 * `validateConfig(env)` is a pure function (testable, no process.exit); the
 * module-level code applies it to the real environment and exits on failure.
 */

/**
 * @returns {{ config: object, problems: string[], warnings: string[] }}
 */
export function validateConfig(env = process.env) {
  const isProd = env.NODE_ENV === "production";
  const problems = [];
  const warnings = [];

  // JWT secret — required and non-trivial in production.
  if (isProd) {
    if (!env.JWT_SECRET) {
      problems.push("JWT_SECRET is required in production (sessions must survive restarts).");
    } else if (env.JWT_SECRET.length < 32) {
      problems.push("JWT_SECRET is too short — use at least 32 random characters (64 hex recommended).");
    }
  } else if (!env.JWT_SECRET) {
    warnings.push("JWT_SECRET not set — using an ephemeral dev secret; sessions reset on restart.");
  }

  // Turso: both vars or neither. One-without-the-other is always a mistake.
  const hasUrl = !!env.TURSO_DATABASE_URL;
  const hasToken = !!env.TURSO_AUTH_TOKEN;
  if (hasUrl !== hasToken) {
    problems.push("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set together (or both unset for local SQLite).");
  }
  if (isProd && !hasUrl) {
    warnings.push("No TURSO_* configured in production — using an on-disk SQLite file, which is lost on ephemeral hosts.");
  }

  // Port must be a valid number if provided.
  let port = 8787;
  if (env.PORT != null && env.PORT !== "") {
    const n = Number(env.PORT);
    if (!Number.isInteger(n) || n < 1 || n > 65535) problems.push(`PORT must be an integer 1-65535 (got "${env.PORT}").`);
    else port = n;
  }

  // Admin-hint bootstrap endpoint should never be enabled in production.
  if (isProd && env.ENABLE_ADMIN_HINT === "1") {
    problems.push("ENABLE_ADMIN_HINT=1 exposes the bootstrap admin password — must be off in production.");
  }

  const config = {
    isProd,
    port,
    usingTurso: hasUrl && hasToken,
    clientOrigin: env.CLIENT_ORIGIN || null,
    logLevel: env.LOG_LEVEL || "info",
  };

  return { config, problems, warnings };
}

// The validated config for the current environment. Computing it has NO side
// effects (no exit), so this module is safe to import from tests.
export const config = validateConfig(process.env).config;

/**
 * Boot-time enforcement: log warnings, and refuse to start (exit 1) on any hard
 * problem. Called explicitly from index.js — NOT an import side effect — so
 * importing this module for `validateConfig`/`config` never terminates a test.
 * Uses console on purpose: a boot-config failure must always be visible
 * regardless of LOG_LEVEL.
 */
export function enforceConfig(env = process.env) {
  const { problems, warnings } = validateConfig(env);
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (problems.length) {
    console.error("[config] Refusing to start due to invalid configuration:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}
