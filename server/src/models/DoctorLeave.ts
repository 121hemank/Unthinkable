import mongoose, { Schema, Document, Types } from "mongoose";

export interface IDoctorLeave extends Document {
  doctorId: Types.ObjectId; // references User (role: doctor)
  date: string; // "YYYY-MM-DD" — stored as string for simple equality queries
  reason?: string;
  createdAt: Date;
}

const doctorLeaveSchema = new Schema<IDoctorLeave>({
  doctorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// A doctor can only have one leave entry per date
doctorLeaveSchema.index({ doctorId: 1, date: 1 }, { unique: true });

export const DoctorLeave = mongoose.model<IDoctorLeave>("DoctorLeave", doctorLeaveSchema);
