import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Appointment } from "../models/Appointment";
import { DoctorLeave } from "../models/DoctorLeave";
import { DoctorProfile } from "../models/DoctorProfile";
import { SymptomForm } from "../models/SymptomForm";
import { PreVisitSummary } from "../models/PreVisitSummary";
import { PostVisitNote } from "../models/PostVisitNote";
import { PostVisitSummary } from "../models/PostVisitSummary";
import { User } from "../models/User";
import { generatePreVisitSummary } from "../services/llmService";
import {
  logAndSendEmail,
  syncAppointmentCalendars,
  deleteAppointmentCalendars,
} from "../services/notificationService";
import { emailTemplates } from "../services/emailService";
import { CLINIC_TIMEZONE, zonedToUtc, clinicDateStr } from "../utils/time";

const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes — see §3.1 of design doc

const holdSlotSchema = z.object({
  doctorId: z.string(),
  slotStart: z.string().datetime(), // ISO string from the client
  slotEnd: z.string().datetime(),
});

/**
 * Step 1 of booking: place a temporary HELD appointment so no one else can
 * take this slot while the patient fills out the symptom form.
 *
 * This is where §3.1/§3.2 of the design doc actually happen:
 *  - a Mongoose transaction re-checks leave + existing bookings
 *  - the unique index on {doctorId, slotStart} is the final safety net —
 *    if two requests race past the application-level check, MongoDB itself
 *    rejects the loser with a duplicate-key error (code 11000), which the
 *    central errorHandler turns into a 409.
 */
export async function holdSlot(req: Request, res: Response, next: NextFunction) {
  const session = await mongoose.startSession();
  try {
    const { doctorId, slotStart, slotEnd } = holdSlotSchema.parse(req.body);
    const patientId = req.user!.userId;
    const start = new Date(slotStart);
    const end = new Date(slotEnd);
    // Clinic-calendar date of the slot (NOT the UTC date — they differ for
    // early-morning IST slots), so leave checks match how the day was booked.
    const dateStr = clinicDateStr(start);

    let created;
    await session.withTransaction(async () => {
      // Abandoned (expired) holds must not block this booking — neither via
      // the application-level conflict check nor via the unique index (which
      // covers every HELD doc, expired or not). Delete them atomically first.
      await Appointment.deleteMany(
        { doctorId, status: "HELD", holdExpiresAt: { $lte: new Date() } },
        { session }
      );

      const now = new Date();
      const conflict = await Appointment.findOne({
        doctorId,
        slotStart: start,
        $or: [
          { status: "CONFIRMED" },
          { status: "HELD", holdExpiresAt: { $gt: now } },
        ],
      }).session(session);
      if (conflict) {
        throw Object.assign(new Error("That slot is not available"), { status: 409 });
      }

      // Booking surface guard — mirrors getAvailableSlots' isActive filter so
      // a crafted direct request can't book around a deactivated profile.
      const activeProfile = await DoctorProfile.findOne({ userId: doctorId, isActive: true }).session(session);
      if (!activeProfile) {
        throw Object.assign(new Error("This doctor is not accepting bookings"), { status: 409 });
      }

      const onLeave = await DoctorLeave.findOne({ doctorId, date: dateStr }).session(session);
      if (onLeave) {
        throw Object.assign(new Error("Doctor is on leave that day"), { status: 409 });
      }

      const docs = await Appointment.create(
        [
          {
            patientId,
            doctorId,
            slotStart: start,
            slotEnd: end,
            status: "HELD",
            holdExpiresAt: new Date(Date.now() + HOLD_DURATION_MS),
          },
        ],
        { session }
      );
      created = docs[0];
    });

    // Return the doctor's NAME with the held appointment — the client renders
    // a confirmation card from this response, and an unpopulated ObjectId
    // would show up as "Dr. Unknown".
    const populated = await Appointment.findById(created!._id).populate("doctorId", "name");

    return res.status(201).json({ appointment: populated, holdDurationMs: HOLD_DURATION_MS });
  } catch (err) {
    next(err); // duplicate-key races land here too, handled by errorHandler
  } finally {
    session.endSession();
  }
}

const symptomSchema = z.object({ symptoms: z.string().min(3) });

/** Patient's own appointments, newest first, with doctor names populated. */
export async function listMyAppointments(req: Request, res: Response, next: NextFunction) {
  try {
    // Eager cleanup of MY abandoned holds so they never linger as zombies
    // (the TTL index also deletes them, but on its own ~60s lag).
    await Appointment.deleteMany({
      patientId: req.user!.userId,
      status: "HELD",
      holdExpiresAt: { $lt: new Date() },
    });

    // Cancelled bookings are scheduling noise, not appointments — a patient
    // who cancelled (or whose hold lapsed) shouldn't see them stacked up here.
    const appointments = await Appointment.find({
      patientId: req.user!.userId,
      status: { $in: ["HELD", "CONFIRMED", "COMPLETED"] },
    })
      .populate("doctorId", "name email")
      .sort({ slotStart: -1 });
    return res.json({ appointments });
  } catch (err) {
    next(err);
  }
}

/**
 * Patient-facing visit record: their symptoms, the doctor's prescription,
 * and the AI patient-friendly summary. If the LLM failed (llmStatus FAILED)
 * we still return the raw clinical notes so the client can show them with a
 * fallback notice — information is never lost to an LLM outage (§4).
 */
export async function getAppointmentSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { appointmentId } = req.params;
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patientId: req.user!.userId,
    }).populate("doctorId", "name");

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const [symptomForm, postVisitNote, postVisitSummary] = await Promise.all([
      SymptomForm.findOne({ appointmentId }),
      PostVisitNote.findOne({ appointmentId }),
      PostVisitSummary.findOne({ appointmentId }),
    ]);

    return res.json({ appointment, symptomForm, postVisitNote, postVisitSummary });
  } catch (err) {
    next(err);
  }
}

/**
 * Step 2: patient submits symptoms. We generate the pre-visit LLM summary
 * here (urgency + chief complaint + suggested questions for the doctor).
 * If the LLM fails, llmStatus is stored as FAILED and the raw symptoms are
 * still saved — the doctor always sees the raw text even if AI summary
 * generation failed. See §4 of the design doc.
 */
export async function submitSymptoms(req: Request, res: Response, next: NextFunction) {
  try {
    const { appointmentId } = req.params;
    const { symptoms } = symptomSchema.parse(req.body);

    const appointment = await Appointment.findOne({ _id: appointmentId, status: "HELD" });
    if (!appointment) {
      return res.status(404).json({ error: "No held appointment found (it may have expired)" });
    }

    await SymptomForm.create({ appointmentId, rawSymptoms: symptoms });

    const llmResult = await generatePreVisitSummary(symptoms);
    await PreVisitSummary.create({
      appointmentId,
      urgencyLevel: llmResult.status === "OK" ? llmResult.urgencyLevel : null,
      chiefComplaint: llmResult.status === "OK" ? llmResult.chiefComplaint : null,
      suggestedQuestions: llmResult.status === "OK" ? llmResult.suggestedQuestions : [],
      llmStatus: llmResult.status,
      rawLlmResponse: llmResult.rawResponse,
    });

    return res.json({ ok: true, llmStatus: llmResult.status });
  } catch (err) {
    next(err);
  }
}

/**
 * Step 3: confirm the booking. Transitions HELD -> CONFIRMED, sends the
 * confirmation email (Google Calendar event creation would also be
 * triggered here once OAuth is wired up — see calendarService.ts).
 */
export async function confirmAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, status: "HELD" },
      { status: "CONFIRMED", holdExpiresAt: null },
      { new: true }
    );

    if (!appointment) {
      return res.status(410).json({ error: "This hold has expired. Please pick a slot again." });
    }

    const [patient, doctor] = await Promise.all([
      User.findById(appointment.patientId),
      User.findById(appointment.doctorId),
    ]);

    // Side effects below are all best-effort: a failed email or a Google
    // outage must never fail the booking itself — everything is logged to
    // NotificationLog and retried by cron (§3.4).
    if (patient && doctor) {
      const tpl = emailTemplates.bookingConfirmation(patient.name, doctor.name, appointment.slotStart);
      await logAndSendEmail({
        type: "BOOKING_CONFIRM",
        recipientId: patient._id,
        to: patient.email,
        subject: tpl.subject,
        html: tpl.html,
      });

      const doctorTpl = emailTemplates.bookingConfirmationForDoctor(doctor.name, patient.name, appointment.slotStart);
      await logAndSendEmail({
        type: "BOOKING_CONFIRM",
        recipientId: doctor._id,
        to: doctor.email,
        subject: doctorTpl.subject,
        html: doctorTpl.html,
      });

      await syncAppointmentCalendars({
        appointmentId: appointment._id,
        patient,
        doctor,
        doctorName: doctor.name,
        patientName: patient.name,
        start: appointment.slotStart,
        end: appointment.slotEnd,
      });
    }

    return res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

const rescheduleSchema = z.object({
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
});

/**
 * Move an existing CONFIRMED appointment to a new slot. Same safety rules as
 * booking: leave check + conflict check inside a transaction, unique index as
 * the race backstop (moving onto a taken slot triggers duplicate-key -> 409).
 * On success: email BOTH parties and replace calendar events (delete old,
 * create new) — all best-effort per §3.4.
 */
export async function rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
  const session = await mongoose.startSession();
  try {
    const { appointmentId } = req.params;
    const { slotStart, slotEnd } = rescheduleSchema.parse(req.body);
    const newStart = new Date(slotStart);
    const newEnd = new Date(slotEnd);

    let updated;
    let oldStart: Date | null = null;
    await session.withTransaction(async () => {
      const appt = await Appointment.findOne({
        _id: appointmentId,
        patientId: req.user!.userId,
        status: "CONFIRMED",
      }).session(session);
      if (!appt) {
        throw Object.assign(new Error("Appointment not found or not reschedulable"), { status: 404 });
      }
      if (newStart.getTime() === appt.slotStart.getTime()) {
        throw Object.assign(new Error("Pick a different slot than the current one"), { status: 400 });
      }

      oldStart = appt.slotStart; // capture BEFORE mutation, for the notification

      const dateStr = clinicDateStr(newStart);
      const onLeave = await DoctorLeave.findOne({ doctorId: appt.doctorId, date: dateStr }).session(session);
      if (onLeave) {
        throw Object.assign(new Error("Doctor is on leave that day"), { status: 409 });
      }

      const conflict = await Appointment.findOne({
        _id: { $ne: appt._id },
        doctorId: appt.doctorId,
        slotStart: newStart,
        status: { $in: ["HELD", "CONFIRMED"] },
      }).session(session);
      if (conflict) {
        throw Object.assign(new Error("That slot is not available"), { status: 409 });
      }

      appt.slotStart = newStart;
      appt.slotEnd = newEnd;
      await appt.save({ session });
      updated = appt;
    });

    const [patient, doctor] = await Promise.all([
      User.findById(updated!.patientId),
      User.findById(updated!.doctorId),
    ]);

    if (patient && doctor) {
      for (const [recipient, otherName] of [
        [patient, `Dr. ${doctor.name}`],
        [doctor, patient.name],
      ] as const) {
        const tpl = emailTemplates.rescheduled(recipient.name, otherName, oldStart!, newStart);
        await logAndSendEmail({
          type: "RESCHEDULED",
          recipientId: recipient._id,
          to: recipient.email,
          subject: tpl.subject,
          html: tpl.html,
        });
      }

      await deleteAppointmentCalendars(updated!._id);
      await syncAppointmentCalendars({
        appointmentId: updated!._id,
        patient,
        doctor,
        doctorName: doctor.name,
        patientName: patient.name,
        start: updated!.slotStart,
        end: updated!.slotEnd,
      });
    }

    return res.json({ appointment: updated });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

export async function cancelAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const { appointmentId } = req.params;
    const appointment = await Appointment.findOneAndUpdate(
      { _id: appointmentId, status: { $in: ["HELD", "CONFIRMED"] } },
      { status: "CANCELLED", holdExpiresAt: null },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found or already cancelled" });
    }

    const [patient, doctor] = await Promise.all([
      User.findById(appointment.patientId),
      User.findById(appointment.doctorId),
    ]);

    if (patient && doctor) {
      const patientTpl = emailTemplates.cancellation(patient.name, doctor.name, appointment.slotStart, "Cancelled");
      await logAndSendEmail({
        type: "CANCELLATION",
        recipientId: patient._id,
        to: patient.email,
        subject: patientTpl.subject,
        html: patientTpl.html,
      });

      // The doctor's calendar just freed up — they need to know too.
      const doctorTpl = emailTemplates.cancellationForDoctor(doctor.name, patient.name, appointment.slotStart, "Cancelled by the other party");
      await logAndSendEmail({
        type: "CANCELLATION",
        recipientId: doctor._id,
        to: doctor.email,
        subject: doctorTpl.subject,
        html: doctorTpl.html,
      });

      // Remove the event from both calendars if it was created on confirm.
      await deleteAppointmentCalendars(appointment._id);
    }

    return res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "09:00" -> minutes since midnight */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** minutes since midnight -> "HH:MM" (zero-padded) */
function minutesToHHMM(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * List available slots for a doctor on a given date — computed, never stored.
 *
 * Pipeline: working hours for that weekday -> cut into slotDurationMinutes
 * chunks -> remove slots on a leave day -> remove slots overlapping an active
 * booking (CONFIRMED, or HELD whose hold hasn't expired yet) -> remove past
 * slots.
 *
 * Working hours are WALL-CLOCK times in CLINIC_TIMEZONE (default IST): a
 * "09:00" slot becomes the true instant 03:30Z, so Google Calendar shows it
 * as 9:00 AM in India instead of 2:30 PM. All instants round-trip into /hold.
 */
export async function getAvailableSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const { doctorId, date } = req.query as { doctorId?: string; date?: string };

    if (!doctorId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "doctorId and date (YYYY-MM-DD) are required" });
    }

    // Abandoned holds must free their slot the instant they expire, not on
    // the TTL sweeper's lag. Purge them before computing availability so
    // other patients can book immediately.
    await Appointment.deleteMany({
      doctorId,
      status: "HELD",
      holdExpiresAt: { $lt: new Date() },
    });

    const profile = await DoctorProfile.findOne({ userId: doctorId, isActive: true });
    if (!profile) {
      return res.json({ doctorId, date, slots: [], reason: "Doctor not found or inactive" });
    }

    // Weekday key from the date string itself — avoids any timezone drift.
    const weekday = WEEKDAY_KEYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
    const windows = profile.workingHours[weekday] || [];
    if (windows.length === 0) {
      // Distinguish a regular off-day from a doctor who never published any
      // availability at all, so patients aren't left guessing.
      const hasAnyHours = Object.values(profile.workingHours).some((w) => w && w.length > 0);
      return res.json({
        doctorId,
        date,
        slots: [],
        reason: hasAnyHours
          ? "Dr. does not consult on this day — try another date"
          : "This doctor hasn't published their availability yet — check back soon",
      });
    }

    const onLeave = await DoctorLeave.findOne({ doctorId, date });
    if (onLeave) {
      return res.json({ doctorId, date, slots: [], reason: `Doctor is on leave${onLeave.reason ? ` (${onLeave.reason})` : ""}` });
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    const now = new Date();

    // Active bookings only: CONFIRMED always blocks; HELD blocks only while
    // its hold is still alive (TTL cleanup is lazy, so check explicitly).
    const bookings = await Appointment.find({
      doctorId,
      slotStart: { $gte: dayStart, $lte: dayEnd },
      $or: [
        { status: "CONFIRMED" },
        { status: "HELD", holdExpiresAt: { $gt: now } },
      ],
    });

    const takenStarts = new Set(bookings.map((b) => b.slotStart.getTime()));
    const duration = profile.slotDurationMinutes;

    const slots: { slotStart: string; slotEnd: string }[] = [];
    for (const w of windows) {
      for (let m = hhmmToMinutes(w.start); m + duration <= hhmmToMinutes(w.end); m += duration) {
        // Wall-clock clinic time -> real instant (e.g. 09:00 IST = 03:30Z)
        const start = zonedToUtc(date, minutesToHHMM(m));
        const end = zonedToUtc(date, minutesToHHMM(m + duration));

        if (start.getTime() <= now.getTime()) continue; // can't book the past
        if (takenStarts.has(start.getTime())) continue; // already held/confirmed

        slots.push({ slotStart: start.toISOString(), slotEnd: end.toISOString() });
      }
    }

    return res.json({ doctorId, date, slots });
  } catch (err) {
    next(err);
  }
}
