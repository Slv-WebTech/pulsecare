# Feature Inventory

**Project:** AI-Powered Healthcare Appointment & Patient Portal
**Document scope:** Full inventory of the 10 canonical product features, their implementation status, and the pages/APIs/components each one touches.
**Last updated:** 2026-08-14
**Source of truth:** Canonical cross-service synthesis of the server, client, and ai-service codebases (repo age at time of writing: ~1 hour — a freshly generated scaffold, not a mature codebase).

> Context: the project's overall Feature Completeness score in the canonical assessment is **4.5 / 10** — roughly half of the features below have a real end-to-end happy path, while the rest are functionally wired but have concrete, named gaps (missing authorization checks, missing error handling, or no implementation at all). Statuses below use the synthesis's own enum verbatim: `IMPLEMENTED`, `PARTIALLY_IMPLEMENTED`, `PLANNED`.

## Status legend

| Status | Meaning as applied in this document |
|---|---|
| `IMPLEMENTED` | Real end-to-end logic exists (server SQL/handlers + client wiring where applicable) with no outstanding functional gap noted in the synthesis for that feature. |
| `PARTIALLY_IMPLEMENTED` | A genuine, working happy path exists, but the synthesis records at least one concrete functional, security, or UX gap in it. |
| `PLANNED` | No application code exists; at most a database table or schema stub is present. |

## Summary table

| # | Feature | Status | Related pages | Related APIs | Related components |
|---|---|---|---|---|---|
| 1 | Auth / Registration & Login | `PARTIALLY_IMPLEMENTED` | `/login`, `/register` | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | `Login.jsx`, `Register.jsx`, `AuthContext.jsx` |
| 2 | Doctor Search & Filters | `IMPLEMENTED` | `/patient` | `GET /api/doctors`, `GET /api/doctors/:id/availability`, `PUT /api/doctors/profile` | `DoctorSearchFilters.jsx`, `DoctorCard.jsx`, `PatientDashboard.jsx` |
| 3 | Appointment Booking | `PARTIALLY_IMPLEMENTED` | `/patient` | `POST /api/appointments` | `BookingModal.jsx` |
| 4 | Doctor Dashboard | `PARTIALLY_IMPLEMENTED` | `/doctor` | `GET /api/appointments`, `PATCH /api/appointments/:id/status`, `PATCH /api/appointments/:id/reschedule` | `DoctorDashboard.jsx`, `AppointmentCard.jsx` |
| 5 | Medical Document Upload | `IMPLEMENTED` | `/patient` | `POST /api/documents`, `GET /api/documents` | `DocumentUpload.jsx` |
| 6 | AI Document Summarization | `PARTIALLY_IMPLEMENTED` | `/patient` | `POST /api/documents/:id/summarize` (server) → `POST /summarize` (ai-service) | `DocumentCard.jsx` |
| 7 | Doctor-Patient Chat | `PARTIALLY_IMPLEMENTED` | not a dedicated route in the client route table (`ChatWindow.jsx` is a component; its hosting page is not identified in the discovery) | `GET /api/chat/:userId`, `PATCH /api/chat/:id/read`, `SOCKET message:send`, `SOCKET typing` | `ChatWindow.jsx`, `socket.js` (client service) |
| 8 | Appointment Reminders | `PLANNED` | none | none | none |
| 9 | Patient Dashboard | `PARTIALLY_IMPLEMENTED` | `/patient` | `GET /api/doctors`, `GET /api/appointments`, `GET /api/documents` | `PatientDashboard.jsx` |
| 10 | Admin Dashboard | `PARTIALLY_IMPLEMENTED` | `/admin` | `GET /api/admin/stats` | `AdminDashboard.jsx` |

---

## 1. Auth / Registration & Login

**Status:** `PARTIALLY_IMPLEMENTED`

**Purpose:** Let a person create an account as a patient or doctor and sign in to obtain an authenticated session for the rest of the app.

**User value:** Gives patients, doctors, and admins a persistent, role-scoped identity so the appointment, document, chat, and dashboard features can be tied to the right account.

**Dependencies:**
- `bcryptjs` for password hashing and `jsonwebtoken` for JWT issuance/verification (server)
- `JWT_SECRET` / `JWT_EXPIRES_IN` environment variables (`server/.env.example`)
- `users` table in `server/src/models/schema.sql` (with `user_role` enum: patient/doctor/admin)
- `axios` instance with Bearer-token interceptor (`client/src/services/api.js`)
- Browser `localStorage` for token persistence

**Related pages:** `/login`, `/register`

**Related APIs:**
- `POST /api/auth/register` — no auth required; `role` restricted to `patient`/`doctor`
- `POST /api/auth/login` — no auth required
- `GET /api/auth/me` — requires authentication (`requireAuth`)

**Related components:** `client/src/pages/Login.jsx`, `client/src/pages/Register.jsx`, `client/src/context/AuthContext.jsx`

**Evidence / gaps (from synthesis, updated 2026-08-14 same-day follow-up):** Server register/login/me are real — bcrypt hashing, JWT issue/verify, `req.user` restored via `requireAuth` — and the client Login/Register pages call them with real error handling. **Fixed:** `POST /api/auth/register` previously accepted a client-supplied `role` field including `"admin"` with zero restriction (a critical privilege-escalation issue); it now validates against `REGISTERABLE_ROLES = {patient, doctor}` in `auth.controller.js`. Remaining gap: the Login and Register submit buttons still have no submitting/disabled state, so a double-submit during the async call is possible — this is why the feature stays `PARTIALLY_IMPLEMENTED` rather than moving to `IMPLEMENTED`.

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

**Status:** `PARTIALLY_IMPLEMENTED`

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

**Evidence / gaps (from synthesis):** `bookAppointment` enforces a real database-level `UNIQUE(doctor_id, starts_at)` constraint that returns HTTP 409 on a genuine double-booking attempt — a race-safe guarantee by construction. The client's `BookingModal.jsx` has real API wiring with loading and error state. However, it hardcodes a 30-minute appointment duration client-side and performs no validation that the chosen date/time is in the future. Server-side, `bookAppointment` never checks that `startsAt < endsAt`.

---

## 4. Doctor Dashboard

**Status:** `PARTIALLY_IMPLEMENTED`

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

**Evidence / gaps (from synthesis, updated 2026-08-14 same-day follow-up):** `listMyAppointments` (role-aware) and the status/reschedule mutation handlers work functionally. **Fixed:** `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` previously only required a valid JWT via `requireAuth` — not ownership of the appointment — so any authenticated patient, doctor, or admin could mutate any appointment by ID (an IDOR flagged as a critical issue). Both handlers now call `getAppointmentAccess()`, returning 403 for non-owners. Remaining, unrelated gap: on the client, `DoctorDashboard.jsx` still fetches appointments via `.then()` with no `.catch()` and no loading indicator, so its appointment grid simply renders empty until data arrives (or fails silently) — this UI gap is why the feature stays `PARTIALLY_IMPLEMENTED`.

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

**Evidence / gaps (from synthesis, updated 2026-08-17 after the Claude→Ollama migration):** The full round trip is real and functional on the happy path, and its underlying model backend changed: the server's `summarizeDocument` still calls ai-service's `/summarize`, which fetches the file, but now builds the request for a **local Ollama server** instead of Claude — images (JPG/PNG) are base64-encoded directly as before, and PDFs are rasterized page-by-page via the new `build_images()` (PyMuPDF, capped at `MAX_PDF_PAGES = 8`), with all page images sent as one multi-image chat message to `ollama_client.chat_json()`, which returns a structured JSON summary that gets persisted to `documents.ai_summary` exactly as before. The prior `ai-service/claude_client.py` and the `anthropic` SDK dependency were removed entirely; the `SUMMARY_PROMPT` text itself is unchanged. **Fixed as a genuine part of this migration:** exception handling in `summarizer.py` (and `assistant.py`) was broadened — it previously only caught JSON-parse-shaped errors (`JSONDecodeError`/`IndexError`/`AttributeError`), leaving Anthropic SDK/httpx connection and timeout errors to surface as raw 500s; it now also catches `httpx.ConnectError` (Ollama not running → 502), `httpx.HTTPStatusError` (Ollama returned an error → 502), and `httpx.TimeoutException` (model taking too long → 504), closing the previously-documented "narrow exception handling" tech-debt item for this feature. **Second same-day fix (2026-08-17, N2 in `docs/PROJECT_PLAN.md`):** the gaps below were closed later the same day — ~~`/summarize` has no domain allowlist or private-IP blocking on the client-supplied `fileUrl` (SSRF risk)~~ now rejects any `fileUrl` outside `res.cloudinary.com`, checked before any fetch; ~~no file-size cap before the file is read into memory~~ now streams the fetch and rejects (413) past 10MB; ~~no authentication on `/summarize`~~ now requires `Authorization: Bearer <AI_SERVICE_TOKEN>`; ~~the server's `fetch()` call to `AI_SERVICE_URL` has no timeout~~ now has an explicit 30s timeout mapped to a clean 504. Still open and unrelated to either fix: `DocumentCard.handleSummarize` on the client still has no `catch` block around its `await api.post(...)`, so a failed summarize call is an unhandled promise rejection with no user-facing error message. Small gap introduced by the Ollama migration itself: PDFs longer than `MAX_PDF_PAGES = 8` are silently truncated to the first 8 pages, with nothing in the returned summary indicating the document was truncated. Verification status: code-verified (`py_compile` on every ai-service file passed; a clean `pip install -r requirements.txt` succeeded on Python 3.14, where it previously failed on the old dated pins; `build_images()` was confirmed against a real synthetic 2-page PDF; `parse_json_response` was confirmed against fenced and unfenced JSON; the auth/SSRF/size-cap logic was exercised via an in-process `TestClient` smoke test) but **not yet runtime-verified against a live Ollama server** — Ollama itself is not installed in this environment, so the actual `/api/chat` response shape, JSON-mode reliability, and image/PDF summary quality of `llama3.2-vision` remain unconfirmed pending the operator running this against their own Ollama instance. This is why the feature stays `PARTIALLY_IMPLEMENTED` rather than moving to `IMPLEMENTED` — every security gap is closed, but the client catch block is still missing and the model backend is still unverified at runtime.

---

## 7. Doctor-Patient Chat

**Status:** `PARTIALLY_IMPLEMENTED`

**Purpose:** Provide 1:1 real-time messaging between a patient and a doctor, plus a typing indicator, backed by persisted message history.

**User value:** Lets patients and doctors communicate directly (e.g., follow-up questions) without leaving the app, with a durable record of the conversation.

**Dependencies:**
- `messages` table in `server/src/models/schema.sql` (indexed on `appointment_id`)
- `socket.io` (server) / `socket.io-client` (client) for real-time transport
- JWT verification on the Socket.IO handshake (`auth.token`)
- `client/src/services/socket.js` — singleton Socket.IO client connect/get/disconnect helpers

**Related pages:** No dedicated route appears in the client's route table (`/`, `/login`, `/register`, `/patient`, `/doctor`, `/admin`, `*`); `ChatWindow.jsx` is a component and its specific hosting page is not identified in the discovery data.

**Related APIs:**
- `GET /api/chat/:userId` — any authenticated user; fetches the message thread between caller and `:userId`, correctly scoped to `req.user.id`
- `PATCH /api/chat/:id/read` — any authenticated user; marks a message read, correctly scoped to `recipient_id = req.user.id`
- `SOCKET message:send` — JWT-authenticated via socket handshake; persists a message and broadcasts `message:new`
- `SOCKET typing` — JWT-authenticated via socket handshake; broadcasts a typing indicator to the recipient's room

**Related components:** `client/src/components/Chat/ChatWindow.jsx`, `client/src/services/socket.js`

**Evidence / gaps (from synthesis):** REST history (`getConversation`) and `markRead` are real and correctly scoped to `req.user.id`. `socket.js`'s `message:send` handler persists and broadcasts messages but has **no try/catch** around its `await pool.query(...)` call and no payload validation — a DB failure there is not caught and can crash the process. On the client, `ChatWindow.jsx` loads history via `api.get(...).then(...)` with no `.catch()` and no loading state, and has no optimistic local append — a user's own sent messages only appear if the server echoes `message:new` back to the sender's own socket, which cannot be verified from the client alone.

---

## 8. Appointment Reminders

**Status:** `PLANNED`

**Purpose:** Intended to notify patients (and/or doctors) ahead of a scheduled appointment.

**User value:** Would reduce missed appointments by prompting patients before their scheduled time — but this value is not currently realized since no delivery mechanism exists.

**Dependencies:**
- `reminders` table only (`server/src/models/schema.sql`): `id`, `appointment_id` (FK to `appointments`, `ON DELETE CASCADE`), `send_at`, `sent` (boolean, default `false`)

**Related pages:** None — no route, page, or UI element for reminders exists.

**Related APIs:** None — no controller, route, or scheduler/cron endpoint exists.

**Related components:** None.

**Evidence / gaps (from synthesis):** Only a `reminders` table exists in `schema.sql` (`appointment_id`, `send_at`, `sent`). No controller, route, scheduler/cron job, or notification-sending code for reminders appears anywhere in the 21 server files reviewed in the discovery pass. This is called out as a critical issue in the canonical synthesis: one of the ten named product features has no implementation beyond a dangling database table. An open question in the synthesis asks who or what is meant to trigger reminders, since no scheduler or worker process exists in the codebase.

---

## 9. Patient Dashboard

**Status:** `PARTIALLY_IMPLEMENTED`

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

**Evidence / gaps (from synthesis):** `PatientDashboard.jsx` wires doctor search, the appointments list, and the documents list together via real API calls. However, all three fetches (`searchDoctors({})`, `api.get("/appointments")`, `api.get("/documents")`) run in `useEffect` using `.then()` with no `.catch()`, and there is no loading state anywhere on the page — API failures on any of the three produce a silently-empty section rather than a visible error.

---

## 10. Admin Dashboard

**Status:** `PARTIALLY_IMPLEMENTED`

**Purpose:** Give an admin a platform-level view of patient/doctor counts, appointment completion rate, and the most popular specializations.

**User value:** Lets an administrator monitor overall platform activity and health at a glance.

**Dependencies:**
- Aggregate SQL query in `getDashboardStats` (server) over `users` and `appointments` tables, using `COUNT(*) FILTER (WHERE status = 'completed')`
- `requireRole('admin')` middleware gating the entire admin route group

**Related pages:** `/admin` (role: admin, gated by `ProtectedRoute`)

**Related APIs:**
- `GET /api/admin/stats` — admin-only (`requireAuth` + `requireRole('admin')`)

**Related components:** `client/src/pages/AdminDashboard.jsx`

**Evidence / gaps (from synthesis):** `getDashboardStats` runs one real aggregate SQL query returning patient/doctor counts, appointment completion rate, and top specializations. The client's `AdminDashboard.jsx` fetches it via `api.get("/admin/stats").then(({ data }) => setStats(data))` with **no `.catch()`** — if the request fails, the page is stuck on "Loading..." forever with no error message. It also destructures `stats.popularSpecializations.map(...)` with no guard against that field being undefined or renamed in the backend response, which would throw at render time.

---

*This inventory reflects the state of the codebase at the time of writing (a ~1-hour-old scaffold). Statuses, evidence, and gaps above are taken directly from the canonical cross-service synthesis and should be re-verified as the codebase evolves.*
