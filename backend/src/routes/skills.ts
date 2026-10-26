import express from "express";
import { authenticate } from "../middlewares/auth.ts";
import { validateQuery, schemas } from "../utils/validator.ts";

import skillsController from "../controllers/skills.ts";

const router = express.Router();

// Every role may read the taxonomy
router.get("/", authenticate, validateQuery(schemas.skillQuerySchema), skillsController.listSkills);

export default router;
