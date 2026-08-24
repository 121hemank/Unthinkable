import { Request, Response, NextFunction } from "express";

/**
 * Central error handler. Every controller should catch its own errors and
 * call next(err) rather than throwing uncaught — this guarantees a
 * consistent JSON error shape and stops one bad request from crashing the
 * process.
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error("[error]", err);

  // MongoDB duplicate key error — most commonly hit on the appointment
  // unique index (doctorId + slotStart). See appointmentController.ts.
  if (err?.code === 11000) {
    return res.status(409).json({ error: "That slot was just taken. Please pick another." });
  }

  const status = err?.status || 500;
  const message = err?.message || "Something went wrong on our end.";
  return res.status(status).json({ error: message });
}
