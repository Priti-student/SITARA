import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as analytics from "../analytics/analytics.service.js";
import * as alerts from "../analytics/alerts.service.js";

/** GET /api/v1/analytics/overview — role-aware dashboard payload. */
export const overview = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await analytics.getOverview(user);
  res.json({ success: true, data });
});

/** GET /api/v1/analytics/alerts — severity-ranked consolidated alert feed. */
export const alertFeed = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 50;
  const data = await alerts.getAlerts(user, limit);
  res.json({ success: true, data });
});