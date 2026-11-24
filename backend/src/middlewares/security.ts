// helmet (security headers), CORS and rate limits for the auth endpoints.
import cors from "cors";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";

// The frontend normally calls the API through its own origin (Next.js rewrites), which needs no
// CORS at all. CORS_ORIGINS lists the extra origins allowed to call the API straight from a
// browser, comma-separated (e.g. a Vercel preview). Without it, cross-origin calls are refused.
export const corsMiddleware = (): RequestHandler => {
  const origins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return cors({
    origin: origins.length > 0 ? origins : false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  });
};

// Swagger UI (/api-docs) loads inline scripts and styles, so helmet's default CSP would break it.
// The API itself only returns JSON, which a CSP doesn't affect, so CSP is left off.
export const helmetMiddleware = (): RequestHandler =>
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false });

// Limits per client IP. Off in tests, which log in hundreds of times from one address.
const limiter = (windowMinutes: number, limit: number): RequestHandler =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test" && process.env.RATE_LIMIT_IN_TESTS !== "1",
    handler: (_req, res) => {
      res.status(429).json({ error: { message: "Too many requests, please try again later" } });
    },
  });

// 10 login attempts per 15 minutes per IP
export const loginLimiter = limiter(15, 10);
// 5 reset emails and 10 reset attempts per hour per IP
export const forgotPasswordLimiter = limiter(60, 5);
export const resetPasswordLimiter = limiter(60, 10);
