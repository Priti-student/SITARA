import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as department from "../workflow/department.service.js";
import { runSlaPass } from "../workflow/sla.service.js";

const actionSchema = z.object({
  instanceId: z.string().min(1),
  comment: z.string().max(2000).optional(),
  reason: z.string().max(2000).optional(),
  question: z.string().max(2000).optional(),
});

/** GET /api/v1/department/inbox */
export const getInbox = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await department.inbox(user, req.query.status ? { status: String(req.query.status) } : {});
  res.json({ success: true, data });
});

/** GET /api/v1/department/applications/:id */
export const getApplication = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const application = await department.viewApplication(user, String(req.params.id));
  res.json({ success: true, data: { application } });
});

/** POST /api/v1/department/applications/:id/approve */
export const approve = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { instanceId, comment } = actionSchema.parse(req.body);
  const data = await department.approveStep(user, instanceId, comment ?? "");
  res.json({ success: true, data });
});

/** POST /api/v1/department/applications/:id/reject */
export const reject = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { instanceId, reason } = actionSchema.parse(req.body);
  const data = await department.rejectApplication(user, instanceId, reason ?? "");
  res.json({ success: true, data });
});

/** POST /api/v1/department/applications/:id/query */
export const query = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { instanceId, question } = actionSchema.parse(req.body);
  if (!question) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Query question is required" } });
    return;
  }
  const data = await department.raiseQuery(user, instanceId, question);
  res.json({ success: true, data });
});

/** POST /api/v1/department/applications/:id/escalate */
export const escalate = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { instanceId, reason } = actionSchema.parse(req.body);
  const data = await department.escalate(user, instanceId, reason ?? "");
  res.json({ success: true, data });
});

/** POST /api/v1/department/sla/run — manual SLA pass (also runs every 60s) */
export const runSla = asyncHandler(async (_req: Request, res: Response) => {
  void currentUser(res);
  const data = await runSlaPass();
  res.json({ success: true, data });
});