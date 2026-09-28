import { Router } from "express";
import * as ctrl from "../controllers/units.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const unitsRouter = Router();

unitsRouter.use(requireAuth);

unitsRouter.post("/", ctrl.create);
unitsRouter.get("/", ctrl.list);
unitsRouter.get("/:id", ctrl.detail);