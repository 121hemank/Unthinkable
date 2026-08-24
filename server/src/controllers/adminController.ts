import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { DoctorProfile } from "../models/DoctorProfile";
import { DoctorLeave } from "../models/DoctorLeave";
import { Appointment } from "../models/Appointment";
import { User } from "../models/User";
import { logAndSendEmail, deleteAppointmentCalendars } from "../services/notificationService";
import { emailTemplates } from "../services/emailService";
import { zonedToUtc, addDays, clinicDateStr } from "../utils/time";
const doctorProfileSchema = z.object({
    userId: z.string(),
    specialization: z.string(),
    slotDurationMinutes: z.number().int().positive().default(30),
    workingHours: z.record(z.array(z.object({ start: z.string(), end: z.string() }))).optional(),
});
export async function listDoctors(_req: Request, res: Response, next: NextFunction) {
    try {
        const [doctors, profiles] = await Promise.all([
            User.find({ role: "doctor" }).select("name email createdAt"),
            DoctorProfile.find(),
        ]);
        const profileByUser = new Map(profiles.map((p) => [p.userId.toString(), p]));
        const result = doctors.map((d) => ({
            _id: d._id,
            name: d.name,
            email: d.email,
            profile: profileByUser.get(d._id.toString()) || null,
        }));
        return res.json({ doctors: result });
    }
    catch (err) {
        next(err);
    }
}
export async function createDoctorProfile(req: Request, res: Response, next: NextFunction) {
    try {
        const data = doctorProfileSchema.parse(req.body);
        const profile = await DoctorProfile.create(data);
        return res.status(201).json({ profile });
    }
    catch (err) {
        next(err);
    }
}
const leaveSchema = z.object({ doctorId: z.string(), date: z.string(), reason: z.string().optional() });
export async function markDoctorLeave(req: Request, res: Response, next: NextFunction) {
    const session = await mongoose.startSession();
    try {
        const { doctorId, date, reason } = leaveSchema.parse(req.body);
        let cancelledAppointments: any[] = [];
        await session.withTransaction(async () => {
            await DoctorLeave.create([{ doctorId, date, reason }], { session });
            const dayStart = zonedToUtc(date, "00:00");
            const dayEnd = zonedToUtc(addDays(date, 1), "00:00");
            const affected = await Appointment.find({
                doctorId,
                status: "CONFIRMED",
                slotStart: { $gte: dayStart, $lte: dayEnd },
            }).session(session);
            for (const appt of affected) {
                appt.status = "CANCELLED";
                await appt.save({ session });
            }
            cancelledAppointments = affected;
        });
        const doctor = await User.findById(doctorId);
        for (const appt of cancelledAppointments) {
            const patient = await User.findById(appt.patientId);
            if (patient && doctor) {
                const tpl = emailTemplates.leaveConflict(patient.name, doctor.name, appt.slotStart);
                await logAndSendEmail({
                    type: "LEAVE_CONFLICT",
                    recipientId: patient._id,
                    to: patient.email,
                    subject: tpl.subject,
                    html: tpl.html,
                });
            }
            await deleteAppointmentCalendars(appt._id);
        }
        return res.json({ ok: true, cancelledCount: cancelledAppointments.length });
    }
    catch (err) {
        next(err);
    }
    finally {
        session.endSession();
    }
}
export async function getPlatformStats(_req: Request, res: Response, next: NextFunction) {
    try {
        const todayStr = clinicDateStr(new Date());
        const dayStart = zonedToUtc(todayStr, "00:00");
        const dayEnd = zonedToUtc(addDays(todayStr, 1), "00:00");
        const [patients, doctors, statusAgg, todayConfirmed] = await Promise.all([
            User.countDocuments({ role: "patient" }),
            User.countDocuments({ role: "doctor" }),
            Appointment.aggregate<{
                _id: string;
                count: number;
            }>([
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            Appointment.countDocuments({ status: "CONFIRMED", slotStart: { $gte: dayStart, $lt: dayEnd } }),
        ]);
        const byStatus = Object.fromEntries(statusAgg.map((s) => [s._id, s.count]));
        return res.json({ patients, doctors, byStatus, todayConfirmed });
    }
    catch (err) {
        next(err);
    }
}
export async function listAllAppointments(req: Request, res: Response, next: NextFunction) {
    try {
        const q = z
            .object({
            status: z.enum(["HELD", "CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
            limit: z.coerce.number().int().min(1).max(200).default(30),
        })
            .parse(req.query);
        const appointments = await Appointment.find(q.status ? { status: q.status } : {})
            .populate("patientId", "name")
            .populate("doctorId", "name")
            .sort({ slotStart: -1 })
            .limit(q.limit);
        return res.json({ appointments });
    }
    catch (err) {
        next(err);
    }
}
export async function adminCancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
        const appt = await Appointment.findById(req.params.id);
        if (!appt)
            return res.status(404).json({ error: "Appointment not found" });
        if (appt.status !== "CONFIRMED") {
            return res.status(409).json({ error: `Only confirmed appointments can be cancelled (this one is ${appt.status})` });
        }
        appt.status = "CANCELLED";
        await appt.save();
        const [patient, doctor] = await Promise.all([
            User.findById(appt.patientId),
            User.findById(appt.doctorId),
        ]);
        if (patient && doctor) {
            const pTpl = emailTemplates.cancellation(patient.name, doctor.name, appt.slotStart, "Cancelled by clinic administration");
            await logAndSendEmail({
                type: "CANCELLATION",
                recipientId: patient._id,
                to: patient.email,
                subject: pTpl.subject,
                html: pTpl.html,
            });
            const dTpl = emailTemplates.cancellationForDoctor(doctor.name, patient.name, appt.slotStart, "Cancelled by clinic administration");
            await logAndSendEmail({
                type: "CANCELLATION",
                recipientId: doctor._id,
                to: doctor.email,
                subject: dTpl.subject,
                html: dTpl.html,
            });
        }
        await deleteAppointmentCalendars(appt._id);
        return res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
}
export async function setDoctorActive(req: Request, res: Response, next: NextFunction) {
    try {
        const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
        const profile = await DoctorProfile.findOneAndUpdate({ userId: req.params.userId }, { isActive }, { new: true });
        if (!profile)
            return res.status(404).json({ error: "Doctor profile not found" });
        return res.json({ profile });
    }
    catch (err) {
        next(err);
    }
}
export async function listUpcomingLeaves(_req: Request, res: Response, next: NextFunction) {
    try {
        const todayStr = clinicDateStr(new Date());
        const leaves = await DoctorLeave.find({ date: { $gte: todayStr } })
            .populate("doctorId", "name")
            .sort({ date: 1 })
            .limit(50);
        return res.json({ leaves });
    }
    catch (err) {
        next(err);
    }
}
export async function deleteLeave(req: Request, res: Response, next: NextFunction) {
    try {
        const leave = await DoctorLeave.findById(req.params.id);
        if (!leave)
            return res.status(404).json({ error: "Leave entry not found" });
        if (leave.date < clinicDateStr(new Date())) {
            return res.status(409).json({ error: "Past leave days cannot be removed" });
        }
        await leave.deleteOne();
        return res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
}
export async function listUsers(req: Request, res: Response, next: NextFunction) {
    try {
        const q = z
            .object({
            role: z.enum(["patient", "doctor", "admin"]).optional(),
            limit: z.coerce.number().int().min(1).max(500).default(100),
        })
            .parse(req.query);
        const users = await User.find(q.role ? { role: q.role } : {})
            .select("name email role isActive createdAt")
            .sort({ createdAt: -1 })
            .limit(q.limit);
        return res.json({ users });
    }
    catch (err) {
        next(err);
    }
}
export async function setUserActive(req: Request, res: Response, next: NextFunction) {
    try {
        const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
        const target = await User.findById(req.params.userId).select("role isActive");
        if (!target)
            return res.status(404).json({ error: "User not found" });
        if (target.role === "admin") {
            return res.status(409).json({ error: "Admin accounts cannot be disabled" });
        }
        target.isActive = isActive;
        await target.save();
        return res.json({ user: { _id: target._id, isActive: target.isActive } });
    }
    catch (err) {
        next(err);
    }
}
