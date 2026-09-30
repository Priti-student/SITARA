import { Router } from "express";
import * as ctrl from "../controllers/analytics.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

// Dashboards & alerts are for every signed-in role (payloads are scoped server-side).
const READERS = ["DEPARTMENT_USER", "APPROVING_AUTHORITY", "INSPECTOR", "STATE_ADMIN", "SUPER_ADMIN", "APPLICANT", "UNIT_USER"];

analyticsRouter.get("/overview", requireRoles(...READERS), ctrl.overview);
analyticsRouter.get("/alerts", requireRoles(...READERS), ctrl.alertFeed);