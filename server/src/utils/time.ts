/**
 * Clinic-timezone handling. Working hours are WALL-CLOCK times in the
 * clinic's timezone (default Asia/Kolkata) — "09:00" means 9 AM local, NOT
 * 09:00 UTC. These helpers convert between wall-clock and real instants so
 * slots land in patients'/doctors' Google Calendars at the time everyone
 * actually expects.
 *
 * Set CLINIC_TIMEZONE in .env (IANA name) to change it.
 */
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || "Asia/Kolkata";

/** Offset of `tz` east of UTC, in ms, observed at a given instant. */
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
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - instant.getTime();
}

/** Wall-clock date + HH:MM in the clinic timezone -> the real UTC instant. */
export function zonedToUtc(dateStr: string, hhmm: string): Date {
  const guess = new Date(`${dateStr}T${hhmm}:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess, CLINIC_TIMEZONE));
}

/** "YYYY-MM-DD" of an instant as seen on the clinic's wall clock. */
export function clinicDateStr(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIMEZONE }).format(instant);
}

/** "YYYY-MM-DD" plus n days (pure UTC-string arithmetic). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
