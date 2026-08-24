import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../utils/jwt";
import { User } from "../models/User";

// Extend Express's Request type so req.user is typed everywhere downstream
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verifies the JWT AND the live account state. A valid token belonging to a
 * user who has since been deactivated is rejected immediately — disabling an
 * account takes effect without waiting for token expiry.
 * `$ne: false` (not `=== true`) so legacy documents missing the field still pass.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
    const account = await User.findById(payload.userId).select("isActive");
    if (!account || account.isActive === false) {
      return res.status(403).json({ error: "This account has been disabled by the clinic" });
    }
  } catch {
    // Covers both bad tokens and transient DB failures
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = payload;
  next();
}
