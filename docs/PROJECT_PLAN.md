# Project Plan & Roadmap

**Project:** AI-Powered Healthcare Appointment & Patient Portal
**Doc status:** Living roadmap, generated from a full-codebase discovery pass
**As of:** 2026-08-14 (original discovery pass); **last updated 2026-08-22** — see the update note directly below
**Repo state:** Was a freshly generated scaffold with no git history as of 2026-08-14; as of 2026-08-22 the repo is a real git repository, pushed to `https://github.com/Slv-WebTech/pulsecare`
**Reference:** Overall assessment score 4.1/10 across 15 categories, **as of 2026-08-14/17** (Documentation scored provisionally at 9/10 pending this doc suite landing — see the audit/scorecard doc for full category detail; this file covers roadmap only). This score has not been re-run since the 2026-08-22 session below — treat the item-level strikethroughs in this document as the current source of truth, not this number.

> **Update (2026-08-22):** A UI/UX redesign session (design system, component library, and — critically — making doctor-patient chat reachable from the UI for the first time) was followed by a remediation pass that closed nearly every named gap in **In Progress → I1–I7** and made real headway on **Next → N3–N4**. Every affected item below is annotated in place with a strikethrough and a **FIXED (2026-08-22)** / **Resolved (2026-08-22)** note rather than moved between sections, to preserve this document's existing `I`/`N`/`L` cross-references from other files in `docs/`. See `docs/DEV_CONTEXT.md` Section 4 for the full session writeup and verification detail, and the **Summary counts** table at the bottom of this file for the net effect.

This document translates the current state of the codebase into a working plan. It does **not** invent features, metrics, or history beyond what the discovery pass and canonical synthesis established. Every item below is traceable to either a fully-implemented feature, a partially-implemented feature with named gaps, or one of the synthesis's explicit next-step recommendations.

## How to read this roadmap

- **Completed** — Scaffolding/wiring that is genuinely done and evidenced in code. Several of these entries are *pieces* of a larger feature that is itself still partial; each entry says so explicitly. Only two whole features in the current synthesis (Doctor Search & Filters, Medical Document Upload) are rated fully `IMPLEMENTED`.
- **In Progress** — Features rated `PARTIALLY_IMPLEMENTED`: real, working code paths with named, concrete gaps (missing authorization checks, missing error handling, missing client-side states).
- **Next** — Near-term remediation work, drawn from the synthesis's recommended next steps, prioritized by the two confirmed authorization vulnerabilities and the unauthenticated AI service.
- **Later** — Larger-scope or lower-urgency work from the same recommendation set, including the one fully unbuilt product feature (Appointment Reminders).
- **Blocked** — Work that cannot be scoped or started until an explicit product/technical decision is made; each entry names the open question blocking it and which Next/Later item it gates.

**Priority legend:** `P0` critical (security or data-integrity, or a hard prerequisite) · `P1` high (core gap affecting reliability/authorization) · `P2` medium (hardening, scale, quality-of-life) · `P3` low (polish).

---

## Completed

Eleven pieces of real, working scaffolding are in place. Where the parent feature is still partial, that is called out explicitly and cross-referenced into **In Progress**.

### C1. Auth core mechanics — registration, login, session lookup
- **Objective:** Create accounts and authenticate users with hashed passwords and stateless JWTs.
- **Priority:** P0 (foundational — delivered)
- **Dependencies:** `users` table, `JWT_SECRET` env var
- **Implementation considerations:** `server/src/controllers/auth.controller.js` hashes passwords with bcrypt on register and verifies them on login; `requireAuth` middleware verifies the JWT and populates `req.user`; `GET /api/auth/me` returns the caller's own row.
- **Acceptance criteria (met):** Register produces a bcrypt-hashed user row; login with correct credentials returns a valid JWT; a valid JWT resolves to the correct user via `/me`.
- **Status:** Completed (mechanics only). The `Auth / Registration & Login` feature overall is `PARTIALLY_IMPLEMENTED` — see **In Progress → I1**.

### C2. Doctor Search & Filters
- **Objective:** Let patients discover doctors by specialization, location, fee, experience, and language.
- **Priority:** P0 (foundational — delivered)
- **Dependencies:** `doctor_profiles` table with `specialization`/`location` indexes
- **Implementation considerations:** `searchDoctors` builds dynamic SQL filters server-side (public route); `DoctorSearchFilters` strips empty filter fields before calling the API; `DoctorCard` renders results; wired end-to-end through `PatientDashboard`.
- **Acceptance criteria (met):** Any combination of filters returns matching doctors; omitted filters are ignored rather than excluding results.
- **Status:** Completed — one of only **two** features rated fully `IMPLEMENTED` in the current synthesis. Still unpaginated (unbounded result set); tracked in **Later → L2**.

### C3. Doctor profile self-service upsert
- **Objective:** Let an authenticated doctor create or update their own profile in a single call.
- **Priority:** P1 (delivered)
- **Dependencies:** `doctor` role claim, `requireRole('doctor')` middleware
- **Implementation considerations:** `PUT /api/doctors/profile` uses `INSERT ... ON CONFLICT (user_id) DO UPDATE ... RETURNING *`.
- **Acceptance criteria (met):** First call creates a profile, subsequent calls update the same row; a doctor cannot edit another doctor's profile (scoped to `req.user.id`).
- **Status:** Completed.

### C4. Appointment booking — double-booking prevention
- **Objective:** Guarantee no two patients can book the same doctor at the same start time, including under concurrent requests.
- **Priority:** P0 (data-integrity guarantee — delivered)
- **Dependencies:** `appointments` table `UNIQUE (doctor_id, starts_at)` constraint
- **Implementation considerations:** Enforced at the database level rather than an app-level check-then-insert, which would be race-prone; the controller catches the constraint violation and returns HTTP 409.
- **Acceptance criteria (met):** Two concurrent booking requests for the same doctor/time produce exactly one success and one 409.
- **Status:** Completed (this guarantee only). The `Appointment Booking` feature overall is `PARTIALLY_IMPLEMENTED` — see **In Progress → I2**.

### C5. Medical Document Upload
- **Objective:** Let patients upload medical documents (PDF/JPEG/PNG) for storage and later AI summarization.
- **Priority:** P0 (foundational — delivered)
- **Dependencies:** Cloudinary credentials, multer middleware
- **Implementation considerations:** `upload.middleware.js` enforces a 10MB size limit and a MIME allowlist (`application/pdf`, `image/jpeg`, `image/png`); `uploadDocument` stores the file in Cloudinary and persists metadata via parameterized SQL; `DocumentUpload.jsx` has real loading and error states.
- **Acceptance criteria (met):** A valid file uploads and appears in `GET /api/documents` for its owner; disallowed MIME types and oversized files are rejected.
- **Status:** Completed — the second of the two fully `IMPLEMENTED` features in the current synthesis.

### C6. AI document summarization — happy path
- **Objective:** Produce a structured, plain-language summary of an uploaded medical document via an LLM (originally Claude, now a local Ollama model — see the superseded note below).
- **Priority:** P1 (delivered)
- **Dependencies:** `ai-service` running, `OLLAMA_BASE_URL`/`OLLAMA_MODEL` set (formerly `ANTHROPIC_API_KEY` — see C11), `AI_SERVICE_URL` reachable from the server
- **Implementation considerations (superseded by C11 — kept for history, see the note below for current behavior):** `POST /api/documents/:id/summarize` calls `ai-service`'s `POST /summarize`, which fetches the file, base64-encodes it into a Claude document/image content block, and returns `{documentType, keyInfo, abnormalValues, followUp, disclaimer}`, persisted to `documents.ai_summary`.
- **Acceptance criteria (met):** A document the caller owns returns a structured summary and it is saved on the row.
- **Status:** Completed (happy path only). The `AI Document Summarization` feature overall is `PARTIALLY_IMPLEMENTED` — see **In Progress → I4**. **Superseded (2026-08-17):** the backend described above (Claude, `ANTHROPIC_API_KEY`) was migrated to a local Ollama server — see **Completed → C11**. The request/response contract (`POST /summarize`, the returned `{documentType, keyInfo, abnormalValues, followUp, disclaimer}` shape) and `SUMMARY_PROMPT` are unchanged; PDF handling changed from Claude's native PDF understanding to page-by-page rasterization via PyMuPDF (capped at 8 pages per document).

### C7. AI natural-language doctor-search-filter parsing
- **Objective:** Convert a free-text query into structured doctor-search filters via an LLM (originally Claude, now a local Ollama model — see the superseded note below).
- **Priority:** P2 (delivered)
- **Dependencies:** `ai-service`, `OLLAMA_BASE_URL`/`OLLAMA_MODEL` (formerly `ANTHROPIC_API_KEY` — see C11)
- **Implementation considerations (superseded by C11 — kept for history, see the note below for current behavior):** `POST /assistant/query` templates `FILTER_PROMPT`, calls Claude, and parses the reply into `{specialization, location, maxFee, minExperience, language, availableDay}`; returns 502 if the reply isn't valid JSON.
- **Acceptance criteria (met):** A natural-language query returns a valid filters object on the happy path.
- **Status:** Completed (happy path only). Error handling is narrow (JSON-parse failures only) — tracked in **Next → N2/N3**. **Superseded (2026-08-17):** the backend described above (Claude, `ANTHROPIC_API_KEY`) was migrated to a local Ollama server — see **Completed → C11**. `FILTER_PROMPT` and the returned filters shape are unchanged. `assistant.py`'s exception handling was also broadened as part of that migration (now also catches httpx connection/timeout/status errors, not just JSON-parse failures) — see **Completed → C11** and **In Progress → I4**.

### C8. Real-time chat — persistence, broadcast, typing, history
- **Objective:** Provide 1:1 doctor-patient messaging with live delivery and conversation history.
- **Priority:** P1 (delivered)
- **Dependencies:** Socket.IO JWT-authenticated handshake, `messages` table
- **Implementation considerations:** `message:send` persists to `messages` and broadcasts `message:new`; `typing` broadcasts to the recipient's room; REST `GET /api/chat/:userId` and `PATCH /api/chat/:id/read` are both correctly scoped to `req.user.id`.
- **Acceptance criteria (met):** Two authenticated users exchange messages, retrieve history via REST, and a message can be marked read only by its recipient.
- **Status:** Completed (this scaffolding only). The `Doctor-Patient Chat` feature overall is `PARTIALLY_IMPLEMENTED` — see **In Progress → I5**.

### C9. Admin dashboard stats aggregation
- **Objective:** Give admins a single view of platform health.
- **Priority:** P2 (delivered)
- **Dependencies:** `requireRole('admin')` middleware
- **Implementation considerations:** `getDashboardStats` runs one real aggregate SQL query — patient/doctor counts, completion rate via `FILTER (WHERE status = 'completed')`, and top specializations.
- **Acceptance criteria (met):** `GET /api/admin/stats` (admin-only) returns counts and a completion rate computed from live data.
- **Status:** Completed (server-side aggregation only). The `Admin Dashboard` feature overall is `PARTIALLY_IMPLEMENTED` — see **In Progress → I7**.

### C10. Role-based route protection
- **Objective:** Ensure patient/doctor/admin areas are reachable only by the correct role, on both server and client.
- **Priority:** P0 (foundational — delivered)
- **Dependencies:** `role` claim in the JWT, `users.role` enum
- **Implementation considerations:** Server: `requireAuth` + `requireRole(...)` middleware factory. Client: `ProtectedRoute` branches on loading/auth/role.
- **Acceptance criteria (met):** An unauthenticated request to a protected route is rejected/redirected; a wrong-role authenticated request is rejected/redirected.
- **Status:** Completed (mechanism works). Note: `ProtectedRoute` currently sends a wrong-role authenticated user to `/`, which unconditionally redirects to `/login` rather than the user's own dashboard — tracked in **Later → L2**.

### C11. Migrate ai-service from Claude API to local Ollama
- **Objective:** Remove the paid, hosted Claude API dependency from `ai-service` and replace it with a self-hosted, free local LLM (Ollama), resolving the AI-model half of the open-source-stack migration direction agreed in the prior session — see **Blocked → B4**.
- **Priority:** P1 (cost/privacy-motivated architecture change, not a bug fix)
- **Dependencies:** C6, C7 (the two features whose backend this replaces); supersedes `ai-service/claude_client.py` and the `anthropic` package
- **Implementation considerations:** `claude_client.py` and the `anthropic` pip dependency were removed entirely, along with the `ANTHROPIC_API_KEY` env var. A new `ollama_client.py` (thin httpx-based client — no new SDK dependency, httpx was already a dependency) POSTs to a local Ollama server's `/api/chat` with `format: "json"` to constrain output. Two new env vars: `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.2-vision`) — a vision-capable model chosen specifically so one model covers both `assistant.py`'s text-only filter parsing and `summarizer.py`'s image/PDF document summarization, preserving the multimodal capability Claude provided. A new `util.py` holds `parse_json_response` (markdown-fence stripping + `json.loads`), deduplicated out of `assistant.py`/`summarizer.py` — this exact duplication was a pre-existing `TECHNICAL_DEBT.md` item, fixed as a natural side effect of touching both files for this swap. Both files' exception handling was broadened to also catch `httpx.ConnectError` (→502), `httpx.HTTPStatusError` (→502), and `httpx.TimeoutException` (→504) — see **In Progress → I4**. `summarizer.py` gained a `build_images()` function: images pass through as before (base64), but PDFs are now rasterized page-by-page via PyMuPDF (`pymupdf==1.28.2`, `import pymupdf`) since Ollama has no native PDF understanding, capped at `MAX_PDF_PAGES = 8` per document (a deliberate, code-commented scoping decision — pages beyond 8 are silently dropped with no indication in the returned summary; worth a small new `TECHNICAL_DEBT.md` entry). The `FILTER_PROMPT` and `SUMMARY_PROMPT` text, both endpoint contracts (`POST /assistant/query`, `POST /summarize` — same request/response JSON shapes), `main.py`, `document.controller.js`, and the 3-service architecture split are all unchanged. `requirements.txt` also bumped several dated pins that were a separate pre-existing `TECHNICAL_DEBT.md` item (`fastapi` 0.111.0→0.141.1, `uvicorn[standard]` 0.30.1→0.52.3, `pydantic` 2.7.4→2.13.4, `python-dotenv` 1.0.1→1.2.3, `httpx` 0.27.0→0.28.1) — necessary, not cosmetic: the old `pydantic` pin has no prebuilt wheel for current Python and fails building from source, so the service was actually uninstallable on a current Python before this bump. Root `README.md`'s stack table and AI-service getting-started steps were updated to reference Ollama instead of `ANTHROPIC_API_KEY`.
- **Acceptance criteria (met):** `python -m py_compile` passes on every `ai-service` `.py` file; a clean `pip install -r requirements.txt` into a fresh venv on Python 3.14 succeeds (previously failed on the old pins); the FastAPI app imports successfully with all three routes (`/health`, `/assistant/query`, `/summarize`) registered per the OpenAPI schema; `build_images()` correctly rasterizes a real synthetic PDF into per-page base64 images and passes non-PDF images through unchanged; `parse_json_response` handles both fenced and unfenced JSON.
- **Status:** Completed and verified via compile/install/import/offline-unit checks — **not** verified end-to-end against a live Ollama server (Ollama is not installed in this dev sandbox); the user must confirm real runtime behavior (actual `/api/chat` response shape, JSON-mode reliability of `llama3.2-vision`, image/PDF summary quality) once run against their own local Ollama instance. Unrelated to and does not change: the ai-service's lack of authentication on any endpoint, or the `/summarize` SSRF gap — both still open, see **In Progress → I4** and **Next → N2**. The Cloudinary/storage half of the broader migration direction remains separately blocked — see **Blocked → B4**.
- **Related files:** `ai-service/ollama_client.py`, `ai-service/util.py`, `ai-service/assistant.py`, `ai-service/summarizer.py`, `ai-service/requirements.txt`, `ai-service/.env.example`, `README.md`

---

## In Progress

The seven features currently rated `PARTIALLY_IMPLEMENTED`. Each has a real, working code path and named, concrete gaps — these are not stubs, but they are not safe or complete either.

### I1. Auth / Registration & Login
- **Objective:** Registration and login that are both functionally correct *and* safe to expose publicly.
- **Priority:** P1 (privilege-escalation gap **fixed**; remaining gap is UX-only) — **all named gaps now closed, see Status.**
- **Dependencies:** C1
- **Implementation considerations:** ~~`POST /api/auth/register` accepts a client-supplied `role` field with `VALID_ROLES = {patient, doctor, admin}` and no restriction~~ — **fixed**: `register` now validates against `REGISTERABLE_ROLES = {patient, doctor}` in `auth.controller.js`. ~~`Login.jsx`/`Register.jsx` submit buttons still have no submitting/disabled state, allowing double-submit.~~ **FIXED (2026-08-22)** — both pages were redesigned onto the new `Button` component (`client/src/components/ui/Button.jsx`), which shows a spinner and disables itself while `loading` is true; both pages now track a `submitting` state around their async `login()`/`register()` calls.
- **Acceptance criteria (remaining):** ~~`role=admin` is rejected on public registration~~ — done. ~~submit buttons disable and relabel during the async call~~ — done (2026-08-22). Still open: admin accounts are provisioned through a separate out-of-band path (open question, see **Blocked → B2** — unrelated to this item's UI/security scope, not expected to block closing it).
- **Status:** **Effectively resolved (2026-08-22).** Both gaps named in this item — the registration privilege-escalation fix and the submit-button loading state — are now fixed. Kept under "In Progress" rather than moved to "Completed" only to preserve this doc's existing `I1` cross-references elsewhere in `docs/`; treat it as closed.
- **Related files:** `server/src/controllers/auth.controller.js`, `server/src/routes/auth.routes.js`, `server/src/middleware/auth.middleware.js`, `client/src/pages/Login.jsx`, `client/src/pages/Register.jsx`, `client/src/context/AuthContext.jsx`

### I2. Appointment Booking (client-side validation gaps)
- **Objective:** Booking flow that reflects real slot durations and prevents nonsensical bookings.
- **Priority:** P1 — **all named gaps closed 2026-08-22, see Status.**
- **Dependencies:** C4
- **Implementation considerations:** ~~`BookingModal.jsx` hardcodes appointment duration to 30 minutes client-side regardless of the doctor's actual `slot_minutes`, and performs no validation that the chosen datetime is in the future. Server-side, `bookAppointment` never checks `startsAt < endsAt`.~~ **FIXED (2026-08-22).** Client: `BookingModal.jsx` now fetches `GET /doctors/:id/availability` on open and derives duration from the matching `day_of_week`'s `slot_minutes` (falling back to 30 minutes only if that day has no configured availability or the fetch fails); the datetime picker already had a `min` attribute preventing past selections (added in the same UI-redesign session). Server: both `bookAppointment` and `rescheduleAppointment` now run a shared `validateAppointmentWindow()` — rejects invalid dates, `startsAt >= endsAt`, and any `startsAt` in the past, all with 400 before touching the database.
- **Acceptance criteria (remaining):** ~~Booking duration is derived from `doctor_availability.slot_minutes`~~ — done. ~~past-date/time selections are rejected client- and server-side~~ — done. ~~server validates `startsAt < endsAt`~~ — done. Nothing remaining against this item's original scope.
- **Status:** **Resolved (2026-08-22).** Verified live: a request with `endsAt` before `startsAt`, and a request with a past `startsAt`, both correctly return 400 before any DB call; a request with a valid future window correctly passes validation and proceeds to the DB layer. Kept under "In Progress" to preserve this doc's `I2` cross-references.
- **Related files:** `server/src/controllers/appointment.controller.js`, `server/src/models/schema.sql`, `client/src/components/Appointment/BookingModal.jsx`

### I3. Doctor Dashboard (appointment mutation authorization)
- **Objective:** Doctors manage only their own appointments; status/reschedule mutations are properly scoped.
- **Priority:** P2 (IDOR **fixed**; remaining gap is UI-only, unrelated to authorization) — **closed, see Status.**
- **Dependencies:** C1, C4
- **Implementation considerations:** ~~`PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` only require `requireAuth` — no ownership check~~ — **fixed**: both handlers now call `getAppointmentAccess()` in `appointment.controller.js`, returning 403 unless the caller is the appointment's patient, its doctor, or an admin. ~~`DoctorDashboard.jsx` fetches appointments with no `.catch` and no loading indicator.~~ **FIXED (2026-08-22)** — the 2026-08-22 UI redesign already added a loading state (`SkeletonCard`); this session added the missing `.catch()` (a visible `Alert` on fetch failure) and wrapped `handleStatusChange` in try/catch with a toast on failure, since a failed status-change call was previously an unhandled promise rejection.
- **Acceptance criteria (remaining):** ~~Status/reschedule mutations verify ownership~~ — done. ~~the dashboard shows a loading state and a visible error on fetch failure~~ — done (2026-08-22).
- **Status:** **Resolved (2026-08-22).** Kept under "In Progress" to preserve this doc's `I3` cross-references.
- **Related files:** `server/src/controllers/appointment.controller.js`, `server/src/routes/appointment.routes.js`, `client/src/pages/DoctorDashboard.jsx`, `client/src/components/Appointment/AppointmentCard.jsx`

### I4. AI Document Summarization (hardening)
- **Objective:** A summarization pipeline that fails safely and can't be used as an attack vector.
- **Priority:** P2 (SSRF, missing auth, and missing timeout are all **fixed**; remaining gap is client-side UX only)
- **Dependencies:** C6, C11, N2
- **Implementation considerations:** ~~`/summarize` fetches an arbitrary client-supplied `fileUrl` with no domain allowlist, and has no file-size cap before base64-encoding.~~ — **fixed, see Next → N2**: `fileUrl` must now resolve to `res.cloudinary.com` or the request is rejected (400) before any fetch, and the fetch itself is streamed with a 10MB cap (413 if exceeded). ~~Both `assistant.py` and `summarizer.py` only catch `json.JSONDecodeError`/`IndexError`/`AttributeError`~~ — **fixed as part of C11**: both files now also catch `httpx.ConnectError` (→502), `httpx.HTTPStatusError` (→502), and `httpx.TimeoutException` (→504); JSON-parse handling is deduplicated into `util.py`. ~~The server's `fetch()` to `AI_SERVICE_URL` has no timeout.~~ — **fixed, see N2**: now has an explicit 30s `AbortSignal.timeout`, mapped to a clean 504. All of the above is code-verified (compiles, a `TestClient`-based smoke test exercised the auth/SSRF paths end-to-end within the FastAPI app) but **not** yet tested against a live running Ollama server. Remaining, unrelated gap: on the client, `DocumentCard.handleSummarize` still has no `catch` block at all, so a failed request is an unhandled promise rejection with no user-facing error.
- **Acceptance criteria (remaining):** ~~`/summarize` only fetches from an allowlisted set of hosts~~ — done (N2). ~~fetched files are capped at a defined size~~ — done (N2). ~~SDK/network exceptions are caught and mapped to sensible status codes~~ — done (C11). ~~the server's outbound call to `ai-service` has an explicit timeout~~ — done (N2). ~~`DocumentCard` shows a visible error on failure~~ — **FIXED** (landed as part of the 2026-08-22 UI redesign — `handleSummarize` now has a `catch` block reporting failure via a toast). Still open: an automated test proving the SSRF/size-cap/exception-handling behavior against a *real* Ollama server (the 2026-08-22 `ai-service/tests/` suite unit-tests `build_images()` and the SSRF host guard directly and does lock those in, but doesn't exercise the full `/summarize` request/response cycle through a mocked or live Ollama `/api/chat` call — tracked in N4); the model itself remains unverified against a live Ollama instance.
- **Status:** In Progress — every security/reliability gap in this item's original scope (SSRF, unauthenticated access, missing file-size cap, narrow exception handling, missing timeout) is fixed as of **Next → N2** and **Completed → C11** (2026-08-17), and the client-side `DocumentCard` catch block is fixed as of the 2026-08-22 UI redesign. Remaining scope is test coverage against a real/mocked Ollama server and live-model verification, both tracked under **N4**.
- **Related files:** `server/src/controllers/document.controller.js`, `ai-service/summarizer.py`, `ai-service/ollama_client.py`, `ai-service/util.py`, `ai-service/auth.py`, `client/src/components/Document/DocumentCard.jsx`

### I5. Doctor-Patient Chat (realtime hardening)
- **Objective:** A chat path that can't crash the process and reliably shows a user their own sent messages.
- **Priority:** P1 (process-crash risk) — **closed, see Status.**
- **Dependencies:** C8
- **Implementation considerations:** ~~`socket.js`'s `message:send` handler `await`s `pool.query` with no try/catch, so a DB failure there is not caught anywhere and can crash the process; there is also no payload validation on the socket event.~~ **FIXED (2026-08-22)** — wrapped in try/catch, validates `recipientId` and a `body`/`fileUrl` before touching the DB, emits a new `message:error` event back to the sender on either failure path. ~~On the client, `ChatWindow.jsx` loads history with no `.catch`/loading state.~~ **FIXED (2026-08-22)** — both added, plus a listener for the new `message:error` event (surfaced via a toast). ~~has no optimistic local append — sent messages only appear if the server echoes `message:new` back to the sender's own socket, which is unverified behavior.~~ **Investigated and resolved (2026-08-22), not a bug** — reading `socket.js` directly confirms `message:new` is emitted to *both* the recipient's room and `` `user:${socket.user.id}` `` (the sender's own room), so the echo this item worried about not existing does, in fact, exist. Optimistic append was deliberately not added on top of an already-working path.
- **Acceptance criteria (remaining):** ~~`message:send` is wrapped in try/catch with a structured error event on failure and basic payload validation~~ — done. ~~`ChatWindow` shows a loading state on history fetch, handles fetch failure visibly~~ — done. ~~optimistically appends sent messages locally rather than depending entirely on server echo~~ — **not done, and no longer judged necessary**: the server echo this criterion was hedging against turned out to already be correct (see above).
- **Status:** **Resolved (2026-08-22).** This is also the session `ChatWindow.jsx` became reachable from the UI for the first time — see **Completed** section's new 2026-08-22 entry and `docs/DEV_CONTEXT.md` Section 4 for why it was previously dead code (a missing `doctor_user_id` in the appointments response) and how that was fixed. Kept under "In Progress" to preserve this doc's `I5` cross-references.
- **Related files:** `server/src/controllers/chat.controller.js`, `server/src/routes/chat.routes.js`, `server/src/socket/socket.js`, `client/src/components/Chat/ChatWindow.jsx`, `client/src/services/socket.js`, `client/src/components/Appointment/AppointmentCard.jsx`, `client/src/pages/PatientDashboard.jsx`, `client/src/pages/DoctorDashboard.jsx`

### I6. Patient Dashboard (fetch resilience)
- **Objective:** A patient hub that degrades visibly, not silently, when any of its data sources fail.
- **Priority:** P2 — **closed, see Status.**
- **Dependencies:** C2, C4, C5
- **Implementation considerations:** ~~`PatientDashboard.jsx` wires doctor search, the appointments list, and the documents list together via real API calls, but all three use `.then()` with no `.catch()`, and there is no loading state anywhere on the page.~~ **FIXED (2026-08-22).** The 2026-08-22 UI redesign already added per-section loading states (`SkeletonCard`, tracked separately from this fix); this session added the missing `.catch()`/try-catch on all three fetches, each with its own error state rendered via `Alert`.
- **Acceptance criteria (remaining):** ~~Each of the three sections has its own loading indicator and a visible error state on fetch failure, independent of the other two.~~ — done.
- **Status:** **Resolved (2026-08-22).** Kept under "In Progress" to preserve this doc's `I6` cross-references.
- **Related files:** `client/src/pages/PatientDashboard.jsx`

### I7. Admin Dashboard (fetch resilience)
- **Objective:** An admin stats view that surfaces failures instead of hanging.
- **Priority:** P2 — **closed, see Status.**
- **Dependencies:** C9
- **Implementation considerations:** ~~`AdminDashboard.jsx` fetches `/admin/stats` with no `.catch` — on failure the page is stuck on "Loading..." indefinitely with no error message. It also destructures `stats.popularSpecializations.map(...)` with no guard against that field being undefined/null.~~ **FIXED (2026-08-22)** — a `.catch()` now renders a visible `Alert` on failure instead of an infinite skeleton state, and `popularSpecializations` is now read via `stats?.popularSpecializations ?? []`.
- **Acceptance criteria (remaining):** ~~Fetch failure surfaces a visible error instead of an infinite loading state~~ — done. ~~`popularSpecializations` access is guarded (default to an empty array)~~ — done.
- **Status:** **Resolved (2026-08-22).** Kept under "In Progress" to preserve this doc's `I7` cross-references.
- **Related files:** `server/src/controllers/admin.controller.js`, `server/src/routes/admin.routes.js`, `client/src/pages/AdminDashboard.jsx`

---

## Next

Near-term remediation, in priority order. N1 closed the synthesis's two confirmed authorization **critical issues** the same day this plan was written; N2 closes the remaining critical issue (ai-service); N3 and N4 make the codebase safe to keep changing.

### N1. Close the two confirmed authorization gaps — ✅ DONE (2026-08-14, same-day follow-up)
- **Objective:** Eliminate the privilege-escalation and IDOR vulnerabilities identified in the discovery pass.
- **Priority:** P0 — critical
- **Dependencies:** I1, I3
- **Implementation considerations:** (a) Restrict `POST /api/auth/register`'s accepted `role` values to `patient`/`doctor` only; reject or silently coerce any other value. Admin accounts should be provisioned out-of-band rather than through the public endpoint (see **Blocked → B2** for the provisioning-workflow decision — still open). (b) Add ownership checks to `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` so only the appointment's own patient, own doctor, or an admin can mutate it; return 403 otherwise.
- **Acceptance criteria:** A public registration request with `role=admin` is rejected or downgraded; a non-owning authenticated user attempting to change another user's appointment status/reschedule receives a 403; existing legitimate flows (patient booking, doctor updating their own appointment) continue to work unchanged.
- **Status:** **Done.** `server/src/controllers/auth.controller.js` (`REGISTERABLE_ROLES`) and `server/src/controllers/appointment.controller.js` (`getAppointmentAccess()`) both updated; syntax-checked (`node --check`). Not yet covered by an automated integration test (see N4) — no test database is available in this environment to run one.

### N2. Secure the ai-service — ✅ DONE (2026-08-17, same-day follow-up)
- **Objective:** Remove the unauthenticated-service and SSRF exposure on the layer that processes patient medical documents.
- **Priority:** P0 — critical
- **Dependencies:** I4, C11
- **Implementation considerations:** Added `ai-service/auth.py` (`require_service_token`, a FastAPI dependency applied to both `assistant.py`'s and `summarizer.py`'s routers) that checks `Authorization: Bearer <AI_SERVICE_TOKEN>` on every request; fails closed (401) if the token is unset, missing, or wrong — `/health` stays open for liveness checks. `server/src/controllers/document.controller.js` now sends that header (env var `AI_SERVICE_TOKEN`, added to both `.env.example` files) and passes `signal: AbortSignal.timeout(30000)`, mapping a timeout to a clean 504. `ai-service/summarizer.py`'s `/summarize` now validates `fileUrl`'s host against `ALLOWED_FILE_HOSTS = {"res.cloudinary.com"}` (the only host documents are ever uploaded to, per `server/src/config/cloudinary.js`) *before* attempting any fetch, rejecting with 400 otherwise; the fetch itself now streams via `httpx`'s `AsyncClient.stream()` and rejects with 413 once 10MB is exceeded, so an oversized file is never fully buffered.
- **Acceptance criteria (met):** Requests to `ai-service` without the shared credential are rejected (verified: 401 with no token, 401 with a wrong token) — verified even for a request whose `fileUrl` looked SSRF-like, confirming auth is checked before the SSRF guard runs, not after; `/summarize` refuses `fileUrl`s outside `res.cloudinary.com` (verified: 400) but proceeds normally for an allowed host (verified: reaches the fetch step, correctly 502s on an unreachable test URL rather than crashing); oversized files are rejected before being sent to the model (code-verified via the streaming cap logic — not exercised against a real >10MB file, since that would require a real reachable Cloudinary asset).
- **Status:** **Done.** `python -m py_compile` passes on all `ai-service` files; a `TestClient`-based smoke test exercised the FastAPI app in-process (no live Ollama needed, since the auth/SSRF checks run before any Ollama call) and confirmed all the acceptance criteria above. Not yet covered by an automated test *suite* (see N4) — the verification above was a one-off manual smoke test during implementation, not a committed test file.

### N3. Centralized validation and error-handling hardening
- **Objective:** Make failure paths safe and consistent across the server and ai-service.
- **Priority:** P1 — **mostly done, see Status.**
- **Dependencies:** I2, I4, I5
- **Implementation considerations:** Introduce a validation library on the server (e.g. `express-validator` or `zod`) applied consistently across controllers, starting with `bookAppointment`'s missing `startsAt < endsAt` check — **the specific check is fixed (2026-08-22), the library adoption is not** (see below). ~~Wrap `socket.js`'s `message:send` handler in try/catch with basic payload validation so a DB failure can't crash the process.~~ **FIXED (2026-08-22)** — see **I5**. ~~Broaden `ai-service`'s exception handling beyond `JSONDecodeError`/`IndexError`/`AttributeError` to cover Anthropic SDK and httpx connection/timeout errors, mapping them to sensible HTTP status codes rather than raw 500s.~~ — **done as a side effect of the 2026-08-17 Claude→Ollama migration**: httpx connection/timeout/status errors are now caught in both `assistant.py` and `summarizer.py` (see **Completed → C11**, **In Progress → I4**); the `anthropic` SDK itself is gone from the codebase so that half of the original wording no longer applies. ~~Sanitize the server's global error handler so raw `err.message` (including Postgres constraint text) is logged server-side but never returned to the client verbatim.~~ **FIXED (2026-08-22)** — see below.
- **Acceptance criteria:** ~~A malformed or malicious socket payload no longer crashes the process~~ — done (2026-08-22). ~~an `ai-service` outage or connection/timeout error returns a clean 5xx with no stack trace or internal detail leaked to the client~~ — done for the httpx half, see C11/I4. ~~`bookAppointment` rejects `startsAt >= endsAt`~~ — done (2026-08-22), and it and `rescheduleAppointment` also now reject past `startsAt` and invalid dates. ~~the server's global error handler never returns raw `err.message` for an unflagged error~~ — done (2026-08-22): `server/index.js`'s handler now only echoes `.message` when a controller/middleware explicitly set `.status`; verified live against an actual DB-connection failure returning a generic message instead of the raw error.
- **Status:** **Mostly done (2026-08-22).** Every concrete acceptance criterion above is met. What's genuinely still open, and the reason this item isn't fully closed: no actual validation library (zod/express-validator) was adopted — the fixes above are hand-written checks at the specific gaps that were named (`validateAppointmentWindow` in `appointment.controller.js`, the payload check in `socket.js`), not a framework applied consistently across every controller. If more input-validation gaps surface elsewhere, they'll need the same one-off treatment until a library is actually adopted.

### N4. Stand up automated test coverage
- **Objective:** Give the codebase a regression safety net before further feature work — currently zero tests exist across all three services.
- **Priority:** P1 — **started, see Status.**
- **Dependencies:** N1 (done — tests should cover the fixed authorization gaps directly, since they're currently only syntax-checked, not integration-tested)
- **Implementation considerations:** No test framework is installed in any of the three manifests (`server/package.json`, `client/package.json`, `ai-service/requirements.txt`) — **as of 2026-08-22, `ai-service` has `pytest` installed and configured** (`pytest.ini`); `server`/`client` still have none (`server/package.json` gained a bare `"test": "node --test"` script with no test files behind it yet). Start with integration tests for the two now-fixed authorization gaps (register-as-admin, appointment IDOR) so the N1 fix is verifiably locked in and can't silently regress, then expand: a Node test runner or a lightweight framework for the server, Vitest for the client, pytest with a mocked Anthropic client for `ai-service` — **superseded**: `ai-service`'s client is Ollama via `httpx` now (not Anthropic, see C11), and its equivalent security-critical logic (`require_service_token`, the SSRF host guard) is now covered by real pytest tests, not just this document's recommendation.
- **Acceptance criteria:** Each of the three services has a runnable test command — **partially done**: `ai-service`'s `pytest` command is real and passing; `server`'s `npm test` command exists but discovers nothing; `client` has no test command at all. ~~at minimum, a test exists asserting `role=admin` cannot be self-registered and a test asserting a non-owning user cannot mutate another user's appointment~~ — **not done for the server** (both of these are DB-coupled and would need a real/test Postgres instance to test meaningfully, which remains unavailable in this environment); the closest equivalent that *was* done is `ai-service`'s `require_service_token` test suite (`ai-service/tests/test_auth.py`) and its SSRF-guard test, both DB-independent security logic that's now regression-proof.
- **Status:** **Started (2026-08-22).** `ai-service/tests/` has 13 real, passing tests (`test_util.py`, `test_summarizer.py`, `test_auth.py`) — see `docs/DEV_CONTEXT.md` Section 4 and `docs/TESTING.md` for exact coverage and what's still not tested (live-Ollama mocking, all server/client logic, anything DB-coupled). This is a genuine first step, not a completion of this item — the server's two named authorization regression tests specifically are still unwritten, blocked on the same "no test DB in this environment" constraint every prior session has hit.

---

## Later

Larger-scope or lower-urgency items from the same recommendation set.

### L1. Implement Appointment Reminders end-to-end
- **Objective:** Deliver the one product feature that currently has no application code at all.
- **Priority:** P2
- **Dependencies:** Blocked on a scheduler/notification-channel decision — see **Blocked → B1**
- **Implementation considerations:** The `reminders` table (`appointment_id`, `send_at`, `sent`) exists in `schema.sql`, but there is no controller, route, scheduler/cron job, or notification-sending code anywhere in the reviewed codebase. This is genuinely unbuilt, not partially built.
- **Acceptance criteria:** A worker/scheduler reads due (`send_at <= now()`, `sent = false`) reminder rows, sends a notification through a chosen channel, and marks the row `sent = true`; a reminder row is created automatically when an appointment is booked (or via an equivalent trigger point).
- **Status:** Not started — `PLANNED`. No work can be meaningfully scoped until B1 is resolved.
- **Related files:** `server/src/models/schema.sql`

### L2. Client & API resilience — pagination, 401 handling, error boundaries
- **Objective:** Close the loading/error-handling gaps across dashboards and prevent unbounded result sets from becoming a problem as data grows.
- **Priority:** P2 — **partially done, see Status.**
- **Dependencies:** I3, I6, I7 (all now resolved, see above)
- **Implementation considerations:** Add pagination (limit/offset or cursor) to `listMyAppointments`, `listMyDocuments`, `getConversation`, and `searchDoctors` — all currently return unbounded result sets. **Not done.** Add a response interceptor in `client/src/services/api.js` for centralized 401/expired-token handling (none exists today; a stale token currently fails silently per-request). **Not done.** Add a React error boundary (none exists in the tree today). **Not done.** ~~Add loading and error states to every page-level fetch called out in I3/I6/I7 (`AdminDashboard`, `DoctorDashboard`, `PatientDashboard`, `ChatWindow`).~~ **FIXED (2026-08-22)** — see I3, I6, I7 above; `ChatWindow` also got its own loading/error state on the history fetch as part of I5. ~~Fix `ProtectedRoute`'s wrong-role redirect (currently sends the user to `/`, which unconditionally redirects to `/login` instead of the user's own dashboard).~~ **FIXED, incidentally, as of the 2026-08-22 UI redesign** — `App.jsx`'s `/` route (`Landing`) now checks auth state: `<Navigate to={user ? \`/${user.role}\` : "/login"} replace />`. Verified by reading both files together: a wrong-role authenticated user hitting a role-gated route is sent by `ProtectedRoute` to `/`, and `Landing` now correctly forwards them to `` /${user.role} `` (their own dashboard) rather than unconditionally to `/login`. This wasn't a deliberate fix for this bug — it fell out of unrelated routing changes for the new bare-auth-page layout — but the bug is genuinely gone.
- **Acceptance criteria:** List endpoints accept and honor pagination parameters with a bounded default page size — not done. An expired/invalid token triggers a single centralized logout/redirect instead of silent per-request failures — not done. A render-time exception in any page shows a fallback UI instead of a blank screen — not done. ~~Every dashboard shows a loading indicator and a visible error message on fetch failure~~ — done (2026-08-22).
- **Status:** **Partially done (2026-08-22)** — the loading/error-state half of this item is complete (folded into I3/I6/I7 above); pagination, the response interceptor, the error boundary, and the `ProtectedRoute` redirect fix are all still open.

---

## Blocked

Work that cannot be scoped or started until an explicit decision is made. Each entry names the open question and which item it gates.

### B1. Appointment Reminders — trigger mechanism & notification channel
- **Blocks:** L1
- **Open question:** *"Who or what is meant to trigger Appointment Reminders?"* The `reminders` table exists, but nothing in the stack (README stack table: React/Vite, Express, PostgreSQL, JWT/bcrypt, Python/FastAPI/Ollama, Cloudinary/S3, Socket.IO) includes an email/SMS/push-notification provider, and no scheduler (cron, queue, job runner) is referenced anywhere.
- **Decision needed:** Choose a scheduling approach (in-process cron, external scheduler, queue-based worker) and a notification delivery channel (email, SMS, in-app, or push) before L1 can be meaningfully scoped.
- **Status:** Awaiting decision.

### B2. Admin account provisioning workflow
- **Blocks:** N/A — the code-fix half of N1 is done; this only blocks building an actual admin-provisioning mechanism.
- **Open question:** *"Is admin account creation meant to go through a separate, non-public flow rather than the current public `/api/auth/register` endpoint?"*
- **Decision needed:** N1's code fix (rejecting `role=admin` on public registration) is **done** and did not depend on this. What's still undecided is the replacement mechanism for creating admin accounts (CLI script, direct DB seed, internal-only endpoint, manual DB update) — until this is decided, admin accounts can only be created via a direct database write.
- **Status:** Awaiting decision.

### B3. Production secrets-management and deployment target
- **Blocks:** Full resolution of `JWT_SECRET=change-me`, and any future CI/CD work
- **Open questions:** *"What is the intended production secrets-management strategy, given the app currently relies entirely on .env files with a placeholder JWT_SECRET value?"* and *"What deployment target/infrastructure (containers, hosting provider, CI/CD) is planned? Nothing in the repo currently addresses deployment beyond local dev instructions."*
- **Decision needed:** A hosting/deployment target and a secrets-management approach (secrets manager vs. environment-injected values) must be chosen before secret handling and a CI pipeline can be properly designed. In the interim, a narrower fix — failing fast at server startup if `JWT_SECRET` is unset or equal to the literal placeholder `change-me` — does not require this decision and can be done as part of N1/N3.
- **Status:** Awaiting decision.

### B4. Free/open-source stack migration — AI-model half done, Cloudinary/storage half still blocked
- **Blocks:** Any new Cloudinary-specific code (should not be added without checking migration status first). The Claude-API half of this migration is no longer blocked — it shipped 2026-08-17; see **Completed → C11**.
- **Direction (decided, 2026-08-14):** Replace Cloudinary with a self-hosted/free file-storage alternative, and replace the paid Claude API with a free/open-source or locally-run LLM for document summarization (`ai-service/summarizer.py`) and search-filter parsing (`ai-service/assistant.py`). This supersedes the Cloudinary/Claude reasoning in `docs/DECISIONS.md` as the long-term direction.
- **AI-model half — RESOLVED (2026-08-17):** Implemented and shipped — see **Completed → C11** for full detail. `ai-service` now calls a local Ollama server (`ollama_client.py`, httpx-based, no new SDK dependency) instead of the Claude API; model is `llama3.2-vision`, chosen specifically because it's vision-capable so one model still covers both text (filter parsing) and image/PDF (document summarization) requests. PDF summarization now rasterizes pages to images via PyMuPDF since Ollama, unlike Claude, has no native PDF understanding. This was code-verified (compiles, installs cleanly, imports, unit-tested offline) but **not** verified end-to-end against a live Ollama server — that remains the user's responsibility to confirm locally. Self-hosting Ollama also introduces a new, unsolved deployment constraint: `ai-service` now needs either Ollama co-located with it with enough RAM/VRAM for a vision model (realistically 8GB+ RAM or a GPU), or a separately reachable Ollama instance via `OLLAMA_BASE_URL` — free-tier PaaS hosting is unlikely to have the resources to run Ollama itself. This compounds the open deployment-target question in **Blocked → B3**.
- **Storage half — still open (unchanged):** Which specific self-hosted storage (e.g. local disk + server-side serving, MinIO) to adopt in place of Cloudinary is undecided — this determines the actual implementation plan and affected files (`server/src/config/cloudinary.js`, `server/src/controllers/document.controller.js`). Do not begin implementation until a plan is presented (per this repo's development protocol) and confirmed.
- **Status:** Partially resolved. AI-model half **done** (C11, 2026-08-17). Storage half: direction agreed, scoping not started, still awaiting decision.

---

## Summary counts

| Section | Item count (2026-08-14/17) | Status as of 2026-08-22 |
|---|---|---|
| Completed | 11 | unchanged (11) |
| In Progress | 7 | **6 of 7 effectively resolved** (I1, I2, I3, I5, I6, I7) — kept under this heading only to preserve cross-references; I4 partially resolved (client catch fixed, Ollama-live test coverage still open) |
| Next | 4 (N1 done, N2 done, N3–N4 open) | N3 mostly done, N4 started (see above) |
| Later | 2 | L2 partially done (loading/error states + the `ProtectedRoute` redirect bug closed; pagination/interceptor/error boundary still open); L1 (Appointment Reminders) untouched by design |
| Blocked | 4 (B4 partially resolved — AI-model half done, storage half open) | unchanged — B1–B4 all still open, none were in scope for the 2026-08-22 session |

Two features are fully `IMPLEMENTED` (Doctor Search & Filters, Medical Document Upload) as of the original 2026-08-14/17 assessment. Seven were `PARTIALLY_IMPLEMENTED` with named gaps at that time; as of 2026-08-22, six of those seven (Auth, Appointment Booking, Doctor Dashboard, Doctor-Patient Chat, Patient Dashboard, Admin Dashboard) have had every gap named in this document's `I1`–`I7` closed — see `docs/FEATURES.md`'s 2026-08-22 update for the corresponding per-feature status changes, since promoting a feature's top-level status is that document's call, not this roadmap's. One (Appointment Reminders) remains `PLANNED` with no application code, unchanged and deliberately out of scope. C11 (Ollama migration) is an infrastructure/backend change rather than one of the synthesis's rated product features, so it does not affect the `IMPLEMENTED`/`PARTIALLY_IMPLEMENTED`/`PLANNED` counts above. No feature in this plan is marked Completed on the strength of aspiration or partial evidence — every Completed entry cites the specific piece of working, evidenced code it covers, and calls out the parent feature's remaining gaps where applicable; the same standard was applied to every 2026-08-22 strikethrough above.
