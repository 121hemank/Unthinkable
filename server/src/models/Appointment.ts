import mongoose, { Schema, Document, Types } from "mongoose";

export type AppointmentStatus =
  | "HELD"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "RESCHEDULED";

export interface IAppointment extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  slotStart: Date;
  slotEnd: Date;
  status: AppointmentStatus;
  holdExpiresAt?: Date | null;
  createdAt: Date;
}

const appointmentSchema = new Schema<IAppointment>({
  patientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  doctorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  slotStart: { type: Date, required: true },
  slotEnd: { type: Date, required: true },
  status: {
    type: String,
    enum: ["HELD", "CONFIRMED", "CANCELLED", "COMPLETED", "RESCHEDULED"],
    required: true,
    default: "HELD",
  },
  // Only set while status === "HELD". Cleared on confirm/cancel.
  holdExpiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

/**
 * THE double-booking safety net.
 * Uniqueness applies ONLY to active bookings (HELD/CONFIRMED) — without the
 * partial filter, a CANCELLED appointment would occupy its slot at the
 * index level forever and the slot could never be booked again.
 */
appointmentSchema.index(
  { doctorId: 1, slotStart: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["HELD", "CONFIRMED"] } },
  }
);

/**
 * TTL index: MongoDB automatically deletes documents once holdExpiresAt is
 * in the past. expireAfterSeconds: 0 means "delete exactly at the value of
 * this field, not N seconds after." Only applies to docs where the field is
 * set (i.e. HELD appointments) — CONFIRMED appointments have holdExpiresAt
 * = null and are therefore never touched by this index.
 * See §3.1 of the design doc.
 */
appointmentSchema.index(
  { holdExpiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: "HELD" } }
);

appointmentSchema.index({ doctorId: 1, status: 1 });
appointmentSchema.index({ patientId: 1, status: 1 });

export const Appointment = mongoose.model<IAppointment>("Appointment", appointmentSchema);
