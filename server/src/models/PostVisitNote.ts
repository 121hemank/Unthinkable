import mongoose, { Schema, Document, Types } from "mongoose";
export interface IPrescriptionItem {
    medicationName: string;
    dosage: string;
    frequency: string;
    durationDays: number;
}
export interface IPostVisitNote extends Document {
    appointmentId: Types.ObjectId;
    clinicalNotes: string;
    prescription: IPrescriptionItem[];
    createdAt: Date;
}
const prescriptionItemSchema = new Schema<IPrescriptionItem>({
    medicationName: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    durationDays: { type: Number, required: true },
}, { _id: false });
const postVisitNoteSchema = new Schema<IPostVisitNote>({
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true },
    clinicalNotes: { type: String, required: true },
    prescription: { type: [prescriptionItemSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
});
export const PostVisitNote = mongoose.model<IPostVisitNote>("PostVisitNote", postVisitNoteSchema);
