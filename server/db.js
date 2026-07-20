import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DB_PATH = path.join(__dirname, "data", "app.db");
fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });

/*
 * Turso connection strategy:
 * - TURSO_DATABASE_URL + TURSO_AUTH_TOKEN set  -> REMOTE-ONLY client: plain
 *   HTTPS queries straight to the Turso primary. No embedded replica, no local
 *   file, no native sync binary. This is deliberate: it keeps the deployment
 *   artifact dependency-light (no libsql native sync package — some npm
 *   mirrors don't carry it), avoids the deprecated embedded-sync protocol
 *   entirely, and makes the container fully stateless (ephemeral-filesystem
 *   platforms like Railway/preview hosts are safe).
 * - Neither set (local dev)                            -> plain local SQLite
 *   file via the same @libsql/client API.
 */
const hasTurso = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

export const db = hasTurso
  ? createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : createClient({ url: `file:${LOCAL_DB_PATH}` });

export const usingTurso = hasTurso;

export async function initSchema() {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        must_change_password INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)`,
      // Asset library: user-uploaded images stored as base64 text (keeps the
      // remote-only Turso client usable -- it has no BLOB binding support).
      `CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        data TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id)`,
      // Admin-managed SVG icon library (global, not per-user): sanitized at
      // upload (svgSanitize) and served read-only to every signed-in user.
      `CREATE TABLE IF NOT EXISTS svg_icons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Icons',
        tags TEXT NOT NULL DEFAULT '[]',
        svg TEXT NOT NULL,
        motion TEXT NOT NULL DEFAULT 'engine',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Editable templates: scope "global" (admin-authored, visible to all) or
      // "user" (personal). A global row whose slug matches a built-in
      // templates.js id is an OVERRIDE of that built-in — code is never mutated.
      `CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('global','user')),
        owner_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Custom',
        description TEXT NOT NULL DEFAULT '',
        accent TEXT NOT NULL DEFAULT '#5B8CFF',
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_templates_scope ON templates(scope, owner_id)`,
    ],
    "write"
  );

  /* Public share links (v2.4): nullable per-project token. ALTER TABLE has no
     IF NOT EXISTS, so guard with PRAGMA table_info to keep initSchema
     idempotent across restarts on an existing database file. */
  const cols = await db.execute(`PRAGMA table_info(projects)`);
  if (!cols.rows.some((c) => c.name === "share_token")) {
    await db.execute(`ALTER TABLE projects ADD COLUMN share_token TEXT`);
  }
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_projects_share_token ON projects(share_token)`);
}
