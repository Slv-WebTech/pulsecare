import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, me, refresh, logout } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

// Credential-stuffing / brute-force guard on the unauthenticated, password-checking
// endpoints. Keyed by IP (express-rate-limit's default).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.REFRESH_RATE_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

// Cookie-authenticated endpoints only accept requests from our own front-end origin
// (SameSite=Lax cookie + this check = CSRF protection without tokens).
function sameOriginOnly(req, res, next) {
  const origin = req.headers.origin;
  const allowed = process.env.CLIENT_ORIGIN || "http://localhost:5173";
  if (origin && origin !== allowed) return res.status(403).json({ error: "Forbidden origin" });
  next();
}

router.post("/register", authLimiter, catchAsync(register));
router.post("/login", authLimiter, catchAsync(login));
router.post("/refresh", refreshLimiter, sameOriginOnly, catchAsync(refresh));
router.post("/logout", sameOriginOnly, catchAsync(logout));
router.get("/me", requireAuth, catchAsync(me));

export default router;
