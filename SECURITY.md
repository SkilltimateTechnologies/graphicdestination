# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Email **skilltimate.studio@gmail.com** with:

- a description of the issue and its impact,
- steps to reproduce (a minimal project JSON or request sequence is ideal),
- any suggested remediation.

You will get an acknowledgement within **3 business days** and a resolution
target once the report is triaged. Please give us a reasonable window to ship a
fix before any public disclosure.

## Supported versions

The `main` branch and the current production deployment are supported. There are
no maintained back-branches; fixes land on `main` and roll out via redeploy.

## What the app already does (current posture)

| Area | Control |
|---|---|
| Passwords | bcrypt, cost factor 12 (`server/auth.js`) |
| Sessions | JWT in an `httpOnly`, `sameSite=lax` cookie; `secure` in production; 7-day expiry |
| Transport | `secure` cookies + HSTS-friendly deploy assumed behind TLS |
| Auth abuse | sliding-window rate limiter, 20 req / 10 min / IP on login+signup (`server/ratelimit.js`) |
| Injection | all SQL uses parameterized `db.execute({ sql, args })` — no string interpolation |
| Tenant isolation | every project/asset query is scoped by `owner_id = req.user.sub` |
| Upload safety | MIME allowlist + per-kind decoded-byte caps (img 3 MB / audio 5 MB) + per-user quota |
| Share links | 96-bit URL-safe tokens; public asset serving is scoped to assets the shared project actually references |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, strict `Content-Security-Policy` |
| Secrets | only in `server/.env` (git-ignored); `JWT_SECRET` required in prod |
| Bootstrap admin | plaintext hint endpoint exists only when `ENABLE_ADMIN_HINT=1` and self-deletes on first password change |

## Known hardening gaps (tracked in ROADMAP.md → Security & Compliance)

These are documented, not hidden:

- **No CSRF token.** State-changing requests rely on `sameSite=lax` + cookie
  auth. Adequate for now; a double-submit token is planned before enterprise GA.
- **No account lockout / MFA.** Rate limiting only. MFA + progressive lockout are
  on the roadmap.
- **No audit log.** Security-relevant events (login, password change, share
  enable/disable, deletes) are not yet persisted.
- **In-memory rate limiter.** Per-instance; does not coordinate across replicas.
  A shared store (Redis) is needed before horizontal scale-out.
- **No automated dependency gate.** `npm audit` runs advisory-only in CI today;
  Dependabot is configured (`.github/dependabot.yml`).

## Operational hygiene

- Rotate any credential ever shared in chat, tickets, or screenshots.
- Delete `server/data/admin-credentials.json` (or change the admin password once,
  which deletes it automatically) before any real deployment.
- Never commit `.env`, lockfile edits from untrusted mirrors, or real tokens.
