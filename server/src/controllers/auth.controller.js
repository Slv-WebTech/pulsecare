import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

// Admin accounts must be provisioned out-of-band (e.g. directly in the database) —
// self-registration is limited to the two public-facing roles.
const REGISTERABLE_ROLES = new Set(["patient", "doctor"]);

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

export async function register(req, res) {
  const { name, email, password, role = "patient", phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (!REGISTERABLE_ROLES.has(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
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
  res.status(201).json({ user, token: signToken(user) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser, token: signToken(user) });
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
