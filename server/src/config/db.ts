import mongoose from "mongoose";
export async function connectDB(): Promise<void> {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        throw new Error("MONGO_URI is not set in .env");
    }
    mongoose.connection.on("connected", () => {
        console.log("[db] MongoDB connected");
    });
    mongoose.connection.on("error", (err) => {
        console.error("[db] MongoDB connection error:", err);
    });
    await mongoose.connect(uri);
}
