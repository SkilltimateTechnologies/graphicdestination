import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, initSchema, usingTurso } from "./db.js";
import { hashPassword, verifyPassword, signSession, requireAuth, COOKIE_NAME, COOKIE_OPTS } from "./auth.js";
import { authLimiter } from "./ratelimit.js";

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

app.use(express.json({ limit: "8mb" })); // project JSON payloads can be sizable
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));

await initSchema();
console.log(`Database: ${usingTurso ? "Turso cloud (remote HTTPS)" : "local SQLite file (no Turso env vars set)"}`);

/* ---------------- health (no auth) ---------------- */

app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: usingTurso ? "turso" : "local" });
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
    sql: "SELECT id, name, updated_at, created_at FROM projects WHERE owner_id = ? ORDER BY updated_at DESC",
    args: [req.user.sub],
  });
  res.json(result.rows);
});

app.get("/api/projects/:id", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ? AND owner_id = ?",
    args: [req.params.id, req.user.sub],
  });
  if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
  const row = result.rows[0];
  res.json({ id: row.id, name: row.name, data: JSON.parse(row.data), updatedAt: row.updated_at });
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

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
