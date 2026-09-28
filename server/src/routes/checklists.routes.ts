import { Router } from "express";
import * as ctrl from "../controllers/checklists.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const checklistsRouter = Router();

checklistsRouter.use(requireAuth);

checklistsRouter.post("/preview", ctrl.preview);
checklistsRouter.post("/", ctrl.create);
checklistsRouter.get("/", ctrl.list);
checklistsRouter.get("/:id", ctrl.detail);
checklistsRouter.patch("/:id/items/:itemId", ctrl.updateItem);