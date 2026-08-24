import mongoose, { Schema, Document, Types } from "mongoose";
export type AppointmentStatus = "HELD" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "RESCHEDULED";
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
    holdExpiresAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});
appointmentSchema.index({ doctorId: 1, slotStart: 1 }, {
    unique: true,
    partialFilterExpression: { status: { $in: ["HELD", "CONFIRMED"] } },
});
appointmentSchema.index({ holdExpiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { status: "HELD" } });
appointmentSchema.index({ doctorId: 1, status: 1 });
appointmentSchema.index({ patientId: 1, status: 1 });
export const Appointment = mongoose.model<IAppointment>("Appointment", appointmentSchema);
