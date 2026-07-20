# Zwoosh (graphicdestination.com)

**After Effects-grade motion graphics, in your browser.** Zwoosh is a full-stack
motion-design studio: keyframed layers, shape morphing, text FX, charts, maps —
with instant in-browser WebM export and cloud-saved projects.

## Features

- **Motion editor** — 1280×720 stage, multi-track timeline, keyframe animation
  (position / scale / rotation / opacity) with 10 easings, 64-point shape
  morphing (11 shapes), per-character text FX, number rollers, charts, real
  country maps with border FX, nested clips with speed/transition control.
- **Instant WebM export (client-side)** — deterministic frame-stepped render of
  the exact editor engine into a canvas → MediaRecorder (VP9/VP8). No server,
  no render farm, works offline.
- **Server MP4 render (beta, opt-in)** — HyperFrames pipeline compiles project
  JSON → HTML composition → MP4 streamed back. The `hyperframes` package is
  intentionally NOT a declared dependency (heavy tree, slows deploys): the
  endpoint degrades gracefully to `{rendered:false, hint}` without it. To
  enable: `cd server && npm install hyperframes --ignore-scripts` + a Chromium
  binary on the host. The compile endpoint works regardless.
- **Accounts & cloud projects** — public signup, bcrypt password hashing,
  JWT session cookies, per-user project isolation, Turso (libsql) cloud
  persistence with local SQLite fallback for dev.
- **Security** — rate-limited auth endpoints (20 req / 10 min / IP), strict
  security headers + CSP, password bootstrap endpoint disabled unless
  `ENABLE_ADMIN_HINT=1`.

## Architecture

```
client/   React 19 + Vite — landing, auth, editor, in-browser export engine
server/   Express 4 — auth (JWT cookies), projects API, HyperFrames render
          @libsql/client 0.17 — Turso embedded replica (syncs to cloud primary)
```

| Route | Purpose |
|---|---|
| `POST /api/auth/signup` | Create account (auto-login) — rate limited |
| `POST /api/auth/login` / `logout` / `me` / `change-password` | Session auth |
| `GET/POST/PUT/DELETE /api/projects[/:id]` | Cloud project CRUD (owner-scoped) |
| `POST /api/render/compile` | Project JSON → HyperFrames HTML |
| `POST /api/projects/:id/render` | Server-side MP4 render stream |
| `GET /api/health` | `{ok, db:"turso"|"local"}` |

## Quickstart

```bash
# Server
cd server && npm ci
cp .env.example .env   # set TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET
npm run seed           # creates the admin account (prints password once)
npm start              # http://localhost:8787

# Client (dev)
cd client && npm ci && npm run dev   # http://localhost:5173

# Production: client build is served by the server
cd client && npm run build && cd ../server && npm start
```

Tests — the whole battery (client engine/editor checks, export/render fidelity,
and server integration) runs from the repo root with one command:

```bash
npm test                 # run every suite (auto-discovered)
npm run test:server      # server integration only
npm run test:client      # engine + editor checks only
npm run test:list        # list discovered suites
```

Suites are self-contained Node scripts that exit non-zero on failure; the runner
(`scripts/run-checks.mjs`) orchestrates and aggregates them. CI runs the same
command on every push/PR. See [CONTRIBUTING.md](CONTRIBUTING.md#testing).

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | prod | Turso cloud DB (unset → local SQLite file; must be set together) |
| `JWT_SECRET` | prod | Session signing key (≥32 chars; **boot fails** in production if missing/weak) |
| `NODE_ENV` | prod | `production` enables fail-fast config validation |
| `PORT` | no | Default 8787 |
| `LOG_LEVEL` | no | Structured-log verbosity: `debug`/`info`/`warn`/`error` (default `info`) |
| `SENTRY_DSN` | no | Enables error tracking (no-op unless set **and** `@sentry/node` installed) |
| `METRICS_TOKEN` | no | If set, `GET /metrics` requires `Authorization: Bearer <token>` |
| `ENABLE_ADMIN_HINT` | no | `1` exposes the seeded-admin bootstrap endpoint (dev only; **rejected in production**) |
| `CLIENT_ORIGIN` | no | CORS origin for the client |

Operational endpoints:
- `GET /api/health` — liveness (process is up).
- `GET /api/ready` — readiness (DB reachable; 503 if not). Point load balancers here.
- `GET /metrics` — Prometheus metrics (request rate/errors/duration + process uptime/memory).

## Deploy

- **Docker**: `docker build -t gd-motion . && docker run -p 8787:8787 --env-file server/.env gd-motion`
- **Railway**: `railway.json` included (builds client, starts server).

## Security notes

- Secrets live only in `server/.env` (git-ignored). Never commit credentials.
- Rotate any credential that has ever been shared in chat/tickets.
- Full posture, hardening gaps, and reporting: [SECURITY.md](SECURITY.md).

## Documentation

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System overview, module map, data model, render/export pipelines |
| [AGENTS.md](AGENTS.md) | **Read first before changing code** — frozen-feature contracts, golden rules, regression history |
| [RENDERING.md](RENDERING.md) | Server-side MP4 (HyperFrames) pipeline in depth |
| [ROADMAP.md](ROADMAP.md) | Enterprise-grade roadmap — current-state assessment + prioritized phases |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, testing, code style, PR process |
| [SECURITY.md](SECURITY.md) | Security posture, known gaps, vulnerability reporting |
| [docs/backup-restore.md](docs/backup-restore.md) | Backup/restore runbook — RPO/RTO, drills |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes per release |
