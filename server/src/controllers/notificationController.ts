import { Request, Response, NextFunction } from "express";
import { NotificationLog } from "../models/NotificationLog";
export async function listMyNotifications(req: Request, res: Response, next: NextFunction) {
    try {
        const notifications = await NotificationLog.find({ recipientId: req.user!.userId })
            .sort({ createdAt: -1 })
            .limit(25)
            .select("type channel status payload createdAt lastError");
        return res.json({ notifications });
    }
    catch (err) {
        next(err);
    }
}
