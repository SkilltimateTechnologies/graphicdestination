import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { enforceConfig } from "./config.js";
import { db, initSchema, usingTurso } from "./db.js";
import { hashPassword, verifyPassword, signSession, requireAuth, COOKIE_NAME, COOKIE_OPTS } from "./auth.js";
import { authLimiter, shareLimiter, createRateLimiter } from "./ratelimit.js";
import { logger } from "./logger.js";
import { initErrorTracking, captureError } from "./errorTracking.js";
import { recordHttp, renderMetrics } from "./metrics.js";

// Validate env & fail-fast in production before the app starts serving traffic.
enforceConfig();

// Optional error tracking (no-op unless SENTRY_DSN set + @sentry/node installed).
const tracking = await initErrorTracking();
logger.info("error_tracking", tracking);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_FILE = path.join(__dirname, "data", "admin-credentials.json");
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

const app = express();

// Security headers first, so they are present on every response (including
// error responses produced by later middleware).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'"
  );
  next();
});

// Per-request id + structured access log. The id is echoed in the response
// header and stamped on every log line for that request, so a client-reported
// failure can be traced end-to-end. Bodies are never logged (the logger redacts
// sensitive keys regardless).
app.use((req, res, next) => {
  const id = String(req.headers["x-request-id"] || crypto.randomUUID());
  req.id = id;
  req.log = logger.child({ reqId: id });
  res.setHeader("X-Request-Id", id);
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    req.log[level]("request", { method: req.method, path: req.path, status: res.statusCode, ms });
    // Skip infra endpoints so scrapes/probes don't drown the request signal.
    if (!(req.path === "/metrics" || req.path === "/api/health" || req.path === "/api/ready")) {
      recordHttp(req.method, res.statusCode, ms);
    }
  });
  next();
});

// Raised 8mb -> 12mb: audio assets up to 5 MB decoded arrive as base64 inside
// the JSON envelope (~6.7 MB) plus field overhead, so 8mb would 413 valid
// uploads; 12mb keeps headroom for sizable project JSON payloads too.
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));

await initSchema();
/* R9w3 — per-user settings store (brand kits, text styles, default stage bg).
   ADDITIVE: one row per user, whole-document JSON (validated + size-capped in
   the PUT route below). Kept out of db.js so the core schema stays untouched. */
await db.execute(`CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
logger.info("database_ready", { backend: usingTurso ? "turso" : "local" });

/* ---------------- health (no auth) ----------------
 * /api/health  — liveness: the process is up and answering (no I/O).
 * /api/ready    — readiness: the DB is actually reachable. Load balancers /
 *                 orchestrators should gate traffic on readiness, not liveness.
 */

app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: usingTurso ? "turso" : "local" });
});

/* Prometheus metrics (RED + process). Optionally gate with METRICS_TOKEN:
   when set, scrapers must send `Authorization: Bearer <token>`. Left open
   (internal-network scraping) when unset — the payload carries no secrets. */
app.get("/metrics", (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (token && req.headers.authorization !== `Bearer ${token}`) {
    return res.status(401).type("text/plain").send("Unauthorized\n");
  }
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderMetrics());
});

app.get("/api/ready", async (req, res) => {
  try {
    await db.execute("SELECT 1");
    res.json({ ready: true, db: usingTurso ? "turso" : "local" });
  } catch (err) {
    req.log?.error("readiness_check_failed", { err: String(err?.message || err) });
    res.status(503).json({ ready: false });
  }
});

/* ---------------- auth ---------------- */

const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || username.length < 3 || username.length > 24 || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Username must be 3-24 characters and contain only letters, numbers, dots, underscores, and hyphens" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  // Pre-check for a friendly 409 before doing the expensive hash.
  const existing = await db.execute({ sql: "SELECT id FROM users WHERE username = ?", args: [username] });
  if (existing.rows.length > 0) return res.status(409).json({ error: "Username is taken" });

  const hash = await hashPassword(password);
  let userId;
  try {
    const result = await db.execute({
      sql: "INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'user', 0)",
      args: [username, hash],
    });
    userId = Number(result.lastInsertRowid);
  } catch (err) {
    // Lost the race against a concurrent signup with the same username.
    if (String(err?.code || "").includes("CONSTRAINT") || /unique/i.test(String(err?.message || err))) {
      return res.status(409).json({ error: "Username is taken" });
    }
    console.error("Signup failed:", err);
    return res.status(500).json({ error: "Internal server error" });
  }

  const token = signSession({ id: userId, username, role: "user" });
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  res.status(201).json({ username, role: "user" });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const result = await db.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid username or password" });

  const token = signSession(user);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
  res.json({ username: user.username, role: user.role, mustChangePassword: !!user.must_change_password });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: undefined });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  const hash = await hashPassword(newPassword);
  await db.execute({ sql: "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", args: [hash, req.user.sub] });
  // Once the admin changes their password, the plaintext bootstrap file is dead weight -- remove it.
  try { fs.unlinkSync(CRED_FILE); } catch {}
  res.json({ ok: true });
});

/*
 * DEV/DEMO ONLY: exposes the freshly-seeded admin password so the login page
 * can display it on first run, per the request to "show admin login details
 * on the login page for now". This only ever returns data while the
 * bootstrap credentials file still exists -- it's deleted automatically the
 * moment the admin changes their password (see /change-password above), and
 * you should delete server/data/admin-credentials.json (or just change the
 * password once) before any real deployment. See README "Security" section.
 *
 * The route is only registered when ENABLE_ADMIN_HINT === "1"; otherwise the
 * endpoint does not exist at all (404).
 */
if (process.env.ENABLE_ADMIN_HINT === "1") {
  app.get("/api/auth/admin-hint", (req, res) => {
    try {
      const raw = fs.readFileSync(CRED_FILE, "utf8");
      res.json({ active: true, ...JSON.parse(raw) });
    } catch {
      res.json({ active: false });
    }
  });
}

/* ---------------- projects (Turso-backed) ---------------- */

app.get("/api/projects", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT id, name, updated_at, created_at, (share_token IS NOT NULL) AS shared FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
    args: [req.user.sub],
  });
  res.json(result.rows.map((row) => ({ id: row.id, name: row.name, updated_at: row.updated_at, created_at: row.created_at, shared: !!Number(row.shared) })));
});

app.get("/api/projects/:id", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user.sub],
  });
  if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = result.rows[0];
  res.json({ id: row.id, name: row.name, data: JSON.parse(row.data), updatedAt: row.updated_at, shareToken: row.share_token || null });
});

app.post("/api/projects", requireAuth, async (req, res) => {
  const { name, data } = req.body || {};
  if (!name || !data) return res.status(400).json({ error: "name and data required" });
  const result = await db.execute({
    sql: "INSERT INTO projects (owner_id, name, data) VALUES (?, ?, ?)",
    args: [req.user.sub, name, JSON.stringify(data)],
  });
  res.json({ id: Number(result.lastInsertRowid) });
});

app.put("/api/projects/:id", requireAuth, async (req, res) => {
  const { name, data } = req.body || {};
  const result = await db.execute({
    sql: "UPDATE projects SET name = COALESCE(?, name), data = COALESCE(?, data), updated_at = datetime('now') WHERE id = ? AND owner_id = ?",
    args: [name || null, data ? JSON.stringify(data) : null, req.params.id, req.user.sub],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.delete("/api/projects/:id", requireAuth, async (req, res) => {
  const result = await db.execute({ sql: "DELETE FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user.sub] });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

/* ---------------- public share links ----------------
 * The owner enables a link with POST /api/projects/:id/share; anyone holding
 * the 16-char URL-safe token can then read the composition via
 * GET /api/share/:token — PUBLIC (no session), but behind its own lenient
 * rate bucket. The public payload is { name, data } only: never the owner id,
 * project id, timestamps, or the token itself.
 */

const newShareToken = () => crypto.randomBytes(12).toString("base64url"); // 96 bits -> 16 URL-safe chars

app.post("/api/projects/:id/share", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT id, share_token FROM projects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user.sub],
  });
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  // Idempotent: re-enabling returns the existing token instead of rotating it.
  if (row.share_token) return res.json({ shareToken: row.share_token, url: `/p/${row.share_token}` });
  // 2^96 tokens make a collision practically impossible; the retry loop is
  // belt-and-braces so a clash can never 500 the request.
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newShareToken();
    const clash = await db.execute({ sql: "SELECT id FROM projects WHERE share_token = ?", args: [token] });
    if (clash.rows.length) continue;
    await db.execute({ sql: "UPDATE projects SET share_token = ? WHERE id = ?", args: [token, row.id] });
    return res.json({ shareToken: token, url: `/p/${token}` });
  }
  res.status(500).json({ error: "Could not allocate a share token" });
});

app.delete("/api/projects/:id/share", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "UPDATE projects SET share_token = NULL WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user.sub],
  });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/share/:token", shareLimiter, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT name, data FROM projects WHERE share_token = ?",
    args: [req.params.token],
  });
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ name: row.name, data: JSON.parse(row.data) });
});

/*
 * Token-scoped public asset serving: anonymous viewers of a shared project
 * need its uploaded images/audio, but the asset API itself is owner-auth'd.
 * This route serves an asset ONLY when the shared project's JSON actually
 * references it — token holders get exactly that project's media, nothing
 * else in the owner's library.
 */
app.get("/api/share/:token/assets/:assetId", shareLimiter, async (req, res) => {
  const project = await db.execute({
    sql: "SELECT data FROM projects WHERE share_token = ?",
    args: [req.params.token],
  });
  const row = project.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!row.data.includes(`"/api/assets/${req.params.assetId}"`)) {
    return res.status(404).json({ error: "Not found" });
  }
  const asset = await db.execute({
    sql: "SELECT mime, data FROM assets WHERE id = ?",
    args: [req.params.assetId],
  });
  const a = asset.rows[0];
  if (!a) return res.status(404).json({ error: "Not found" });
  const buf = Buffer.from(a.data, "base64");
  res.setHeader("Content-Type", a.mime);
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buf);
});

/* ---------------- asset library ----------------
 * Owner-scoped image and audio uploads. Payloads arrive as data URLs and are
 * stored as base64 text in the assets table (the remote-only Turso client
 * binds no BLOBS); GET /api/assets/:id decodes and serves the raw bytes.
 * Same-origin URLs plus the CSP's `img-src 'self' data:` / `media-src 'self'
 * blob:` keep these usable in <img> and <audio> tags.
 */

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const AUDIO_MIMES = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/aac", "audio/m4a", "audio/webm"]);
const ASSET_MIMES = new Set([...IMAGE_MIMES, ...AUDIO_MIMES]);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB decoded
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB decoded
// Test hook: GD_ASSET_QUOTA overrides the default 50-assets-per-user limit.
const ASSET_QUOTA = Math.max(1, Number.parseInt(process.env.GD_ASSET_QUOTA || "50", 10) || 50);
const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]*)$/;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

const assetKind = (mime) => (String(mime).startsWith("audio/") ? "audio" : "image");

const assetMeta = (row) => ({
  id: row.id,
  name: row.name,
  mime: row.mime,
  kind: assetKind(row.mime),
  size: row.size,
  url: `/api/assets/${row.id}`,
  createdAt: row.created_at,
});

app.post("/api/assets", requireAuth, async (req, res) => {
  const { name, mime, dataUrl } = req.body || {};
  if (typeof name !== "string" || name.length < 1 || name.length > 120) {
    return res.status(400).json({ error: "name must be 1-120 characters" });
  }
  if (typeof mime !== "string" || typeof dataUrl !== "string") {
    return res.status(400).json({ error: "mime and dataUrl required" });
  }
  if (!ASSET_MIMES.has(mime)) {
    return res.status(415).json({ error: `Unsupported media type (allowed: ${[...ASSET_MIMES].join(", ")})` });
  }
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m || m[1] !== mime || !m[2] || m[2].length % 4 !== 0 || !BASE64_RE.test(m[2])) {
    return res.status(400).json({ error: "Malformed dataUrl (expected data:<mime>;base64,<data>)" });
  }
  const buf = Buffer.from(m[2], "base64");
  // Per-kind size caps on decoded bytes: images 3 MB, audio 5 MB.
  const kind = assetKind(mime);
  if (buf.length > (kind === "audio" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES)) {
    return res.status(413).json({ error: kind === "audio" ? "Audio too large (max 5 MB)" : "Image too large (max 3 MB)" });
  }
  const count = await db.execute({ sql: "SELECT COUNT(*) AS n FROM assets WHERE owner_id = ?", args: [req.user.sub] });
  if (Number(count.rows[0].n) >= ASSET_QUOTA) {
    return res.status(409).json({ error: `Asset limit reached (${ASSET_QUOTA})` });
  }
  const result = await db.execute({
    sql: "INSERT INTO assets (owner_id, name, mime, data, size) VALUES (?, ?, ?, ?, ?)",
    args: [req.user.sub, name, mime, m[2], buf.length],
  });
  const created = await db.execute({ sql: "SELECT * FROM assets WHERE id = ?", args: [result.lastInsertRowid] });
  res.status(201).json(assetMeta(created.rows[0]));
});

app.get("/api/assets", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT id, name, mime, size, created_at FROM assets WHERE owner_id = ? ORDER BY id DESC",
    args: [req.user.sub],
  });
  res.json(result.rows.map(assetMeta));
});

app.get("/api/assets/:id", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM assets WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user.sub],
  });
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  const buf = Buffer.from(row.data, "base64");
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("Content-Length", String(buf.length));
  res.end(buf);
});

app.delete("/api/assets/:id", requireAuth, async (req, res) => {
  const result = await db.execute({ sql: "DELETE FROM assets WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user.sub] });
  if (result.rowsAffected === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

/* ---------------- user settings (R9w3) ----------------
 * Per-user JSON document: saved brand kits, text-style config and the
 * default stage background. One row per user in user_settings; the whole
 * document is validated + size-capped on every PUT (unknown keys are
 * stripped, unknown text-style tiers dropped). Own lenient rate bucket
 * (60 req / 10 min / IP) so it can't be used to amplify like the auth
 * endpoints, but normal editor use never trips it.
 */

const settingsLimiter = createRateLimiter({ max: 60, message: "Too many requests. Try again later." });

const SETTINGS_MAX_BYTES = 256 * 1024; /* serialized cap — kits + optional small logo data URLs */
const SETTINGS_MAX_KITS = 24;
const SETTINGS_LOGO_MAX = 120 * 1024; /* a logo is a small data/asset URL string */
const SETTINGS_HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SETTINGS_ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;
const SETTINGS_TIERS = ["heading", "subheading", "body", "caption"];
const SETTINGS_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);

const defaultSettingsDoc = () => ({ v: 1, brandKits: [], textStyles: null, defaultBg: null });

const cleanHex = (v) => (typeof v === "string" && SETTINGS_HEX_RE.test(v) ? v : null);
const cleanFontName = (v) => (typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 60 ? v.trim() : null);

/* strict-but-repairing validator: returns { settings } or { error }.
   Unknown top-level keys are stripped; malformed REQUIRED fields 400. */
function sanitizeSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "settings must be a JSON object" };
  const out = { v: 1, brandKits: [], textStyles: null, defaultBg: null };

  if (input.brandKits != null) {
    if (!Array.isArray(input.brandKits)) return { error: "brandKits must be an array" };
    if (input.brandKits.length > SETTINGS_MAX_KITS) return { error: `too many brand kits (max ${SETTINGS_MAX_KITS})` };
    const seen = new Set();
    for (let i = 0; i < input.brandKits.length; i++) {
      const k = input.brandKits[i];
      if (!k || typeof k !== "object" || Array.isArray(k)) return { error: `brand kit #${i + 1} must be an object` };
      const name = typeof k.name === "string" ? k.name.trim() : "";
      if (!name || name.length > 60) return { error: `brand kit #${i + 1}: name must be 1-60 characters` };
      const primary = cleanHex(k.primary), accent = cleanHex(k.accent), textColor = cleanHex(k.textColor);
      if (!primary || !accent || !textColor) return { error: `brand kit "${name}": primary/accent/textColor must be hex colors (#rgb or #rrggbb)` };
      const headingFont = cleanFontName(k.headingFont), bodyFont = cleanFontName(k.bodyFont);
      if (!headingFont || !bodyFont) return { error: `brand kit "${name}": headingFont/bodyFont must be 1-60 character strings` };
      let id = typeof k.id === "string" && SETTINGS_ID_RE.test(k.id) ? k.id : `kit${i + 1}`;
      while (seen.has(id)) id = `${id}x`;
      seen.add(id);
      const kit = { id, name, primary, accent, textColor, headingFont, bodyFont };
      if (k.logo != null && k.logo !== "") {
        if (typeof k.logo !== "string" || k.logo.length > SETTINGS_LOGO_MAX) return { error: `brand kit "${name}": logo must be a string up to 120 KB` };
        kit.logo = k.logo;
      }
      out.brandKits.push(kit);
    }
  }

  if (input.textStyles != null) {
    if (typeof input.textStyles !== "object" || Array.isArray(input.textStyles)) return { error: "textStyles must be an object" };
    const ts = {};
    for (const tier of SETTINGS_TIERS) {
      const t = input.textStyles[tier];
      if (t == null) continue;
      if (typeof t !== "object" || Array.isArray(t)) return { error: `textStyles.${tier} must be an object` };
      const fontFamily = cleanFontName(t.fontFamily);
      if (!fontFamily) return { error: `textStyles.${tier}.fontFamily must be a 1-60 character string` };
      const fontSize = Number(t.fontSize);
      if (!Number.isFinite(fontSize) || fontSize < 6 || fontSize > 400) return { error: `textStyles.${tier}.fontSize must be a number between 6 and 400` };
      const fontWeight = Number(t.fontWeight);
      if (!SETTINGS_WEIGHTS.has(fontWeight)) return { error: `textStyles.${tier}.fontWeight must be one of 100-900 (x100)` };
      ts[tier] = { fontFamily, fontSize: Math.round(fontSize), fontWeight };
    }
    out.textStyles = Object.keys(ts).length ? ts : null;
  }

  if (input.defaultBg != null && input.defaultBg !== "") {
    const bg = cleanHex(input.defaultBg);
    if (!bg) return { error: "defaultBg must be a hex color (#rgb or #rrggbb), \"\" or null" };
    out.defaultBg = bg;
  }

  const size = Buffer.byteLength(JSON.stringify(out), "utf8");
  if (size > SETTINGS_MAX_BYTES) return { error: `settings too large (max ${SETTINGS_MAX_BYTES / 1024} KB)`, status: 413 };
  return { settings: out };
}

app.get("/api/settings", settingsLimiter, requireAuth, async (req, res) => {
  const result = await db.execute({ sql: "SELECT json FROM user_settings WHERE user_id = ?", args: [req.user.sub] });
  const row = result.rows[0];
  if (!row) return res.json(defaultSettingsDoc());
  try {
    res.json(JSON.parse(row.json));
  } catch {
    res.json(defaultSettingsDoc());
  }
});

app.put("/api/settings", settingsLimiter, requireAuth, async (req, res) => {
  /* cap the INCOMING payload first — unknown keys are stripped by the
     sanitizer, so measuring after would let an oversized envelope through */
  let incomingBytes = 0;
  try { incomingBytes = Buffer.byteLength(JSON.stringify(req.body), "utf8"); } catch { incomingBytes = SETTINGS_MAX_BYTES + 1; }
  if (incomingBytes > SETTINGS_MAX_BYTES) {
    return res.status(413).json({ error: `settings too large (max ${SETTINGS_MAX_BYTES / 1024} KB)` });
  }
  const verdict = sanitizeSettings(req.body);
  if (verdict.error) return res.status(verdict.status || 400).json({ error: verdict.error });
  await db.execute({
    sql: `INSERT INTO user_settings (user_id, json, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = datetime('now')`,
    args: [req.user.sub, JSON.stringify(verdict.settings)],
  });
  res.json({ ok: true, settings: verdict.settings });
});

/* ---------------- HyperFrames export ---------------- */

app.post("/api/render/compile", requireAuth, async (req, res) => {
  const { project } = req.body || {};
  if (!project) return res.status(400).json({ error: "project required" });
  try {
    const { compileProject } = await import("./hyperframes/compile.js");
    const { html, warnings } = compileProject(project);
    res.json({ html, warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/projects/:id/render", requireAuth, async (req, res) => {
  const result = await db.execute({ sql: "SELECT * FROM projects WHERE id = ? AND owner_id = ?", args: [req.params.id, req.user.sub] });
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });

  const { renderProjectToMp4 } = await import("./hyperframes/render.js");
  const outcome = await renderProjectToMp4(JSON.parse(row.data), {
    fps: req.body?.fps,
    quality: req.body?.quality,
  });

  if (outcome.ok) {
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${row.name.replace(/[^a-z0-9-_]+/gi, "_")}.mp4"`);
    res.setHeader("X-Render-Chrome-Source", outcome.chromeSource || "unknown");
    if (outcome.warnings?.length) res.setHeader("X-Render-Warnings", String(outcome.warnings.length));
    fs.createReadStream(outcome.path).pipe(res);
    return;
  }
  // Compilation still succeeded even though the video render didn't -- return
  // 200 with the compiled HTML rather than a hard failure, so the caller can
  // still get something usable (render it elsewhere, inspect the warnings).
  res.json({ rendered: false, reason: outcome.reason, hint: outcome.hint, error: outcome.error, warnings: outcome.warnings, html: outcome.html });
});

/* ---------------- static client (production) ---------------- */

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

/* ---------------- centralized error handling ----------------
 * Last middleware: catches synchronous throws and any `next(err)`. It never
 * leaks a stack trace to the client — the reqId in the response header ties the
 * user-visible 500 back to the full server-side log line.
 */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Body-parser and other middleware errors carry their own status (malformed
  // JSON -> 400, payload too large -> 413). Preserve those; only truly
  // unexpected errors (no status) become a 500. Client-facing 4xx get a short
  // reason; 5xx never leak internals.
  const status = Number(err?.status || err?.statusCode) || 500;
  const level = status >= 500 ? "error" : "warn";
  req.log?.[level]("request_error", { path: req.path, status, err: String(err?.stack || err) });
  if (status >= 500) {
    captureError(err, { requestId: req.id, path: req.path, method: req.method });
    return res.status(500).json({ error: "Internal server error", requestId: req.id });
  }
  res.status(status).json({ error: err.type === "entity.too.large" ? "Payload too large" : "Bad request", requestId: req.id });
});

const PORT = process.env.PORT || 8787;
const server = app.listen(PORT, () => logger.info("listening", { port: Number(PORT), url: `http://localhost:${PORT}` }));

/* Graceful shutdown: stop accepting connections, let in-flight requests drain,
   then exit. A hard 10s deadline guarantees the process can't hang forever. */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn("shutdown_initiated", { signal });
  server.close(() => {
    logger.info("shutdown_complete", {});
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("shutdown_forced", { reason: "drain timeout exceeded" });
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Last-resort guards: log (don't silently swallow) async faults that escaped a
// route. These indicate a bug to fix, not normal flow.
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", { err: String(reason?.stack || reason) });
  captureError(reason, { kind: "unhandledRejection" });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaught_exception", { err: String(err?.stack || err) });
  captureError(err, { kind: "uncaughtException" });
});
