import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import logger from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import authRoute from "./routes/auth.ts";
import meRoute from "./routes/me.ts";
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
