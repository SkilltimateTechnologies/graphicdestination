# Contributing to GraphicDestination Motion (Zwoosh)

Thanks for working on this codebase. **Read [AGENTS.md](AGENTS.md) first** — it
documents features that were 100% working and got accidentally broken, and the
guardrails that now protect them. Everything below operationalizes those rules.

## Prerequisites

- **Node.js ≥ 20** (`engines` field enforces this). The whole toolchain is
  vanilla Node + npm — there is no global build tool to install.
- No database needed for local dev: with `TURSO_*` unset the server uses a local
  SQLite file (`server/data/app.db`).

## First-time setup

```bash
# from the repo root
npm run install:all           # installs client + server deps

# server
cd server
cp .env.example .env          # set JWT_SECRET; leave TURSO_* blank for local SQLite
npm run seed                  # creates the admin account (prints the password ONCE)
npm start                     # http://localhost:8787

# client (separate terminal, hot reload)
cd client
npm run dev                   # http://localhost:5173
```

## The golden rules (from AGENTS.md)

1. **Determinism is load-bearing.** Every visual is a pure function of timeline
   time. No `Date.now()`, no unseeded `Math.random()` — use
   `client/src/engine/random.js` (mulberry32). The export path re-renders the
   same frames deterministically; nondeterminism = broken exports.
2. **Run the full check battery before delivering.** `node scripts/run-checks.mjs`
   must be fully green. If a change intentionally alters behavior, update the
   guard check in the *same* change — never delete a failing assertion to go
   green.
3. **Lint budget:** 0 errors, ≤ 19 warnings. Build must pass.
4. **Back-compat:** old project JSON must keep rendering. Map legacy ids/props;
   never crash on unknown fields.
5. **Do not touch** lockfiles, `.npmrc`, `vendor/`, or `Dockerfile` — they are
   deploy-critical and hardened against Railway/registry failures.

## Testing

The verification battery is dozens of self-contained Node scripts (no test
framework). One command runs them all:

```bash
npm test                      # everything: client checks + export + server
npm run test:client           # engine + editor unit checks only
npm run test:export           # export/render fidelity only
npm run test:server           # API/auth/assets/share/settings only
npm run test:list             # list discovered suites without running
node scripts/run-checks.mjs --filter timeline   # one suite by name
node scripts/run-checks.mjs --bail              # stop at first failure
```

New suites are auto-discovered: any `client/check-*.mjs`,
`client/src/export/test-*.mjs`, `client/src/lib/*.check.mjs`, or
`server/test-*.mjs` is picked up with no registration step.

**When you add or change behavior, add or update its guard check** in the same
PR. A feature with engine support but no test is one refactor away from silent
regression — that is exactly the history AGENTS.md exists to stop.

## Code style

- ES modules everywhere (`"type": "module"`). React 19 function components.
- Match the surrounding file's conventions: comment density, naming, idiom.
- Keep the engine modules pure (`client/src/engine/`) — no DOM, no I/O, no clock.
- Server routes are **additive** — extend `server/index.js`, don't restructure it.
- Lint: `cd client && npm run lint` (oxlint).

## Branching & PRs

- Branch off `main`; open a PR against `main`.
- Fill in the PR template (it mirrors the golden-rule checklist).
- CI must be green: lint, build, and the full test battery all run on every PR.
- For any visual change, attach a before/after of the editor or an exported clip.

## Commit messages

- Present-tense, scope-first where it helps (`export:`, `timeline:`, `server:`).
- Reference the guard check you added/updated when changing frozen behavior.

## Where things live

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full module map. Quick pointers:

- Engine (pure): `client/src/engine/`
- The one renderer: `client/src/components/StageObject.jsx`
- Editor state owner: `client/src/components/GraphicDestinationMotion.jsx`
- Export pipeline: `client/src/export/`
- Server: `server/index.js` (routes), `server/auth.js`, `server/db.js`
- Server-side render: `server/hyperframes/`
