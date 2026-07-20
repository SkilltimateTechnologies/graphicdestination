<!-- Read AGENTS.md before opening a PR that touches the engine, export path, or server routes. -->

## What & why

<!-- One paragraph: what this changes and the motivation. Link the issue. -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking, additive)
- [ ] Behavior change to a **FROZEN** feature (AGENTS.md) — updated the guard check in the same PR
- [ ] Docs / tooling / CI only

## Checklist (AGENTS.md golden rules)

- [ ] `node scripts/run-checks.mjs` is fully green (all suites pass)
- [ ] `cd client && npm run lint` — 0 errors, ≤19 warnings
- [ ] `cd client && npm run build` passes
- [ ] Determinism preserved — no `Date.now()` / unseeded `Math.random()` on any render path
- [ ] Back-compat preserved — old project JSON still renders (no crash on unknown fields)
- [ ] Did NOT touch lockfiles / `.npmrc` / `vendor/` / `Dockerfile` (or explained why below)
- [ ] If I changed a FROZEN behavior, I updated its guard check **and** the AGENTS.md table/regression-history

## Screenshots / recordings

<!-- For any visual change, attach a before/after of the editor or an exported clip. -->
