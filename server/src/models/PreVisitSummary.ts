import mongoose, { Schema, Document, Types } from "mongoose";

export type UrgencyLevel = "Low" | "Medium" | "High";
export type LlmStatus = "OK" | "FAILED";

export interface IPreVisitSummary extends Document {
  appointmentId: Types.ObjectId;
  urgencyLevel: UrgencyLevel | null;
  chiefComplaint: string | null;
  suggestedQuestions: string[];
  llmStatus: LlmStatus;
  rawLlmResponse?: string;
  createdAt: Date;
}

const preVisitSummarySchema = new Schema<IPreVisitSummary>({
  appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true },
  urgencyLevel: { type: String, enum: ["Low", "Medium", "High", null], default: null },
  chiefComplaint: { type: String, default: null },
  suggestedQuestions: { type: [String], default: [] },
  llmStatus: { type: String, enum: ["OK", "FAILED"], required: true },
  rawLlmResponse: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const PreVisitSummary = mongoose.model<IPreVisitSummary>("PreVisitSummary", preVisitSummarySchema);
