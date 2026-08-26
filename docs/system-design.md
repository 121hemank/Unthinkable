# System Design — Clinic Appointment Platform

**Stack:** React 18 + Vite SPA · Express + TypeScript (Node) · MongoDB replica set · Gemini Flash (clinical summarization) · Nodemailer with Gmail REST fallback · Google Calendar API · node-cron.

## Double-booking prevention

Three independent layers, because any single layer has failure modes:

1. **Transactional application check.** Booking runs inside a MongoDB multi-document transaction. A conflict is defined as an existing appointment for the same doctor and exact slot that is either `CONFIRMED`, or `HELD` with `holdExpiresAt > now`. Expired holds are deliberately *not* conflicts.
2. **Partial unique index as a race safety net.** `{ doctorId, slotStart }` is unique but **only among documents whose status is `HELD` or `CONFIRMED`** (`partialFilterExpression`). Two concurrent booking requests may both pass the read-check, but only one transaction can insert into the index; the loser gets a duplicate-key error surfaced as HTTP 409. The partial filter is critical: without it, every cancelled visit would permanently poison its own slot at the index level while the UI advertised it as free — a real bug we found and fixed.
3. **Eager purge of expired holds.** The unique index covers *all* HELD documents regardless of expiry, so an abandoned hold would still ghost-block its slot until MongoDB's TTL sweeper ran (up to ~60 s late). The hold endpoint therefore deletes expired holds for the target doctor *inside* the same transaction, before the conflict check. Abandoned slots are reusable the instant they expire.

## Doctor leave handling

Leaves are stored as **clinic-calendar dates**, not UTC instants — an IST slot at 09:00 maps to the previous UTC day, so date-based matching uses a timezone-aware conversion to avoid off-by-one-day leaks. Availability generation simply skips leave dates. Because a patient could request a hold while leave is being approved, `holdSlot` re-validates leave *inside* the booking transaction (TOCTOU guard). When an admin approves a leave that overlaps existing confirmed visits, those appointments are force-cancelled in one pass and both patient and doctor receive cancellation emails — the roster stays consistent without manual cleanup.

## Slot hold mechanism

Selecting a slot creates a `HELD` appointment with `holdExpiresAt = now + 5 min` (transactional create). This converts a racy "reserve then pay" flow into a state machine:

- `HELD → CONFIRMED` when the patient confirms details in time; `holdExpiresAt` is cleared.
- `HELD → (deleted)` on expiry, via a TTL index (partial on HELD docs) plus the eager purge above.
- The patient dashboard treats holds as first-class rows: a pulsing countdown, **"Complete booking →"** to resume confirmation, or **"Release slot"** to cancel immediately; a client ticker drops lapsed holds from view.

The unique index doubles as protection against the confirm-vs-competing-hold race.

## Notification reliability

Every outbound email attempt is appended to a `NotificationLog` collection: `{ type, channel, recipientId, status: SENT|FAILED, lastError }`. Nothing is fire-and-forget. A retry job scans `FAILED` entries every 5 minutes and re-sends. Delivery is two-layered: Nodemailer (STARTTLS, IPv4-forced, short timeouts) first, then a Gmail REST fallback over plain HTTPS with the clinic's linked Google token — HTTPS egress works on hosts where SMTP ports are blocked. Symptom and post-visit submissions are idempotent upserts — a browser timeout plus retry overwrites records instead of colliding. Medication reminders are generated per prescription line with `endsAt = visitTime + durationDays`; the reminder cron deactivates any course whose window has ended ("deactivate instead of mailing forever"), stamps `lastSentAt` to prevent same-day duplicates, and because due-ness is computed as "scheduled time has passed today and not yet sent," a server outage causes at-most-one delayed send rather than missed or duplicated reminders.

**LLM failure handling:** post-visit summaries are best-effort. If Gemini errors or times out, the visit still completes; `llmStatus` records the failure, raw clinical notes are returned to the patient behind a "summary unavailable" notice, and regeneration can be retried later — an AI outage never blocks or destroys clinical data. Prescription parsing degrades the same way: unparsed schedules fall back to explicit doctor-entered medication lines.

## Data model (essentials)

`User(role, isActive)` · `DoctorProfile(userId, weeklySchedule[{day,start,end}], slotDurationMinutes, isActive)` · `Appointment(patientId, doctorId, slotStart, slotEnd, status ENUM[HELD,CONFIRMED,CANCELLED,COMPLETED], holdExpiresAt)` with the two partial indexes described above · `PostVisitNote(appointmentId, clinicalNotes, prescription[{name,dosage,frequency,durationDays}])` · `MedicationReminder(patientId, medicationName, timeOfDay, endsAt, active, lastSentAt)` · `DoctorLeave(doctorId, date)` · `NotificationLog(type, channel, status, lastError, payload)`.

## API shape

REST under `/api`: `auth` (register/login/Google OAuth), `appointments` (`available-slots`, `hold`, `confirm`, `cancel`, `reschedule`, `mine`), `doctors` (roster, schedule, leaves, complete-visit, patient history gated by treating-relationship), `admin` (stats, users incl. enable/disable **and patient→doctor promotion** — self-registration is hard-pinned to the patient role so strangers can never mint clinician accounts, doctor-profile create/update, leaves, oversight cancellations), `notifications/mine`. All inputs validated with Zod; role middleware guards every route; account status is checked live so disabled accounts are locked out mid-session, not just at login.

*(~790 words)*

