import express from "express";
import { validateBody, schemas } from "../utils/validator.ts";

import authController from "../controllers/auth.ts";

const router = express.Router();

// Public: the only routes that don't need a token
router.post("/register", validateBody(schemas.registerSchema), authController.register);
router.post("/login", validateBody(schemas.loginSchema), authController.login);

export default router;
