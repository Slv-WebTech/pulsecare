import { Router } from "express";
import { queryAssistant } from "../controllers/assistant.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.post("/query", requireAuth, catchAsync(queryAssistant));

export default router;
