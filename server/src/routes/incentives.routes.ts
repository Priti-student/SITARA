import { Router } from "express";
import * as ctrl from "../controllers/incentives.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

export const incentivesRouter = Router();

incentivesRouter.use(requireAuth);

// Readers: officers + the applicant side (claims scoped to their units).
const READERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN", "APPLICANT", "UNIT_USER"];
const OFFICERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];

// Static paths first — Express 5 matches in registration order.
incentivesRouter.get("/schemes", requireRoles(...READERS), ctrl.schemes);
incentivesRouter.get("/claims", requireRoles(...READERS), ctrl.claims);

incentivesRouter.post("/schemes/:schemeId/check", requireRoles(...READERS), ctrl.check);
incentivesRouter.post("/claims", requireRoles("APPLICANT", "UNIT_USER"), ctrl.create);

incentivesRouter.get("/claims/:claimId", requireRoles(...READERS), ctrl.detail);
incentivesRouter.post("/claims/:claimId/review", requireRoles(...OFFICERS), ctrl.review);
incentivesRouter.post("/claims/:claimId/decide", requireRoles(...OFFICERS), ctrl.decide);
incentivesRouter.post(
  "/claims/:claimId/disburse",
  requireRoles("STATE_ADMIN", "SUPER_ADMIN"),
  ctrl.disburse,
);
incentivesRouter.post("/claims/:claimId/utilise", requireRoles("APPLICANT", "UNIT_USER"), ctrl.utilise);
