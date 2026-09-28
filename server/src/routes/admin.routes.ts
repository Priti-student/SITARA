import { Router } from "express";
import { currentUser, requireAuth, requireRoles } from "../middleware/auth.js";

/**
 * Admin-only probe — the simplest demonstration that RBAC middleware is
 * actually enforced. Any endpoint mounted here is gated to SUPER_ADMIN:
 *   401 → no/invalid token       403 → wrong role       200 → allowed
 */
export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get(
  "/ping",
  requireRoles("SUPER_ADMIN"),
  (_req, res) => {
    const user = currentUser(res);
    res.json({
      success: true,
      data: {
        message: "Admin route OK — RBAC enforced",
        user: { id: user.id, email: user.email, roles: user.roles },
      },
    });
  }
);