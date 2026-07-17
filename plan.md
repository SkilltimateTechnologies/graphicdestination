# GraphicDestination.com — SaaS Motion Video Platform
## Execution Plan (Kimi K3 / Orchestrator)

Goal: Turn the Claude-built prototype into a 100% working, professional,
lightweight SaaS video-creation app ("After Effects for the browser"),
pushed to GitHub.

## Stage 1 — Baseline Verification (Orchestrator)
- npm install + build client, boot server, smoke-test auth/API.
- Verify Turso cloud DB connectivity with provided credentials (server/.env, git-ignored).
- Output: known-good baseline + defect list.

## Stage 2 — Architecture Hardening (backend coder subagent)
- Add public signup (username/password, bcrypt, JWT cookie) + validation + rate limiting.
- Gate `/api/auth/admin-hint` behind env flag (never expose in production).
- Health endpoint, graceful Turso fallback to local SQLite, security headers.
- Keep 100% backward compat with existing project JSON schema.
- Output: hardened `server/`.

## Stage 3 — Lightweight Export Engine (frontend coder subagent)
- Client-side export: render timeline to canvas at 60fps deterministic clock,
  capture via MediaRecorder → WebM download (zero server deps = lightweight).
- Keep server MP4 (HyperFrames) as "Pro render" path.
- Output: export module integrated into editor.

## Stage 4 — Professional UI/UX Overhaul (design coder subagent)
- Design system: refined dark theme, Inter typography, consistent spacing,
  professional panel hierarchy (like CapCut/Canva-grade polish, not Google-material).
- Redesign: Landing (marketing-grade hero for GraphicDestination.com),
  Login/Signup, editor shell (top bar, panel docking, timeline polish),
  empty states, toasts, loading states.
- Constraint: DO NOT break editor engine logic — presentation layer only.
- Output: restyled client.

## Stage 5 — Integration, QA, Ship (Orchestrator + verifier)
- Full build, boot, end-to-end smoke: signup → login → create project →
  edit → save → reload → export webm.
- oxlint clean, README refresh (architecture, setup, deploy).
- Commit + push to GitHub (main), secrets never committed.
- Save preview version via website_version_manager.

## Secrets handling
- server/.env holds Turso URL/token + JWT secret (git-ignored, never pushed).
- User advised to rotate all credentials after session.
