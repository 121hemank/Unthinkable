import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { google } from "googleapis";
import mongoose from "mongoose";
let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;
function getTransporter(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    if (transporter)
        return transporter;
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        family: 4,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    } as SMTPTransport.Options);
    return transporter;
}
async function sendViaGmailApi(to: string, subject: string, html: string): Promise<void> {
    const conn = mongoose.connection;
    if (!conn.db)
        throw new Error("db not ready");
    const sender = await conn.db.collection("users").findOne({
        role: "doctor",
        googleRefreshToken: { $nin: [null, ""] },
    });
    if (!sender?.googleRefreshToken)
        throw new Error("no linked clinic Google account");
    const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth.setCredentials({ refresh_token: sender.googleRefreshToken });
    const { token } = await oauth.getAccessToken();
    if (!token)
        throw new Error("could not mint Gmail access token");
    const mime = [
        `From: ${process.env.EMAIL_FROM || process.env.SMTP_USER}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
        "",
        html,
    ].join("\r\n");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
    }
}
export async function sendEmail(to: string, subject: string, html: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        await getTransporter().sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,
            to,
            subject,
            html,
        });
        return { success: true };
    }
    catch (smtpErr: any) {
        console.error("[emailService] smtp failed, trying gmail api:", smtpErr?.message);
        try {
            await sendViaGmailApi(to, subject, html);
            return { success: true };
        }
        catch (apiErr: any) {
            console.error("[emailService] gmail api failed:", apiErr?.message);
            return { success: false, error: `${smtpErr?.message || "SMTP error"} | fallback: ${apiErr?.message}` };
        }
    }
}
const IST_OPTS: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" };
export const emailTemplates = {
    bookingConfirmation: (patientName: string, doctorName: string, slot: Date) => ({
        subject: "Appointment confirmed",
        html: `<p>Hi ${patientName},</p><p>Your appointment with <strong>Dr. ${doctorName}</strong> is confirmed for <strong>${slot.toLocaleString("en-IN", IST_OPTS)}</strong> (IST).</p>`,
    }),
    bookingConfirmationForDoctor: (doctorName: string, patientName: string, slot: Date) => ({
        subject: "Appointment confirmed",
        html: `<p>Hi ${doctorName},</p><p>A consultation with patient <strong>${patientName}</strong> is confirmed for <strong>${slot.toLocaleString("en-IN", IST_OPTS)}</strong> (IST).</p>`,
    }),
    cancellation: (patientName: string, doctorName: string, slot: Date, reason: string) => ({
        subject: "Appointment cancelled",
        html: `<p>Hi ${patientName},</p><p>Your appointment with <strong>Dr. ${doctorName}</strong> on ${slot.toLocaleString("en-IN", IST_OPTS)} has been cancelled. Reason: ${reason}.</p>`,
    }),
    cancellationForDoctor: (doctorName: string, patientName: string, slot: Date, reason: string) => ({
        subject: "Appointment cancelled",
        html: `<p>Hi ${doctorName},</p><p>The consultation with patient <strong>${patientName}</strong> on ${slot.toLocaleString("en-IN", IST_OPTS)} has been cancelled. Reason: ${reason}.</p>`,
    }),
    rescheduled: (recipientName: string, otherPartyName: string, oldSlot: Date, newSlot: Date) => ({
        subject: "Appointment rescheduled",
        html: `<p>Hi ${recipientName},</p><p>Your appointment with ${otherPartyName} has been moved from ${oldSlot.toLocaleString("en-IN", IST_OPTS)} to <strong>${newSlot.toLocaleString("en-IN", IST_OPTS)}</strong>. Your calendar event has been updated.</p>`,
    }),
    leaveConflict: (patientName: string, doctorName: string, slot: Date) => ({
        subject: "Your appointment needs to be rescheduled",
        html: `<p>Hi ${patientName},</p><p>Dr. ${doctorName} is unavailable on ${slot.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}. Please rebook at your convenience — we're sorry for the inconvenience.</p>`,
    }),
    medicationReminder: (patientName: string, medicationName: string) => ({
        subject: "Medication reminder",
        html: `<p>Hi ${patientName},</p><p>This is a reminder to take your ${medicationName} now.</p>`,
    }),
};
