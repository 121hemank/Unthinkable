import { Request, Response, NextFunction } from "express";
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
    console.error("[error]", err);
    if (err?.code === 11000) {
        return res.status(409).json({ error: "That slot was just taken. Please pick another." });
    }
    const status = err?.status || 500;
    const message = err?.message || "Something went wrong on our end.";
    return res.status(status).json({ error: message });
}
