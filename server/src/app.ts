import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { corsOriginList, env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { apiRateLimiter, authRateLimiter } from "./middleware/rate-limit.js";
import { authRouter } from "./routes/auth.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { rulesRouter } from "./routes/rules.routes.js";
import { unitsRouter } from "./routes/units.routes.js";
import { checklistsRouter } from "./routes/checklists.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { applicationsRouter } from "./routes/applications.routes.js";
import { departmentRouter } from "./routes/department.routes.js";
import { inspectionsRouter } from "./routes/inspections.routes.js";
import { renewalsRouter } from "./routes/renewals.routes.js";
import { complianceRouter } from "./routes/compliance.routes.js";
import { incentivesRouter } from "./routes/incentives.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";
import { grievancesRouter } from "./routes/grievances.routes.js";

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

  // Phase 10 — per-IP rate limiting: global API budget, stricter auth budget
  app.use("/api/v1", apiRateLimiter);
  app.use("/api/v1/auth", authRateLimiter);

  // API routes v1
  app.use("/api/v1/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/rules", rulesRouter);
  app.use("/api/v1/units", unitsRouter);
  app.use("/api/v1/checklists", checklistsRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/applications", applicationsRouter);
  app.use("/api/v1/department", departmentRouter);
  app.use("/api/v1/inspections", inspectionsRouter);
  app.use("/api/v1/renewals", renewalsRouter);
  app.use("/api/v1/compliance", complianceRouter);
  app.use("/api/v1/incentives", incentivesRouter);
  app.use("/api/v1/analytics", analyticsRouter);
  app.use("/api/v1/grievances", grievancesRouter);

  // 404 + central error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}