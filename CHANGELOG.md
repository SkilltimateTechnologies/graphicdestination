# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project uses internal
release tags (Rn-Wn "round/week") rather than strict SemVer for feature work.

## [Unreleased]

### Added
- **Master test runner** (`scripts/run-checks.mjs`) — one command discovers and
  runs the entire verification battery (client checks, export/render fidelity,
  server integration). Wired into `npm test` with `--group` / `--filter` /
  `--bail` / `--list` options.
- **CI/CD** — GitHub Actions (`.github/workflows/ci.yml`): lint + build + full
  test battery on every push/PR, plus an advisory dependency-audit job.
- **Dependabot** — weekly grouped dependency PRs for client, server, GitHub
  Actions, and Docker.
- **Governance docs** — `SECURITY.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`,
  `ROADMAP.md`, `LICENSE`, PR/issue templates, `.editorconfig`, this changelog.
- **Server production hardening (Phase 1, additive)**:
  - Boot-time config validation (`server/config.js`) — production now **refuses
    to start** on a missing/weak `JWT_SECRET`, half-configured Turso, invalid
    `PORT`, or `ENABLE_ADMIN_HINT=1`.
  - Structured JSON logging (`server/logger.js`) — zero-dependency, with
    key-based secret redaction; replaces ad-hoc `console.*` on the server.
  - Per-request id + structured access log; `X-Request-Id` response header.
  - `GET /api/ready` readiness probe (DB reachability, 503 when down).
  - Centralized Express error handler (no stack leaks; preserves body-parser
    status codes) + graceful `SIGTERM`/`SIGINT` shutdown + process-level
    unhandled-rejection / uncaught-exception logging.
  - Optional error tracking (`server/errorTracking.js`) wired into the error
    handler + process guards — activates only when `SENTRY_DSN` is set **and**
    `@sentry/node` is installed (undeclared, like the `hyperframes` pattern); a
    safe no-op otherwise, so it adds no required dependency.
  - New guard suite `server/test-observability.mjs` (22 assertions).
  - Backup & restore runbook ([docs/backup-restore.md](docs/backup-restore.md))
    — RPO/RTO targets, Turso + local-SQLite procedures, quarterly restore drill.

### Changed
- Root `npm test` now runs the **entire** battery via `scripts/run-checks.mjs`
  (previously ran only `server/test-api.mjs`). The old behavior is available as
  `npm run test:api`.

### Notes
- No engine, editor, or export behavior changed. Server changes are additive
  middleware/routes/observability — existing route responses are unchanged
  except that production boot now fails fast on invalid config (intended). The
  FROZEN feature contracts in AGENTS.md are untouched.

## [1.1.0]

### Added — R9 (settings, shell, morph, timeline)
- **Settings architecture** (R9-W3): `/settings` page with brand-kit CRUD, a
  4-tier text-style config, and a default background; server-persisted
  `user_settings` table with `GET/PUT /api/settings`; in-editor brand switcher.
- **Shape morph restored** (R9-W2) with A→B indicators (Inspector morph card +
  live preview, canvas badge, panel badges); path-motion clamp-collapse fixed
  via `progKeyPlan`; rebuilt emoji/icon panel.
- **Shell polish** (R9-W1): Export beside Save, breadcrumb in transport, avatar
  menu, Animate arm toggle (armed = keyframe, disarmed = base edit),
  scrub-follow playhead, per-prop keyframe glyphs.

### Added — earlier (v3.3 and before)
- Timeline ergonomics (row-lock, gap pills + ripple-close, lock/hide toggles).
- Confetti with clamped bounds and explicit duration; chart lifecycle mapped to
  timeline span; camera card; 11 backdrop variants; 57 bezier kit icons; maps
  with 239 countries / 7 continents.
- **Client-side export** — deterministic frame-stepped WebCodecs MP4 with WebM
  fallback; data-URI asset inlining to avoid canvas taint.
- **Server MP4 render (beta)** — HyperFrames pipeline compiling project JSON →
  HTML composition → MP4, degrading gracefully when the optional `hyperframes`
  package / Chromium binary is absent.
- **Accounts & cloud projects** — bcrypt + JWT cookie auth, per-user isolation,
  Turso (libsql) persistence with local SQLite dev fallback, rate-limited auth,
  strict security headers + CSP, public share links.

---

Regression history that shaped these guardrails is preserved in
[AGENTS.md](AGENTS.md#regression-history-learn-from-these).
