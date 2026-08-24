import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "./config/db";
import { startCronJobs } from "./jobs/cronJobs";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/authRoutes";
import doctorRoutes from "./routes/doctorRoutes";
import appointmentRoutes from "./routes/appointmentRoutes";
import adminRoutes from "./routes/adminRoutes";
import notificationRoutes from "./routes/notificationRoutes";
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
    origin: [
        process.env.CLIENT_URL || "http://localhost:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
}));
app.use(express.json());
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again in a few minutes." },
});
app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use(errorHandler);
const PORT = process.env.PORT || 5000;
async function start() {
    await connectDB();
    startCronJobs();
    app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
}
start().catch((err) => {
    console.error("[server] failed to start:", err);
    process.exit(1);
});
