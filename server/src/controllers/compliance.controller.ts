import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as compliance from "../compliance/compliance.service.js";

const remediateSchema = z.object({ notes: z.string().min(1).max(4000) });
const resolveSchema = z.object({ accepted: z.boolean(), notes: z.string().max(4000).optional() });

/** GET /api/v1/compliance — remediation cases (+ status counts). */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await compliance.listComplianceCases(user, {
    status: req.query.status ? String(req.query.status) : undefined,
    unitId: req.query.unitId ? String(req.query.unitId) : undefined,
  });
  res.json({ success: true, data });
});

/** GET /api/v1/compliance/units/:unitId — derived unit compliance rollup. */
export const unit = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await compliance.getUnitComplianceStatus(user, String(req.params.unitId));
  res.json({ success: true, data });
});

/** GET /api/v1/compliance/:caseId — case detail + history + action flags. */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const caseData = await compliance.getComplianceCase(user, String(req.params.caseId));
  res.json({ success: true, data: { case: caseData } });
});

/** POST /api/v1/compliance/:caseId/remediate — applicant files proof. */
export const remediate = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { notes } = remediateSchema.parse(req.body);
  const updated = await compliance.submitRemediation(user, String(req.params.caseId), notes);
  res.json({ success: true, data: { case: updated } });
});

/** POST /api/v1/compliance/:caseId/resolve — officer verifies (accept/reopen). */
export const resolve = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = resolveSchema.parse(req.body);
  const updated = await compliance.resolveComplianceCase(user, String(req.params.caseId), input);
  res.json({ success: true, data: { case: updated } });
});
