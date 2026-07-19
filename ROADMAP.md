# Enterprise Roadmap

**Goal:** take GraphicDestination Motion from a well-built, single-tenant SaaS to
enterprise-grade — reliable, observable, secure, scalable, and sellable to
organizations — **without regressing the deterministic render engine** that is
the product's crown jewel.

This roadmap is honest about what already exists. A lot does. The work below is
mostly *around* the engine (ops, security, scale, org features), not inside it.

---

## Where the codebase stands today (assessment)

| Dimension | Grade | Notes |
|---|---|---|
| Core engine & determinism | **A** | Pure, seeded, one-renderer-three-consumers. The hard part is done and well guarded. |
| Test coverage (logic) | **A−** | ~45 self-contained suites, thousands of assertions, a documented regression history. Missing: browser E2E, visual regression, coverage metrics. |
| Code quality / structure | **A−** | Clean module separation, thoughtful comments, additive server. A few very large files (`kits.js`, `GraphicDestinationMotion.jsx`). |
| Security (app-level) | **B+** | bcrypt, JWT, parameterized SQL, tenant scoping, rate limiting, CSP, upload validation. Gaps: CSRF, MFA, audit log, lockout. |
| CI/CD & quality gates | **B** (was **D**) | Added this batch: GH Actions (lint+build+full battery), Dependabot. Missing: coverage gate, E2E in CI, release automation. |
| Observability | **D** | `console.log` only. No structured logs, error tracking, metrics, tracing, or uptime monitoring. |
| Reliability / ops | **C** | Stateless container, graceful DB fallback. Missing: graceful shutdown, centralized error handler, readiness probe, backups/DR. |
| Scalability | **C−** | Assets stored as base64 in the DB; in-memory (per-instance) rate limiter; no object storage/CDN; no horizontal-scale story. |
| Data & migrations | **C** | Schema evolves via ad-hoc `ALTER`/`PRAGMA`. No migration framework, no backup/restore runbook. |
| Type safety | **C** | Plain JS/JSX (`@types/react` present, no `tsconfig`). Runtime validation on the server is solid; no static types. |
| Enterprise/org features | **D** | Single-user accounts only. No teams, SSO, RBAC, billing, quotas, or admin console. |
| Accessibility & i18n | **D** | Not yet addressed. |
| Governance docs | **A** (was **C**) | Added this batch: SECURITY, CONTRIBUTING, ARCHITECTURE, CHANGELOG, LICENSE, templates. |

Effort key: **S** ≈ ≤2 days · **M** ≈ ≤2 weeks · **L** ≈ ≤1 quarter.

---

## Guiding principles

1. **Never regress a FROZEN feature** (AGENTS.md). Every engine/export/editor
   change ships with its guard check updated in the same PR.
2. **Additive over invasive.** Prefer new modules/routes to restructuring
   `index.js`, `StageObject.jsx`, or the engine.
3. **Ship the gate before the feature.** Observability and CI gates come before
   the features that need watching.
4. **Determinism is sacred.** Anything on a render path stays a pure function of
   `t`.

---

## Phase 0 — Foundation (✅ shipped in this batch)

- ✅ Unified test runner (`scripts/run-checks.mjs`) — one command runs the whole
  battery; auto-discovers new suites.
- ✅ CI: lint + build + full battery on every push/PR; advisory dependency audit.
- ✅ Dependabot (client, server, actions, docker).
- ✅ Governance: SECURITY, CONTRIBUTING, ARCHITECTURE, CHANGELOG, LICENSE, PR &
  issue templates, `.editorconfig`.

---

## Phase 1 — Production hardening (P0, next ~4–6 weeks)

The "if this is live, do these first" list.

| # | Item | Effort | Status | Why |
|---|---|---|---|---|
| 1.1 | **Structured logging** — zero-dep JSON logger (`server/logger.js`); per-request `request_id`; secret redaction. | S | ✅ done | Nothing is debuggable in prod without it. Prereq for everything else in this phase. |
| 1.2 | **Error tracking** — Sentry (or equivalent) on client + server; source maps uploaded on build. | S | ⬜ | Catch the regressions AGENTS.md keeps warning about, in the field. |
| 1.3 | **Centralized Express error handler + graceful shutdown** — one error middleware (no stack leaks, preserves body-parser status), `SIGTERM` drain, uncaught-rejection guard. | S | ✅ done | An unhandled route error could crash or leak. |
| 1.4 | **Readiness vs liveness probes** — `/api/health` (liveness) + `/api/ready` (DB reachable). | S | ✅ done | Prevents routing traffic to a booting/broken instance. |
| 1.5 | **CSRF protection** — double-submit token (or origin check) on state-changing routes, layered on the existing `sameSite=lax`. Needs a coordinated client change. | S | ⬜ | Closes the one notable app-security gap for cookie auth. |
| 1.6 | **Secrets & config validation at boot** — fail fast if `JWT_SECRET` unset/weak in `NODE_ENV=production` (`server/config.js`). | S | ✅ done | The ephemeral-secret fallback is a dev convenience that must never silently run in prod. |
| 1.7 | **Uptime + latency monitoring** — external probe (BetterStack/Pingdom) + basic RED metrics (`prom-client` `/metrics`). Access logs already emit per-request latency. | S | ⬜ | Know about downtime before customers report it. |
| 1.8 | **Backup & restore runbook for Turso** — scheduled dumps, a tested restore drill, documented RPO/RTO. | M | ⬜ | User projects are the business. No backup = no enterprise. |

**Progress:** 4 / 8 shipped (1.1, 1.3, 1.4, 1.6). Remaining before this phase
closes: error tracking (1.2), CSRF (1.5), monitoring (1.7), backups (1.8).

**Exit criteria:** an on-call engineer can detect, diagnose, and recover from a
production incident using logs, error reports, metrics, and a restore runbook.

---

## Phase 2 — Scale & data integrity (P1, ~6–10 weeks)

| # | Item | Effort | Why |
|---|---|---|---|
| 2.1 | **Move assets to object storage** — S3/R2/Cloudflare Images; keep only metadata + URLs in the DB; signed URLs for share scope. | M | Base64-in-DB caps asset size, bloats rows, and blocks CDN delivery. Biggest scale blocker. |
| 2.2 | **Migration framework** — replace ad-hoc `ALTER`/`PRAGMA` with versioned, ordered migrations (a tiny runner is fine; libsql-compatible). | M | Ad-hoc schema changes don't survive multiple environments or rollbacks. |
| 2.3 | **Distributed rate limiting** — move the in-memory limiter to a shared store (Redis/Upstash) so limits hold across replicas. | S | Current limiter is per-instance; horizontal scale defeats it. |
| 2.4 | **CDN + cache headers** — front the static client and public share assets with a CDN; tune cache-control. | S | Latency + egress cost. |
| 2.5 | **Horizontal-scale readiness** — confirm statelessness end-to-end (sessions ✓, rate limiter → 2.3, assets → 2.1), document the scale-out topology. | S | Turns "one box" into "N boxes behind a LB". |
| 2.6 | **Payload & abuse limits review** — per-route body limits, project-JSON size cap, per-user project quota, request timeouts. | S | Today only assets/settings are capped; a giant project JSON is unbounded. |
| 2.7 | **Server-render at scale** — move HyperFrames render to a job queue + worker pool with a real Chromium image; status polling; the `hyperframes cloud` path noted in RENDERING.md. | L | Synchronous in-request rendering won't survive real usage. |

**Exit criteria:** the service runs on ≥2 stateless replicas behind a load
balancer, assets are on object storage + CDN, and schema changes are versioned
and reversible.

---

## Phase 3 — Security & compliance (P1, parallel with Phase 2)

| # | Item | Effort | Why |
|---|---|---|---|
| 3.1 | **Audit log** — persist security-relevant events (login, password change, share enable/disable, project/asset delete) with actor, IP, timestamp. | M | Table stakes for enterprise procurement and incident forensics. |
| 3.2 | **Account protection** — progressive lockout / exponential backoff on failed logins; optional **MFA (TOTP)**; breached-password check. | M | Rate limiting alone doesn't stop targeted credential attacks. |
| 3.3 | **SAST + secret scanning in CI** — CodeQL, `gitleaks`; promote `npm audit` from advisory to a hard high-severity gate. | S | Automated security regression prevention. |
| 3.4 | **Session hardening** — short-lived access token + rotating refresh; server-side revocation (logout-all, force-logout on password change). | M | JWTs today can't be revoked before 7-day expiry. |
| 3.5 | **Data lifecycle & privacy** — account deletion (GDPR erasure), data export, retention policy; Privacy Policy + ToS. | M | Legal prerequisite to selling to orgs / operating in the EU. |
| 3.6 | **Penetration test + threat model** — one external pentest; a documented STRIDE threat model kept with SECURITY.md. | M | Independent assurance before enterprise GA. |

**Exit criteria:** a security questionnaire from an enterprise buyer can be
answered "yes" across auth, audit, data lifecycle, and testing.

---

## Phase 4 — Multi-tenant & enterprise product (P2, ~1–2 quarters)

| # | Item | Effort | Why |
|---|---|---|---|
| 4.1 | **Teams / organizations / workspaces** — org entity, membership, project ownership at the org level, invitations. | L | The single biggest unlock for B2B revenue. |
| 4.2 | **RBAC** — roles beyond `user`/`admin` (owner, editor, viewer, billing); per-resource permissions; real-time or comment-based collaboration later. | L | Enterprises buy seats and control. |
| 4.3 | **SSO / SAML / SCIM** — enterprise identity (Okta/Azure AD), directory-synced provisioning. | L | Hard requirement in enterprise procurement. |
| 4.4 | **Billing & plans** — Stripe subscriptions, plan-based quotas (projects, assets, render minutes, seats), usage metering. | L | Monetization + quota enforcement. |
| 4.5 | **Admin console** — org/user management, usage dashboards, feature flags, impersonation-with-audit for support. | M | Operate and support customers at scale. |
| 4.6 | **API + webhooks** — documented public REST API (OpenAPI spec), API keys, webhooks for render-complete. | M | Integrations and platform stickiness. |

**Exit criteria:** an organization can self-serve sign up, invite a team with
roles, authenticate via SSO, and be billed per plan.

---

## Phase 5 — Quality, performance & reach (P2/P3, ongoing)

| # | Item | Effort | Why |
|---|---|---|---|
| 5.1 | **Browser E2E in CI** — Playwright smoke of the critical paths (sign up → edit → export → share) on every PR. | M | Logic checks are excellent; the actual browser flow is untested. |
| 5.2 | **Visual regression for the renderer** — golden-frame diffing so pixel drift in `StageObject` is caught automatically. | M | The engine is the product; protect its output, not just its math. |
| 5.3 | **Coverage metrics** — instrument the battery, publish a coverage number, set a floor. | S | Make the (already high) coverage visible and non-regressing. |
| 5.4 | **TypeScript migration (incremental)** — start with `engine/` and `api.js`; `checkJs` + JSDoc as a bridge; strict on new files. | L | Static safety on a large, fast-moving codebase. |
| 5.5 | **Bundle & runtime performance** — code-split the editor, lazy-load `mapdata.js` (154 KB) and heavy panels, budget the bundle in CI. | M | First-load and low-end-device experience. |
| 5.6 | **Accessibility (WCAG 2.1 AA)** — keyboard nav, focus management, ARIA on editor controls, contrast audit. | M | Enterprise + public-sector requirement. |
| 5.7 | **Internationalization** — externalize strings, locale routing. | M | International reach. |
| 5.8 | **Large-file refactors** — split `kits.js` (2k lines) and `GraphicDestinationMotion.jsx` (2k lines) behind their existing guard checks. | M | Maintainability; do only with green checks before/after. |
| 5.9 | **Storybook for panels** — isolate the 12 editor panels for visual dev + review. | M | DX + design consistency. |

---

## Definition of "enterprise-grade"

The product is enterprise-grade when all of the following are true:

- **Observable:** every request is traceable; errors auto-reported; RED metrics
  and uptime alerting are live.
- **Reliable:** ≥2 stateless replicas, tested backups with a stated RPO/RTO,
  graceful shutdown, health/readiness probes.
- **Secure:** audit log, MFA available, lockout, revocable sessions, SAST +
  secret scanning + a passed pentest, data export/erasure.
- **Scalable:** assets on object storage + CDN, distributed rate limiting,
  versioned migrations, queued server rendering.
- **Multi-tenant:** orgs, RBAC, SSO/SCIM, billing with quotas, admin console.
- **Quality-gated:** lint + build + full battery + E2E + visual regression +
  coverage floor all green in CI, on every PR.
- **Accessible & documented:** WCAG 2.1 AA, OpenAPI API docs, runbooks.

---

## Immediate next 5 (highest value / lowest risk)

1. **1.1 Structured logging + 1.2 error tracking** — you can't operate blind.
2. **1.6 Boot-time config validation** — make the prod-secret fallback impossible.
3. **1.3 Central error handler + graceful shutdown** — stop crashes/leaks.
4. **1.8 Backup & restore runbook** — protect customer data now.
5. **2.1 Assets → object storage** — remove the hardest scale ceiling.

All five are additive, none touch the render engine, and each ships behind the
CI gate added in Phase 0.
