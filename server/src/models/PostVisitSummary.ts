import mongoose, { Schema, Document, Types } from "mongoose";
import { LlmStatus } from "./PreVisitSummary";
interface IMedicationScheduleItem {
    medicationName: string;
    timeOfDay: string[];
}
export interface IPostVisitSummary extends Document {
    appointmentId: Types.ObjectId;
    patientFriendlyText: string | null;
    medicationSchedule: IMedicationScheduleItem[];
    followUpSteps: string | null;
    llmStatus: LlmStatus;
    createdAt: Date;
}
const medicationScheduleItemSchema = new Schema<IMedicationScheduleItem>({ medicationName: { type: String, required: true }, timeOfDay: { type: [String], default: [] } }, { _id: false });
const postVisitSummarySchema = new Schema<IPostVisitSummary>({
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true },
    patientFriendlyText: { type: String, default: null },
    medicationSchedule: { type: [medicationScheduleItemSchema], default: [] },
    followUpSteps: { type: String, default: null },
    llmStatus: { type: String, enum: ["OK", "FAILED"], required: true },
    createdAt: { type: Date, default: Date.now },
});
export const PostVisitSummary = mongoose.model<IPostVisitSummary>("PostVisitSummary", postVisitSummarySchema);
