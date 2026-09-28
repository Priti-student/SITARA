import { Router } from "express";
import * as ctrl from "../controllers/applications.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadMiddleware } from "../utils/storage.js";

export const applicationsRouter = Router();

applicationsRouter.use(requireAuth);

applicationsRouter.post("/", ctrl.create);
applicationsRouter.get("/", ctrl.list);
applicationsRouter.get("/:id", ctrl.detail);
applicationsRouter.put("/:id/form", ctrl.updateForm);
applicationsRouter.post("/:id/documents", uploadMiddleware.single("file"), ctrl.uploadDocument);
applicationsRouter.post("/:id/documents/reuse", ctrl.reuseDocument);
applicationsRouter.delete("/:id/documents/:docId", ctrl.deleteDocument);
applicationsRouter.post("/:id/submit", ctrl.submit);