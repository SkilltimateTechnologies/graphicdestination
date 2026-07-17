import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Zero-config boot (previews, demos, first-run Docker): fall back to a random
  // ephemeral secret instead of crashing. Sessions are invalidated on restart.
  // Real deployments MUST set JWT_SECRET via the environment.
  const { randomBytes } = await import("crypto");
  JWT_SECRET = randomBytes(48).toString("hex");
  console.warn("WARNING: JWT_SECRET is not set — using an ephemeral secret. Sessions will not survive restarts. Set JWT_SECRET in the environment for production.");
}

export const COOKIE_NAME = "gd_session";
export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signSession(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Express middleware: 401s if there's no valid session cookie. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const payload = token && verifySession(token);
  if (!payload) return res.status(401).json({ error: "Not authenticated" });
  req.user = payload;
  next();
}

/** Generates a strong random password for the bootstrap admin account. */
export function generateStrongPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
