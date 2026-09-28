import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.js";
import { currentUser } from "../middleware/auth.js";
import * as authService from "../services/auth.service.js";

/** POST /api/v1/auth/register */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = authService.registerSchema.parse(req.body);
  const data = await authService.register(input);
  res.status(201).json({ success: true, data });
});

/** POST /api/v1/auth/login */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = authService.loginSchema.parse(req.body);
  const data = await authService.login(input);
  res.json({ success: true, data });
});

/** POST /api/v1/auth/refresh */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const input = authService.refreshSchema.parse(req.body);
  const data = await authService.refresh(input.refreshToken);
  res.json({ success: true, data });
});

/** POST /api/v1/auth/logout */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const input = authService.refreshSchema.parse(req.body);
  const data = await authService.logout(input.refreshToken);
  res.json({ success: true, data });
});

/** GET /api/v1/auth/me (authenticated) */
export const me = asyncHandler(async (_req: Request, res: Response) => {
  const user = currentUser(res);
  const data = await authService.getUserProfile(user.id);
  res.json({ success: true, data });
});