import { Router } from "express";
import * as ctrl from "../controllers/units.controller.js";
import * as applicationsCtrl from "../controllers/applications.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const unitsRouter = Router();

unitsRouter.use(requireAuth);

unitsRouter.post("/", ctrl.create);
unitsRouter.get("/", ctrl.list);
unitsRouter.get("/:id", ctrl.detail);
unitsRouter.get("/:id/documents", applicationsCtrl.listUnitDocuments);