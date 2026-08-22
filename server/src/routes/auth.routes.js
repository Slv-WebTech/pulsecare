import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

// Credential-stuffing / brute-force guard on the two unauthenticated,
// password-checking endpoints. Keyed by IP (express-rate-limit's default).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

router.post("/register", authLimiter, catchAsync(register));
router.post("/login", authLimiter, catchAsync(login));
router.get("/me", requireAuth, catchAsync(me));

export default router;
