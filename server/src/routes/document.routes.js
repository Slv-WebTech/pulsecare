import { Router } from "express";
import {
  uploadDocument,
  listMyDocuments,
  summarizeDocument,
} from "../controllers/document.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.use(requireAuth);

router.post("/", upload.single("file"), catchAsync(uploadDocument));
router.get("/", catchAsync(listMyDocuments));
router.post("/:id/summarize", catchAsync(summarizeDocument));

export default router;
