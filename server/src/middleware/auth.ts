import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../utils/jwt";
import { User } from "../models/User";
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
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
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = payload;
    next();
}
