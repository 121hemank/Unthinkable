export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "Asia/Kolkata";
function tzOffsetMs(instant: Date, tz: string): number {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(instant))
        parts[p.type] = p.value;
    const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second));
    return asUTC - instant.getTime();
}
export function zonedToUtc(dateStr: string, hhmm: string): Date {
    const guess = new Date(`${dateStr}T${hhmm}:00Z`);
    return new Date(guess.getTime() - tzOffsetMs(guess, CLINIC_TIMEZONE));
}
export function clinicDateStr(instant: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIMEZONE }).format(instant);
}
export function addDays(dateStr: string, n: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
