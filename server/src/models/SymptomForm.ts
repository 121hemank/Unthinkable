import mongoose, { Schema, Document, Types } from "mongoose";
export interface ISymptomForm extends Document {
    appointmentId: Types.ObjectId;
    rawSymptoms: string;
    submittedAt: Date;
}
const symptomFormSchema = new Schema<ISymptomForm>({
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true },
    rawSymptoms: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now },
});
export const SymptomForm = mongoose.model<ISymptomForm>("SymptomForm", symptomFormSchema);
