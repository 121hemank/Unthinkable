import mongoose, { Schema, Document, Types } from "mongoose";

interface IWorkingHoursSlot {
  start: string; // "09:00"
  end: string; // "13:00"
}

export interface IDoctorProfile extends Document {
  userId: Types.ObjectId;
  specialization: string;
  workingHours: {
    mon: IWorkingHoursSlot[];
    tue: IWorkingHoursSlot[];
    wed: IWorkingHoursSlot[];
    thu: IWorkingHoursSlot[];
    fri: IWorkingHoursSlot[];
    sat: IWorkingHoursSlot[];
    sun: IWorkingHoursSlot[];
  };
  slotDurationMinutes: number;
  isActive: boolean;
}

const slotSchema = new Schema<IWorkingHoursSlot>(
  { start: { type: String, required: true }, end: { type: String, required: true } },
  { _id: false }
);

const doctorProfileSchema = new Schema<IDoctorProfile>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  specialization: { type: String, required: true, index: true },
  workingHours: {
    mon: { type: [slotSchema], default: [] },
    tue: { type: [slotSchema], default: [] },
    wed: { type: [slotSchema], default: [] },
    thu: { type: [slotSchema], default: [] },
    fri: { type: [slotSchema], default: [] },
    sat: { type: [slotSchema], default: [] },
    sun: { type: [slotSchema], default: [] },
  },
  slotDurationMinutes: { type: Number, required: true, default: 30 },
  isActive: { type: Boolean, default: true },
});

export const DoctorProfile = mongoose.model<IDoctorProfile>("DoctorProfile", doctorProfileSchema);
