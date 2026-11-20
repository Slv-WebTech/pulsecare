import { Router } from "express";
import { getDashboardStats, listAuditLog } from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/stats", catchAsync(getDashboardStats));
router.get("/audit", catchAsync(listAuditLog));

export default router;
