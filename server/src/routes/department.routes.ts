import { Router } from "express";
import * as ctrl from "../controllers/department.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

export const departmentRouter = Router();

departmentRouter.use(requireAuth);

departmentRouter.get("/inbox", requireRoles("DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"), ctrl.getInbox);
departmentRouter.get("/applications/:id", requireRoles("DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"), ctrl.getApplication);
departmentRouter.post("/applications/:id/approve", requireRoles("DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"), ctrl.approve);
departmentRouter.post("/applications/:id/reject", requireRoles("DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"), ctrl.reject);
departmentRouter.post("/applications/:id/query", requireRoles("DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"), ctrl.query);
departmentRouter.post("/applications/:id/escalate", requireRoles("DEPARTMENT_USER", "APPROVING_AUTHORITY", "STATE_ADMIN", "SUPER_ADMIN"), ctrl.escalate);
departmentRouter.post("/sla/run", requireRoles("STATE_ADMIN", "SUPER_ADMIN"), ctrl.runSla);