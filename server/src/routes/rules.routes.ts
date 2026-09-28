import { Router } from "express";
import * as ctrl from "../controllers/rules.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const rulesRouter = Router();

// Any authenticated user can browse the knowledge base / evaluate it
rulesRouter.use(requireAuth);

// Master catalogue FIRST so it is not shadowed by the "/:id" route
rulesRouter.get("/approval-types", ctrl.approvalTypes);
rulesRouter.post("/evaluate", ctrl.evaluate);
rulesRouter.get("/", ctrl.list);
rulesRouter.get("/:id", ctrl.detail);