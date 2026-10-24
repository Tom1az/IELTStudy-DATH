import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import logger from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import adminRoute from "./routes/admin.ts";
import authRoute from "./routes/auth.ts";
import coursesRoute from "./routes/courses.ts";
import diagnosticRoute from "./routes/diagnostic.ts";
import instructorRoute from "./routes/instructor.ts";
import lessonsRoute from "./routes/lessons.ts";
import meRoute from "./routes/me.ts";
import passagesRoute from "./routes/passages.ts";
import questionsRoute from "./routes/questions.ts";
import quizzesRoute from "./routes/quizzes.ts";
import skillsRoute from "./routes/skills.ts";
import uploadsRoute from "./routes/uploads.ts";
import { httpError } from "./utils/http-error.ts";
import type { HttpError } from "./utils/http-error.ts";

const app = express();

const openapiDoc = YAML.parse(
  fs.readFileSync(new URL("./docs/openapi.yaml", import.meta.url), "utf8"),
);

// Middlewares, client -> middlewares -> server (handled in controllers)
if (process.env.NODE_ENV !== "test") app.use(logger("dev"));
app.use(express.json());

// API docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDoc));

// Routes
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/me", meRoute);
app.use("/api/v1/skills", skillsRoute);
app.use("/api/v1/courses", coursesRoute);
app.use("/api/v1/lessons", lessonsRoute);
app.use("/api/v1/passages", passagesRoute);
app.use("/api/v1/uploads", uploadsRoute);
app.use("/api/v1/questions", questionsRoute);
app.use("/api/v1/quizzes", quizzesRoute);
app.use("/api/v1/diagnostic", diagnosticRoute);
app.use("/api/v1/instructor", instructorRoute);
app.use("/api/v1/admin", adminRoute);

app.get("/", (req, res) => {
  return res.status(200).json({
    message: "Server is OK!",
  });
});

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  next(httpError(404, "Not Found"));
});

// Error handler function
app.use((err: HttpError, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  const isDev = app.get("env") === "development";

  if (status >= 500) console.error(err);

  return res.status(status).json({
    error: {
      message: status < 500 || isDev ? err.message : "Internal Server Error",
    },
  });
});

export default app;
