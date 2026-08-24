import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICalendarEvent extends Document {
  appointmentId: Types.ObjectId;
  userId: Types.ObjectId; // the calendar owner (patient or doctor)
  googleEventId: string | null;
  status: "CREATED" | "UPDATED" | "DELETED" | "FAILED";
}

const calendarEventSchema = new Schema<ICalendarEvent>({
  appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  googleEventId: { type: String, default: null },
  status: { type: String, enum: ["CREATED", "UPDATED", "DELETED", "FAILED"], required: true },
});

calendarEventSchema.index({ appointmentId: 1, userId: 1 }, { unique: true });

export const CalendarEvent = mongoose.model<ICalendarEvent>("CalendarEvent", calendarEventSchema);
