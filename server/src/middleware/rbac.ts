import { Request, Response, NextFunction } from "express";
import { UserRole } from "../models/User";

/**
 * Role-based access control. Use AFTER requireAuth so req.user is populated.
 * Usage: router.post("/leave", requireAuth, requireRole("admin"), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do this" });
    }
    next();
  };
}
