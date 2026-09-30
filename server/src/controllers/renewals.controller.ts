import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as renewals from "../renewals/renewals.service.js";

const createSchema = z.object({ approvalId: z.string().min(1) });

/** GET /api/v1/renewals/due — approvals expiring soon (or already lapsed). */
export const due = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const raw = req.query.days !== undefined ? Number(req.query.days) : undefined;
  const days = raw !== undefined && Number.isFinite(raw) && raw > 0 ? raw : undefined;
  const data = await renewals.listDueRenewals(user, days);
  res.json({ success: true, data });
});

/** GET /api/v1/renewals/:approvalId — renewal readiness + blockers. */
export const readiness = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const readiness = await renewals.getRenewalReadiness(user, String(req.params.approvalId));
  res.json({ success: true, data: { readiness } });
});

/** POST /api/v1/renewals — open a renewal application for an approval. */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { approvalId } = createSchema.parse(req.body);
  const application = await renewals.createRenewalApplication(user, approvalId);
  res.status(201).json({ success: true, data: { application } });
});

/** POST /api/v1/renewals/sweep — run the expiry/alert pass (admin only). */
export const sweep = asyncHandler(async (_req: Request, res: Response) => {
  const result = await renewals.runRenewalPass();
  res.json({ success: true, data: result });
});
