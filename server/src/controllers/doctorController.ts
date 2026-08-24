import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { DoctorProfile } from "../models/DoctorProfile";
import { Appointment } from "../models/Appointment";
import { PostVisitNote } from "../models/PostVisitNote";
import { PostVisitSummary } from "../models/PostVisitSummary";
import { PreVisitSummary } from "../models/PreVisitSummary";
import { SymptomForm } from "../models/SymptomForm";
import { generatePostVisitSummary } from "../services/llmService";
import { MedicationReminder } from "../models/MedicationReminder";
import { User } from "../models/User";

/**
 * Patient-facing doctor search. Returns a FLAT shape keyed by the doctor's
 * USER id (what /available-slots and /hold expect), not raw profile docs —
 * mixing those two shapes was the source of a real bug once, keep them
 * normalized.
 */
export async function searchDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const { specialization } = req.query as { specialization?: string };
    const filter: Record<string, unknown> = { isActive: true };
    if (specialization) filter.specialization = new RegExp(specialization, "i");

    const profiles = await DoctorProfile.find(filter).populate("userId", "name email");

    const doctors = profiles
      .filter((p) => p.userId)
      .map((p) => {
        const u = p.userId as unknown as { _id: Types.ObjectId; name: string; email: string };
        return {
          _id: u._id.toString(), // USER id — used by slots/hold endpoints
          name: u.name,
          email: u.email,
          specialization: p.specialization,
          slotDurationMinutes: p.slotDurationMinutes,
        };
      });

    return res.json({ doctors });
  } catch (err) {
    next(err);
  }
}

/** Doctor's own appointment list, with patient names populated. */
export async function listDoctorAppointments(req: Request, res: Response, next: NextFunction) {
  try {
    const appointments = await Appointment.find({
      doctorId: req.user!.userId,
      status: { $in: ["CONFIRMED", "COMPLETED"] }, // holds are invisible mid-booking states; cancelled ones are scheduling noise
    })
      .populate("patientId", "name email")
      .sort({ slotStart: -1 });
    return res.json({ appointments });
  } catch (err) {
    next(err);
  }
}

/** Doctor's pre-visit view: symptom form + AI summary for an upcoming appointment. */
export async function getPreVisitBrief(req: Request, res: Response, next: NextFunction) {
  try {
    const { appointmentId } = req.params;
    // Ownership check: doctors may only read briefs for THEIR appointments
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId: req.user!.userId,
    });
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const [symptomForm, summary] = await Promise.all([
      SymptomForm.findOne({ appointmentId }),
      PreVisitSummary.findOne({ appointmentId }),
    ]);
    return res.json({ symptomForm, summary });
  } catch (err) {
    next(err);
  }
}

const postVisitSchema = z.object({
  clinicalNotes: z.string().min(3),
  prescription: z
    .array(
      z.object({
        medicationName: z.string(),
        dosage: z.string(),
        frequency: z.string(),
        durationDays: z.number().int().positive(),
      })
    )
    .default([]),
});

/**
 * Rough natural-language frequency -> reminder times (24h "HH:MM").
 * The DOCTOR'S PRESCRIPTION TEXT is the source of truth here — the LLM's
 * invented schedule is deliberately ignored (it renames medicines and
 * miscounts doses). Supports Indian "1-0-1"-style notation plus common
 * words, and honours meal/bedtime hints so "once daily after dinner"
 * lands at night, not in the morning.
 */
const STANDARD_SLOTS = ["08:00", "14:00", "20:00"]; // morning, afternoon, night

function frequencyToTimes(frequency: string): string[] {
  const f = frequency.toLowerCase();

  // "1-0-1" style: morning-afternoon-night dose counts
  const dash = f.match(/(\d)\s*-\s*(\d)\s*-\s*(\d)/);
  if (dash) {
    const [morning, afternoon, night] = [dash[1], dash[2], dash[3]].map(Number);
    const times: string[] = [];
    if (morning) times.push(STANDARD_SLOTS[0]);
    if (afternoon) times.push(STANDARD_SLOTS[1]);
    if (night) times.push(STANDARD_SLOTS[2]);
    return times.length ? times : [STANDARD_SLOTS[0]];
  }

  // Doses per day from words
  let count = 1;
  if (/three|thrice|tds|tid|\b3\s*(x|times)?\b/.test(f)) count = 3;
  else if (/four|qid|\b4\s*(x|times)?\b/.test(f)) count = 4;
  else if (/two|twice|double|\b2\s*(x|times)?\b/.test(f)) count = 2;

  // Part-of-day hints refine where the dose(s) land
  const wantsNight = /dinner|night|bedtime|evening|\bpm\b/.test(f);
  const wantsAfternoon = /lunch|afternoon/.test(f);
  const wantsMorning = /breakfast|morning|\bam\b/.test(f);

  if (count === 1) {
    if (wantsNight && !wantsMorning) return [STANDARD_SLOTS[2]];
    if (wantsAfternoon) return [STANDARD_SLOTS[1]];
    if (wantsMorning) return [STANDARD_SLOTS[0]];
    return [STANDARD_SLOTS[0]];
  }

  // Multiple doses: spread across the standard slots
  return STANDARD_SLOTS.slice(0, count);
}

/**
 * Doctor submits post-visit notes + prescription. Generates the
 * patient-friendly LLM summary and schedules medication reminders.
 *
 * The medication schedule shown to the patient (and used for reminders) is
 * computed DIRECTLY from each prescription line's frequency text — never
 * from the LLM, which invents medicine names and dose counts. The LLM
 * contributes only the narrative parts. Either way, reminders are ALWAYS
 * created — an LLM failure must not lose the medication schedule (§4).
 */
export async function submitPostVisit(req: Request, res: Response, next: NextFunction) {
  try {
    const { appointmentId } = req.params;
    const { clinicalNotes, prescription } = postVisitSchema.parse(req.body);

    // Ownership + state guard: only THIS doctor, only CONFIRMED bookings,
    // and only once the appointment time has actually arrived. This closes
    // the loophole where a visit scheduled for tomorrow could be "completed"
    // (and prescribed against!) a day early — or at all after cancellation.
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId: req.user!.userId,
    });
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    if (appointment.status !== "CONFIRMED") {
      return res.status(409).json({ error: "Only confirmed appointments can be completed" });
    }
    if (appointment.slotStart.getTime() > Date.now()) {
      return res.status(409).json({
        error: `This visit hasn't happened yet — notes open at ${appointment.slotStart.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} (IST)`,
      });
    }

    await PostVisitNote.create({ appointmentId, clinicalNotes, prescription });
    appointment.status = "COMPLETED";
    await appointment.save();

    // Deterministic schedule straight from the prescription (verbatim names)
    const medicationSchedule = prescription.map((item) => ({
      medicationName: item.medicationName,
      timeOfDay: frequencyToTimes(item.frequency),
    }));

    const llmResult = await generatePostVisitSummary(clinicalNotes, prescription);
    await PostVisitSummary.create({
      appointmentId,
      patientFriendlyText: llmResult.status === "OK" ? llmResult.patientFriendlyText : clinicalNotes,
      medicationSchedule,
      followUpSteps: llmResult.status === "OK" ? llmResult.followUpSteps : null,
      llmStatus: llmResult.status,
    });

    // Reminders use the exact same deterministic schedule as the UI
    for (let i = 0; i < prescription.length; i++) {
      const item = prescription[i];
      for (const timeOfDay of medicationSchedule[i].timeOfDay) {
        await MedicationReminder.create({
          appointmentId,
          patientId: appointment.patientId,
          medicationName: item.medicationName,
          timeOfDay,
          endsAt: new Date(appointment.slotStart.getTime() + item.durationDays * 24 * 60 * 60 * 1000),
          active: true,
        });
      }
    }

    return res.json({ ok: true, llmStatus: llmResult.status });
  } catch (err) {
    next(err);
  }
}

/** The logged-in doctor's own profile (specialization etc.), or null if not set up yet. */
export async function getMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await DoctorProfile.findOne({ userId: req.user!.userId });
    return res.json({ profile });
  } catch (err) {
    next(err);
  }
}

const slotTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24h)");

/** "09:00" -> minutes since midnight */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const myProfileSchema = z
  .object({
    specialization: z.string().trim().min(2),
    slotDurationMinutes: z.number().int().min(5).max(240).optional(),
    workingHours: z.record(z.array(z.object({ start: slotTime, end: slotTime }))).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.workingHours) return;
    for (const [day, windows] of Object.entries(val.workingHours)) {
      const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 0; i < sorted.length; i++) {
        if (hhmmToMinutes(sorted[i].start) >= hhmmToMinutes(sorted[i].end)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${day}: each consult window must end after it starts`,
            path: ["workingHours", day],
          });
          return;
        }
        if (i > 0 && sorted[i].start < sorted[i - 1].end) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${day}: consult windows must not overlap — leave a gap for lunch between them`,
            path: ["workingHours", day],
          });
          return;
        }
      }
    }
  });

/**
 * Self-service profile setup for doctors. Saving specialization makes them
 * searchable; saving workingHours defines the slots patients can book.
 * The profile is created on first save (upsert), so a self-registered doctor
 * becomes fully bookable without waiting for an admin.
 */
export async function upsertMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { specialization, slotDurationMinutes, workingHours } = myProfileSchema.parse(req.body);

    const update: Record<string, unknown> = { specialization, isActive: true };
    if (slotDurationMinutes) update.slotDurationMinutes = slotDurationMinutes;
    if (workingHours) {
      // Fill all 7 keys so partial payloads never leave gaps that would
      // break weekday lookup in getAvailableSlots.
      update.workingHours = {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
        ...workingHours,
      };
    }

    const profile = await DoctorProfile.findOneAndUpdate(
      { userId: req.user!.userId },
      { $setOnInsert: { userId: req.user!.userId }, $set: update },
      { upsert: true, new: true, runValidators: true }
    );
    return res.json({ profile });
  } catch (err) {
    next(err);
  }
}

/**
 * Pre-consultation context: the patient's past visits (completed/cancelled)
 * with prescriptions and dose schedules. SECURITY: a doctor may only pull
 * history for patients they share at least one appointment with � this
 * prevents arbitrary patient-record enumeration via crafted ids.
 */
export async function getPatientHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { patientId } = req.params;
    if (!Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }

    const patient = await User.findOne({ _id: patientId, role: "patient" }).select("name");
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Treating-relationship check
    const hasRelationship = await Appointment.exists({
      doctorId: req.user!.userId,
      patientId,
    });
    if (!hasRelationship) {
      return res.status(403).json({ error: "No shared appointments with this patient" });
    }

    // Only real consultations belong in medical history — cancelled bookings
    // are scheduling noise, not clinical context.
    const visits = await Appointment.find({
      patientId,
      status: "COMPLETED",
    })
      .sort({ slotStart: -1 })
      .limit(10)
      .select("slotStart status");

    const ids = visits.map((v) => v._id);
    const [notes, summaries] = await Promise.all([
      PostVisitNote.find({ appointmentId: { $in: ids } }).select("appointmentId prescription"),
      PostVisitSummary.find({ appointmentId: { $in: ids } }).select("appointmentId medicationSchedule"),
    ]);

    const noteById = new Map(notes.map((n) => [n.appointmentId.toString(), n]));
    const summaryById = new Map(summaries.map((s) => [s.appointmentId.toString(), s]));

    return res.json({
      patient: { _id: patient._id, name: patient.name },
      visits: visits.map((v) => ({
        _id: v._id,
        slotStart: v.slotStart,
        status: v.status,
        prescription: noteById.get(v._id.toString())?.prescription ?? [],
        medicationSchedule: summaryById.get(v._id.toString())?.medicationSchedule ?? [],
      })),
    });
  } catch (err) {
    next(err);
  }
}
