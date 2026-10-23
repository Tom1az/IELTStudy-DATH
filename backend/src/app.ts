import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import logger from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import userRoute from "./routes/user.ts";

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
app.use("/api/v1/users", userRoute);

app.get("/", (req, res) => {
  return res.status(200).json({
    message: "Server is OK!",
  });
});

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  const error: HttpError = new Error("Not Found");
  error.status = 404;
  next(error);
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

type HttpError = Error & { status?: number };

export default app;
