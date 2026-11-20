# API Documentation

Full REST reference for the AI-Powered Healthcare Appointment & Patient Portal. This document
covers the **server** API (Express/PostgreSQL) and the separate **ai-service** API (FastAPI/Ollama —
migrated off the Claude API 2026-08-17, see the ai-service section below for details).

This project is a freshly generated scaffold (~1 hour old at time of writing). Every endpoint
below is annotated with its real implementation status — **Implemented**, **Partial**, or
**Planned** — taken directly from the codebase discovery. "Partial" means the route exists and
runs real logic, but has a known functional or security gap (documented inline). Request/response
shapes not directly confirmed by controller evidence are marked **(inferred, verify against
controller)**.

## Base URLs

| Service | Base URL | Source |
|---|---|---|
| Server (Express API) | `http://localhost:5000/api` | `server/index.js`, `client/.env.example` (`VITE_API_URL`) |
| Server (Socket.IO) | `http://localhost:5000` | `client/.env.example` (`VITE_SOCKET_URL`) |
| ai-service (FastAPI) | `http://localhost:8000` | `server/.env.example` (`AI_SERVICE_URL`), README |

The server's route prefix `/api` is mounted in `server/index.js`; the `/health` route on the
server is **not** under `/api` (see below). The ai-service has no `/api` prefix at all.

## Authentication model

- **Server REST routes**: JWT bearer token via `Authorization: Bearer <token>` header, verified
  by `requireAuth` middleware (`server/src/middleware/auth.middleware.js`) against `JWT_SECRET`.
  On failure: `401 { "error": "Invalid or expired token" }` (verbatim from controller evidence).
  Role-gated routes additionally use `requireRole(role)`, which checks `req.user.role`.
- **Server Socket.IO**: JWT passed via the socket handshake as `auth.token` (confirmed by both
  server discovery and the client's `connectSocket(token)` helper, which calls
  `io(url, { auth: { token } })`).
- **ai-service**: **Fixed 2026-08-17.** `/assistant/query` and `/summarize` now require
  `Authorization: Bearer <AI_SERVICE_TOKEN>`, checked by `ai-service/auth.py`'s
  `require_service_token` dependency; on failure: `401 { "detail": "Missing or invalid service
  token" }`. The check fails closed — if `AI_SERVICE_TOKEN` is unset on the ai-service side, every
  request to those two routes is rejected. `/health` is intentionally left open (no auth) for
  liveness checks.

## Status legend

| Label | Meaning |
|---|---|
| Implemented | Route exists, runs real logic end-to-end, no known functional gap in the reviewed evidence. |
| Partial | Route exists and runs real logic, but has a known missing check, missing validation, or narrow error handling. |
| Planned | No route/controller/code exists yet — listed only where explicitly relevant (e.g. Reminders, see note at bottom). |

---

## Health checks

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| GET | `/health` | none | Liveness check for the server. | Implemented |
| GET | `/health` (ai-service) | none | Liveness check for the ai-service. | Implemented |

**GET `/health`** (server, `http://localhost:5000/health`)
Response `200`:
```json
{ "status": "ok" }
```

**GET `/health`** (ai-service, `http://localhost:8000/health`)
Response `200`:
```json
{ "status": "ok" }
```

---

## Auth — `/api/auth`

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| POST | `/api/auth/register` | none | Create a user. `role` must be `patient` or `doctor` — `admin` is rejected. | Implemented |
| POST | `/api/auth/login` | none | Verify a bcrypt password hash and issue a JWT. | Implemented |
| GET | `/api/auth/me` | any authenticated (`requireAuth`) | Return the caller's own user profile. | Implemented |

### POST `/api/auth/register`
Request body (inferred, verify against controller — fields align with the `users` table in
`schema.sql` and the `REGISTERABLE_ROLES` set):
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "role": "patient | doctor",
  "phone": "string (optional)"
}
```
**FIXED (was a privilege-escalation risk):** `role` is now validated against
`const REGISTERABLE_ROLES = new Set(["patient", "doctor"]);` in
`server/src/controllers/auth.controller.js` — a request with `role: "admin"` (or anything
else outside that set) is rejected with `400 { error: "Invalid role" }`. Admin accounts must
be provisioned out-of-band (e.g. directly in the database) — there is still no dedicated
admin-provisioning endpoint or script (see `docs/DEV_CONTEXT.md` Section 10, and the open
question in `docs/PROJECT_PLAN.md`).

Response `201` (inferred, verify against controller — pattern matches login's JWT issuance):
```json
{
  "token": "jwt string",
  "user": { "id": 1, "name": "string", "email": "string", "role": "patient", "phone": "string", "created_at": "timestamp" }
}
```
Error cases (inferred): a duplicate `email` will violate the `users.email UNIQUE` constraint;
the global error handler is not confirmed to catch this specifically, so it likely surfaces as a
raw `500 { "error": "<raw Postgres error text>" }` rather than a clean `409`/`400` (see "Error
handling" note below).

### POST `/api/auth/login`
Request body (inferred, verify against controller):
```json
{ "email": "string", "password": "string" }
```
Response `200` (inferred, verify against controller):
```json
{
  "token": "jwt string",
  "user": { "id": 1, "name": "string", "email": "string", "role": "patient", "phone": "string", "created_at": "timestamp" }
}
```
Confirmed: the handler verifies the bcrypt password hash and issues a JWT signed with
`JWT_SECRET`, expiring per `JWT_EXPIRES_IN` (`.env.example` default `15m`), and a refresh cookie is set (see `/api/auth/refresh` below).

### POST `/api/auth/refresh` / POST `/api/auth/logout`

Cookie-authenticated (`rt` httpOnly cookie, `Path=/api/auth`); only accepted from `CLIENT_ORIGIN`.

- `refresh` rotates the refresh token and returns `{ user, token }` (access token, 15 min). `401`
  = no/invalid/expired/revoked session (replaying an old token revokes the whole session family);
  `409 {"code":"rotated"}` = another tab rotated it a moment ago, retry once.
- `logout` revokes the refresh token and clears the cookie (`204`).

`register` and `login` now also set the refresh cookie.

### GET `/api/auth/me`
Headers: `Authorization: Bearer <token>`
Response `200` (inferred shape, based on the `users` table minus `password_hash`):
```json
{ "user": { "id": 1, "name": "string", "email": "string", "role": "patient", "phone": "string", "created_at": "timestamp" } }
```
Confirmed: returns the caller's own profile using `req.user` populated by `requireAuth`
(`req.user = jwt.verify(token, process.env.JWT_SECRET)`).

---

## Doctors — `/api/doctors`

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| GET | `/api/doctors` | none | Search doctors by specialization/location/fee/experience/language. | Implemented |
| GET | `/api/doctors/:id/availability` | none | List a doctor's weekly availability slots. | Implemented |
| PUT | `/api/doctors/profile` | doctor (`requireAuth` + `requireRole('doctor')`) | Upsert the caller's own doctor profile. | Implemented |

### GET `/api/doctors`
Query params (inferred, verify against controller — matches filter fields named in
`DoctorSearchFilters.jsx` and the `doctor_profiles` table columns):
```
?specialization=string&location=string&maxFee=number&minExperience=number&language=string
```
Response `200` (inferred, verify against controller):
```json
{
  "doctors": [
    {
      "id": 1,
      "user_id": 5,
      "specialization": "string",
      "location": "string",
      "fee": 500.00,
      "experience_years": 8,
      "languages": ["English", "Hindi"],
      "bio": "string or null"
    }
  ]
}
```
Client strips empty filter values before calling this endpoint (`DoctorSearchFilters.jsx`
builds `cleaned` via `Object.entries(filters).filter(([, v]) => v !== "")`).

### GET `/api/doctors/:id/slots?date=YYYY-MM-DD`

Public. Free, bookable slots for that local date in the doctor's timezone:
`{ "timezone": "Asia/Kolkata", "date": "...", "slots": [{ "startsAt": ISO, "endsAt": ISO }] }`.
`400` bad date, `404` unknown doctor. Bookings must use exactly one of these slots.

### GET `/api/doctors/:id/availability`
`:id` is the `doctor_profiles.id`.
Response `200` (inferred, verify against controller — matches `doctor_availability` table):
```json
{
  "availability": [
    { "id": 1, "doctor_id": 1, "day_of_week": 1, "start_time": "09:00:00", "end_time": "17:00:00", "slot_minutes": 30 }
  ]
}
```
`day_of_week` is `0` (Sunday) through `6` (Saturday) per `schema.sql`.

### PUT `/api/doctors/profile`
Headers: `Authorization: Bearer <token>` (role must be `doctor`)
Request body (inferred, verify against controller):
```json
{
  "specialization": "string",
  "location": "string",
  "fee": 500.00,
  "experience_years": 8,
  "languages": ["English", "Hindi"],
  "bio": "string (optional)"
}
```
Response `200` (inferred, verify against controller):
```json
{ "profile": { "id": 1, "user_id": 5, "specialization": "string", "location": "string", "fee": 500.00, "experience_years": 8, "languages": [], "bio": "string or null" } }
```
Confirmed via SQL evidence: `INSERT INTO doctor_profiles (...) VALUES (...) ON CONFLICT (user_id)
DO UPDATE SET specialization = EXCLUDED.specialization, ... RETURNING *` — this is a real
upsert keyed on `user_id`, so a doctor calling this endpoint repeatedly updates their single
profile row rather than creating duplicates.

---

## Appointments — `/api/appointments`

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| POST | `/api/appointments` | patient (`requireAuth` + `requireRole('patient')`) | Book an appointment. | Implemented |
| GET | `/api/appointments` | any authenticated (`requireAuth`) | List the caller's own appointments (patient or doctor view). | Implemented |
| PATCH | `/api/appointments/:id/status` | owning patient, owning doctor, or admin | Update an appointment's status. | Implemented |
| PATCH | `/api/appointments/:id/reschedule` | owning patient, owning doctor, or admin | Reschedule an appointment. | Implemented |

> **FIXED (was an IDOR):** both handlers now call a `getAppointmentAccess(appointmentId, user)`
> helper in `server/src/controllers/appointment.controller.js` before mutating the row. It
> resolves the appointment's `patient_id` and its doctor's `user_id` (via `doctor_profiles`)
> and returns `404` if the appointment doesn't exist or `403` if the caller is not the
> appointment's patient, its doctor, or an admin. Previously neither handler's `UPDATE`
> query had a `WHERE` clause tying the row to `req.user.id`.

### POST `/api/appointments`
Headers: `Authorization: Bearer <token>` (role must be `patient`)
Request body (inferred, verify against controller — matches `appointments` table columns):
```json
{
  "doctorId": 1,
  "startsAt": "2026-08-20T10:00:00Z",
  "endsAt": "2026-08-20T10:30:00Z",
  "notes": "string (optional)"
}
```
Response `201` (inferred, verify against controller):
```json
{
  "appointment": {
    "id": 1, "patient_id": 5, "doctor_id": 1,
    "starts_at": "2026-08-20T10:00:00Z", "ends_at": "2026-08-20T10:30:00Z",
    "status": "scheduled", "notes": "string or null", "created_at": "timestamp"
  }
}
```
Response `409` on a genuine double-booking (confirmed): the DB-level constraint
`CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)` is real and race-safe; the
controller maps a constraint violation on that key to `409`. **Note:** there is no evidence the
controller validates `startsAt < endsAt` — this is a documented gap (`bookAppointment never
checks startsAt < endsAt`), so a malformed request with `endsAt` before `startsAt` may still be
accepted.

### GET `/api/appointments`
Headers: `Authorization: Bearer <token>`
Response `200` — confirmed field name from client evidence
(`api.get("/appointments").then(({ data }) => setAppointments(data.appointments))`):
```json
{
  "appointments": [
    {
      "id": 1, "patient_id": 5, "doctor_id": 1,
      "starts_at": "timestamp", "ends_at": "timestamp",
      "status": "scheduled", "notes": "string or null", "created_at": "timestamp"
    }
  ]
}
```
Role-aware: returns the caller's own appointments as a patient or as a doctor, depending on
`req.user.role`. Unbounded — no pagination on this endpoint (documented tech debt).

### PATCH `/api/appointments/:id/status`
Headers: `Authorization: Bearer <token>` (any authenticated role — no ownership enforced)
Request body (inferred, verify against controller; `appointment_status` enum confirmed in
`schema.sql`):
```json
{ "status": "scheduled | confirmed | completed | cancelled" }
```
Response `200` (inferred, verify against controller):
```json
{ "appointment": { "id": 1, "...": "...", "status": "confirmed" } }
```
Confirmed SQL: `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *`.

### PATCH `/api/appointments/:id/reschedule`
Headers: `Authorization: Bearer <token>` (any authenticated role — no ownership enforced)
Request body (inferred, verify against controller):
```json
{ "startsAt": "2026-08-21T11:00:00Z", "endsAt": "2026-08-21T11:30:00Z" }
```
Response `200` (inferred, verify against controller):
```json
{ "appointment": { "id": 1, "...": "...", "starts_at": "2026-08-21T11:00:00Z", "ends_at": "2026-08-21T11:30:00Z" } }
```

---

## Documents — `/api/documents`

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| POST | `/api/documents` | any authenticated (`requireAuth`) | Upload a file to Cloudinary and record metadata. | Implemented |
| GET | `/api/documents` | any authenticated (`requireAuth`) | List the caller's own uploaded documents. | Implemented |
| GET | `/api/documents/patient/:patientId` | `doctor`, `admin` | List documents a patient attached to the caller's own appointments (requires a care relationship). | Implemented |
| POST | `/api/assistant/query` | any authenticated | Proxy to ai-service: natural-language search → doctor filters. Body `{message}` (≤500 chars). | Implemented (no UI yet) |
| POST | `/api/documents/:id/summarize` | any authenticated (`requireAuth`) | Call the ai-service to summarize a document the caller owns. | Implemented (round trip works; see hardening gaps under ai-service) |

### POST `/api/documents`
Headers: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
Request: multipart form, file field name confirmed as `file`
(`router.post("/", upload.single("file"), catchAsync(uploadDocument))`).
```
file: <binary> (required; allowlisted MIME types: application/pdf, image/jpeg, image/png; max 10MB)
appointmentId: number (optional, inferred — documents.appointment_id is nullable in schema.sql)
```
Response `201` (inferred, verify against controller — matches `documents` table columns):
```json
{
  "document": {
    "id": 1, "patient_id": 5, "appointment_id": null,
    "file_url": "https://res.cloudinary.com/...", "file_type": "application/pdf",
    "original_name": "report.pdf", "ai_summary": null, "uploaded_at": "timestamp"
  }
}
```
Enforced by `upload.middleware.js`: `ALLOWED_MIME_TYPES = new Set(["application/pdf",
"image/jpeg", "image/png"])`, `limits: { fileSize: 10 * 1024 * 1024 }`. **Known gap:** a
rejected-mimetype error is thrown as a plain `Error` with no `.status`, so it surfaces as a raw
`500` instead of a `400` via the global error handler.

### GET `/api/documents`
Headers: `Authorization: Bearer <token>`
Response `200` (inferred, verify against controller — field name inferred by analogy with
`/api/appointments`'s confirmed `{ appointments: [...] }` shape):
```json
{
  "documents": [
    { "id": 1, "patient_id": 5, "appointment_id": null, "file_url": "string", "file_type": "application/pdf", "original_name": "report.pdf", "ai_summary": null, "uploaded_at": "timestamp" }
  ]
}
```
Lists only the caller's own documents. Unbounded — no pagination (documented tech debt).

### GET `/api/documents/:id/file`

Returns `{ "url": "<signed Cloudinary URL>" }` for the owning patient, or a doctor/admin the
document was shared with via an appointment; otherwise `404`. Audited (`document.file_access`).
Document objects never include `file_url`/`public_id`.

### GET `/api/documents/patient/:patientId`

`doctor`/`admin` only. Documents that patient attached to this doctor's appointments (`403`
without a care relationship). Audited (`document.list_patient`).

### POST `/api/documents/:id/summarize`
Headers: `Authorization: Bearer <token>`
Request body: none required (the server looks up the document's `file_url`/`file_type` by `:id`
and the caller's ownership; inferred).
Response `200` — confirmed field name from client evidence
(`const { data } = await api.post(...); onSummarized(data.document);`):
```json
{
  "document": {
    "id": 1, "...": "...",
    "ai_summary": {
      "documentType": "string",
      "keyInfo": "string or object (inferred, verify against controller)",
      "abnormalValues": "string or array (inferred, verify against controller)",
      "followUp": "string (inferred, verify against controller)",
      "disclaimer": "string"
    }
  }
}
```
Confirmed: server calls `fetch(`${process.env.AI_SERVICE_URL}/summarize`, { method: "POST", ... })`
and, on failure, `return res.status(502).json({ error: "AI service failed to summarize document" })`.
**Known gap:** this `fetch()` call has no timeout/`AbortController` — a hung ai-service call
stalls the request indefinitely.

---

## Chat — `/api/chat`

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| GET | `/api/chat/:userId` | any authenticated (`requireAuth`) | Fetch the message thread between the caller and `:userId`. | Implemented |
| PATCH | `/api/chat/:id/read` | any authenticated (`requireAuth`) | Mark a message read. | Implemented |
| SOCKET | `message:send` | JWT via socket handshake `auth.token` | Persist a chat message and broadcast `message:new`. | Partial — see note |
| SOCKET | `typing` | JWT via socket handshake `auth.token` | Broadcast a typing indicator to the recipient's room. | Implemented |

### GET `/api/chat/:userId`
Headers: `Authorization: Bearer <token>`
`:userId` is the other party's `users.id`.
Response `200` — confirmed field name from client evidence
(`api.get(`/chat/${peerId}`).then(({ data }) => setMessages(data.messages))`):
```json
{
  "messages": [
    { "id": 1, "appointment_id": null, "sender_id": 5, "recipient_id": 9, "body": "string", "file_url": null, "read_at": null, "created_at": "timestamp" }
  ]
}
```
Confirmed SQL: `WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND
recipient_id = $1) ORDER BY created_at ASC` — correctly scoped to `req.user.id`. Unbounded —
no pagination on conversation history (documented tech debt).

### PATCH `/api/chat/:id/read`
Headers: `Authorization: Bearer <token>`
`:id` is the `messages.id` row.
Request body: none required (inferred).
Response `200` (inferred, verify against controller):
```json
{ "message": { "id": 1, "...": "...", "read_at": "timestamp" } }
```
Confirmed: correctly scoped via `recipient_id = req.user.id`, so a caller can only mark
messages addressed to them as read.

### SOCKET `message:send`
Client emits, server persists then broadcasts. Handshake: connect with
`io(VITE_SOCKET_URL, { auth: { token } })`.
Emitted payload — confirmed from controller evidence
(`socket.on("message:send", async ({ recipientId, appointmentId, body, fileUrl }) => { ... })`):
```json
{ "recipientId": 9, "appointmentId": 1, "body": "string", "fileUrl": "string or null" }
```
Server behavior (confirmed): runs a `pool.query` to persist the message, then broadcasts
`message:new` to the relevant room/socket. **Known gap:** the `await pool.query(...)` call is
not wrapped in `try/catch` — a DB failure here is not caught by the equivalent of Express's
`catchAsync` and can crash the process. There is also no payload validation.

`message:new` (server broadcast, inferred shape — the persisted row):
```json
{ "id": 1, "appointment_id": 1, "sender_id": 5, "recipient_id": 9, "body": "string", "file_url": null, "read_at": null, "created_at": "timestamp" }
```
Note (client-side risk, documented): `ChatWindow.jsx`'s send flow has no optimistic local
append — it depends entirely on the server echoing `message:new` back to the sender's own
socket for the sent message to appear in the sender's own UI.

### SOCKET `typing`
Client emits, server broadcasts a typing indicator to the recipient's room. Exact payload shape
not detailed in discovery evidence beyond "broadcast to the recipient's room" — inferred:
```json
{ "recipientId": 9 }
```

---

## Admin — `/api/admin`

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| GET | `/api/admin/stats` | admin (`requireAuth` + `requireRole('admin')`) | Dashboard stats: patient/doctor counts, appointment completion rate, top specializations. | Implemented |

### GET `/api/admin/audit?limit=&offset=&userId=`

Admin only. Newest-first audit entries `{ id, user_id, action, resource_type, resource_id, ip, created_at }`.

### GET `/api/admin/stats`
Headers: `Authorization: Bearer <token>` (role must be `admin`)
Response `200` (inferred overall envelope; `popularSpecializations` field name confirmed by
client evidence `stats.popularSpecializations.map(...)` in `AdminDashboard.jsx`; other field
names inferred from the confirmed aggregate query):
```json
{
  "patientCount": 0,
  "doctorCount": 0,
  "totalAppointments": 0,
  "completedAppointments": 0,
  "completionRate": 0.0,
  "popularSpecializations": [
    { "specialization": "string", "count": 0 }
  ]
}
```
Confirmed SQL evidence: `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status =
'completed')::int AS completed FROM appointments`. **Known gap (client side):**
`AdminDashboard.jsx` destructures `stats.popularSpecializations.map(...)` with no guard for
that field being `undefined`/`null`, and the fetch itself has no `.catch` — a failed request
leaves the page stuck on "Loading..." with no error message.

> Note: this endpoint's `requireRole('admin')` gate is now a meaningful access boundary —
> `POST /api/auth/register` no longer permits self-registering with `role: "admin"` (see the
> register endpoint note above). The remaining gap is that admin accounts still have no
> dedicated provisioning path other than a direct database change.

---

## ai-service (FastAPI / Ollama) — `http://localhost:8000`

No `/api` prefix. **Auth fixed 2026-08-17** (later same day as the Ollama migration below):
`/assistant/query` and `/summarize` now require `Authorization: Bearer <AI_SERVICE_TOKEN>`,
checked by `ai-service/auth.py`. `/health` remains open (no auth) for liveness checks. Before
this fix, any client that could reach port 8000 directly could call these routes without going
through the Express server at all — that gap is now closed; see the `Known gaps` note under
`/summarize` for what's still open.

> **CHANGED (2026-08-17, AI backend migration):** the ai-service no longer calls the paid
> Anthropic Claude API. `ai-service/claude_client.py` and the `anthropic` pip package have been
> removed entirely; both endpoints below now call a **locally-hosted Ollama server** through a
> new `ai-service/ollama_client.py` — a thin `httpx`-based client (no new SDK dependency, since
> `httpx` was already a dependency) that POSTs to Ollama's `/api/chat` endpoint with
> `format: "json"` to constrain the model's output to valid JSON. The `ANTHROPIC_API_KEY` env
> var no longer exists; it's replaced by `OLLAMA_BASE_URL` (default `http://localhost:11434`)
> and `OLLAMA_MODEL` (default `llama3.2-vision`). `llama3.2-vision` was chosen specifically
> because it's vision-capable, so one model serves both endpoints (text-only filter parsing and
> image/PDF summarization) — preserving the multimodal capability the Claude models provided.
> The documented request/response JSON shapes for both endpoints below are **unchanged** by
> this migration. See each endpoint's section for implementation detail and open gaps. This is
> the Claude-half of ADR-007 ("replace Cloudinary and the paid Claude API with free/
> open-source alternatives"); the Cloudinary half is **not** part of this change and remains
> undone.

| Method | Path | Auth | Description | Status |
|---|---|---|---|---|
| GET | `/health` | none | Static liveness check. | Implemented |
| POST | `/assistant/query` | `Bearer <AI_SERVICE_TOKEN>` | Convert a natural-language doctor search into structured filters via a local Ollama model. | Partial — see note |
| POST | `/summarize` | `Bearer <AI_SERVICE_TOKEN>` | Fetch a document by URL (Cloudinary-hosted only), send it to a local Ollama model, return a structured plain-language summary. | Partial — see note |

### POST `/assistant/query`
Request body — confirmed:
```json
{ "message": "string" }
```
Response `200` — confirmed:
```json
{
  "filters": {
    "specialization": "string or null",
    "location": "string or null",
    "maxFee": "number or null",
    "minExperience": "number or null",
    "language": "string or null",
    "availableDay": "number or null"
  }
}
```
**CHANGED (Ollama migration):** the model call now goes through `ai-service/ollama_client.py`'s
`chat_json()` helper — a thin `httpx` POST to the local Ollama server's `/api/chat` endpoint
with `format: "json"` (constraining the model to emit valid JSON), sending `FILTER_PROMPT`
(the prompt text itself is **unchanged** by this migration) formatted with `payload.message` as
the message content. Model/endpoint are configured via env vars `OLLAMA_BASE_URL` (default
`http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.2-vision`) — see the ai-service
section intro above; `ANTHROPIC_API_KEY` no longer exists. The reply is parsed via
`parse_json_response` (strips markdown code fences, then `json.loads`), which now lives in a
new `ai-service/util.py` — deduplicated out of `assistant.py`/`summarizer.py`, where it was
previously duplicated.
Response `502` if the model's reply is not valid JSON (confirmed), **or** if Ollama is
unreachable (`httpx.ConnectError`) or returns an HTTP error status (`httpx.HTTPStatusError`).
Response `504` if the model call times out (`httpx.TimeoutException`).
**FIXED (was a known gap):** exception handling around the model call is now broadened to
explicitly catch `httpx.ConnectError`, `httpx.HTTPStatusError`, and `httpx.TimeoutException`,
in addition to JSON-parse errors. Previously — under the Anthropic SDK — only
`json.JSONDecodeError`/`IndexError`/`AttributeError` were caught, and SDK/network errors
surfaced as raw, unhandled `500`s.
**Known gaps (still open, unaffected by this migration):** no input validation on `message`.
The user's raw text is still interpolated into the prompt with no sanitization
(prompt-injection surface) — `FILTER_PROMPT` itself did not change. No output schema
validation on the returned `filters` object before it would be used to build search filters.
**Verification status:** code-verified — `python -m py_compile` passes on all ai-service files,
a clean `pip install -r requirements.txt` succeeds on a fresh Python 3.14 venv, and the route is
confirmed registered via the app's OpenAPI schema. **Not yet runtime-verified against a live
Ollama server** — Ollama itself is not installed in this environment, so real-world JSON-mode
reliability and filter-parsing quality of `llama3.2-vision` are unconfirmed.

### POST `/summarize`
Request body — confirmed:
```json
{ "fileUrl": "string", "fileType": "string" }
```
Response `200` — field names confirmed from route description
(`documentType, keyInfo, abnormalValues, followUp, disclaimer`); envelope wrapping is inferred
(verify against controller — whether these fields are top-level or nested under a `summary`
key):
```json
{
  "documentType": "string",
  "keyInfo": "string or object (inferred, verify against controller)",
  "abnormalValues": "string or array (inferred, verify against controller)",
  "followUp": "string (inferred, verify against controller)",
  "disclaimer": "string"
}
```
Confirmed flow: `fetch_file()` first validates `payload.fileUrl`'s hostname against
`ALLOWED_FILE_HOSTS = {"res.cloudinary.com"}` (the only host documents are ever uploaded to —
see `server/src/config/cloudinary.js`), rejecting with `400` before any network request is made
if the host doesn't match. It then streams the fetch via `httpx.AsyncClient.stream()`, raising
an `HTTPException(502)` if `response.status_code != 200`, and raising `HTTPException(413)` if
the streamed body exceeds `MAX_FILE_BYTES = 10 * 1024 * 1024` (10MB) — the cap is enforced while
streaming, so an oversized file is never fully buffered into memory. **Both the host allowlist
and size cap were added 2026-08-17** (same day as, but after, the Ollama migration below).
**CHANGED (Ollama migration):** the fetched bytes are no longer sent to Claude's "document"/
"image" content blocks. A new `build_images()` function in `ai-service/summarizer.py` now
prepares one or more base64 images for a vision-model chat call:
- **Images** (JPG/PNG) are base64-encoded directly, same as before.
- **PDFs are now rasterized page-by-page into images using PyMuPDF** (package `pymupdf`,
  imported as `import pymupdf`) — because Ollama, unlike Claude, has no native PDF-document
  understanding, so the PDF has to be turned into images the vision model can read.
  Rasterization is **capped at `MAX_PDF_PAGES = 8` pages per document**, a deliberate,
  code-commented scoping decision.

All resulting page images are sent together as one multi-image chat message to the local
Ollama server's `/api/chat` endpoint (via the same `ollama_client.chat_json()` helper used by
`/assistant/query`) with `SUMMARY_PROMPT` (prompt text itself **unchanged**) and
`format: "json"`. The reply is parsed via `parse_json_response`, now in `ai-service/util.py`.

> **Caveat for API consumers:** if a PDF has more than 8 pages, pages beyond the 8th are
> **silently dropped** during rasterization — the returned summary gives no indication that the
> source document was truncated. Nothing in the response shape above signals truncation, so a
> caller cannot currently detect this from the API response alone.

Response `400` if `fileUrl`'s host isn't `res.cloudinary.com` (fixed 2026-08-17, checked before
any fetch is attempted). Response `413` if the fetched file exceeds 10MB (fixed 2026-08-17,
enforced while streaming). Response `502` on fetch failure, JSON-parse failure (both confirmed),
Ollama being unreachable (`httpx.ConnectError`), or Ollama returning an HTTP error
(`httpx.HTTPStatusError`). Response `504` if the model call times out
(`httpx.TimeoutException`).
**Known gaps:**
- No input validation on `fileType` beyond the implicit PDF-vs-image branch in `build_images()`.
- No output schema validation on the returned summary object before it's persisted or shown to the user.

**Fixed (2026-08-17):**
- ~~No domain allowlist or private-IP/internal-network blocking on the client-supplied `fileUrl` — SSRF risk.~~ `fetch_file()` now rejects any host other than `res.cloudinary.com` with 400, before attempting any fetch.
- ~~No file-size limit on the fetched document before encoding and sending to the model.~~ `fetch_file()` now streams and rejects (413) once 10MB is exceeded.
- ~~No authentication on this endpoint.~~ Now requires `Authorization: Bearer <AI_SERVICE_TOKEN>` — see the ai-service section intro above.
- exception handling around the model call is now broadened to
  catch `httpx.ConnectError`, `httpx.HTTPStatusError`, and `httpx.TimeoutException`, in addition
  to JSON-parse errors — previously (under the Anthropic SDK) only JSON-parse errors were
  caught and SDK/network errors surfaced as raw, unhandled `500`s.
- ~~A synchronous Anthropic SDK call (`.messages.create()`) blocked the event loop.~~ **FIXED** — the Anthropic SDK is gone entirely; `ollama_client.py`'s `chat_json()` uses `async with httpx.AsyncClient(...)` and `await client.post(...)`, a genuinely non-blocking async call. Confirmed by direct code inspection, not runtime profiling.
**Verification status:** code-verified — `python -m py_compile` passes on all ai-service files,
a clean `pip install -r requirements.txt` succeeds on a fresh Python 3.14 venv, the route is
confirmed registered via the app's OpenAPI schema, `build_images()` was tested standalone
against a real synthetic 2-page PDF (correctly rasterized into 2 base64 page images) and against
direct image passthrough, and the auth/host-allowlist logic was exercised via an in-process
`TestClient` (401 with no/wrong token including against an SSRF-like URL, 400 for a disallowed
host with valid auth, a clean 502 — not a crash — for an allowed-but-unreachable host).
**Not yet runtime-verified against a live Ollama server** — Ollama is
not installed in this environment, so the actual `/api/chat` response shape, JSON-mode
reliability, and document-summary quality of `llama3.2-vision` against real patient documents
are unconfirmed.

---

## Reference: enums (from `server/src/models/schema.sql`)

| Enum | Values |
|---|---|
| `user_role` | `patient`, `doctor`, `admin` |
| `appointment_status` | `scheduled`, `confirmed`, `completed`, `cancelled` |

## Global error handling (server)

Confirmed verbatim from `server/index.js`:
```js
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});
```
Every server route above that does not specify a custom error path funnels through this
handler. It returns the raw `err.message` to the client for any unhandled error — including raw
Postgres constraint/error text — which is a documented information-disclosure risk. Treat any
`500` response body's `error` field as **potentially exposing internal detail**, not a stable
API contract.

## Not covered by any endpoint above

**Appointment reminders** have no HTTP endpoint by design: they are created when appointments are booked or rescheduled and delivered by a background worker as the Socket.IO event `reminder:due` (`{ appointmentId, startsAt, with }`, sent to `user:<id>` rooms). Email/SMS delivery is not configured.
