# System Design — Healthcare Appointment & Follow-up Manager

Stack: React (Vite) + Express + MongoDB Atlas (M0 replica set) + Mongoose.
Atlas M0 runs as a **replica set**, which is what makes multi-document
transactions available — a deliberate dependency of this design.

## 1. Double-booking prevention

Two independent layers. Layer 1 is application logic: when a patient holds a
slot, a Mongoose transaction re-checks the doctor's leave collection and any
existing `HELD`/`CONFIRMED` appointment at that instant before inserting.
Layer 2 is the database itself: a **compound unique index** on
`{ doctorId: 1, slotStart: 1 }`. Even if two requests race past the
application check on different app servers, MongoDB rejects the second insert
with duplicate-key error `11000`, which the central error handler converts to
HTTP 409. The DB constraint is the real safety net; application checks exist
only to give friendlier errors.

## 2. Simultaneous booking attempts

The hold request runs inside `session.withTransaction(...)`. Both racers read
"slot free", both attempt the insert; the transaction snapshot plus the unique
index guarantee exactly one commits. The loser receives Mongo error `11000`,
mapped to `409 Conflict` with the message *"That slot was just taken"*; the
client then refreshes the slot grid so the winner's hold is visible. No locks
are held across user think-time — transactions last milliseconds.

## 3. Slot hold mechanism

Booking is split into hold → confirm because patients need time to fill the
symptom form, but a slot must not be sellable twice during that window. On
slot selection we create an appointment with `status: "HELD"` and
`holdExpiresAt = now + 5 min`. A **TTL index** on `holdExpiresAt`
(`expireAfterSeconds: 0`, partial filter on `status: "HELD"`) lets MongoDB
delete expired holds automatically — no cleanup cron. Confirm transitions
`HELD → CONFIRMED` only if the document still exists unexpired; otherwise the
API returns `410 Gone` and the patient re-picks. Available slots are computed,
not stored: working hours for the weekday minus leave days, minus active
bookings (`CONFIRMED`, or `HELD` with `holdExpiresAt > now`), minus past times.

## 4. Doctor leave conflict handling

Marking leave runs in one transaction: insert the `doctorLeaves` document and
flip all `CONFIRMED` appointments that day to `CANCELLED`. Atomicity matters —
a leave saved while patients keep stale confirmed appointments would be worse
than failing loudly. Email notifications and Google Calendar event deletions
are kicked off **after** commit, since external API calls must never sit
inside a DB transaction. Cancel-on-leave was chosen over auto-reschedule as a
deliberate scope trade-off.

## 5. Notification failure handling

Every email/calendar action goes through one gateway that writes a
`notificationLogs` document (`PENDING`), attempts the send, then records
`SENT` or `FAILED` (+ error). Senders never throw into business flows — a dead
SMTP server cannot break a booking. A node-cron job every 5 minutes retries
`FAILED` logs up to 3 attempts; calendar retries re-read the OAuth refresh
token from the User doc (tokens are never stored in logs). Medication
reminders use the same log pipeline.

## 6. LLM failure handling

All LLM calls live in one service that can never throw: 15-second timeout via
`AbortController`, JSON-only prompt contract, response validated against the
expected shape before saving. Any failure (timeout, bad JSON, API outage)
stores `llmStatus: "FAILED"` with fallback text. Crucially, **raw symptoms and
raw clinical notes are always displayed alongside AI output**, so an LLM
failure degrades convenience, never information or safety. Medication
reminders are still created from a deterministic frequency parser when the
LLM's schedule parse fails.

## 7. Trade-offs made for the 3-day scope

- **Cancel-on-leave instead of auto-reschedule** — simpler, honest UX.
- **Slot math in UTC** — deterministic round-tripping between availability
  and booking endpoints; clients render with `timeZone: "UTC"`.
- **In-process node-cron** rather than a queue system — adequate at this
  scale, zero extra infrastructure.
- **Frequency parsing covers once/twice/three/four-times-daily** — common
  cases only; LLM output refines when available.
- Single Express backend (no LLM microservice) — one deploy surface, fewer
  failure modes under deadline pressure.
