import mongoose, { Schema, Document, Types } from "mongoose";
export interface IMedicationReminder extends Document {
    appointmentId: Types.ObjectId;
    patientId: Types.ObjectId;
    medicationName: string;
    timeOfDay: string;
    endsAt: Date | null;
    lastSentAt: Date | null;
    active: boolean;
}
const medicationReminderSchema = new Schema<IMedicationReminder>({
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    medicationName: { type: String, required: true },
    timeOfDay: { type: String, required: true },
    endsAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
});
medicationReminderSchema.index({ active: 1, timeOfDay: 1 });
export const MedicationReminder = mongoose.model<IMedicationReminder>("MedicationReminder", medicationReminderSchema);
