import { Router } from "express";
import * as ctrl from "../controllers/notifications.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", ctrl.list);
notificationsRouter.post("/read-all", ctrl.markAllRead);
notificationsRouter.post("/:id/read", ctrl.markRead);