import mongoose, { Schema, Document, Types } from "mongoose";

export type NotificationType =
  | "BOOKING_CONFIRM"
  | "REMINDER"
  | "CANCELLATION"
  | "RESCHEDULED"
  | "LEAVE_CONFLICT";
export type NotificationChannel = "EMAIL" | "CALENDAR";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface INotificationLog extends Document {
  type: NotificationType;
  recipientId: Types.ObjectId;
  channel: NotificationChannel;
  status: NotificationStatus;
  retryCount: number;
  payload: Record<string, unknown>;
  lastError?: string;
  createdAt: Date;
}

const notificationLogSchema = new Schema<INotificationLog>({
  type: {
    type: String,
    enum: ["BOOKING_CONFIRM", "REMINDER", "CANCELLATION", "RESCHEDULED", "LEAVE_CONFLICT"],
    required: true,
  },
  recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  channel: { type: String, enum: ["EMAIL", "CALENDAR"], required: true },
  status: { type: String, enum: ["PENDING", "SENT", "FAILED"], required: true, default: "PENDING" },
  retryCount: { type: Number, default: 0 },
  payload: { type: Schema.Types.Mixed, default: {} },
  lastError: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// This is what the retry cron scans — see jobs/cronJobs.ts
notificationLogSchema.index({ status: 1, retryCount: 1 });

export const NotificationLog = mongoose.model<INotificationLog>("NotificationLog", notificationLogSchema);
