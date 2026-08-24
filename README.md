# Healthcare Appointment & Follow-up Manager

Full-stack appointment platform with patient / doctor / admin portals, AI
pre-visit and post-visit summaries, email notifications, and Google Calendar
sync.

- **System design write-up** (double-booking prevention, race handling,
  holds, leave conflicts, notification & LLM failure handling):
  [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md)
- **Setup guide**: this README covers running the code end-to-end.

## Stack
- Client: React (Vite) + TypeScript + Tailwind + shadcn/ui
- Server: Node.js + Express + TypeScript
- DB: MongoDB Atlas (free M0 replica set) + Mongoose
- Auth: JWT + role-based access control (patient / doctor / admin)
- Email: Nodemailer
- Calendar: Google Calendar API v3 (OAuth 2.0)
- LLM: Google Gemini (free tier) — pre-visit & post-visit summaries
- Background jobs: node-cron (in-process — see `server/src/jobs/cronJobs.ts`)

## Project structure
```
client/   React frontend (patient / doctor / admin dashboards)
server/   Express API (auth, appointments, doctors, admin, notifications)
```

## Quick start

### 1. MongoDB Atlas
Create a free M0 cluster at https://cloud.mongodb.com, allow network access
from anywhere (0.0.0.0/0) for dev, and copy the connection string.

### 2. Server
```bash
cd server
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, SMTP keys,
                        # GEMINI_API_KEY, GOOGLE_CLIENT_ID/SECRET, etc.
npm install
npm run dev             # starts on http://localhost:5000
```

### 3. Client
```bash
cd client
cp .env.example .env   # set VITE_API_URL=http://localhost:5000/api
npm install
npm run dev             # starts on http://localhost:5173
```

### 4. Google Calendar OAuth (summary — full steps in the design doc)
1. Create a project in Google Cloud Console.
2. Enable the "Google Calendar API".
3. Configure the OAuth consent screen (External, add your test user email).
4. Create OAuth 2.0 credentials (Web application), add
   `http://localhost:5000/api/auth/google/callback` as an authorized
   redirect URI.
5. Put the client ID/secret in `server/.env`.

## Seeding an admin user
On first run, register a user normally via `/api/auth/register`, then
manually set `role: "admin"` on that document in Atlas (there's no public
"become admin" endpoint — that's intentional).

## API reference

All routes are prefixed with `/api`. Auth = `Authorization: Bearer <jwt>`.

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | Register patient or doctor |
| POST | `/auth/login` | — | Login, returns JWT + user |
| GET | `/auth/google` | any | Redirect to Google OAuth consent (calendar link) |
| GET | `/auth/google/callback` | — | OAuth callback; stores refresh token |
| GET | `/auth/calendar/status` | any | `{ linked: boolean }` |
| GET | `/doctors?specialization=` | any | Search active doctors |
| GET | `/doctors/appointments/mine` | doctor | Doctor's appointments (patients populated) |
| GET | `/doctors/appointments/:id/pre-visit` | doctor | Symptom form + AI pre-visit summary |
| POST | `/doctors/appointments/:id/post-visit` | doctor | Clinical notes + prescription → AI summary + reminders |
| GET | `/appointments/available-slots?doctorId=&date=YYYY-MM-DD` | any | Computed free slots (UTC) |
| GET | `/appointments/mine` | patient | Patient's appointments |
| POST | `/appointments/hold` | patient | Hold a slot for 5 min (`409` if taken) |
| POST | `/appointments/:id/symptoms` | patient | Submit symptom form (+ LLM summary) |
| POST | `/appointments/:id/confirm` | patient | `HELD → CONFIRMED` (`410` if hold expired) |
| POST | `/appointments/:id/reschedule` | patient | Move a confirmed appointment (`409` if slot taken / doctor on leave); re-notifies both parties and replaces calendar events |
| POST | `/appointments/:id/cancel` | any | Cancel + notify both parties + remove calendar events |
| GET | `/admin/doctors` | admin | Doctors with/without profiles |
| POST | `/admin/doctors` | admin | Create doctor profile (hours, slot length) |
| POST | `/admin/leave` | admin | Mark leave; cancels + notifies affected patients |

Error shape is always `{ "error": string }`. Duplicate-key races on the
appointment unique index return `409`.

## Database schema (collections)

`users` (name, email, passwordHash, role, googleRefreshToken) ·
`doctorProfiles` (userId, specialization, workingHours per weekday,
slotDurationMinutes) · `doctorLeaves` (doctorId, date, reason) ·
`appointments` (patientId, doctorId, slotStart, slotEnd, status
HELD/CONFIRMED/CANCELLED/COMPLETED/RESCHEDULED, holdExpiresAt) with **unique
index `{doctorId, slotStart}`** and a **TTL index on `holdExpiresAt`** for
expired holds · `symptomForms` · `preVisitSummaries` (urgencyLevel,
chiefComplaint, suggestedQuestions, llmStatus) · `postVisitNotes`
(clinicalNotes, prescription[]) · `postVisitSummaries` (patientFriendlyText,
medicationSchedule, followUpSteps, llmStatus) · `medicationReminders`
(medicationName, timeOfDay, endsAt, lastSentAt, active) · `notificationLogs`
(type, channel EMAIL/CALENDAR, status PENDING/SENT/FAILED, retryCount,
payload) · `calendarEvents` (appointmentId, userId, googleEventId, status).

Full Mongoose definitions: `server/src/models/`.

## Exact LLM prompts

Pre-visit summary (`server/src/services/llmService.ts`):

```text
Analyse these symptoms and return ONLY a JSON object (no prose, no markdown fences) with keys:
"urgencyLevel" (one of "Low", "Medium", "High"),
"chiefComplaint" (a one-sentence summary),
"suggestedQuestions" (an array of exactly 3 short questions the doctor could ask the patient).
Symptoms: ${symptoms}
```

Post-visit summary:

```text
Convert these clinical notes into a patient-friendly summary. Return ONLY a JSON object (no prose, no markdown fences) with keys:
"patientFriendlyText" (a short, plain-language explanation of the visit and diagnosis),
"medicationSchedule" (an array of { "medicationName": string, "timeOfDay": string[] }, times in 24h "HH:MM" format),
"followUpSteps" (a short paragraph on what the patient should do next).
Clinical notes: ${clinicalNotes}
```

Both calls: 15s timeout, JSON validated before saving, `llmStatus: "FAILED"`
+ fallback text on any failure. Raw symptoms/notes are always shown to the
doctor/patient regardless of LLM outcome.
