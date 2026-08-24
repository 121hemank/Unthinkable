import cron from "node-cron";
import { NotificationLog } from "../models/NotificationLog";
import { MedicationReminder } from "../models/MedicationReminder";
import { User } from "../models/User";
import { sendEmail, emailTemplates } from "../services/emailService";
import { createCalendarEvent, deleteCalendarEvent } from "../services/calendarService";

const MAX_RETRIES = 3;

/**
 * Retries any notification stuck in FAILED state (up to MAX_RETRIES times),
 * for BOTH channels:
 *  - EMAIL:    replays the stored subject/html
 *  - CALENDAR: re-reads the user's refresh token from the User doc (never
 *              stored in the log) and replays the CREATE or DELETE action
 *
 * This is what makes §3.4 (notification failure handling) actually
 * self-heal instead of just logging and forgetting.
 */
async function retryFailedNotifications() {
  const failed = await NotificationLog.find({ status: "FAILED", retryCount: { $lt: MAX_RETRIES } });

  for (const log of failed) {
    let success = false;
    let error: string | undefined;

    if (log.channel === "EMAIL") {
      const payload = log.payload as { to?: string; subject?: string; html?: string };
      if (!payload.to || !payload.subject) continue;
      const result = await sendEmail(payload.to, payload.subject, payload.html || "");
      success = result.success;
      error = result.error;
    } else if (log.channel === "CALENDAR") {
      const payload = log.payload as {
        action?: "CREATE" | "DELETE";
        userId?: string;
        summary?: string;
        description?: string;
        startISO?: string;
        endISO?: string;
        googleEventId?: string;
      };
      const user = payload.userId ? await User.findById(payload.userId) : null;
      if (!user?.googleRefreshToken) continue; // can't retry without a token

      if (payload.action === "CREATE" && payload.startISO && payload.endISO) {
        const result = await createCalendarEvent(
          user.googleRefreshToken,
          payload.summary || "Appointment",
          payload.description || "",
          new Date(payload.startISO),
          new Date(payload.endISO)
        );
        success = result.success;
        error = result.error;
      } else if (payload.action === "DELETE" && payload.googleEventId) {
        const result = await deleteCalendarEvent(user.googleRefreshToken, payload.googleEventId);
        success = result.success;
        error = result.error;
      }
    } else {
      continue;
    }

    log.retryCount += 1;
    log.status = success ? "SENT" : "FAILED";
    if (!success && error) log.lastError = error;
    await log.save();
  }

  if (failed.length > 0) {
    console.log(`[cron] retried ${failed.length} failed notification(s)`);
  }
}

/**
 * Checks active medication reminders. Runs every 5 minutes; for each
 * reminder we compute TODAY's scheduled instant from timeOfDay and fire if
 *   now >= scheduled  AND  lastSentAt < scheduled
 * which means: missed windows (server was down at the exact minute) still
 * fire on the next tick, and nothing ever double-sends for the same day.
 */
async function sendDueMedicationReminders() {
  const now = new Date();
  const due = await MedicationReminder.find({ active: true });

  for (const reminder of due) {
    // Prescription window over? Deactivate instead of mailing forever.
    if (reminder.endsAt && now > reminder.endsAt) {
      reminder.active = false;
      await reminder.save();
      continue;
    }

    const [h, m] = reminder.timeOfDay.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;

    const scheduled = new Date(now);
    scheduled.setHours(h, m, 0, 0);
    if (now < scheduled) continue; // not due yet today
    if (reminder.lastSentAt && reminder.lastSentAt >= scheduled) continue; // already sent

    const patient = await User.findById(reminder.patientId);
    if (!patient) continue;

    const tpl = emailTemplates.medicationReminder(patient.name, reminder.medicationName);
    const result = await sendEmail(patient.email, tpl.subject, tpl.html);

    await NotificationLog.create({
      type: "REMINDER",
      recipientId: patient._id,
      channel: "EMAIL",
      status: result.success ? "SENT" : "FAILED",
      lastError: result.error,
      payload: { to: patient.email, subject: tpl.subject, html: tpl.html },
    });

    reminder.lastSentAt = now;
    await reminder.save();
  }
}

/** Call this once from server.ts after the DB connects. */
export function startCronJobs() {
  // Every 5 minutes: retry failed notifications
  cron.schedule("*/5 * * * *", () => {
    retryFailedNotifications().catch((err) => console.error("[cron] retry job error:", err));
  });

  // Every 5 minutes: fire medication reminders that came due
  cron.schedule("*/5 * * * *", () => {
    sendDueMedicationReminders().catch((err) => console.error("[cron] reminder job error:", err));
  });

  console.log("[cron] jobs scheduled");
}
