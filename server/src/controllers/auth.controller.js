import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { normalizeEmail, isValidEmail, passwordError } from "../utils/validation.js";
import { audit } from "../utils/audit.js";

// Admin accounts must be provisioned out-of-band (e.g. directly in the database);
// self-registration is limited to the two public-facing roles.
const REGISTERABLE_ROLES = new Set(["patient", "doctor"]);

// Short-lived access token (kept in memory by the client) + rotating refresh token that only
// ever lives in an httpOnly cookie and is stored hashed, so it can be revoked server-side.
const REFRESH_COOKIE = "rt";
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;
// Two requests with the same cookie can legitimately race (two tabs, a hot reload, a retry). A token
// rotated within this window is rejected softly (409) instead of being treated as stolen.
const REUSE_GRACE_MS = 10_000;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
}

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: REFRESH_TTL_MS,
  };
}

function clearRefreshCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
}

async function issueSession(res, user) {
  const raw = crypto.randomBytes(48).toString("base64url");
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [user.id, sha256(raw), new Date(Date.now() + REFRESH_TTL_MS)]
  );
  res.cookie(REFRESH_COOKIE, raw, cookieOptions());
  return signToken(user);
}

export async function register(req, res) {
  const { name, password, role = "patient", phone } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  const pwError = passwordError(password);
  if (pwError) {
    return res.status(400).json({ error: pwError });
  }
  if (!REGISTERABLE_ROLES.has(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
  if (existing.rowCount > 0) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, phone`,
    [name, email, passwordHash, role, phone || null]
  );

  const user = result.rows[0];
  const token = await issueSession(res, user);
  await audit(req, "auth.register", "user", user.id, user.id);
  res.status(201).json({ user, token });
}

export async function login(req, res) {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!email || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const result = await pool.query("SELECT * FROM users WHERE lower(email) = $1", [email]);
  const user = result.rows[0];
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!passwordMatches) {
    await audit(req, "auth.login_failed", "user", user?.id ?? null, user?.id ?? null);
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const { password_hash, ...safeUser } = user;
  const token = await issueSession(res, safeUser);
  await audit(req, "auth.login", "user", user.id, user.id);
  res.json({ user: safeUser, token });
}

// Rotates the refresh token and returns a fresh access token. Presenting an already-revoked
// token means it was stolen or replayed, so every session of that user is revoked.
export async function refresh(req, res) {
  const raw = readCookie(req, REFRESH_COOKIE);
  if (!raw) return res.status(401).json({ error: "No session" });

  const found = await pool.query("SELECT * FROM refresh_tokens WHERE token_hash = $1", [sha256(raw)]);
  const row = found.rows[0];
  if (!row) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Invalid session" });
  }
  if (row.revoked_at) {
    if (Date.now() - new Date(row.revoked_at).getTime() < REUSE_GRACE_MS) {
      return res.status(409).json({ error: "Session already rotated", code: "rotated" });
    }
    // Backdated past the grace window on purpose: these were revoked for theft, not rotated, so
    // presenting any of them again must be a hard 401, not the soft "just rotated" 409.
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() - interval '1 hour' WHERE user_id = $1 AND revoked_at IS NULL",
      [row.user_id]
    );
    await audit(req, "auth.refresh_reuse_detected", "user", row.user_id, row.user_id);
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Session revoked" });
  }
  if (new Date(row.expires_at) < new Date()) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Session expired" });
  }

  const user = (await pool.query("SELECT id, name, email, role, phone FROM users WHERE id = $1", [row.user_id])).rows[0];
  if (!user) return res.status(401).json({ error: "Invalid session" });

  // Atomic rotate: only one concurrent request can revoke this exact token.
  const revoked = await pool.query(
    "UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id",
    [row.id]
  );
  if (revoked.rowCount === 0) return res.status(409).json({ error: "Session already rotated", code: "rotated" });

  const token = await issueSession(res, user);
  res.json({ user, token });
}

// Logout revokes with a backdated timestamp (past the rotation grace window) so the token is hard-dead.
export async function logout(req, res) {
  const raw = readCookie(req, REFRESH_COOKIE);
  if (raw) {
    const r = await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() - interval '1 hour' WHERE token_hash = $1 AND revoked_at IS NULL RETURNING user_id",
      [sha256(raw)]
    );
    if (r.rows[0]) await audit(req, "auth.logout", "user", r.rows[0].user_id, r.rows[0].user_id);
  }
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function me(req, res) {
  const result = await pool.query(
    "SELECT id, name, email, role, phone FROM users WHERE id = $1",
    [req.user.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ user: result.rows[0] });
}
