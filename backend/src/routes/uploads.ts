import express from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateBody, schemas } from "../utils/validator.ts";

import uploadsController from "../controllers/uploads.ts";

const router = express.Router();

// Only content authors upload media
router.use(authenticate, authorize("instructor", "admin"));

router.post("/", validateBody(schemas.uploadRequestSchema), uploadsController.createUpload);

export default router;
