/*
 * Unit checks for the observability + config hardening modules (config.js,
 * logger.js). Pure — spawns no server, touches no DB. Prints PASS/FAIL and
 * exits non-zero on any failure, matching the rest of the battery.
 *
 *   node test-observability.mjs
 */
import { validateConfig } from "./config.js";
import { redact, formatLine, REDACT_KEYS } from "./logger.js";
import { initErrorTracking, errorTrackingStatus, captureError } from "./errorTracking.js";
import { recordHttp, renderMetrics, resetMetrics } from "./metrics.js";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

/* ---------- config validation ---------- */
console.log("validateConfig — production fail-fast");

{
  const { problems } = validateConfig({ NODE_ENV: "production" });
  check("prod without JWT_SECRET is a hard problem", problems.some((p) => /JWT_SECRET is required/.test(p)));
}
{
  const { problems } = validateConfig({ NODE_ENV: "production", JWT_SECRET: "short" });
  check("prod with a too-short JWT_SECRET is a problem", problems.some((p) => /too short/.test(p)));
}
{
  const secret = "x".repeat(64);
  const { problems } = validateConfig({ NODE_ENV: "production", JWT_SECRET: secret });
  check("prod with a strong JWT_SECRET has no problems", problems.length === 0, JSON.stringify(problems));
}
{
  const { problems, warnings } = validateConfig({});
  check("dev without JWT_SECRET boots (warning, not problem)", problems.length === 0 && warnings.some((w) => /ephemeral dev secret/.test(w)));
}
{
  const { problems } = validateConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(64), TURSO_DATABASE_URL: "libsql://x" });
  check("half-configured Turso (url without token) is a problem", problems.some((p) => /must be set together/.test(p)));
}
{
  const { config } = validateConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(64), TURSO_DATABASE_URL: "libsql://x", TURSO_AUTH_TOKEN: "t" });
  check("both Turso vars → usingTurso true", config.usingTurso === true);
}
{
  const { problems } = validateConfig({ PORT: "70000" });
  check("out-of-range PORT is a problem", problems.some((p) => /PORT must be an integer/.test(p)));
}
{
  const { config } = validateConfig({ PORT: "9000" });
  check("valid PORT is parsed to a number", config.port === 9000);
}
{
  const { problems } = validateConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(64), ENABLE_ADMIN_HINT: "1" });
  check("ENABLE_ADMIN_HINT in production is a problem", problems.some((p) => /ENABLE_ADMIN_HINT/.test(p)));
}

/* ---------- logger redaction ---------- */
console.log("logger — secret redaction");

{
  const out = redact({ username: "alice", password: "hunter2", nested: { token: "abc", keep: 1 } });
  check("top-level password redacted", out.password === "[redacted]");
  check("nested token redacted", out.nested.token === "[redacted]");
  check("non-secret fields preserved", out.username === "alice" && out.nested.keep === 1);
}
{
  const out = redact({ items: [{ dataUrl: "data:...", name: "logo" }] });
  check("redaction reaches into arrays", out.items[0].dataUrl === "[redacted]" && out.items[0].name === "logo");
}
{
  check("core secret keys are in the redact set", ["password", "token", "authToken", "data", "json"].every((k) => REDACT_KEYS.has(k)));
}
{
  const line = formatLine("info", "request", { status: 200, password: "secret" }, "2026-01-01T00:00:00.000Z");
  const parsed = JSON.parse(line);
  check("formatLine emits valid JSON", parsed.level === "info" && parsed.msg === "request" && parsed.status === 200);
  check("formatLine redacts secrets", parsed.password === "[redacted]");
  check("formatLine carries the timestamp", parsed.t === "2026-01-01T00:00:00.000Z");
}
{
  // A circular structure must not throw inside the logger.
  const circular = {};
  circular.self = circular;
  const line = formatLine("error", "boom", circular, "2026-01-01T00:00:00.000Z");
  const parsed = JSON.parse(line);
  check("formatLine survives unserializable fields", parsed._logError === "unserializable fields");
}

/* ---------- error tracking (optional, gracefully degrading) ---------- */
console.log("errorTracking — safe no-op when disabled");

{
  const status = await initErrorTracking({}); // no SENTRY_DSN
  check("init without SENTRY_DSN reports disabled", status.enabled === false && /SENTRY_DSN not set/.test(status.reason));
  check("errorTrackingStatus reflects disabled", errorTrackingStatus().enabled === false);
}
{
  // @sentry/node is not a declared dependency, so with a DSN but no package it
  // must still degrade to disabled rather than throw.
  const status = await initErrorTracking({ SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0" });
  check("init with DSN but no @sentry/node package degrades to disabled", status.enabled === false && /unavailable/.test(status.reason));
}
{
  let threw = false;
  try {
    captureError(new Error("boom"), { requestId: "abc" });
    captureError("string error");
    captureError(null);
  } catch {
    threw = true;
  }
  check("captureError never throws when disabled", threw === false);
}

/* ---------- metrics (Prometheus exposition) ---------- */
console.log("metrics — RED counters + duration histogram");

{
  resetMetrics();
  recordHttp("GET", 200, 12);
  recordHttp("GET", 200, 300);
  recordHttp("POST", 500, 8);
  const text = renderMetrics();

  check("counts requests by method+status", /http_requests_total\{method="GET",status="200"\} 2/.test(text));
  check("separate series per status", /http_requests_total\{method="POST",status="500"\} 1/.test(text));
  check("histogram emits a +Inf bucket equal to total count", /http_request_duration_ms_bucket\{le="\+Inf"\} 3/.test(text));
  check("histogram sum reflects observations", /http_request_duration_ms_sum 320/.test(text));
  check("histogram count is total observations", /http_request_duration_ms_count 3/.test(text));
  check("le=10 bucket only counts the 8ms request", /http_request_duration_ms_bucket\{le="10"\} 1/.test(text));
  check("le=25 bucket counts the 8ms and 12ms requests", /http_request_duration_ms_bucket\{le="25"\} 2/.test(text));
  check("exposition has TYPE metadata", /# TYPE http_requests_total counter/.test(text) && /# TYPE http_request_duration_ms histogram/.test(text));
  check("process gauges present", /process_uptime_seconds /.test(text) && /process_resident_memory_bytes /.test(text));
  check("no secrets leak into metrics", !/password|token|secret|JWT/i.test(text));
}
{
  resetMetrics();
  check("reset clears counters", !/http_requests_total\{/.test(renderMetrics()));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All observability checks pass.");
process.exit(failed ? 1 : 0);
