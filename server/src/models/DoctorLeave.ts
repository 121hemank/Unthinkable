import mongoose, { Schema, Document, Types } from "mongoose";
export interface IDoctorLeave extends Document {
    doctorId: Types.ObjectId;
    date: string;
    reason?: string;
    createdAt: Date;
}
const doctorLeaveSchema = new Schema<IDoctorLeave>({
    doctorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    reason: { type: String },
    createdAt: { type: Date, default: Date.now },
});
doctorLeaveSchema.index({ doctorId: 1, date: 1 }, { unique: true });
export const DoctorLeave = mongoose.model<IDoctorLeave>("DoctorLeave", doctorLeaveSchema);
