import mongoose, { Schema, Document, Types } from "mongoose";
export type UserRole = "patient" | "doctor" | "admin";
export interface IUser extends Document {
    _id: Types.ObjectId;
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    googleRefreshToken: string | null;
    isActive: boolean;
    createdAt: Date;
}
const userSchema = new Schema<IUser>({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["patient", "doctor", "admin"], required: true, default: "patient" },
    googleRefreshToken: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
});
export const User = mongoose.model<IUser>("User", userSchema);
