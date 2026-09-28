import type { Request, Response } from "express";
import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/error.js";

export const healthRouter = Router();

/** GET /api/v1/health — liveness + database connectivity probe */
healthRouter.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    let db = "down";
    let connected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "up";
      connected = true;
    } catch {
      db = "down";
    }
    res.status(connected ? 200 : 503).json({
      success: connected,
      data: {
        service: "sitara-api",
        status: connected ? "ok" : "degraded",
        db,
        time: new Date().toISOString(),
      },
    });
  })
);