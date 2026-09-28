import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as service from "../services/units.service.js";

/** POST /api/v1/units */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = service.createUnitSchema.parse(req.body);
  const unit = await service.createUnit(user.id, input);
  res.status(201).json({ success: true, data: { unit } });
});

/** GET /api/v1/units */
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const items = await service.listMine(user.id);
  res.json({ success: true, data: { items } });
});

/** GET /api/v1/units/:id */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const unit = await service.getMine(user.id, String(req.params.id));
  res.json({ success: true, data: { unit } });
});