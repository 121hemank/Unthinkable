# Healthcare Appointment & Follow-up Manager — Build Guide

**Deadline: Aug 24, 2026 (3 days). Submission = GitHub repo link only.**

Read the "reality check" section first. It determines everything else.

---

## 0. Reality Check — What You're Actually Being Graded On

Re-read the Evaluation Focus list: slot conflict handling, leave management,
notification reliability, LLM prompt quality + failure handling, DB schema,
API design, email/calendar integration, documentation.

Nowhere does it say "beautiful UI" or "every feature perfect." With 3 days,
**your job is to make the hard parts (concurrency, conflict handling, failure
handling) visibly correct and well-explained**, even if the UI is plain.
Evaluators for this kind of assignment skim code + README + design write-up
far more than they click every button.

**Do not** try to build a pixel-perfect multi-theme UI, a microservices
architecture, real payment gateway, video calls, or a mobile app. None of
that is asked for and it will eat your time budget.

---

## 1. Tech Stack — matched to your resume (React + Express + MongoDB)

You've already shipped this exact shape twice (VendorCRM, AgroSync), so reuse
it instead of learning Next.js under deadline pressure. This is faster for
you AND it's honest to put on your resume/GitHub since it's real prior
experience, not a stack you improvised for one assignment.

| Layer | Choice | Why (tied to your experience) |
|---|---|---|
| Frontend | **React.js (Vite) + TypeScript** | Same as both your listed projects |
| Backend | **Node.js + Express.js + TypeScript** | Same as AgroSync — you already know how to structure routes/middleware here |
| Database | **MongoDB Atlas (free M0 cluster)** | Also on your resume, and avoids the "only 2 Supabase projects allowed concurrently" limit. M0 runs as a **replica set**, which is what matters — replica sets support multi-document transactions, so you don't lose the safety mechanism you need for double-booking prevention. |
| ODM | **Mongoose** | More natural fit for MongoDB than Prisma's Mongo connector (which has real limitations — no raw aggregation pipeline typing, weaker relation modeling). Mongoose gives you clean schema validation, unique compound indexes, and `session`-based transactions, which is everything this project needs. |
| Auth | **JWT + RBAC**, custom (bcrypt + jsonwebtoken) | Identical pattern to AgroSync's "JWT authentication and RBAC" — copy that logic over almost directly, just with roles `patient/doctor/admin` instead of `farmer/buyer` |
| Realtime (optional, bonus) | **Socket.IO** | You already used this in AgroSync for notifications. Optional here — could push instant "slot just got booked" updates to other patients viewing the same doctor's calendar so the UI reflects a hold in real time. Skip if time-constrained; not required by the spec. |
| UI | Tailwind CSS + shadcn/ui | Fast, clean, professional, zero new tooling to learn |
| Email | Nodemailer (Gmail App Password) or Resend | Either works from Express; Nodemailer needs no separate account if you already have Gmail |
| Calendar | Google Calendar API v3 + OAuth 2.0 (`googleapis` npm package) | Required explicitly |
| LLM | Anthropic or OpenAI API called directly from Express | Keep it in the same backend rather than spinning up a second FastAPI service — see note below |
| Background jobs | **`node-cron` running inside the Express process** | Because Express runs as a long-lived server (not serverless functions like Vercel/Next would be), you don't need external cron triggers — a simple `node-cron` job inside `server.ts` firing every few minutes handles both notification retries and medication reminders. Simpler than the Next.js version of this plan. |
| Hosting | **Vercel** (React frontend, static) + **Render or Railway** (Express backend, free web service) + **MongoDB Atlas** (DB, free M0 cluster) | Matches your resume's Vercel experience; Render/Railway free tier is fine for Express |

**On FastAPI**: your resume also lists FastAPI (VendorCRM). You *could* spin
up a tiny separate FastAPI microservice just for the LLM calls to showcase
that skill too — but with 3 days, running two backends (Express + FastAPI)
doubles your deployment surface for a feature (an LLM API call) that Express
can do in 10 lines with `fetch`. **Recommendation: skip it, keep one backend,
mention FastAPI/RoBERTa experience in your README's "about me" or in the
project's tech-stack rationale section instead.** Judgment about scope is
part of what's being evaluated — showing you deliberately kept the
architecture simple is a plus, not a minus.

---

## 2. Database Schema — MongoDB collections (also goes in your README)

Mongo is document-based, so this isn't tables-with-foreign-keys — it's
collections, most referencing each other by `ObjectId` (like a FK), with a
couple of small things embedded where it makes sense (e.g. working hours
inside `DoctorProfile`, since they're always read together and never queried
independently).

```
users
  _id, name, email, passwordHash, role: "patient"|"doctor"|"admin", createdAt

doctorProfiles
  _id, userId (ref: users), specialization,
  workingHours: { mon: [{start:"09:00", end:"13:00"}], tue: [...], ... },  // embedded
  slotDurationMinutes, isActive

doctorLeaves
  _id, doctorId (ref: users), date, reason

appointments
  _id, patientId (ref: users), doctorId (ref: users), slotStart, slotEnd,
  status: "HELD"|"CONFIRMED"|"CANCELLED"|"COMPLETED"|"RESCHEDULED",
  holdExpiresAt, createdAt
  -- COMPOUND UNIQUE INDEX on { doctorId: 1, slotStart: 1 } -- see §3

symptomForms
  _id, appointmentId (ref: appointments), rawSymptoms, submittedAt

preVisitSummaries
  _id, appointmentId (ref: appointments), urgencyLevel: "Low"|"Medium"|"High",
  chiefComplaint, suggestedQuestions: [String], llmStatus: "OK"|"FAILED",
  rawLlmResponse, createdAt

postVisitNotes
  _id, appointmentId (ref: appointments), clinicalNotes,
  prescription: [{ medicationName, dosage, frequency, durationDays }],
  createdAt

postVisitSummaries
  _id, appointmentId (ref: appointments), patientFriendlyText,
  medicationSchedule: [{ medicationName, timeOfDay: [String] }],
  followUpSteps, llmStatus, createdAt

medicationReminders
  _id, appointmentId (ref: appointments), medicationName, timeOfDay,
  lastSentAt, active

notificationLogs
  _id, type: "BOOKING_CONFIRM"|"REMINDER"|"CANCELLATION"|"LEAVE_CONFLICT",
  recipientId (ref: users), channel: "EMAIL"|"CALENDAR",
  status: "PENDING"|"SENT"|"FAILED", retryCount, payload, createdAt

calendarEvents
  _id, appointmentId (ref: appointments), userId (ref: users),
  googleEventId, status
```

Key design point to call out in your write-up: **`notificationLogs` is what
makes notification failures recoverable** — every email/calendar action is
logged with a status, so a cron job can retry anything `FAILED` or `PENDING`
instead of silently losing it.

**Mongoose schema note**: define the compound unique index directly in the
`appointments` schema:

```js
appointmentSchema.index({ doctorId: 1, slotStart: 1 }, { unique: true });
```

This is the Mongo equivalent of a Postgres `UNIQUE` constraint and is your
real safety net against double-booking, same as before — just enforced by
MongoDB instead of Postgres.

---

## 3. The Four "Hard Parts" — Exactly What To Implement

These four are explicitly named in your deliverables (system design write-up)
and in evaluation focus. Get these right; they matter more than any UI polish.

### 3.1 Double-booking prevention
- Add a **compound unique index** on `{ doctorId: 1, slotStart: 1 }` in the
  `appointments` collection (see §2). This is your real safety net — even if
  two requests race, MongoDB will reject the second insert with a duplicate
  key error (code `11000`).
- Application flow: when a patient picks a slot, insert a document with
  `status: "HELD"` inside a Mongoose session/transaction, after re-checking
  the doctor's leave collection and existing CONFIRMED/HELD slots inside
  that same transaction.
- **Slot hold mechanism**: when a patient selects a slot (before finishing
  the symptom form + confirm), create a `HELD` document with a
  `holdExpiresAt` timestamp (now + 5 minutes). Either add a **MongoDB TTL
  index** on `holdExpiresAt` (Mongo auto-deletes expired documents — no
  cron needed for this specific cleanup) or check-and-reject expired holds
  on read. TTL index is the cleaner Mongo-native choice:
  ```js
  appointmentSchema.index(
    { holdExpiresAt: 1 },
    { expireAfterSeconds: 0, partialFilterExpression: { status: "HELD" } }
  );
  ```
- On confirm, transition `HELD → CONFIRMED` on that same document only if it
  hasn't expired/been deleted; otherwise return "slot no longer available."

### 3.2 Simultaneous booking attempts
- Use a **Mongoose session with a transaction**:
  ```js
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // check leave + existing slots, then create the HELD appointment
    });
  } catch (err) {
    if (err.code === 11000) {
      // unique index violation → someone else grabbed this slot first
      return res.status(409).json({ error: "Slot just got taken" });
    }
    throw err;
  } finally {
    session.endSession();
  }
  ```
- This only works because Atlas M0 is a replica set (confirmed above) —
  transactions on a standalone Mongo instance would fail, so it's worth a
  one-line callout in your system design write-up that you specifically
  relied on Atlas's replica-set behavior for this.

### 3.3 Doctor leave conflict handling
- When admin marks a doctor on leave for a date, inside one transaction:
  1. Insert the `doctorLeaves` document.
  2. Query all `CONFIRMED` appointments for that doctor on that date.
  3. Mark them `CANCELLED` (cancel is simpler than auto-reschedule and fine
     for a 3-day scope).
  4. For each affected patient, insert a `notificationLogs` document
     (`type: "LEAVE_CONFLICT"`), then trigger email + calendar-delete
     (these side effects can happen just after the transaction commits,
     since external API calls shouldn't be inside a DB transaction).
  5. Wrapping steps 1–3 in a transaction keeps leave-marking and
     cancellation atomic — you don't want a leave day saved but patients
     left with a stale confirmed appointment.

### 3.4 Notification failure handling
- Every send attempt (email or calendar) goes through a single
  `sendNotification()` function that: tries the action, writes `SENT` or
  `FAILED` + error message to `NotificationLog`, and never throws up to the
  caller (so a failed email never breaks a booking).
- A cron endpoint (`/api/cron/retry-notifications`, protected by a secret
  header, triggered by Vercel Cron or GitHub Actions on a schedule) queries
  `NotificationLog WHERE status = FAILED AND retryCount < 3`, retries, and
  increments `retryCount`. Same cron (or a second one) also handles
  medication reminders by checking `MedicationReminder` rows due to fire.

---

## 4. LLM Integration — Prompts & Failure Handling

Use the exact prompts given in the assignment (don't rephrase them —
graders may check for this). Wrap every call like this:

```
try {
  const result = await callLLM(prompt);
  save({ ...result, llmStatus: "OK" });
} catch (err) {
  save({
    llmStatus: "FAILED",
    fallbackText: "Summary unavailable — please review raw notes below.",
  });
  log(err);
}
```

- **Always show the raw symptoms/notes to the doctor/patient alongside the
  LLM output**, so a failure never hides information — it just loses the
  AI-generated convenience layer. This is the "graceful degradation" point
  your write-up should highlight.
- Parse LLM output as structured JSON by instructing the model to return
  JSON only (urgency, chief complaint, 3 questions). Validate with a schema
  check (e.g. zod) before saving — if parsing fails, treat it as `llmStatus:
  FAILED` too, don't crash.
- Set a timeout (e.g. 15s) on the LLM call so a hung request doesn't block
  the booking/visit flow.

---

## 5. Day-by-Day Plan (3 days)

**Day 1 — Foundation + booking core**
- Scaffold two folders in one repo: `/client` (React + Vite + TS + Tailwind +
  shadcn/ui) and `/server` (Express + TS). Create a free MongoDB Atlas M0
  cluster, connect via Mongoose, define the schemas + indexes from §2
  (including the compound unique index and TTL index).
- Auth (register/login, role-based middleware) for patient/doctor/admin —
  reuse your JWT + RBAC pattern from AgroSync.
- Admin: create/edit doctor profile (specialization, working hours, slot
  duration, mark leave days).
- Patient: search doctors by specialization, view available slots
  (computed from working hours − existing bookings − leave days).
- Slot hold + confirm booking flow with the unique constraint (§3.1–3.3).

**Day 2 — Symptom form, LLM, notifications, calendar**
- Patient symptom form → pre-visit LLM summary → doctor dashboard shows it
  before the visit.
- Doctor post-visit notes + prescription form → post-visit LLM summary
  shown to patient.
- Email integration: booking confirmation, cancellation, leave-conflict
  notice (Resend/Nodemailer).
- Google Calendar OAuth + create event on booking, delete/update on
  cancel/reschedule.
- Medication reminder scheduling logic + cron endpoint.

**Day 3 — Polish, deploy, docs**
- Cron for retries + reminders (Vercel Cron or GitHub Actions schedule).
- Basic empty/error states, loading states, mobile responsiveness pass.
- Deploy `/client` to Vercel and `/server` to Render/Railway, connect your
  MongoDB Atlas URI, set all env vars on both, smoke-test the whole flow
  end-to-end on the live URL.
- Write README (setup guide, `.env.example`, API docs, DB schema, LLM
  prompts, Google Calendar setup steps).
- Write the 800-word system design doc (§3 above is basically your outline).
- Push to GitHub, double-check the repo is **public** (or shared with the
  right account — check the submission form for instructions on this).

---

## 6. What NOT to Do

- Don't build a separate mobile app — not asked for.
- Don't implement payments — not asked for.
- Don't use Redis/BullMQ/microservices — adds deploy complexity you don't
  have time for; Vercel Cron does the job for this scope.
- Don't hardcode API keys anywhere in code — use `.env`, commit only
  `.env.example`.
- Don't store plain-text passwords — bcrypt hash, always.
- Don't let an LLM or email failure throw an unhandled exception that
  breaks booking — this is explicitly graded (§4).
- Don't submit a ZIP — the CDC email is explicit: **GitHub link only**.
- Don't skip the system design write-up or exceed 800 words — it's a named
  deliverable with a limit.
- Don't over-theme the UI with multiple color schemes/dark-mode toggles —
  one clean, consistent look is enough (see §7).

---

## 7. UI/Design Guidance

Keep it simple, calm, and consistent — this is a healthcare product, not a
consumer app.

- **Palette**: a single primary blue/teal (e.g. `#2563EB` or `#0D9488`) for
  actions and branding, neutral grays (`#F8FAFC` background, `#1E293B`
  text) for structure, and reserve **red/amber only for urgency indicators**
  (High urgency = red, Medium = amber, Low = green) — don't use red
  elsewhere, it reads as "error" everywhere else in healthcare UIs.
- **Typography**: one sans-serif (Inter or system font), 2 weights max.
- **Layout**: three distinct dashboards (patient/doctor/admin), each with a
  simple sidebar or top nav — don't invent a different layout per role.
- Use shadcn/ui components (cards, tables, badges, forms) rather than
  building custom components from scratch — it looks polished with almost
  no design effort, which matters given your time budget.
- Urgency level and status (Confirmed/Cancelled/Held) should always render
  as a colored **badge**, not just text — it's a small touch evaluators
  notice.

---

## 8. README Checklist (matches the deliverables exactly)

- [ ] Project overview + architecture diagram (even a simple text/ASCII one)
- [ ] Setup guide (clone, install, `client` + `server` env vars, MongoDB
      Atlas connection string, run dev for both)
- [ ] `.env.example` (one for `/client`, one for `/server`), no real secrets
- [ ] API docs (route, method, auth required, request/response shape) —
      a simple table is enough
- [ ] DB schema (paste the Mongoose schemas from §2, or a diagram)
- [ ] Exact LLM prompts used (copy verbatim from the assignment)
- [ ] Google Calendar OAuth setup steps (Google Cloud Console project →
      enable Calendar API → OAuth consent screen → credentials → redirect URI)
- [ ] Link to hosted app
- [ ] Link/section for the system design write-up (can be a separate
      `SYSTEM_DESIGN.md` file in the repo)

---

## 9. System Design Write-up — Outline (fill in your own wording, ≤800 words)

1. **Double-booking prevention** — unique DB constraint + transactional
   hold-then-confirm flow (§3.1).
2. **Simultaneous booking attempts** — how the unique constraint / row lock
   resolves the race, and what the losing request sees.
3. **Slot hold mechanism** — why holds exist, TTL, cleanup strategy.
4. **Doctor leave conflict handling** — atomic leave-marking +
   cancellation + notification (§3.3).
5. **Notification failure handling** — `NotificationLog` table, retry cron,
   why failures never block core actions (§3.4).
6. **LLM failure handling** — timeout, fallback text, raw-data visibility
   preserved (§4).
7. Brief note on trade-offs made for time (e.g. "cancel-on-leave instead of
   auto-reschedule, given the 3-day scope").

That last point is worth including explicitly — naming your scope
trade-offs shows judgment, which is exactly what a placement evaluator is
screening for.
