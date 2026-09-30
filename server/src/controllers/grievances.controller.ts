import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as grievances from "../grievances/grievances.service.js";

const createSchema = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(10).max(4000),
  category: z.enum(["SERVICE_DELAY", "PROCESS_ISSUE", "CORRUPTION_REPORT", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  unitId: z.string().min(1).optional(),
  applicationId: z.string().min(1).optional(),
});
const decideSchema = z.object({
  accepted: z.boolean(),
  notes: z.string().min(3).max(2000),
});
const notesSchema = z.object({ notes: z.string().min(3).max(2000) });
const escalateSchema = z.object({ reason: z.string().min(3).max(1000) });

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** GET /api/v1/grievances — list + status counts (scoped by role). */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await grievances.listGrievances(user, {
    status: str(req.query.status),
    category: str(req.query.category),
    priority: str(req.query.priority),
  });
  res.json({ success: true, data });
});

/** POST /api/v1/grievances — file a grievance (SLA by priority). */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = createSchema.parse(req.body);
  const grievance = await grievances.createGrievance(user, input);
  res.status(201).json({ success: true, data: { grievance } });
});

/** GET /api/v1/grievances/:grievanceId — detail, timeline, action flags. */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await grievances.getGrievance(user, String(req.params.grievanceId));
  res.json({ success: true, data });
});

/** POST /api/v1/grievances/:grievanceId/acknowledge — officer takes the case. */
export const acknowledge = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const grievance = await grievances.acknowledgeGrievance(user, String(req.params.grievanceId));
  res.json({ success: true, data: { grievance } });
});

/** POST /api/v1/grievances/:grievanceId/respond — officer adds a response. */
export const respond = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { notes } = notesSchema.parse(req.body);
  const grievance = await grievances.respondToGrievance(user, String(req.params.grievanceId), notes);
  res.json({ success: true, data: { grievance } });
});

/** POST /api/v1/grievances/:grievanceId/resolve — accept & close / reject. */
export const resolve = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = decideSchema.parse(req.body);
  const grievance = await grievances.decideGrievance(user, String(req.params.grievanceId), input);
  res.json({ success: true, data: { grievance } });
});

/** POST /api/v1/grievances/:grievanceId/escalate — push it up a level. */
export const escalate = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { reason } = escalateSchema.parse(req.body);
  const grievance = await grievances.escalateGrievance(user, String(req.params.grievanceId), reason);
  res.json({ success: true, data: { grievance } });
});

/** POST /api/v1/grievances/sweep — run the auto-escalation pass now. */
export const sweep = asyncHandler(async (_req: Request, res: Response) => {
  const result = await grievances.runGrievancePass();
  res.json({ success: true, data: result });
});