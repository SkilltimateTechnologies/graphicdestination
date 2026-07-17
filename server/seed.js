import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, initSchema } from "./db.js";
import { hashPassword, generateStrongPassword } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_FILE = path.join(__dirname, "data", "admin-credentials.json");

async function seed() {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  await initSchema();

  const existing = await db.execute({ sql: "SELECT id FROM users WHERE role = 'admin' LIMIT 1", args: [] });
  if (existing.rows.length > 0) {
    console.log("An admin user already exists — not creating a new one.");
    console.log("If you've lost the password, delete the user from the DB and re-run `npm run seed`.");
    return;
  }

  const username = "admin";
  const password = generateStrongPassword(16);
  const hash = await hashPassword(password);

  await db.execute({
    sql: "INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'admin', 1)",
    args: [username, hash],
  });

  // Written for the login page's "first-run" hint banner (see /api/auth/admin-hint).
  // This is a DEMO/BOOTSTRAP convenience only -- see README security note.
  fs.writeFileSync(CRED_FILE, JSON.stringify({ username, password, createdAt: new Date().toISOString() }, null, 2));

  console.log("\n=== Admin account created ===");
  console.log("Username:", username);
  console.log("Password:", password);
  console.log("==============================");
  console.log(`(Also written to ${CRED_FILE} so the login page can display it until you change the password.)\n`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
