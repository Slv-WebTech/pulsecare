import { Router } from "express";
import { getConversation, markRead } from "../controllers/chat.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.use(requireAuth);

router.get("/:userId", catchAsync(getConversation));
router.patch("/:id/read", catchAsync(markRead));

export default router;
