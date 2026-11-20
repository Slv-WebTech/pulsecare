import { Router } from "express";
import {
  searchDoctors,
  getDoctorAvailability,
  getDoctorSlots,
  upsertDoctorProfile,
} from "../controllers/doctor.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.get("/", catchAsync(searchDoctors));
router.get("/:id/availability", catchAsync(getDoctorAvailability));
router.get("/:id/slots", catchAsync(getDoctorSlots));
router.put("/profile", requireAuth, requireRole("doctor"), catchAsync(upsertDoctorProfile));

export default router;
