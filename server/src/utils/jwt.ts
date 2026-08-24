import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { UserRole } from "../models/User";

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

export function signToken(userId: Types.ObjectId, role: UserRole): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in .env");

  return jwt.sign({ userId: userId.toString(), role }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in .env");
  return jwt.verify(token, secret) as JwtPayload;
}
