import type { NextFunction, Request, Response } from "express";
import { AppError } from "./error.js";
import { verifyAccessToken } from "../utils/tokens.js";

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var authUser: AuthUser | undefined;
}

/**
 * Attaches the authenticated user (from Bearer token) to `res.locals.user`.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError({ message: "Authentication required", status: 401, code: "UNAUTHENTICATED" }));
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
    res.locals = res.locals ?? {};
    res.locals.user = user;
    next();
  } catch {
    next(new AppError({ message: "Invalid or expired token", status: 401, code: "INVALID_TOKEN" }));
  }
}

/** Builds a middleware that requires at least one of the allowed roles. */
export function requireRoles(...allowed: string[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = (res.locals as { user?: AuthUser }).user;
    if (!user) {
      next(new AppError({ message: "Authentication required", status: 401, code: "UNAUTHENTICATED" }));
      return;
    }
    const permitted = user.roles.some((r) => allowed.includes(r));
    if (!permitted) {
      next(new AppError({ message: "Insufficient permissions", status: 403, code: "FORBIDDEN" }));
      return;
    }
    next();
  };
}

export function currentUser(res: Response): AuthUser {
  const user = (res.locals as { user?: AuthUser }).user;
  if (!user) {
    throw new AppError({ message: "Authentication required", status: 401, code: "UNAUTHENTICATED" });
  }
  return user;
}