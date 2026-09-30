import { Router } from "express";
import * as ctrl from "../controllers/inspections.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

export const inspectionsRouter = Router();

inspectionsRouter.use(requireAuth);

// Readers: officers, inspectors — and applicants (scoped to their own applications).
const READERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN", "APPLICANT"];
// Planners: officers who schedule, assign, complete and cancel visits.
const PLANNERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];
const EXECUTORS = [...PLANNERS, "INSPECTOR"];

// Specific paths must be registered before "/:id".
inspectionsRouter.get("/risk/:applicationId", requireRoles(...READERS), ctrl.risk);
inspectionsRouter.get("/inspectors", requireRoles(...EXECUTORS), ctrl.inspectors);

inspectionsRouter.get("/", requireRoles(...READERS), ctrl.list);
inspectionsRouter.post("/", requireRoles(...PLANNERS), ctrl.create);
inspectionsRouter.get("/:id", requireRoles(...READERS), ctrl.detail);
inspectionsRouter.post("/:id/assign", requireRoles(...PLANNERS), ctrl.assign);
inspectionsRouter.post("/:id/start", requireRoles(...EXECUTORS), ctrl.start);
inspectionsRouter.post("/:id/observation", requireRoles(...EXECUTORS), ctrl.observation);
inspectionsRouter.post("/:id/complete", requireRoles(...PLANNERS), ctrl.complete);
inspectionsRouter.post("/:id/cancel", requireRoles(...PLANNERS), ctrl.cancel);
