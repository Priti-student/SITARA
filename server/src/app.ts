import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { corsOriginList, env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.routes.js";
import { healthRouter } from "./routes/health.routes.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin: corsOriginList,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  // API routes v1
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", authRouter);

  // 404 + central error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}