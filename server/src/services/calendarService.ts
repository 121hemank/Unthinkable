import { google } from "googleapis";
function getOAuthClient(refreshToken: string) {
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
}
export async function createCalendarEvent(refreshToken: string, summary: string, description: string, start: Date, end: Date): Promise<{
    success: boolean;
    googleEventId?: string;
    error?: string;
}> {
    try {
        const auth = getOAuthClient(refreshToken);
        const calendar = google.calendar({ version: "v3", auth });
        const event = await calendar.events.insert({
            calendarId: "primary",
            requestBody: {
                summary,
                description,
                start: { dateTime: start.toISOString() },
                end: { dateTime: end.toISOString() },
            },
        });
        return { success: true, googleEventId: event.data.id ?? undefined };
    }
    catch (err: any) {
        console.error("[calendarService] create failed:", err);
        return { success: false, error: err?.message || "Unknown calendar error" };
    }
}
export async function deleteCalendarEvent(refreshToken: string, googleEventId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const auth = getOAuthClient(refreshToken);
        const calendar = google.calendar({ version: "v3", auth });
        await calendar.events.delete({ calendarId: "primary", eventId: googleEventId });
        return { success: true };
    }
    catch (err: any) {
        console.error("[calendarService] delete failed:", err);
        return { success: false, error: err?.message || "Unknown calendar error" };
    }
}
