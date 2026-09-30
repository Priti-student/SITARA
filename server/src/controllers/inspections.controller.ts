import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as inspections from "../inspections/inspections.service.js";

const createSchema = z.object({
  applicationId: z.string().min(1),
  title: z.string().max(200).optional(),
  scheduledAt: z.string().min(1),
  venue: z.string().max(500).optional(),
  departmentCodes: z.array(z.string().min(1)).max(10).optional(),
});

const assignSchema = z.object({
  participantId: z.string().min(1),
  inspectorId: z.string().min(1),
});

const observationSchema = z.object({
  participantId: z.string().min(1).optional(),
  compliant: z.boolean(),
  notes: z.string().min(1).max(4000),
});

const completeSchema = z.object({
  findings: z.string().min(1).max(8000),
  complianceStatus: z.string().min(1),
});

const cancelSchema = z.object({ reason: z.string().max(2000).optional() });

/** GET /api/v1/inspections — list (status, applicationId, mine filters). */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await inspections.listInspections(user, {
    status: req.query.status ? String(req.query.status) : undefined,
    applicationId: req.query.applicationId ? String(req.query.applicationId) : undefined,
    mine: req.query.mine === "true",
  });
  res.json({ success: true, data });
});

/** GET /api/v1/inspections/risk/:applicationId — risk assessment (recompute + persist). */
export const risk = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const assessment = await inspections.assessRisk(user, String(req.params.applicationId));
  res.json({ success: true, data: { assessment } });
});

/** GET /api/v1/inspections/inspectors — active inspector directory. */
export const inspectors = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await inspections.listInspectors(user);
  res.json({ success: true, data });
});

/** POST /api/v1/inspections — plan a joint inspection. */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = createSchema.parse(req.body);
  const inspection = await inspections.createInspection(user, input);
  res.status(201).json({ success: true, data: { inspection } });
});

/** GET /api/v1/inspections/:id — full detail. */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const inspection = await inspections.getInspection(user, String(req.params.id));
  res.json({ success: true, data: { inspection } });
});

/** POST /api/v1/inspections/:id/assign — assign an inspector to a participant. */
export const assign = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { participantId, inspectorId } = assignSchema.parse(req.body);
  const data = await inspections.assignInspector(user, String(req.params.id), participantId, inspectorId);
  res.json({ success: true, data });
});

/** POST /api/v1/inspections/:id/start — begin the site visit. */
export const start = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await inspections.startInspection(user, String(req.params.id));
  res.json({ success: true, data });
});

/** POST /api/v1/inspections/:id/observation — inspector files field notes. */
export const observation = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = observationSchema.parse(req.body);
  const created = await inspections.fileObservation(user, String(req.params.id), input);
  res.status(201).json({ success: true, data: { observation: created } });
});

/** POST /api/v1/inspections/:id/complete — consolidated report + verdict. */
export const complete = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = completeSchema.parse(req.body);
  const data = await inspections.completeInspection(user, String(req.params.id), input);
  res.json({ success: true, data });
});

/** POST /api/v1/inspections/:id/cancel — cancel the visit. */
export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { reason } = cancelSchema.parse(req.body ?? {});
  const data = await inspections.cancelInspection(user, String(req.params.id), reason ?? "");
  res.json({ success: true, data });
});
