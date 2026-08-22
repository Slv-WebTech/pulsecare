import { Router } from "express";
import {
  bookAppointment,
  listMyAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
} from "../controllers/appointment.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.use(requireAuth);

router.post("/", requireRole("patient"), catchAsync(bookAppointment));
router.get("/", catchAsync(listMyAppointments));
router.patch("/:id/status", catchAsync(updateAppointmentStatus));
router.patch("/:id/reschedule", catchAsync(rescheduleAppointment));

export default router;
