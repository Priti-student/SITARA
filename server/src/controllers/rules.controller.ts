import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as engine from "../rules/engine.js";
import { prisma } from "../utils/prisma.js";

export const evaluateSchema = z.object({
  context: z.record(z.string(), z.unknown()),
});

const listQuerySchema = z.object({
  ruleType: z.string().optional(),
  authority: z.string().optional(),
  q: z.string().optional(),
  activeOnly: z.string().optional(),
});

/** GET /api/v1/rules */
export const list = asyncHandler(async (req: Request, res: Response) => {
  void currentUser(res); // requires authentication
  const query = listQuerySchema.parse(req.query);
  const data = await engine.listRules({
    ruleType: query.ruleType,
    authority: query.authority,
    q: query.q,
    activeOnly: query.activeOnly === "true",
  });
  res.json({ success: true, data });
});

/** GET /api/v1/rules/:id */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  void currentUser(res);
  const rule = await prisma.regulatoryRule.findUnique({
    where: { id: String(req.params.id) },
    include: {
      authority: true,
      department: true,
      approvalType: { include: { authority: true, department: true } },
    },
  });
  if (!rule) {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Rule not found" },
    });
    return;
  }
  res.json({ success: true, data: { rule } });
});

/** POST /api/v1/rules/evaluate — knowledge engine against a unit/profile context */
export const evaluate = asyncHandler(async (req: Request, res: Response) => {
  void currentUser(res);
  const input = evaluateSchema.parse(req.body);
  const data = await engine.getApplicableApprovals(input.context);
  res.json({ success: true, data });
});

/** GET /api/v1/approval-types — master catalogue */
export const approvalTypes = asyncHandler(async (_req: Request, res: Response) => {
  void currentUser(res);
  const items = await prisma.approvalType.findMany({
    include: {
      authority: true,
      department: true,
      requirements: { include: { documentType: true } },
    },
    orderBy: [{ stage: "asc" }, { name: "asc" }],
  });
  res.json({ success: true, data: { items } });
});