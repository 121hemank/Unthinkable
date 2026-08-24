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
import { logAndSendEmail, syncAppointmentCalendars, deleteAppointmentCalendars, } from "../services/notificationService";
import { emailTemplates } from "../services/emailService";
import { CLINIC_TIMEZONE, zonedToUtc, clinicDateStr } from "../utils/time";
const HOLD_DURATION_MS = 5 * 60 * 1000;
const holdSlotSchema = z.object({
    doctorId: z.string(),
    slotStart: z.string().datetime(),
    slotEnd: z.string().datetime(),
});
export async function holdSlot(req: Request, res: Response, next: NextFunction) {
    const session = await mongoose.startSession();
    try {
        const { doctorId, slotStart, slotEnd } = holdSlotSchema.parse(req.body);
        const patientId = req.user!.userId;
        const start = new Date(slotStart);
        const end = new Date(slotEnd);
        const dateStr = clinicDateStr(start);
        let created;
        await session.withTransaction(async () => {
            await Appointment.deleteMany({ doctorId, status: "HELD", holdExpiresAt: { $lte: new Date() } }, { session });
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
            const activeProfile = await DoctorProfile.findOne({ userId: doctorId, isActive: true }).session(session);
            if (!activeProfile) {
                throw Object.assign(new Error("This doctor is not accepting bookings"), { status: 409 });
            }
            const onLeave = await DoctorLeave.findOne({ doctorId, date: dateStr }).session(session);
            if (onLeave) {
                throw Object.assign(new Error("Doctor is on leave that day"), { status: 409 });
            }
            const docs = await Appointment.create([
                {
                    patientId,
                    doctorId,
                    slotStart: start,
                    slotEnd: end,
                    status: "HELD",
                    holdExpiresAt: new Date(Date.now() + HOLD_DURATION_MS),
                },
            ], { session });
            created = docs[0];
        });
        const populated = await Appointment.findById(created!._id).populate("doctorId", "name");
        return res.status(201).json({ appointment: populated, holdDurationMs: HOLD_DURATION_MS });
    }
    catch (err) {
        next(err);
    }
    finally {
        session.endSession();
    }
}
const symptomSchema = z.object({ symptoms: z.string().min(3) });
export async function listMyAppointments(req: Request, res: Response, next: NextFunction) {
    try {
        await Appointment.deleteMany({
            patientId: req.user!.userId,
            status: "HELD",
            holdExpiresAt: { $lt: new Date() },
        });
        const appointments = await Appointment.find({
            patientId: req.user!.userId,
            status: { $in: ["HELD", "CONFIRMED", "COMPLETED"] },
        })
            .populate("doctorId", "name email")
            .sort({ slotStart: -1 });
        return res.json({ appointments });
    }
    catch (err) {
        next(err);
    }
}
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
    }
    catch (err) {
        next(err);
    }
}
export async function submitSymptoms(req: Request, res: Response, next: NextFunction) {
    try {
        const { appointmentId } = req.params;
        const { symptoms } = symptomSchema.parse(req.body);
        const appointment = await Appointment.findOne({ _id: appointmentId, patientId: req.user!.userId, status: "HELD" });
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
    }
    catch (err) {
        next(err);
    }
}
export async function confirmAppointment(req: Request, res: Response, next: NextFunction) {
    try {
        const { appointmentId } = req.params;
        const appointment = await Appointment.findOneAndUpdate({ _id: appointmentId, patientId: req.user!.userId, status: "HELD" }, { status: "CONFIRMED", holdExpiresAt: null }, { new: true });
        if (!appointment) {
            return res.status(410).json({ error: "This hold has expired. Please pick a slot again." });
        }
        const [patient, doctor] = await Promise.all([
            User.findById(appointment.patientId),
            User.findById(appointment.doctorId),
        ]);
        if (patient && doctor) {
            void (async () => {
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
            })().catch(() => { });
        }
        return res.json({ appointment });
    }
    catch (err) {
        next(err);
    }
}
const rescheduleSchema = z.object({
    slotStart: z.string().datetime(),
    slotEnd: z.string().datetime(),
});
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
            oldStart = appt.slotStart;
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
            const old = oldStart as unknown as Date;
            void (async () => {
                for (const [recipient, otherName] of [
                    [patient, `Dr. ${doctor.name}`],
                    [doctor, patient.name],
                ] as const) {
                    const tpl = emailTemplates.rescheduled(recipient.name, otherName, old, newStart);
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
            })().catch(() => { });
        }
        return res.json({ appointment: updated });
    }
    catch (err) {
        next(err);
    }
    finally {
        session.endSession();
    }
}
export async function cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
        const { appointmentId } = req.params;
        const { userId, role } = req.user!;
        const filter: Record<string, unknown> = { _id: appointmentId, status: { $in: ["HELD", "CONFIRMED"] } };
        if (role !== "admin") {
            filter.$or = [{ patientId: userId }, { doctorId: userId }];
        }
        const appointment = await Appointment.findOneAndUpdate(filter, { status: "CANCELLED", holdExpiresAt: null }, { new: true });
        if (!appointment) {
            return res.status(404).json({ error: "Appointment not found or already cancelled" });
        }
        const [patient, doctor] = await Promise.all([
            User.findById(appointment.patientId),
            User.findById(appointment.doctorId),
        ]);
        if (patient && doctor) {
            void (async () => {
                const patientTpl = emailTemplates.cancellation(patient.name, doctor.name, appointment.slotStart, "Cancelled");
                await logAndSendEmail({
                    type: "CANCELLATION",
                    recipientId: patient._id,
                    to: patient.email,
                    subject: patientTpl.subject,
                    html: patientTpl.html,
                });
                const doctorTpl = emailTemplates.cancellationForDoctor(doctor.name, patient.name, appointment.slotStart, "Cancelled by the other party");
                await logAndSendEmail({
                    type: "CANCELLATION",
                    recipientId: doctor._id,
                    to: doctor.email,
                    subject: doctorTpl.subject,
                    html: doctorTpl.html,
                });
                await deleteAppointmentCalendars(appointment._id);
            })().catch(() => { });
        }
        return res.json({ appointment });
    }
    catch (err) {
        next(err);
    }
}
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
function hhmmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
}
function minutesToHHMM(mins: number): string {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
}
export async function getAvailableSlots(req: Request, res: Response, next: NextFunction) {
    try {
        const { doctorId, date } = req.query as {
            doctorId?: string;
            date?: string;
        };
        if (!doctorId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: "doctorId and date (YYYY-MM-DD) are required" });
        }
        if (!/^[a-f\d]{24}$/i.test(doctorId)) {
            return res.status(400).json({ error: "Invalid doctorId" });
        }
        await Appointment.deleteMany({
            doctorId,
            status: "HELD",
            holdExpiresAt: { $lt: new Date() },
        });
        const profile = await DoctorProfile.findOne({ userId: doctorId, isActive: true });
        if (!profile) {
            return res.json({ doctorId, date, slots: [], reason: "Doctor not found or inactive" });
        }
        const weekday = WEEKDAY_KEYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
        const windows = profile.workingHours[weekday] || [];
        if (windows.length === 0) {
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
        const slots: {
            slotStart: string;
            slotEnd: string;
        }[] = [];
        for (const w of windows) {
            for (let m = hhmmToMinutes(w.start); m + duration <= hhmmToMinutes(w.end); m += duration) {
                const start = zonedToUtc(date, minutesToHHMM(m));
                const end = zonedToUtc(date, minutesToHHMM(m + duration));
                if (start.getTime() <= now.getTime())
                    continue;
                if (takenStarts.has(start.getTime()))
                    continue;
                slots.push({ slotStart: start.toISOString(), slotEnd: end.toISOString() });
            }
        }
        return res.json({ doctorId, date, slots });
    }
    catch (err) {
        next(err);
    }
}
