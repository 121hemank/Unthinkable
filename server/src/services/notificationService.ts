import { Types } from "mongoose";
import { NotificationLog, NotificationType, NotificationChannel } from "../models/NotificationLog";
import { CalendarEvent } from "../models/CalendarEvent";
import { User } from "../models/User";
import { sendEmail } from "./emailService";
import { createCalendarEvent, deleteCalendarEvent } from "./calendarService";

/**
 * Single entry point for all notification sends. This is what makes
 * §3.4 (notification failure handling) actually work:
 *   1. Every attempt is logged BEFORE and AFTER the send.
 *   2. A failure updates the log to FAILED instead of throwing.
 *   3. The cron job in jobs/cronJobs.ts later retries anything FAILED.
 *
 * Callers (appointmentController, adminController) should call this and
 * ignore the return value in most cases — the log is the source of truth,
 * not the immediate function result.
 */
export async function logAndSendEmail(params: {
  type: NotificationType;
  recipientId: Types.ObjectId;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const log = await NotificationLog.create({
    type: params.type,
    recipientId: params.recipientId,
    channel: "EMAIL" as NotificationChannel,
    status: "PENDING",
    payload: { to: params.to, subject: params.subject },
  });

  const result = await sendEmail(params.to, params.subject, params.html);

  log.status = result.success ? "SENT" : "FAILED";
  if (!result.success) log.lastError = result.error;
  await log.save();
}

/**
 * Calendar-channel equivalent of logAndSendEmail — same PENDING -> SENT/FAILED
 * lifecycle, same retry story. The refresh token is NEVER stored in the log
 * payload; the retry job re-reads it from the User at retry time.
 */
async function createEventForUser(params: {
  type: NotificationType;
  user: { _id: Types.ObjectId; googleRefreshToken: string | null };
  appointmentId: Types.ObjectId;
  summary: string;
  description: string;
  start: Date;
  end: Date;
}): Promise<void> {
  if (!params.user.googleRefreshToken) return; // never linked their calendar — nothing to sync

  // Idempotency guard: if a previous attempt already created this event
  // (e.g. a retry after an ambiguous timeout), don't create it twice.
  const alreadyCreated = await CalendarEvent.findOne({
    appointmentId: params.appointmentId,
    userId: params.user._id,
    status: "CREATED",
    googleEventId: { $ne: null },
  });
  if (alreadyCreated) return;

  const log = await NotificationLog.create({
    type: params.type,
    recipientId: params.user._id,
    channel: "CALENDAR" as NotificationChannel,
    status: "PENDING",
    payload: {
      action: "CREATE",
      appointmentId: params.appointmentId.toString(),
      userId: params.user._id.toString(),
      summary: params.summary,
      description: params.description,
      startISO: params.start.toISOString(),
      endISO: params.end.toISOString(),
    },
  });

  const result = await createCalendarEvent(
    params.user.googleRefreshToken,
    params.summary,
    params.description,
    params.start,
    params.end
  );

  log.status = result.success ? "SENT" : "FAILED";
  if (!result.success) log.lastError = result.error;
  await log.save();

  await CalendarEvent.findOneAndUpdate(
    { appointmentId: params.appointmentId, userId: params.user._id },
    {
      googleEventId: result.googleEventId ?? null,
      status: result.success ? "CREATED" : "FAILED",
    },
    { upsert: true }
  );
}

/**
 * Best-effort: create the appointment event on BOTH parties' calendars.
 * Never throws — a Google outage must not break a booking (§3.4).
 */
export async function syncAppointmentCalendars(params: {
  appointmentId: Types.ObjectId;
  patient: { _id: Types.ObjectId; googleRefreshToken: string | null };
  doctor: { _id: Types.ObjectId; googleRefreshToken: string | null };
  doctorName: string;
  patientName: string;
  start: Date;
  end: Date;
}): Promise<void> {
  const patientSummary = `Appointment with Dr. ${params.doctorName}`;
  const doctorSummary = `Consultation: ${params.patientName}`;

  for (const [user, summary] of [
    [params.patient, patientSummary],
    [params.doctor, doctorSummary],
  ] as const) {
    try {
      await createEventForUser({
        type: "BOOKING_CONFIRM",
        user,
        appointmentId: params.appointmentId,
        summary,
        description: `${params.patientName} <-> Dr. ${params.doctorName} (booked via clinic portal)`,
        start: params.start,
        end: params.end,
      });
    } catch (err) {
      console.error("[notificationService] calendar create failed:", err);
    }
  }
}

/**
 * Best-effort: delete every calendar event previously created for an
 * appointment (used on cancellation and on leave-conflict cancellations).
 */
export async function deleteAppointmentCalendars(appointmentId: Types.ObjectId): Promise<void> {
  const events = await CalendarEvent.find({
    appointmentId,
    googleEventId: { $ne: null },
    status: { $in: ["CREATED", "FAILED"] },
  });

  for (const ev of events) {
    try {
      const user = await User.findById(ev.userId);
      if (!user?.googleRefreshToken || !ev.googleEventId) continue;

      const log = await NotificationLog.create({
        type: "CANCELLATION",
        recipientId: user._id,
        channel: "CALENDAR" as NotificationChannel,
        status: "PENDING",
        payload: {
          action: "DELETE",
          userId: user._id.toString(),
          googleEventId: ev.googleEventId,
        },
      });

      const result = await deleteCalendarEvent(user.googleRefreshToken, ev.googleEventId);
      log.status = result.success ? "SENT" : "FAILED";
      if (!result.success) log.lastError = result.error;
      await log.save();

      ev.status = result.success ? "DELETED" : "FAILED";
      await ev.save();
    } catch (err) {
      console.error("[notificationService] calendar delete failed:", err);
    }
  }
}
