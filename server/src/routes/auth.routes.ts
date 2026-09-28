import { Router } from "express";
import * as ctrl from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/register", ctrl.register);
authRouter.post("/login", ctrl.login);
authRouter.post("/refresh", ctrl.refresh);
authRouter.post("/logout", ctrl.logout);
authRouter.get("/me", requireAuth, ctrl.me);