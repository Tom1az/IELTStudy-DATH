import "express";
import type { PublicUser } from "../utils/public-user.ts";

declare global {
  namespace Express {
    interface Request {
      // Validated input, set by utils/validator.ts. Joi output is untyped, so controllers
      // destructure it with the shape their schema guarantees.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      value?: {
        body?: any;
        params?: Record<string, any>;
        query?: any;
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
      // The logged-in user, freshly loaded from the database by `authenticate` (middlewares/auth.ts)
      user?: PublicUser;
    }
  }
}
