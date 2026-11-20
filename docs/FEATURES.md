# Feature Inventory

**Project:** AI-Powered Healthcare Appointment & Patient Portal
**Document scope:** Full inventory of the 10 canonical product features, their implementation status, and the pages/APIs/components each one touches.
**Last updated:** 2026-08-22 (original discovery pass: 2026-08-14)
**Source of truth:** Canonical cross-service synthesis of the server, client, and ai-service codebases as of 2026-08-14, updated in place on 2026-08-22 with the outcome of a UI/UX redesign + remediation session — see `docs/DEV_CONTEXT.md` Section 4 and `docs/PROJECT_PLAN.md` (items `I1`–`I7`) for the full detail behind each status change below.

> Context: the project's overall Feature Completeness score in the canonical assessment was **4.5 / 10** as of 2026-08-14/17 — roughly half of the features below had a real end-to-end happy path, while the rest were functionally wired but had concrete, named gaps (missing authorization checks, missing error handling, or no implementation at all). **As of 2026-08-22, six of the seven `PARTIALLY_IMPLEMENTED` features have had every gap named at that time closed** and are promoted to `IMPLEMENTED` below (Auth, Appointment Booking, Doctor Dashboard, Doctor-Patient Chat, Patient Dashboard, Admin Dashboard); this score has not been formally re-run and should be read as stale relative to those promotions. Statuses below use the synthesis's own enum verbatim: `IMPLEMENTED`, `PARTIALLY_IMPLEMENTED`, `PLANNED`.

## Status legend

| Status | Meaning as applied in this document |
|---|---|
| `IMPLEMENTED` | Real end-to-end logic exists (server SQL/handlers + client wiring where applicable) with no outstanding functional gap noted in the synthesis for that feature. |
| `PARTIALLY_IMPLEMENTED` | A genuine, working happy path exists, but the synthesis records at least one concrete functional, security, or UX gap in it. |
| `PLANNED` | No application code exists; at most a database table or schema stub is present. |

## Summary table

| # | Feature | Status | Related pages | Related APIs | Related components |
|---|---|---|---|---|---|
| 1 | Auth / Registration & Login | `IMPLEMENTED` *(promoted 2026-08-22)* | `/login`, `/register` | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | `Login.jsx`, `Register.jsx`, `AuthContext.jsx` |
| 2 | Doctor Search & Filters | `IMPLEMENTED` | `/patient` | `GET /api/doctors`, `GET /api/doctors/:id/availability`, `PUT /api/doctors/profile` | `DoctorSearchFilters.jsx`, `DoctorCard.jsx`, `PatientDashboard.jsx` |
| 3 | Appointment Booking | `IMPLEMENTED` *(promoted 2026-08-22)* | `/patient` | `POST /api/appointments` | `BookingModal.jsx` |
| 4 | Doctor Dashboard | `IMPLEMENTED` *(promoted 2026-08-22)* | `/doctor` | `GET /api/appointments`, `PATCH /api/appointments/:id/status`, `PATCH /api/appointments/:id/reschedule` | `DoctorDashboard.jsx`, `AppointmentCard.jsx` |
| 5 | Medical Document Upload | `IMPLEMENTED` *(private storage, signed access, doctor sharing, 2026-11-20)* | `/patient`, `/doctor` | `POST /api/documents`, `GET /api/documents`, `GET /api/documents/:id/file`, `GET /api/documents/patient/:patientId` | `DocumentUpload.jsx`, `PatientDocumentsModal.jsx` |
| 6 | AI Document Summarization | `IMPLEMENTED` *(requires a running Ollama; tested with mocks)* | `/patient` | `POST /api/documents/:id/summarize` (server) → `POST /summarize` (ai-service) | `DocumentCard.jsx` |
| 7 | Doctor-Patient Chat | `IMPLEMENTED` *(promoted 2026-08-22 — also became reachable from the UI for the first time this session, see below)* | `/patient`, `/doctor` (opened via a "Message" action on `AppointmentCard`, rendered in a `Modal`) | `GET /api/chat/:userId`, `PATCH /api/chat/:id/read`, `SOCKET message:send`, `SOCKET typing`, `SOCKET message:error` (new) | `ChatWindow.jsx`, `socket.js` (client service), `AppointmentCard.jsx`, `PatientDashboard.jsx`, `DoctorDashboard.jsx` |
| 8 | Appointment Reminders | `IMPLEMENTED` *(in-app only, 2026-11-20; email/SMS not configured)* | `/patient`, `/doctor` (toast) | worker `server/src/jobs/reminders.js`, Socket.IO `reminder:due` | `App.jsx` |
| 9 | Patient Dashboard | `IMPLEMENTED` *(promoted 2026-08-22)* | `/patient` | `GET /api/doctors`, `GET /api/appointments`, `GET /api/documents` | `PatientDashboard.jsx` |
| 10 | Admin Dashboard | `IMPLEMENTED` *(promoted 2026-08-22)* | `/admin` | `GET /api/admin/stats` | `AdminDashboard.jsx` |

---

## 1. Auth / Registration & Login

**Status:** `IMPLEMENTED` *(promoted 2026-08-22 — was `PARTIALLY_IMPLEMENTED`)*

**Purpose:** Let a person create an account as a patient or doctor and sign in to obtain an authenticated session for the rest of the app.

**User value:** Gives patients, doctors, and admins a persistent, role-scoped identity so the appointment, document, chat, and dashboard features can be tied to the right account.

**Dependencies:**
- `bcryptjs` for password hashing and `jsonwebtoken` for JWT issuance/verification (server)
- `JWT_SECRET` / `JWT_EXPIRES_IN` environment variables (`server/.env.example`)
- `users` table in `server/src/models/schema.sql` (with `user_role` enum: patient/doctor/admin)
- `axios` instance with Bearer-token interceptor (`client/src/services/api.js`)
- An httpOnly refresh cookie (the access token is held in memory only)

**Related pages:** `/login`, `/register`

**Related APIs:**
- `POST /api/auth/register` — no auth required; `role` restricted to `patient`/`doctor`
- `POST /api/auth/login` — no auth required
- `GET /api/auth/me` — requires authentication (`requireAuth`)

**Related components:** `client/src/pages/Login.jsx`, `client/src/pages/Register.jsx`, `client/src/context/AuthContext.jsx`

**Evidence / gaps (updated 2026-08-22):** Server register/login/me are real — bcrypt hashing, JWT issue/verify, `req.user` restored via `requireAuth` — and the client Login/Register pages call them with real error handling. **Fixed (2026-08-14):** `POST /api/auth/register` previously accepted a client-supplied `role` field including `"admin"` with zero restriction (a critical privilege-escalation issue); it now validates against `REGISTERABLE_ROLES = {patient, doctor}` in `auth.controller.js`. **Fixed (2026-08-22):** the Login and Register submit buttons previously had no submitting/disabled state, allowing a double-submit; both pages were redesigned onto the new `Button` component (`client/src/components/ui/Button.jsx`), which shows a spinner and disables itself while a `submitting` state is true, tracked around each page's async `login()`/`register()` call. No further gap is recorded for this feature — promoted from `PARTIALLY_IMPLEMENTED`. (Admin account provisioning remains a separate, deliberately out-of-band question — see `docs/PROJECT_PLAN.md` **Blocked → B2** — and doesn't block this feature's own status.)

---

## 2. Doctor Search & Filters

**Status:** `IMPLEMENTED`

**Purpose:** Let a patient search the doctor directory and narrow results by specialization, location, fee, experience, and language.

**User value:** Helps patients find an appropriate doctor to book with, filtered on the criteria that matter to them, without wading through an unfiltered directory.

**Dependencies:**
- `doctor_profiles` and `doctor_availability` tables in `server/src/models/schema.sql`, including indexes on `specialization` and `location`
- Dynamic SQL filter construction in `searchDoctors` (server)

**Related pages:** `/patient` (doctor search is part of the Patient Dashboard)

**Related APIs:**
- `GET /api/doctors` — public, search/filter by specialization/location/fee/experience/language
- `GET /api/doctors/:id/availability` — public, lists a doctor's weekly availability
- `PUT /api/doctors/profile` — doctor-only, self-service profile upsert (`ON CONFLICT (user_id) DO UPDATE`)

**Related components:** `client/src/components/Doctor/DoctorSearchFilters.jsx`, `client/src/components/Doctor/DoctorCard.jsx`, `client/src/pages/PatientDashboard.jsx`

**Evidence / gaps (from synthesis):** `searchDoctors` builds dynamic SQL filters and is publicly reachable; `DoctorSearchFilters` strips empty filters before calling the search handler, and `DoctorCard` renders results; `PatientDashboard` wires the two together end-to-end. No functional gap is recorded for this feature in the synthesis, though it inherits the app-wide lack of pagination (unbounded result sets) and the client's general lack of loading/error handling on data fetches.

---

## 3. Appointment Booking

**Status:** `IMPLEMENTED` *(promoted 2026-08-22 — was `PARTIALLY_IMPLEMENTED`)*

**Purpose:** Let a patient book an appointment slot with a chosen doctor.

**User value:** Turns a doctor search result into a concrete, conflict-free appointment on the calendar for the patient.

**Dependencies:**
- `appointments` table with a `CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)` in `server/src/models/schema.sql`
- `doctor_profiles` table (appointments reference `doctor_id`)
- `requireRole('patient')` middleware gating the booking route

**Related pages:** `/patient`

**Related APIs:**
- `POST /api/appointments` — patient-only (`requireAuth` + `requireRole('patient')`)

**Related components:** `client/src/components/Appointment/BookingModal.jsx`

**Evidence / gaps (updated 2026-08-22):** `bookAppointment` enforces a real database-level `UNIQUE(doctor_id, starts_at)` constraint that returns HTTP 409 on a genuine double-booking attempt — a race-safe guarantee by construction. The client's `BookingModal.jsx` has real API wiring with loading and error state. **Fixed (2026-08-22):** it previously hardcoded a 30-minute appointment duration client-side and performed no validation that the chosen date/time was in the future, and server-side `bookAppointment` never checked that `startsAt < endsAt`. Now: `BookingModal.jsx` fetches `GET /doctors/:id/availability` and derives duration from the matching `day_of_week`'s `slot_minutes` (falling back to 30 minutes only if that day has no configured availability); the datetime picker has a `min` attribute preventing past selections; and both `bookAppointment` and `rescheduleAppointment` run a shared `validateAppointmentWindow()` server-side, rejecting invalid dates, `startsAt >= endsAt`, and any past `startsAt` with 400 before touching the database — verified live against all three cases. No further gap is recorded for this feature — promoted from `PARTIALLY_IMPLEMENTED`.

---

## 4. Doctor Dashboard

**Status:** `IMPLEMENTED` *(promoted 2026-08-22 — was `PARTIALLY_IMPLEMENTED`)*

**Purpose:** Give a doctor a view of their appointments (today's and upcoming) with the ability to change an appointment's status or reschedule it.

**User value:** Lets doctors manage their schedule — confirming, completing, cancelling, or rescheduling appointments — from a single dashboard.

**Dependencies:**
- `appointments` table (`server/src/models/schema.sql`)
- `requireAuth` middleware (role-aware listing logic in `listMyAppointments`)

**Related pages:** `/doctor` (role: doctor, gated by `ProtectedRoute`)

**Related APIs:**
- `GET /api/appointments` — any authenticated user; role-aware (patient vs. doctor view)
- `PATCH /api/appointments/:id/status` — owning patient, owning doctor, or admin
- `PATCH /api/appointments/:id/reschedule` — owning patient, owning doctor, or admin

**Related components:** `client/src/pages/DoctorDashboard.jsx`, `client/src/components/Appointment/AppointmentCard.jsx`

**Evidence / gaps (updated 2026-08-22):** `listMyAppointments` (role-aware) and the status/reschedule mutation handlers work functionally. **Fixed (2026-08-14):** `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` previously only required a valid JWT via `requireAuth` — not ownership of the appointment — so any authenticated patient, doctor, or admin could mutate any appointment by ID (an IDOR flagged as a critical issue). Both handlers now call `getAppointmentAccess()`, returning 403 for non-owners. **Fixed (2026-08-22):** `DoctorDashboard.jsx` previously fetched appointments via `.then()` with no `.catch()` and no loading indicator; a loading state (`SkeletonCard`) was added in the same session's UI redesign, and this pass added the missing `.catch()` (a visible `Alert` on failure) plus wrapped `handleStatusChange` in try/catch with a toast on failure — it previously had no failure path at all. The dashboard was also redesigned from two stacked grids into a single filterable list, and gained a "Message" action per appointment (see feature 7). No further gap is recorded for this feature — promoted from `PARTIALLY_IMPLEMENTED`.

---

## 5. Medical Document Upload

**Status:** `IMPLEMENTED`

**Purpose:** Let a patient upload a medical document (PDF or image) and have it stored and listed for later retrieval or AI summarization.

**User value:** Gives patients a place to keep their medical records attached to their account (and optionally an appointment), instead of managing paper or disconnected files.

**Dependencies:**
- Cloudinary integration (`server/src/config/cloudinary.js`) and `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` env vars
- `multer` with in-memory storage, a 10MB file-size limit, and a MIME-type allowlist (`application/pdf`, `image/jpeg`, `image/png`) in `server/src/middleware/upload.middleware.js`
- `documents` table in `server/src/models/schema.sql`

**Related pages:** `/patient`

**Related APIs:**
- `POST /api/documents` — any authenticated user, `upload.single("file")` via multer
- `GET /api/documents` — any authenticated user; lists the caller's own documents

**Related components:** `client/src/components/Document/DocumentUpload.jsx`

**Evidence / gaps (from synthesis):** `uploadDocument` stores files in Cloudinary and persists metadata via real parameterized SQL; multer enforces the 10MB limit and MIME allowlist server-side. The client's `DocumentUpload.jsx` has real API wiring plus both loading and error states — no functional gap is recorded for this feature specifically, though multer `fileFilter` errors on a bad MIME type throw a plain `Error` with no `.status`, so they surface as an HTTP 500 rather than 400 via the global error handler (a general app-wide risk, not specific to this feature's happy path).

---

## 6. AI Document Summarization

**Status:** `PARTIALLY_IMPLEMENTED`

**Purpose:** Generate an AI-produced plain-language summary of an uploaded medical document (document type, key info, abnormal values, follow-up notes, disclaimer) via the ai-service's local Ollama integration (migrated off the paid Claude API on 2026-08-17; see Evidence/gaps below).

**User value:** Helps patients understand the contents of a medical document without needing to parse dense clinical language themselves.

**Dependencies:**
- `server/src/controllers/document.controller.js` calling `AI_SERVICE_URL` (env var) via built-in `fetch` — unchanged by the 2026-08-17 migration
- `ai-service/summarizer.py` — fetches the file; images (JPG/PNG) are base64-encoded directly as before, and PDFs are now rasterized page-by-page into images via a new `build_images()` function (PyMuPDF, capped at `MAX_PDF_PAGES = 8`), since Ollama has no native PDF understanding the way Claude did; the `SUMMARY_PROMPT` text itself is unchanged
- `ai-service/ollama_client.py` — added 2026-08-17, replacing the deleted `ai-service/claude_client.py`; a thin `httpx`-based client (no new SDK dependency) that POSTs to a local Ollama server's `/api/chat` with `format: "json"` to constrain output to valid JSON; reads `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.2-vision`, a vision-capable model chosen so one model still covers both this feature and AI search-filter parsing)
- `ai-service/util.py` — added 2026-08-17; the `parse_json_response` helper (strips markdown fences, `json.loads`), deduplicated out of `assistant.py` and `summarizer.py`, where it was previously duplicated
- `pymupdf==1.28.2` (`ai-service/requirements.txt`) — added 2026-08-17 for PDF-to-image rasterization; the `anthropic` package and `ANTHROPIC_API_KEY` env var were removed in the same change
- `documents.ai_summary` JSONB column (`server/src/models/schema.sql`) where the result is persisted — unchanged
- Cloudinary-hosted file URL as the input to `/summarize` — unchanged; ADR-007's proposed Cloudinary replacement is a separate, still-undone half of that decision (this migration only implemented the Claude→Ollama half)

**Related pages:** `/patient`

**Related APIs:**
- `POST /api/documents/:id/summarize` (server) — any authenticated user, summarizes a document the caller owns
- `POST /summarize` (ai-service) — requires `Authorization: Bearer <AI_SERVICE_TOKEN>` (fixed 2026-08-17, was previously unauthenticated); accepts `{fileUrl, fileType}`; `fileUrl` must resolve to `res.cloudinary.com` (SSRF allowlist, fixed same day) and the fetch is capped at 10MB; request/response JSON shape is unchanged by the migration; returns a structured summary, or 400 for a disallowed host, 413 if the file is too large, 502 on fetch/parse failure or Ollama connection failure, or 504 if the model times out

**Related components:** `client/src/components/Document/DocumentCard.jsx`

**Update (2026-08-22):** `DocumentCard.jsx`'s `handleSummarize` previously had no `catch` block at all around its `await api.post(...)` — a failed summarize call was an unhandled promise rejection with no user-facing error. This is now fixed (caught, reported via a toast), landing as part of the same session's UI redesign. This closes one of the two gaps named below; the feature stays `PARTIALLY_IMPLEMENTED` because the other — live-Ollama runtime verification — is still open, and the 2026-08-22 `ai-service/tests/` suite, while real, is unit-level only (it tests `build_images()` and the SSRF guard directly, not a full mocked-or-live `/summarize` round trip).

**Evidence / gaps (from synthesis, updated 2026-08-17 after the Claude→Ollama migration):** The full round trip is real and functional on the happy path, and its underlying model backend changed: the server's `summarizeDocument` still calls ai-service's `/summarize`, which fetches the file, but now builds the request for a **local Ollama server** instead of Claude — images (JPG/PNG) are base64-encoded directly as before, and PDFs are rasterized page-by-page via the new `build_images()` (PyMuPDF, capped at `MAX_PDF_PAGES = 8`), with all page images sent as one multi-image chat message to `ollama_client.chat_json()`, which returns a structured JSON summary that gets persisted to `documents.ai_summary` exactly as before. The prior `ai-service/claude_client.py` and the `anthropic` SDK dependency were removed entirely; the `SUMMARY_PROMPT` text itself is unchanged. **Fixed as a genuine part of this migration:** exception handling in `summarizer.py` (and `assistant.py`) was broadened — it previously only caught JSON-parse-shaped errors (`JSONDecodeError`/`IndexError`/`AttributeError`), leaving Anthropic SDK/httpx connection and timeout errors to surface as raw 500s; it now also catches `httpx.ConnectError` (Ollama not running → 502), `httpx.HTTPStatusError` (Ollama returned an error → 502), and `httpx.TimeoutException` (model taking too long → 504), closing the previously-documented "narrow exception handling" tech-debt item for this feature. **Second same-day fix (2026-08-17, N2 in `docs/PROJECT_PLAN.md`):** the gaps below were closed later the same day — ~~`/summarize` has no domain allowlist or private-IP blocking on the client-supplied `fileUrl` (SSRF risk)~~ now rejects any `fileUrl` outside `res.cloudinary.com`, checked before any fetch; ~~no file-size cap before the file is read into memory~~ now streams the fetch and rejects (413) past 10MB; ~~no authentication on `/summarize`~~ now requires `Authorization: Bearer <AI_SERVICE_TOKEN>`; ~~the server's `fetch()` call to `AI_SERVICE_URL` has no timeout~~ now has an explicit 30s timeout mapped to a clean 504. Still open and unrelated to either fix: `DocumentCard.handleSummarize` on the client still has no `catch` block around its `await api.post(...)`, so a failed summarize call is an unhandled promise rejection with no user-facing error message. Small gap introduced by the Ollama migration itself: PDFs longer than `MAX_PDF_PAGES = 8` are silently truncated to the first 8 pages, with nothing in the returned summary indicating the document was truncated. Verification status: code-verified (`py_compile` on every ai-service file passed; a clean `pip install -r requirements.txt` succeeded on Python 3.14, where it previously failed on the old dated pins; `build_images()` was confirmed against a real synthetic 2-page PDF; `parse_json_response` was confirmed against fenced and unfenced JSON; the auth/SSRF/size-cap logic was exercised via an in-process `TestClient` smoke test) but **not yet runtime-verified against a live Ollama server** — Ollama itself is not installed in this environment, so the actual `/api/chat` response shape, JSON-mode reliability, and image/PDF summary quality of `llama3.2-vision` remain unconfirmed pending the operator running this against their own Ollama instance. This is why the feature stays `PARTIALLY_IMPLEMENTED` rather than moving to `IMPLEMENTED` — every security gap is closed, but the client catch block is still missing and the model backend is still unverified at runtime.

---

## 7. Doctor-Patient Chat

**Status:** `IMPLEMENTED` *(promoted 2026-08-22 — was `PARTIALLY_IMPLEMENTED`; also became reachable from the UI for the first time this session — see below)*

**Purpose:** Provide 1:1 real-time messaging between a patient and a doctor, plus a typing indicator, backed by persisted message history.

**User value:** Lets patients and doctors communicate directly (e.g., follow-up questions) without leaving the app, with a durable record of the conversation.

**Dependencies:**
- `messages` table in `server/src/models/schema.sql` (indexed on `appointment_id`)
- `socket.io` (server) / `socket.io-client` (client) for real-time transport
- JWT verification on the Socket.IO handshake (`auth.token`)
- `client/src/services/socket.js` — singleton Socket.IO client connect/get/disconnect helpers

**Related pages:** As of 2026-08-22, `/patient` and `/doctor` — `ChatWindow.jsx` opens in a `Modal` from a "Message" action on `AppointmentCard`. Before that, no dedicated route or entry point existed anywhere in the client — see the Update note below for why.

**Related APIs:**
- `GET /api/chat/:userId` — any authenticated user; fetches the message thread between caller and `:userId`, correctly scoped to `req.user.id`
- `PATCH /api/chat/:id/read` — any authenticated user; marks a message read, correctly scoped to `recipient_id = req.user.id`
- `SOCKET message:send` — JWT-authenticated via socket handshake; validates the payload (2026-08-22), persists a message, and broadcasts `message:new` to both the recipient's room and the sender's own room
- `SOCKET typing` — JWT-authenticated via socket handshake; broadcasts a typing indicator to the recipient's room
- `SOCKET message:error` — **new, 2026-08-22**; emitted back to the sender if `message:send` fails validation or the DB write fails

**Related components:** `client/src/components/Chat/ChatWindow.jsx`, `client/src/services/socket.js`, `client/src/components/Appointment/AppointmentCard.jsx`, `client/src/pages/PatientDashboard.jsx`, `client/src/pages/DoctorDashboard.jsx`

**Update (2026-08-22) — closed a real functional gap, not just a styling one:** `ChatWindow.jsx` was fully built but **unreachable from any page** — no route or button anywhere in the client rendered it. The root cause: `listMyAppointments` (`server/src/controllers/appointment.controller.js`) returned `dp.specialization` for the patient's view of an appointment but never the doctor's `users.id` (only `doctor_profiles.id` was exposed), so the client had no valid peer id to address a message to. Fixed with one additive join — the query now also returns `dp.user_id AS doctor_user_id` and `du.name AS doctor_name`. `AppointmentCard.jsx` gained an optional `onMessage` prop (a "Message" button); both `PatientDashboard` and `DoctorDashboard` now open `ChatWindow` in a `Modal` from it, using `appointment.doctor_user_id`/`doctor_name` (patient view) or `appointment.patient_id`/`patient_name` (doctor view, already available beforehand). The Socket.IO layer and REST endpoints needed no changes for this — they were already fully built.

**Evidence / gaps (updated 2026-08-22):** REST history (`getConversation`) and `markRead` are real and correctly scoped to `req.user.id`. **Fixed:** `socket.js`'s `message:send` handler previously had no try/catch around its `await pool.query(...)` call and no payload validation — a DB failure there was uncaught and could crash the process. It's now wrapped in try/catch, validates `recipientId` and a `body`/`fileUrl` first, and emits `message:error` back to the sender on either failure path. **Fixed:** `ChatWindow.jsx` previously loaded history via `.then(...)` with no `.catch()` and no loading state; both are now present, plus a `message:error` listener surfaced via a toast. **Investigated and resolved, not a bug:** this document previously flagged that a user's own sent messages "only appear if the server echoes `message:new` back to the sender's own socket, which cannot be verified from the client alone" — reading `socket.js` directly confirms the server *does* emit to both the recipient's room and the sender's own room, so this was already working; no optimistic-append code was added on top of it. No further gap is recorded for this feature — promoted from `PARTIALLY_IMPLEMENTED`.

---

## 8. Appointment Reminders

**Status:** `IMPLEMENTED` (in-app delivery only)

**What exists:** a reminder row is created when an appointment is booked and updated when it is rescheduled (`send_at` = 24 h before the visit, or now if sooner). A worker (`server/src/jobs/reminders.js`, every 60 s, `FOR UPDATE SKIP LOCKED`) delivers due reminders once, skipping cancelled or past appointments, by emitting Socket.IO `reminder:due` to the patient's and doctor's rooms. The client shows it as a toast.

**Not done (needs a product/vendor decision):** email and SMS delivery. `deliver()` in the worker is the single place to plug a provider in.

**Evidence:** live integration test "reminders: created on booking, delivered once, skipped when cancelled"; verified in Chrome with a real socket connection.

---

## 9. Patient Dashboard

**Status:** `IMPLEMENTED` *(promoted 2026-08-22 — was `PARTIALLY_IMPLEMENTED`)*

**Purpose:** Serve as the patient's main hub, combining doctor search/booking, the patient's own appointments, and their uploaded documents in one page.

**User value:** Gives patients a single place to find a doctor, book an appointment, and manage their medical documents, instead of navigating disparate screens.

**Dependencies:**
- Composes the Doctor Search & Filters, Appointment Booking, and Medical Document Upload features (see their respective dependency lists above)
- `GET /api/doctors`, `GET /api/appointments`, `GET /api/documents` (server)

**Related pages:** `/patient` (role: patient, gated by `ProtectedRoute`)

**Related APIs:**
- `GET /api/doctors` (via `searchDoctors({})` on load)
- `GET /api/appointments`
- `GET /api/documents`

**Related components:** `client/src/pages/PatientDashboard.jsx` (composing the Doctor/Appointment/Document components listed under features 2, 3, 5, and 6)

**Evidence / gaps (updated 2026-08-22):** `PatientDashboard.jsx` wires doctor search, the appointments list, and the documents list together via real API calls, now organized into tabs (Find a doctor / My appointments / Documents) rather than one long stacked page. **Fixed (2026-08-22):** all three fetches (`searchDoctors({})`, `api.get("/appointments")`, `api.get("/documents")`) previously ran with `.then()` and no `.catch()`, with no loading state anywhere — a loading state (`SkeletonCard`) was added as part of the same session's UI redesign, and this pass added the missing `.catch()`/try-catch on all three, each with its own visible error (`Alert`). No further gap is recorded for this feature — promoted from `PARTIALLY_IMPLEMENTED`.

---

## 10. Admin Dashboard

**Status:** `IMPLEMENTED` *(promoted 2026-08-22 — was `PARTIALLY_IMPLEMENTED`)*

**Purpose:** Give an admin a platform-level view of patient/doctor counts, appointment completion rate, and the most popular specializations.

**User value:** Lets an administrator monitor overall platform activity and health at a glance.

**Dependencies:**
- Aggregate SQL query in `getDashboardStats` (server) over `users` and `appointments` tables, using `COUNT(*) FILTER (WHERE status = 'completed')`
- `requireRole('admin')` middleware gating the entire admin route group

**Related pages:** `/admin` (role: admin, gated by `ProtectedRoute`)

**Related APIs:**
- `GET /api/admin/stats` — admin-only (`requireAuth` + `requireRole('admin')`)

**Related components:** `client/src/pages/AdminDashboard.jsx`

**Evidence / gaps (updated 2026-08-22):** `getDashboardStats` runs one real aggregate SQL query returning patient/doctor counts, appointment completion rate, and top specializations. **Fixed (2026-08-22):** the client's `AdminDashboard.jsx` previously fetched via `.then()` with no `.catch()` — a failed request left the page stuck on a loading state forever with no error message — and destructured `stats.popularSpecializations.map(...)` with no guard against that field being undefined. Both fixed: a `.catch()` now renders a visible `Alert` on failure, and the field is read via `stats?.popularSpecializations ?? []`. No further gap is recorded for this feature — promoted from `PARTIALLY_IMPLEMENTED`.

---

*This inventory originally reflected the state of the codebase as a ~1-hour-old scaffold (2026-08-14). Statuses, evidence, and gaps were updated in place on 2026-08-22 after a UI/UX redesign + remediation session promoted six of seven `PARTIALLY_IMPLEMENTED` features to `IMPLEMENTED` — see each feature's own "Evidence / gaps" paragraph above for exactly what changed and how it was verified, and `docs/DEV_CONTEXT.md` Section 4 / `docs/PROJECT_PLAN.md` for the fuller session writeup. Should still be re-verified as the codebase continues to evolve.*
