import { Router } from "express";
import * as ctrl from "../controllers/compliance.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

export const complianceRouter = Router();

complianceRouter.use(requireAuth);

// Readers: officers + the applicant side (scoped to their own units).
const READERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN", "APPLICANT", "UNIT_USER"];
// Officers verify and close cases; applicants file remediations.
const OFFICERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];

// Specific paths must be registered before "/:caseId".
complianceRouter.get("/units/:unitId", requireRoles(...READERS), ctrl.unit);

complianceRouter.get("/", requireRoles(...READERS), ctrl.list);
complianceRouter.get("/:caseId", requireRoles(...READERS), ctrl.detail);
complianceRouter.post("/:caseId/remediate", requireRoles("APPLICANT", "UNIT_USER"), ctrl.remediate);
complianceRouter.post("/:caseId/resolve", requireRoles(...OFFICERS), ctrl.resolve);
