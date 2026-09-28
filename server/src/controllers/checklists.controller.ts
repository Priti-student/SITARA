import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as service from "../services/checklists.service.js";

const previewBodySchema = z.object({
  context: z.record(z.string(), z.unknown()),
});

/** POST /api/v1/checklists/preview — live evaluation without persisting */
export const preview = asyncHandler(async (req: Request, res: Response) => {
  void currentUser(res);
  const { context } = previewBodySchema.parse(req.body);
  const data = await service.previewChecklist(context);
  res.json({ success: true, data });
});

/** POST /api/v1/checklists */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = service.createChecklistSchema.parse(req.body);
  const data = await service.createChecklist(user.id, input);
  res.status(201).json({ success: true, data: { checklist: data } });
});

/** GET /api/v1/checklists */
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.listMine(user.id);
  res.json({ success: true, data: { items: data } });
});

/** GET /api/v1/checklists/:id */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await service.getById(user.id, String(req.params.id));
  res.json({ success: true, data: { checklist: data } });
});

/** PATCH /api/v1/checklists/:id/items/:itemId */
export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = service.updateItemSchema.parse(req.body);
  const data = await service.updateItemStatus(
    user.id,
    String(req.params.id),
    String(req.params.itemId),
    input.status
  );
  res.json({ success: true, data });
});