/**
 * One-off setup script: creates (or promotes) the admin account.
 * Run: npx ts-node src/scripts/createAdmin.ts
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

import { User } from "../models/User";

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing");
  await mongoose.connect(process.env.MONGO_URI);

  const email = "admin@clinic.com";
  const password = "admin123";

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "admin";
    await existing.save();
    console.log(`[createAdmin] promoted existing user ${email} to admin`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ name: "Clinic Admin", email, passwordHash, role: "admin" });
    console.log(`[createAdmin] created admin ${email} / ${password}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
