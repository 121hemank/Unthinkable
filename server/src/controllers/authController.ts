import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";
import { signToken } from "../utils/jwt";
const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
});
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});
export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const { name, email, password } = registerSchema.parse(req.body);
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: "An account with this email already exists" });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, passwordHash, role: "patient" });
        const token = signToken(user._id, user.role);
        return res.status(201).json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
        });
    }
    catch (err) {
        next(err);
    }
}
export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: "Invalid email or password" });
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: "Invalid email or password" });
        }
        if (user.isActive === false) {
            return res.status(403).json({ error: "This account has been disabled by the clinic. Contact the front desk." });
        }
        const token = signToken(user._id, user.role);
        return res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
        });
    }
    catch (err) {
        next(err);
    }
}
const updateNameSchema = z.object({
    name: z.string().trim().min(2),
});
export async function updateMe(req: Request, res: Response, next: NextFunction) {
    try {
        const { name } = updateNameSchema.parse(req.body);
        const user = await User.findByIdAndUpdate(req.user!.userId, { name }, { new: true, runValidators: true }).select("name email role");
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        return res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    }
    catch (err) {
        next(err);
    }
}
