import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DB_PATH = path.join(__dirname, "data", "app.db");
fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });

/*
 * Turso connection strategy:
 * - TURSO_DATABASE_URL + TURSO_AUTH_TOKEN set  -> embedded replica: local file
 *   mirrors a real Turso cloud database (reads are local/fast, writes sync to
 *   the cloud primary). This is the production configuration.
 * - Neither set (local dev / this sandbox)     -> plain local SQLite file via
 *   the same @libsql/client API. Zero code changes needed to go from this to
 *   a real Turso deployment -- just set the two env vars.
 */
const hasTurso = !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);

export const db = hasTurso
  ? createClient({
      url: `file:${LOCAL_DB_PATH}`,
      syncUrl: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
      syncInterval: 60,
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
    ],
    "write"
  );
}
