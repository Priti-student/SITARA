import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as service from "../services/notifications.service.js";

/** GET /api/v1/notifications */
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.listMine(user.id);
  res.json({ success: true, data });
});

/** POST /api/v1/notifications/read-all */
export const markAllRead = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.markAllRead(user.id);
  res.json({ success: true, data });
});

/** POST /api/v1/notifications/:id/read */
export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.markRead(user.id, String(req.params.id));
  res.json({ success: true, data });
});