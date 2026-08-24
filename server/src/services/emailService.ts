import nodemailer from "nodemailer";
let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
    if (transporter)
        return transporter;
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
    return transporter;
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
    catch (err: any) {
        console.error("[emailService] send failed:", err);
        return { success: false, error: err?.message || "Unknown email error" };
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
