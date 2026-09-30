import { Router } from "express";
import * as ctrl from "../controllers/renewals.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

export const renewalsRouter = Router();

renewalsRouter.use(requireAuth);

// Readers: officers + the applicant side (scoped to their own units).
const READERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN", "APPLICANT", "UNIT_USER"];

// Specific paths must be registered before "/:approvalId".
renewalsRouter.get("/due", requireRoles(...READERS), ctrl.due);
renewalsRouter.post("/sweep", requireRoles("STATE_ADMIN", "SUPER_ADMIN"), ctrl.sweep);

renewalsRouter.get("/:approvalId", requireRoles(...READERS), ctrl.readiness);
renewalsRouter.post("/", requireRoles("APPLICANT", "UNIT_USER"), ctrl.create);
