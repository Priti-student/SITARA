import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as incentives from "../incentives/incentives.service.js";

const checkSchema = z.object({ unitId: z.string().min(1) });
const createSchema = z.object({
  schemeId: z.string().min(1),
  unitId: z.string().min(1),
  requestedAmountInr: z.number().int().positive(),
  notes: z.string().max(2000).optional(),
});
const decideSchema = z.object({
  approved: z.boolean(),
  amountInr: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
});
const disburseSchema = z.object({ reference: z.string().min(1).max(120) });
const notesSchema = z.object({ notes: z.string().min(1).max(2000) });

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** GET /api/v1/incentives/schemes — scheme catalogue (+ eligibility for a unit). */
export const schemes = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await incentives.listSchemes(user, {
    q: str(req.query.q),
    category: str(req.query.category),
    unitId: str(req.query.unitId),
    includeInactive: req.query.includeInactive === "1" || req.query.includeInactive === "true",
  });
  res.json({ success: true, data });
});

/** GET /api/v1/incentives/claims — claims list + status counts. */
export const claims = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await incentives.listClaims(user, {
    status: str(req.query.status),
    unitId: str(req.query.unitId),
    schemeId: str(req.query.schemeId),
  });
  res.json({ success: true, data });
});

/** POST /api/v1/incentives/schemes/:schemeId/check — dry-run eligibility. */
export const check = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const { unitId } = checkSchema.parse(req.body);
  const data = await incentives.checkEligibility(user, String(req.params.schemeId), unitId);
  res.json({ success: true, data });
});

/** POST /api/v1/incentives/claims — file a claim (eligibility re-checked). */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = createSchema.parse(req.body);
  const claim = await incentives.createClaim(user, input);
  res.status(201).json({ success: true, data: { claim } });
});

/** GET /api/v1/incentives/claims/:claimId — detail + timeline + action flags. */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await incentives.getClaim(user, String(req.params.claimId));
  res.json({ success: true, data });
});

/** POST /api/v1/incentives/claims/:claimId/review — SUBMITTED → UNDER_REVIEW. */
export const review = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const claim = await incentives.startReview(user, String(req.params.claimId));
  res.json({ success: true, data: { claim } });
});

/** POST /api/v1/incentives/claims/:claimId/decide — approve / reject. */
export const decide = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = decideSchema.parse(req.body);
  const claim = await incentives.decideClaim(user, String(req.params.claimId), input);
  res.json({ success: true, data: { claim } });
});

/** POST /api/v1/incentives/claims/:claimId/disburse — APPROVED → DISBURSED. */
export const disburse = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = disburseSchema.parse(req.body);
  const claim = await incentives.disburseClaim(user, String(req.params.claimId), input);
  res.json({ success: true, data: { claim } });
});

/** POST /api/v1/incentives/claims/:claimId/utilise — DISBURSED → UTILISED. */
export const utilise = asyncHandler(async (req: Request, res: Response) => {
  const user = currentUser(res);
  const input = notesSchema.parse(req.body);
  const claim = await incentives.recordUtilisation(user, String(req.params.claimId), input);
  res.json({ success: true, data: { claim } });
});
