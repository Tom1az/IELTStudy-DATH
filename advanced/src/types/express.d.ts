import "express";
import type { PublicUser } from "../utils/public-user.ts";

declare global {
  namespace Express {
    interface Request {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      value?: {
        body?: any;
        params?: Record<string, any>;
        query?: any;
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
      user?: PublicUser;
    }
  }
}
