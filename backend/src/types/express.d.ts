import "express";

declare global {
  namespace Express {
    interface Request {
      // Validated input, set by utils/validator.ts. Joi output is untyped, so controllers
      // destructure it with the shape their schema guarantees.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      value?: {
        body?: any;
        params?: Record<string, any>;
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
      // Authenticated user, set by the auth middleware (Phase 2)
      user?: {
        id: number;
        role: "learner" | "instructor" | "admin";
      };
    }
  }
}
