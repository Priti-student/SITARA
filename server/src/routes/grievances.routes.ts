import { Router } from "express";
import * as ctrl from "../controllers/grievances.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

export const grievancesRouter = Router();

grievancesRouter.use(requireAuth);

// Readers: everyone (the service scopes applicants to their own filings).
const READERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN", "APPLICANT", "UNIT_USER"];
// Handling: officers acknowledge, respond, resolve and escalate.
const OFFICERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"];

// Static paths first — Express 5 matches in registration order.
grievancesRouter.get("/", requireRoles(...READERS), ctrl.list);
grievancesRouter.post("/", requireRoles(...READERS), ctrl.create);
grievancesRouter.post("/sweep", requireRoles(...OFFICERS), ctrl.sweep);

grievancesRouter.get("/:grievanceId", requireRoles(...READERS), ctrl.detail);
grievancesRouter.post("/:grievanceId/acknowledge", requireRoles(...OFFICERS), ctrl.acknowledge);
grievancesRouter.post("/:grievanceId/respond", requireRoles(...OFFICERS), ctrl.respond);
grievancesRouter.post("/:grievanceId/resolve", requireRoles(...OFFICERS), ctrl.resolve);
// Filer or officer may escalate (the service gates filer escalation on the SLA).
grievancesRouter.post("/:grievanceId/escalate", requireRoles(...READERS), ctrl.escalate);