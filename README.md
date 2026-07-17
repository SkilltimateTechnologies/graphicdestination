# Graphic Destination — Motion

A real, deployable full-stack app: public landing page → login → the motion
editor gated behind auth. Backend uses `@libsql/client` (Turso's driver),
project data persists in a real database, and passwords are bcrypt-hashed
behind JWT session cookies.

## What's actually running right now

This was built and tested inside a sandboxed environment with **no access to
a real Turso cloud account**, so it currently runs against a local SQLite
file using the exact same `@libsql/client` API Turso uses. That's not a
placeholder or a mock — it's the real database layer, genuinely tested
end-to-end (auth, sessions, project CRUD, ownership isolation — see
"What was tested" below). Pointing it at a real Turso database is a
two-environment-variable change, described below.

## Project layout

```
server/   Express API — auth, sessions, Turso-backed project storage
client/   Vite + React — landing page, login, protected editor
```

## Local setup

```bash
# 1. Server
cd server
npm install
npm run seed        # creates the admin account, prints + saves its password
npm start            # http://localhost:8787

# 2. Client (separate terminal)
cd client
npm install
npm run dev           # http://localhost:5173 (proxies API calls to :8787)
```

Visit `http://localhost:5173`. The login page shows the freshly-generated
admin username/password in a banner until you change the password once.

## Connecting a real Turso database

1. Create a database with the [Turso CLI](https://docs.turso.tech) or dashboard:
   ```bash
   turso db create graphic-destination
   turso db show graphic-destination        # gives you the URL
   turso db tokens create graphic-destination  # gives you an auth token
   ```
2. In `server/.env`, uncomment and fill in:
   ```
   TURSO_DATABASE_URL=libsql://graphic-destination-yourorg.turso.io
   TURSO_AUTH_TOKEN=eyJ...
   ```
3. Restart the server. It will log `Database: Turso cloud (embedded replica)`
   instead of the local-file message — no other code changes needed. The
   server keeps a local synced replica file for fast reads; writes sync to
   your real Turso primary.
4. Run `npm run seed` once against the new database to create the admin user.

## Rendering to real MP4

There's a real HyperFrames-based export pipeline in `server/hyperframes/`
— project JSON in, actual MP4 out, verified end-to-end (not just
theoretically wired up). **See `RENDERING.md`** for exact scope (what's
fully animated vs. rendered as a placeholder in v1), the real test
evidence, and the one environment-specific setup step it needs
(a headless Chromium binary — auto-detected where possible).

Quick start once the server is running:
```bash
# in server/, once:
npm install hyperframes --ignore-scripts

# then, authenticated:
curl -b cookies.txt -X POST http://localhost:8787/api/projects/1/render -o out.mp4
```

## Deploying (e.g. Railway)

- Build the client (`cd client && npm run build`) — the server automatically
  serves `client/dist` as static files and handles client-side routing, so
  **one Railway service runs both** frontend and backend.
- Set the environment variables from `server/.env.example` in Railway's
  dashboard (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`,
  `NODE_ENV=production`, `CLIENT_ORIGIN=<your Railway domain>`).
- Start command: `node server/index.js` (after the client build step runs).
- Run `npm run seed` once (Railway shell, or a one-off job) against the
  production database to create the admin account.

## ⚠️ Security — read before real use

- **The admin-hint banner is a bootstrap convenience, not a production
  feature.** `/api/auth/admin-hint` returns the plaintext password of a
  freshly-seeded admin account so it can be shown on the login page, exactly
  as requested for this first pass. It **automatically stops returning data**
  the moment the admin password is changed (the endpoint checks whether the
  bootstrap credentials file still exists, and that file is deleted by
  `/api/auth/change-password`). **Change the admin password immediately
  after your first login**, before this is exposed anywhere real.
- `JWT_SECRET` in `server/.env` was randomly generated for this delivery.
  Generate a new one for your own deployment:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- There's currently one role (`admin`) and no signup flow — this is a
  single-tenant admin tool, not a multi-user product, unless you extend it.
- Cookies are `httpOnly` + `sameSite=lax`; `secure` is auto-enabled when
  `NODE_ENV=production`, which requires HTTPS (Railway gives you this by
  default).

## What was tested

Before delivery, I ran real integration tests against the live server
(not just read through the code):
- Protected routes 401 without a session, 200 with a valid one
- Wrong password rejected, correct password issues a working session cookie
- Full project CRUD round-trips through the database with data integrity
  intact, and a project is invisible to requests without the owning user's
  session (ownership isolation)
- Changing the password invalidates the old password and the admin-hint
  banner permanently disables itself
- The built client is correctly served by Express, client-side routes
  fall back to `index.html`, unknown `/api/*` paths still 404 as JSON
  rather than being swallowed by the SPA fallback, and static assets load
- **Rendering**: the HyperFrames compiler's output was validated against
  HyperFrames' own `lint` tool (0 errors), and a real MP4 was rendered
  end-to-end through the actual HTTP API (login → create project →
  render → real `video/mp4` file, dimensions/duration/codec confirmed
  with `ffprobe`) — not just the CLI in isolation. Full detail in
  `RENDERING.md`.

## Extending

`client/src/components/GraphicDestinationMotion.jsx` is the full editor —
identical to what was iterated on in chat. `client/src/api.js` has
`createProject` / `listProjects` / `getProject` / `updateProject` ready to
wire into the editor's Save/Load UI in place of (or alongside) the existing
copy-paste JSON flow.
