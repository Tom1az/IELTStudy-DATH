import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { authenticate, authorize } from "../middlewares/auth.ts";
import { validateParams, schemas } from "../utils/validator.ts";
import { httpError } from "../utils/http-error.ts";
import advancedController from "../controllers/advanced.ts";
import { processAttemptMastery } from "../services/bkt.ts";
import {
  computeCourseLessonGates,
  isLessonLockedForLearner,
} from "../services/gating.ts";
import { generateRecommendationsForLearner } from "../services/recommender.ts";

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

  // 3. Interceptors (khi gắn cùng Core App)
  router.get(
    "/lessons/:lessonId",
    authenticate,
    validateParams(schemas.idSchema, "lessonId"),
    async (req: Request, _res: Response, next: NextFunction) => {
      if (req.user?.role === "learner") {
        const lessonId = req.value!.params!.lessonId;
        const gate = await isLessonLockedForLearner(req.user.userId, lessonId);
        if (gate.locked) {
          throw httpError(403, gate.reason ?? "This lesson is locked");
        }
      }
      next();
    },
  );

  router.use(
    "/attempts/:attemptId",
    (req: Request, res: Response, next: NextFunction) => {
      const originalJson = res.json.bind(res);

      res.json = ((body: unknown) => {
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
        const hasResult =
          typeof body === "object" &&
          body !== null &&
          "result" in body &&
          typeof (body as { result?: unknown }).result === "object";

        if (!isSuccess || !hasResult) {
          return originalJson(body);
        }

        const payload = body as {
          result: {
            attempt: { attemptId: number; status: string };
            masteryChanges: unknown[];
            recommendations: unknown[];
          };
          message: string;
        };

        if (payload.result.attempt.status !== "completed") {
          return originalJson(body);
        }

        const attemptId = payload.result.attempt.attemptId;
        const userId = req.user?.userId;

        (async () => {
          try {
            const masteryChanges = await processAttemptMastery(attemptId);
            const recommendations = userId
              ? await generateRecommendationsForLearner(userId, {
                  sourceAttemptId: attemptId,
                })
              : [];
            payload.result.masteryChanges = masteryChanges;
            payload.result.recommendations = recommendations;
          } catch (err) {
            console.error("Advanced BKT post-submit hook error:", err);
          }
          originalJson(payload);
        })();

        return res;
      }) as typeof res.json;

      next();
    },
  );

  router.get(
    "/courses/:courseId/lessons",
    (req: Request, res: Response, next: NextFunction) => {
      const originalJson = res.json.bind(res);

      res.json = ((body: unknown) => {
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
        const hasLessons =
          typeof body === "object" &&
          body !== null &&
          "lessons" in body &&
          Array.isArray((body as { lessons?: unknown }).lessons);

        if (!isSuccess || !hasLessons || req.user?.role !== "learner") {
          return originalJson(body);
        }

        const courseId = Number(req.params.courseId);
        const userId = req.user.userId;
        const payload = body as {
          lessons: Array<{ lessonId: number; locked?: boolean }>;
          message: string;
        };

        (async () => {
          try {
            const gates = await computeCourseLessonGates(userId, courseId);
            for (const lesson of payload.lessons) {
              const gate = gates.get(lesson.lessonId);
              if (gate) {
                lesson.locked = gate.locked;
              }
            }
          } catch (err) {
            console.error("Advanced gating hook error:", err);
          }
          originalJson(payload);
        })();

        return res;
      }) as typeof res.json;

      next();
    },
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
