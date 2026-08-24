import { Request, Response, NextFunction } from "express";
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
    console.error("[error]", err);
    if (err?.code === 11000) {
        const keyPattern = JSON.stringify(err?.keyPattern || {});
        if (keyPattern.includes("slotStart")) {
            return res.status(409).json({ error: "That slot was just taken. Please pick another." });
        }
        return res.status(409).json({ error: "This record already exists." });
    }
    const status = err?.status || 500;
    const safeMessage = process.env.NODE_ENV === "production" && status >= 500;
    const message = safeMessage ? "Something went wrong on our end." : (err?.message || "Something went wrong on our end.");
    return res.status(status).json({ error: message });
}
