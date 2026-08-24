# Healthcare Appointment & Follow-up Manager

Full-stack appointment platform with patient / doctor / admin portals, AI
pre-visit and post-visit summaries, resilient email notifications, Google
Calendar sync, and race-proof slot booking.

- **Live app**: frontend on Vercel, API on Render (see [Deployment](#deployment))
- **System design write-up** (double-booking prevention, holds, leave
  conflicts, notification & LLM failure handling): [`docs/system-design.md`](./docs/system-design.md)

## Stack

- Client: React 18 (Vite) + TypeScript + Tailwind CSS
- Server: Node.js + Express + TypeScript + Zod validation
- DB: MongoDB Atlas (M0 replica set — transactions required) + Mongoose
- Auth: JWT + role-based access control (`patient` / `doctor` / `admin`),
  live account-status checks (disabled accounts locked out mid-session)
- Email: Nodemailer SMTP with **Gmail REST API fallback** over HTTPS
- Calendar: Google Calendar API v3 (OAuth 2.0 offline tokens)
- LLM: Google Gemini (`gemini-2.5-flash`) — structured JSON output
- Background jobs: node-cron (retry failed notifications every 5 min,
  medication reminder scheduler)

## Project structure

```
client/   React frontend (patient / doctor / admin dashboards)
server/   Express API (auth, appointments, doctors, admin, notifications)
docs/     System design write-up
```

## Quick start

### 1. MongoDB

Create a free M0 cluster at https://cloud.mongodb.com, add a database user,
allow network access from anywhere (`0.0.0.0/0`) for development, and copy
the connection string. Local dev needs a **replica set** (`rs0`) because
booking holds run in multi-document transactions:

```
mongodb://localhost:27017/healthcare?replicaSet=rs0
```

### 2. Server

```bash
cd server
cp .env.example .env    # fill in every value — see .env.example comments
npm install
npm run dev             # http://localhost:5000  (nodemon + ts-node)
```

### 3. Client

```bash
cd client
cp .env.example .env    # VITE_API_URL=http://localhost:5000/api
npm install
npm run dev             # http://localhost:5173
```

### 4. Seed the admin account

```bash
cd server
npx ts-node src/scripts/createAdmin.ts   # creates admin@clinic.com / admin123
```

There is no public "become admin" endpoint by design. Doctors are created by
the admin console (registration always yields `patient`).

## Environment variables

All keys live in `server/.env.example` with inline explanations:
`MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`,
`SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `CRON_SECRET`.
Client needs only `VITE_API_URL`.

Use port **587** for SMTP on cloud hosts — most providers (including Render)
block or throttle outbound **465**.

## Google Calendar & Gmail setup

1. https://console.cloud.google.com → create/select a project.
2. **Enable both APIs**: *Google Calendar API* and *Gmail API*
   (the app falls back to Gmail's REST API for email delivery).
3. OAuth consent screen → External → add your Gmail address as a test user.
4. Credentials → OAuth client ID → Web application:
   - Authorized redirect URI (local): `http://localhost:5000/api/auth/google/callback`
   - Authorized redirect URI (prod): `https://<your-api-host>/api/auth/google/callback`
   - Authorized JavaScript origin (prod): `https://<your-frontend-host>`
5. Put client ID/secret in env; doctors click **Connect Google Calendar** in
   their dashboard. The consent grants `calendar.events` + `gmail.send`;
   confirmed/rescheduled appointments sync automatically and the clinic's
   linked account becomes the sender for notification emails if SMTP fails.

## Deployment

- **API — Render** (free): New → Blueprint → point at this repo;
  `render.yaml` builds `npm install && npm run build`, starts `npm start`,
  health check `/api/health`. Fill the `sync: false` secrets in the dashboard.
- **Frontend — Vercel** (free): import repo, Root Directory `client`,
  env `VITE_API_URL=https://<render-app>/api`. `client/vercel.json` rewrites
  all routes to `index.html` so SPA deep links survive refresh.
- Set `CLIENT_URL` on Render to the Vercel URL after the first deploy.
- Free Render instances sleep when idle (~50 s cold start); cron jobs run
  only while awake.

## API reference

All routes prefixed with `/api`. Auth: `Authorization: Bearer <jwt>`.
Errors are always `{ "error": string }`; duplicate-key slot races → `409`.

### Auth (`/api/auth`)
| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/register` | — | Register (**always** role `patient`) |
| POST | `/login` | — | Returns JWT + user; disabled accounts get `403` |
| PUT | `/me` | any | Update own name |
| GET | `/google` | any | Start Google OAuth (calendar + gmail.send scopes) |
| GET | `/google/callback` | — | Stores refresh token, redirects to client |
| GET | `/calendar/status` | any | `{ linked }` |

### Appointments (`/api/appointments`)
| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/available-slots?doctorId=&date=` | any | Computed free slots (clinic-tz aware, skips leaves/inactive) |
| GET | `/mine` | patient | Own visits incl. resumable HELD rows (cancelled excluded) |
| POST | `/hold` | patient | Hold slot 5 min; transactional + partial unique index |
| POST | `/:id/symptoms` | patient | Symptom form → Gemini pre-visit summary |
| POST | `/:id/confirm` | patient | `HELD → CONFIRMED` (`410` expired); owner-only |
| POST | `/:id/reschedule` | patient | Owner-only; leave/slot checks; re-notifies + re-syncs |
| POST | `/:id/cancel` | involved party or admin | Notify both + delete calendar events |
| GET | `/:id/summary` | patient | Symptoms + prescription + patient-friendly summary |

### Doctors (`/api/doctors`)
| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/` | any | Search active doctor profiles |
| GET/PUT | `/me/profile` | doctor | Own profile & weekly hours |
| GET | `/appointments/mine` | doctor | Doctor's schedule |
| GET | `/appointments/:id/pre-visit` | doctor | Symptom form + urgency/chief complaint/questions |
| POST | `/appointments/:id/post-visit` | doctor | Clinical notes + prescription → summary + med reminders |
| GET | `/patients/:patientId/history` | doctor | Past completed visits (treating-relationship enforced) |

### Admin (`/api/admin`)
| Method | Route | Purpose |
|---|---|---|
| GET | `/stats` | Platform counters |
| GET/POST | `/doctors` | Roster w/ profiles; create profile (hours parser accepts `mon: 09:00-13:00`) |
| PATCH | `/doctors/:userId/active` | Deactivate → hidden from search/booking |
| POST | `/leave` | Mark leave; force-cancels + emails affected patients |
| GET/DELETE | `/leaves` | Upcoming leaves board |
| GET | `/appointments` | All visits, optional `?status=` |
| POST | `/appointments/:id/cancel` | Force-cancel + notify both parties |
| GET/PATCH | `/users`, `/users/:userId/active` | User management (admins can't be disabled) |

### Notifications (`/api/notifications`)
| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/mine` | any | Own notification log feed (bell dropdown) |

## Database schema

`users`(name, email, passwordHash, role, isActive, googleRefreshToken) ·
`doctorprofiles`(userId, specialization, workingHours per weekday, slotDurationMinutes, isActive) ·
`doctorleaves`(doctorId, date, reason) ·
`appointments`(patientId, doctorId, slotStart, slotEnd, status ENUM[HELD, CONFIRMED, CANCELLED, COMPLETED], holdExpiresAt)
— indexes: **partial unique `{doctorId, slotStart}` where status ∈ {HELD, CONFIRMED}** (cancelled visits never block rebooking),
TTL on holdExpiresAt (partial HELD), plus query-support pairs ·
`symptomforms`(appointmentId, rawSymptoms) ·
`previsitsummaries`(urgencyLevel, chiefComplaint, suggestedQuestions, llmStatus, rawLlmResponse) ·
`postvisitnotes`(clinicalNotes, prescription[{medicationName, dosage, frequency, durationDays}]) ·
`postvisitsummaries`(patientFriendlyText, medicationSchedule, followUpSteps, llmStatus) ·
`medicationreminders`(patientId, medicationName, timeOfDay, endsAt, active, lastSentAt) ·
`notificationlogs`(type, recipientId, channel EMAIL/CALENDAR, status PENDING/SENT/FAILED, lastError, payload) ·
`calendarevents`(appointmentId, userId, googleEventId, status).

Full Mongoose definitions: `server/src/models/`.

## Notification reliability

Every send is journaled to `notificationlogs` first (`PENDING`). Delivery
tries SMTP (IPv4-forced, 10 s timeouts) and falls back to the **Gmail REST
API** over HTTPS using the clinic's linked Google token — cloud platforms'
outbound SMTP is unreliable while HTTPS egress is not. A cron job retries
`FAILED` entries every 5 minutes until they succeed. Medication reminders
auto-expire via `endsAt = visitTime + durationDays` and never double-send on
the same day (`lastSentAt` guard).

## Exact LLM prompts

Model: `gemini-2.5-flash` via REST, `temperature 0.2`,
`responseMimeType: application/json`, 60 s abort timeout, one automatic
retry after 2 s on HTTP 429/503. Responses are JSON-parsed and shape-checked;
any failure yields `llmStatus: "FAILED"` and the UI falls back to raw text —
an LLM outage never blocks a visit.

Pre-visit (`generatePreVisitSummary`):

```text
Analyse these symptoms and return ONLY a JSON object (no prose, no markdown fences) with keys:
"urgencyLevel" (one of "Low", "Medium", "High"),
"chiefComplaint" (a one-sentence summary),
"suggestedQuestions" (an array of exactly 3 short questions the doctor could ask the patient).
Symptoms: ${symptoms}
```

Post-visit (`generatePostVisitSummary`) — receives the doctor's verbatim
prescription lines plus clinical notes:

```text
Convert these clinical notes into a patient-friendly summary. Return ONLY a JSON object (no prose, no markdown fences) with keys:
"patientFriendlyText" (a short, plain-language explanation of the visit and diagnosis),
"medicationSchedule" (an array of { "medicationName": string, "timeOfDay": string[] }, times in 24h "HH:MM" format),
"followUpSteps" (a short paragraph on what the patient should do next).
CRITICAL RULES for mentioning medicines:
- Use ONLY the medicine names exactly as written in the prescription below. Never substitute brand/generic alternatives, never add explanations in parentheses after the name.
- Respect the prescribed frequency exactly (e.g. "once daily after dinner" means ONE dose per day).
Medicines prescribed:
${rxList}
Clinical notes: ${clinicalNotes}
```

## Security notes

Ownership scoping on every appointment mutation, role middleware on every
route, Zod validation on all inputs, ObjectId format checks on query params,
helmet headers, login/register rate limiting (10 / 15 min), generic 500
messages in production, JWT-bound OAuth `state` parameter.
