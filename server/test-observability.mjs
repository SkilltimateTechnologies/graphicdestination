/*
 * Unit checks for the observability + config hardening modules (config.js,
 * logger.js). Pure — spawns no server, touches no DB. Prints PASS/FAIL and
 * exits non-zero on any failure, matching the rest of the battery.
 *
 *   node test-observability.mjs
 */
import { validateConfig } from "./config.js";
import { redact, formatLine, REDACT_KEYS } from "./logger.js";

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

console.log(`\n${passed} passed, ${failed} failed`);
if (!failed) console.log("All observability checks pass.");
process.exit(failed ? 1 : 0);
