import express from "express";
import {
  forgotPasswordLimiter,
  loginLimiter,
  resetPasswordLimiter,
} from "../middlewares/security.ts";
import { validateBody, schemas } from "../utils/validator.ts";

import authController from "../controllers/auth.ts";

const router = express.Router();

// Public: the only routes that don't need a token
router.post("/register", validateBody(schemas.registerSchema), authController.register);
router.post("/login", loginLimiter, validateBody(schemas.loginSchema), authController.login);
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateBody(schemas.forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  resetPasswordLimiter,
  validateBody(schemas.resetPasswordSchema),
  authController.resetPassword,
);

export default router;
