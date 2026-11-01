import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateParams, schemas } from "../utils/validator.ts";
import advancedController from "../controllers/advanced.ts";

export const createAdvancedRouter = () => {
  const router = express.Router();

  // 1. OpenAPI Phase 3 Endpoints
  router.get(
    "/me/mastery",
    authenticate,
    authorize("learner"),
    advancedController.getMyMastery,
  );

  router.get(
    "/recommendations",
    authenticate,
    authorize("learner"),
    advancedController.getRecommendations,
  );

  router.post(
    "/recommendations/:recommendationId/click",
    authenticate,
    authorize("learner"),
    validateParams(schemas.idSchema, "recommendationId"),
    advancedController.clickRecommendation,
  );

  // 2. Prototype & Goal Tracking Endpoints
  router.get(
    "/mastery/me",
    authenticate,
    authorize("learner"),
    advancedController.getMyMastery,
  );
  router.post(
    "/mastery/placement",
    authenticate,
    authorize("learner"),
    advancedController.processPlacement,
  );
  router.get(
    "/mastery/attempts/:attemptId",
    authenticate,
    authorize("learner", "admin"),
    validateParams(schemas.idSchema, "attemptId"),
    advancedController.getAttemptOutcome,
  );
  router.post(
    "/mastery/attempts/:attemptId/process",
    authenticate,
    authorize("learner", "admin"),
    validateParams(schemas.idSchema, "attemptId"),
    advancedController.processAttempt,
  );
  router.get(
    "/progress/me",
    authenticate,
    authorize("learner"),
    advancedController.getMyProgress,
  );
  router.get(
    "/courses/:courseId/gates",
    authenticate,
    authorize("learner"),
    validateParams(schemas.idSchema, "courseId"),
    advancedController.getCourseGates,
  );

  return router;
};

export const createStandaloneAdvancedApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.get("/", (_req, res) => {
    res.json({ message: "IELTStudy Advanced Service is OK!" });
  });
  app.use("/api/v1", createAdvancedRouter());
  app.use((_req, res) => {
    res.status(404).json({ error: { message: "Not found" } });
  });
  app.use(
    (
      err: Error & { status?: number },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const status = err.status ?? 500;
      const message =
        status === 500 && process.env.NODE_ENV !== "development"
          ? "Internal Server Error"
          : err.message;
      res.status(status).json({ error: { message } });
    },
  );
  return app;
};
