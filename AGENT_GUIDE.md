# Graphic Destination — Motion: Agent Guide

This document is written for another AI coding agent (Claude Code, Cursor,
etc.) picking up this codebase with no other context. It describes what
exists, how the pieces fit together, and the conventions to follow when
extending it. It does not describe aspirational features — everything below
is implemented and was tested against the running app.

## 1. What this is

A gated, single-tenant motion graphics editor: a public landing page, a
login page, and a full "lightweight After Effects" web editor behind auth.
Two deployables in one repo, one process in production (Express serves both
the API and the built React app).

```
server/   Express API — auth, sessions, Turso-backed project storage,
          HyperFrames rendering (server/hyperframes/ — see RENDERING.md)
client/   Vite + React — landing page, login, protected editor
```

**Rendering (real MP4 export) has its own doc: `RENDERING.md`.** It covers
the compiler's exact scope, real test evidence (linted against
HyperFrames' own tooling, actual rendered MP4s verified with `ffprobe`),
and the one environmental dependency (headless Chrome) in detail — read it
before touching `server/hyperframes/`.

## 2. Runtime architecture

- **One Node process** (`server/index.js`) serves `/api/*` routes AND the
  built client (`client/dist`) as static files, with a catch-all that
  returns `index.html` for any non-`/api` path (client-side routing).
- **Client-side routing** via `react-router-dom` (`client/src/App.jsx`):
  `/` (landing, public), `/login` (public), `/editor` (protected).
- **Auth is enforced server-side on every protected API call**, not just by
  hiding the client route. `requireAuth` middleware (`server/auth.js`)
  checks a JWT in an httpOnly cookie on every `/api/projects*` and
  `/api/auth/me` request. The client's `ProtectedRoute` component is a UX
  convenience (redirect to `/login` if not authed), not the actual security
  boundary.
- **Session mechanism**: JWT signed with `JWT_SECRET`, stored in an
  `httpOnly`, `sameSite=lax` cookie named `gd_session` (7-day expiry). No
  server-side session table — the JWT itself is the source of truth
  (`{ sub: userId, username, role }`).

## 3. Database (Turso / libSQL)

`server/db.js` creates a `@libsql/client` connection. Two modes, selected
automatically by env vars:

- **`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` both set** → embedded-replica
  mode: local file at `server/data/app.db` syncs with a real Turso cloud
  primary (`syncInterval: 60` seconds). This is production.
- **Neither set** → plain local SQLite file at the same path, no network.
  This is what's running by default in dev/sandbox. **Same client API
  either way** — no code branches on this elsewhere in the app.

`usingTurso` (exported boolean) tells you which mode is active; it's only
used for the startup log line.

### Schema (`initSchema()` in `db.js`, idempotent `CREATE TABLE IF NOT EXISTS`)

```sql
users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,       -- bcrypt, cost 12
  role TEXT NOT NULL DEFAULT 'admin',
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)

projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  data TEXT NOT NULL,                -- JSON.stringify'd project (see §6)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
-- idx_projects_owner ON projects(owner_id)
```

There is currently **one role** (`admin`) and no signup flow. Adding roles
or multi-tenancy means: add a `role` check in `requireAuth` or a new
middleware, and decide whether `projects.owner_id` scoping is still correct
(currently every query filters `WHERE owner_id = ?`, which is the isolation
boundary — preserve that pattern for any new resource table).

## 4. API contract (`server/index.js`)

All routes are JSON in/out. Protected routes require the `gd_session`
cookie (send with `credentials: "include"` / `fetch` default in same-origin
dev via the Vite proxy, or explicit CORS + credentials cross-origin).

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/login` | — | `{username, password}` | `{username, role, mustChangePassword}` + sets cookie |
| POST | `/api/auth/logout` | — | — | `{ok: true}`, clears cookie |
| GET | `/api/auth/me` | ✓ | — | `{username, role}` |
| POST | `/api/auth/change-password` | ✓ | `{newPassword}` (min 8 chars) | `{ok:true}`; deletes the bootstrap credentials file as a side effect |
| GET | `/api/auth/admin-hint` | — | — | `{active:false}` OR `{active:true, username, password, createdAt}` — see §5 |
| GET | `/api/projects` | ✓ | — | `[{id, name, updated_at, created_at}]` (no `data`, list view) |
| GET | `/api/projects/:id` | ✓ | — | `{id, name, data, updatedAt}` (`data` parsed back to an object) — 404 if not owned by caller |
| POST | `/api/projects` | ✓ | `{name, data}` | `{id}` |
| PUT | `/api/projects/:id` | ✓ | `{name?, data?}` (either optional) | `{ok:true}` — 404 if not owned by caller |
| DELETE | `/api/projects/:id` | ✓ | — | `{ok:true}` — 404 if not owned by caller |
| POST | `/api/render/compile` | ✓ | `{project}` | `{html, warnings}` — compiles any project JSON to a HyperFrames composition; always works, no Chrome needed |
| POST | `/api/projects/:id/render` | ✓ | `{fps?, quality?}` | On success: streams back `video/mp4`. On failure: `200 {rendered:false, reason, hint, warnings, html}` — see RENDERING.md |

`client/src/api.js` wraps all of these (`api.login`, `api.listProjects`,
etc.) — use that instead of raw `fetch` from client code.

## 5. Auth bootstrap flow (the "admin hint" system)

`server/seed.js` (`npm run seed` in `server/`) creates exactly one admin
user if none exists (checks `SELECT id FROM users WHERE role='admin' LIMIT
1` first — running it twice is a safe no-op). It generates a random
16-character password (`generateStrongPassword` in `auth.js`), bcrypt-hashes
it into the DB, and **also** writes the plaintext to
`server/data/admin-credentials.json`.

`GET /api/auth/admin-hint` reads that file and returns it unauthenticated —
this is intentionally how the login page shows first-run credentials. The
file (and thus the endpoint's `active` flag) is deleted automatically inside
`POST /api/auth/change-password`. **This means**: the hint is only ever live
between seeding and the first password change. Any new "bootstrap this
resource and show credentials" feature should follow the same pattern
(write a marker file, delete it once the resource is claimed/secured) rather
than leaving a permanent unauthenticated data-exposing endpoint.

## 6. The editor's data model

This is the part most worth understanding before making changes —
`client/src/components/GraphicDestinationMotion.jsx` is a single ~3000-line
file (all previous chat-session part-files concatenated; there is no
internal module boundary, just section comments). Everything below refers
to identifiers that exist verbatim in that file.

### 6.1 Project document shape

A project is `{ app, v, stage: {w, h, dur, bg}, brands, brandId, objects }`.
`objects` is a flat array of **layer** objects (see below); `clip`-type
layers additionally have a `children` array of the same shape (recursive —
clips can nest).

### 6.2 Layer object shape

Every layer, regardless of `type`, has this base shape (`makeObject()`):

```js
{
  id, type, name, tracks: {}, locked: false, hidden: false,
  props: {
    x, y, scale, rotation, opacity, fill, w, h,
    inT: 0, outT: null,   // this layer's active window on the parent timeline
    path: null, prog: 0,  // optional motion path (see §6.5)
  }
}
```

`type` is one of: `shape`, `text`, `image`, `number`, `map`, `world`,
`continent`, `chart`, `confetti`, `clip`. Each adds its own fields to
`props` in `makeObject()` — read that function directly for the current
field list per type rather than trusting a summary, since it's the single
source of truth and gets extended over time.

### 6.3 Keyframes (`tracks`)

`tracks` is `{ [propName]: [{t, v, ease}, ...] }`, sorted by `t`.
`KF_PROPS = ["x","y","scale","rotation","opacity","fill","prog","focus"]`
are the properties that can be keyframed this way; `shape` (for morphing)
is also keyframed but handled by a separate resolver (`morphPtsAt`).

- `valueAt(obj, prop, time)` — generic interpolator for any track.
- `colorAt(obj, "fill", time)` — same, but interpolates hex colors via
  `lerpColor`.
- `withKeyframe(track, t, v, ease)` — **important**: if a keyframe already
  exists at `t` and `ease` is omitted, it preserves the existing easing
  rather than resetting to a default. This was a real bug fixed mid-session
  (dragging used to silently overwrite easing); don't reintroduce it.
- Editing goes through `editProp(id, prop, v)` in the app component, not
  direct track mutation: if `Animate` (the `autokey` state) is on, it writes
  a keyframe at the playhead; if off and a track already exists, it offsets
  the whole track by the delta (moves the animation without adding a key);
  if off and no track exists, it's a plain static edit. Any new
  keyframeable property should route through this same function.

### 6.4 Easing (`EASE` object, 11 total)

`linear, easeOutQuad, easeInQuad, easeInOutCubic, easeOutCubic, easeInCubic,
easeOutBack, easeOutElastic, easeOutBounce, easeInOutSine, softSpring`.
`easeInOutSine` and `softSpring` are the "Apple-style" pair added for
restrained/spring motion — used by the `softRise`/`gentlePop` presets and
offered wherever a shortened ease picker appears (e.g. number-roller easing,
world/continent zoom transitions).

### 6.5 Shapes and morphing

`SHAPE_DEFS` (11 shapes: `rect, ellipse, triangle, diamond, pentagon,
hexagon, star, heart, arrow, cross, bolt`) each store a **64-point outline**
(`N_PTS = 64`), resampled via `samplePoly`/`alignPts` so every shape has the
same point count and consistent winding/start-point. This is what makes
morphing work: `morphPtsAt(obj, time)` just linearly interpolates between
two shapes' point arrays keyframe-to-keyframe — there's no special-cased
morph logic per shape pair. Rounded rectangles (`cornerR` prop) are
generated on demand (`roundedRectPts`, cached in `_rrCache`) and still
morph correctly since they're resampled to the same 64 points.

**Rule for adding a new shape**: its point array must go through
`samplePoly`/`alignPts` at 64 points too, or it will morph incorrectly
(interpolating between mismatched point indices).

### 6.6 Motion paths

`props.path = { pts: [[x,y],...], curved: bool, closed: bool, show: bool }`.
`pointOnPath(path, u)` (u ∈ [0,1]) walks the path — straight segments or
Catmull-Rom-interpolated (`crSample`) if `curved`. `props.prog` is a
keyframeable track (0→1) driving `u`. When `path` is set, it **overrides**
`x`/`y` for positioning (`posOf()` checks `obj.props.path` first). Text
layers additionally support `pathMode: "flow"` (characters laid along the
curve via SVG `<textPath>`) vs `"travel"` (the text block rides the path as
a rigid unit, default for non-text).

### 6.7 Clips (nested compositions)

`type: "clip"` layers have `children` (same layer-array shape) and their
own local timeline: `props.start, dur, speed, end` (`"hold"|"hide"|"loop"`),
plus `tIn/tOut/tDur` (transition in/out — `TRANSITIONS`: `none, fade,
slideU, slideD, slideL, slideR, zoom, zoomOut`), and a full-canvas
background (`bg`). `clipLocalTime(props, parentTime)` maps parent
time → local time (`null` if outside the window and `end !== "hold"`/`loop`
doesn't apply). The app's `path` state (array of clip ids) tracks which
clip you're "inside" for editing — `resolvePath()` walks it to get the
current `ctxLayers`/`ctxDur`. All mutation functions (`patchObject`,
`setKeyframe`, etc.) operate on `ctxLayers`, i.e. they're automatically
scoped to whichever clip you're editing.

### 6.8 Maps: three distinct systems, deliberately sharing code where geometry allows

- **`type: "map"`** — one of 10 curated countries in `MAPS` (hand-picked,
  simplified from `johan/world.geo.json`, normalized to a 100-unit box per
  country). Border-effect styles: `plain, draw, comet, neon, reveal, pulse`.
- **`type: "world"`** — all 176 countries in `WORLD` (same source dataset,
  bulk-simplified, shared coordinate space 0–200 × `WORLD_H`).
  `props.hi` is an array of highlighted countries, each
  `{cc, t, out?, zoom?, zoomIn?, zoomOut?}` — **four independent timeline
  points** (appear/hide/zoom-in/zoom-out), normalized via `normHi()` and
  resolved via `worldZoomWindow(h, P)` which supplies sensible auto-fallback
  values for any point left unset (zoomIn defaults to `t`, zoomOut defaults
  to `out` or `t + zoomHoldMs`). `worldCameraAt(P, time, fallbackCenter?)`
  computes a weighted-blend camera position/zoom-level across all active
  highlights (smooth pan between overlapping/adjacent highlights instead of
  snapping to overview between them) — reused verbatim by continent maps.
- **`type: "continent"`** — `CONTINENTS` maps 6 region keys (`AFRICA, ASIA,
  EUROPE, "NORTH AMERICA", "SOUTH AMERICA", OCEANIA`) to arrays of ISO3
  codes, covering 174 of the 176 `WORLD` countries (2 left unassigned as
  ambiguous transcontinental/edge cases rather than guessed). A continent's `d` (SVG path) is just
  the **concatenation** of its member countries' already-real `WORLD_D`
  paths — no polygon union/geometry fabrication. Its highlight system
  (`props.hi`) is the *same* `worldCameraAt`/`worldZoomWindow` machinery as
  the world map, just called with a `fallbackCenter` (the continent's own
  bbox center, not the globe's) and `hi` pre-filtered to that continent's
  codes.
- **Shared rendering**: `MapEffectPaths` (defs + effect layers for a given
  `d`/`P`/`time`) is the inner fragment reused by both the standalone `map`
  wrapper (`MapEffectShape`) and inlined directly inside the `world`/
  `continent` branches (which need their own `<svg>`/zoom-transform wrapper
  around it). If you add a new border-effect style, add it inside
  `MapEffectPaths` once and all three map types get it automatically.
- **Geometry provenance**: all coordinates trace back to a real public
  GeoJSON dataset (`johan/world.geo.json`), Douglas-Peucker-simplified and
  equirectangular-projected by a one-time build script (not present in this
  repo — it produced the embedded `MAPS`/`WORLD`/`WORLD_H`/`CONTINENTS`
  constants near the top of the file). Nothing is hand-drawn or fabricated.
  Do not hand-edit coordinate arrays; regenerate from source data if you
  need different simplification levels.

### 6.9 Charts

`type: "chart"`, `props.dataStr` is user-typed `"Label, value"` lines,
parsed by `parseChart()` (splits on `,`/`:`, last token is the numeric
value). `chartType: "bar"|"line"|"donut"`. Rendering is pure SVG generated
inline in `StageObject` at render time from the parsed data — there's no
persisted "computed" chart shape, so changing `dataStr` is always live.

### 6.10 Number rollers

`type: "number"`, three `style` values: `odometer` (mechanical digit-wheel
cascade — see `numberColumns()`, each higher digit only turns while the one
below sweeps 9→0, this was specifically unit-tested for correctness),
`count` (simple animated number text), `slot` (slot-machine spin-down per
digit). `ring`/`pie` (`props.ring: "none"|"ring"|"pie"`) overlay a circular
progress indicator that **depletes** instead of fills when `to < from`
(countdown-timer behavior is automatic from the direction of the range, not
a separate flag).

### 6.11 Text effects

`props.textFx = {type, start, seed, speed?}` — per-character effects
(`typewriter, rise, pop, fall, tracking, scramble, wave`), computed by
`charFx()`, purely a function of `(fx, charIndex, totalChars, time, char)`.
`speed` (default 1) scales the stagger/duration. **Not compatible** with
`pathMode: "flow"` text (per-character effects need a normal flex layout;
flowing text uses SVG `textPath` which can't do per-glyph transforms) — the
inspector UI hides the Text FX grid when a text layer is in flow mode
rather than silently no-op'ing it.

### 6.12 Brand system

`brands: [{id, name, colors: [5 hex], headFont, bodyFont}]` + `brandId`.
New text/number layers default to the active brand's font; color swatch
rows across the inspector pull from `brand.colors`. Not deeply wired
everywhere — check `FontControls`/`ColorKfRow` call sites before assuming
every color picker is brand-aware.

## 7. Conventions to preserve when extending

- **Mutation always goes through `patchObject`/`patchProps`/`editProp`**,
  never direct `setObjects` calls that bypass the clip-scoping in
  `setLayers` (`useCallback((fn) => setObjects((root) =>
  updateAtPath(root, path, fn)), [path])`) — otherwise edits inside a clip
  will silently apply to the wrong scope.
- **Timeline bars are the source of truth for a layer's active window**
  (`inT`/`outT`), not just keyframe presence. Trimming a bar edge
  proportionally remaps every keyframe and FX-timing field into the new
  window (see `onBarDown` mode `"in"`/`"out"` → `remap()`) — any new
  time-based prop on a layer type needs to be added to `remap()`,
  `shiftLayerTimes()`, and `scaleLayerTimes()` or it'll desync when the
  user trims/moves/stretches that layer.
- **Determinism**: anything randomized (confetti particles, scramble text,
  world-map "electric" flicker) uses a seeded PRNG (`mulberry32`) or a hash
  function (`highlightFlick`), never `Math.random()` directly in the render
  path — required so scrubbing the timeline backward/forward is
  frame-identical, which matters if this ever feeds a real export pipeline.
- **No file-download reliance in the editor UI** — Claude.ai's artifact
  sandbox blocks `<a download>`/Blob downloads, so Save/Load uses a
  copy-to-clipboard modal (`copyProject`/`importProject`) instead of
  triggering a file save. Now that this runs as a real app, real downloads
  work fine — this is a known simplification worth revisiting (e.g. wiring
  the existing modal to also call `api.createProject`/`api.updateProject`
  for real persistence, per the note in the top-level README's "Extending"
  section).

## 8. What's explicitly NOT implemented (don't assume it exists)

- **MP4 export is real but v1-scoped.** `server/hyperframes/` compiles
  this app's project JSON to a real HyperFrames composition (paused GSAP
  timeline, `data-*` attributes) and can render it to an actual MP4 via
  the real `hyperframes` CLI — verified end-to-end with real output
  (`ffprobe`-checked dimensions/duration/codec), including through the
  full HTTP API (login → create project → render → real `video/mp4`
  response). **But**: only position/scale/rotation/opacity keyframes,
  clips, text, shapes (current keyframe, no morph), and images are
  actually translated. Shape morphing, per-character text FX, number
  rollers, chart/map/world/continent animation, confetti, and motion
  paths render as labeled static placeholders in the compiled video, not
  their real animated selves. Every gap produces an explicit warning
  naming the layer — see **`RENDERING.md`** for full scope, the exact
  test evidence, and the one real environmental dependency (a headless
  Chromium binary; auto-detected where possible, falls back to a specific
  actionable error otherwise, never silently wrong).
- **No signup, no password reset, one role.** See §3.
- **The editor's Save/Load is still local-only** (clipboard JSON), not yet
  wired to the `/api/projects` endpoints that exist and work — see §7's
  last bullet.
- **No tests directory / CI.** All verification so far was manual
  integration testing via `curl` against a running server, targeted Node
  scripts asserting specific pure functions (camera math, keyframe easing
  preservation, odometer digit cascade, etc.), and — for the rendering
  layer specifically — validation against HyperFrames' own `lint`/`check`
  tooling plus real rendered MP4 output inspected with `ffprobe`. There is
  no automated test suite checked into the repo. If you add one,
  `worldCameraAt`, `worldZoomWindow`, `numberColumns`, `withKeyframe`, the
  path/morph interpolators (`pointOnPath`, `morphPtsAt`), and
  `compileProject`/`flattenLayers` are the highest-value pure functions to
  cover first — all deterministic given their inputs.

## 9. Before you change something, verify it — don't just read the diff

Every feature in this codebase was built with real verification, not just
code review: esbuild bundling checks, Node-script unit tests run against
the actual *compiled* output (not just the source, since a patch can land
in the wrong scope and still look correct in a text diff — this happened
twice in this project's history and was only caught by testing the bundle),
and `curl`-based integration tests against a live server for anything
server-side. Follow the same standard: if you change camera math, keyframe
logic, or auth, write a throwaway script that calls the real function with
real inputs and prints pass/fail, rather than trusting that the code
"looks right."
