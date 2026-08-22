# Project Context — AI-Powered Healthcare Appointment & Patient Portal

This document orients a new developer (human or AI) to the project's purpose, scope,
architecture, current implementation status, and constraints — without requiring a
full read of the codebase. It reflects the state of the repository as a **freshly
generated scaffold**, not a mature, battle-tested application.

## Overview score

Overall project health/completeness score as of this writing: **4.1 / 10**
(see `docs/EVALUATION.md` or the canonical scoring synthesis for the full per-category
breakdown). This is expected for a ~1-hour-old scaffold and should rise as the items in
[Current limitations](#current-limitations) are addressed.

---

## 1. Project name and purpose

**AI-Powered Healthcare Appointment & Patient Portal**

A web application where patients discover doctors, book appointments, manage medical
documents, receive reminders, and chat with their providers. An AI layer (a local Ollama
LLM, via a dedicated FastAPI microservice — migrated off the Anthropic Claude API on
2026-08-17) assists with two things: summarizing uploaded medical documents in plain
language, and helping patients find doctors via natural-language search. **The AI layer
assists — it does not replace doctors and does not provide medical diagnoses.**

## 2. Problem being solved

Booking and managing healthcare visits is typically fragmented across phone calls,
paper records, and disconnected portals. This project aims to unify, in one product:

- Discovering the right doctor (by specialization, location, fee, experience, language)
- Booking appointments without double-booking conflicts
- Storing and understanding medical documents (with AI-assisted plain-language summaries)
- Direct, real-time communication between patient and doctor
- Giving admins visibility into platform-wide activity

## 3. Target users

- **Patient** — searches for doctors, books/manages appointments, uploads and reviews
  medical documents, chats with their doctor.
- **Doctor** — manages their profile and availability, views/updates their appointments,
  chats with patients.
- **Admin** — views platform-wide statistics (user counts, appointment completion rate,
  popular specializations).

Roles are enforced via **JWT claims** checked by server-side route middleware
(`server/src/middleware/auth.middleware.js`: `requireAuth` / `requireRole`) and mirrored
on the client by a route guard (`client/src/components/Layout/ProtectedRoute.jsx`).

## 4. Primary use cases

1. A patient registers, searches for a doctor by specialization/location/fee/experience/
   language, and books an appointment.
2. A patient uploads a medical document (PDF/image); the document is stored and can be
   sent for an AI-generated plain-language summary.
3. A doctor reviews their upcoming appointments and updates an appointment's status
   (e.g. scheduled → confirmed → completed) or reschedules it.
4. A patient and their doctor exchange real-time chat messages tied to an appointment.
5. An admin views aggregate platform statistics (counts, completion rate, top
   specializations) on a dashboard.

## 5. Product vision

A single portal that removes friction from the patient–doctor relationship: fast doctor
discovery, frictionless booking with no double-booking, documents that are easy to
understand thanks to AI summarization, and direct messaging — all under role-based
access so patients, doctors, and admins each see only what's relevant to them. The AI
layer is explicitly scoped as an assistant to search and document comprehension, not as
a clinical decision-maker.

## 6. Current project status

**Freshly scaffolded, pre-implementation-hardening.** The repository is not (yet) a git
repository and all files were generated within roughly the same hour. Per the project's
own README:

> Initial scaffold: project structure, auth (register/login), doctor search/filter,
> appointment booking, document upload, chat (Socket.IO), and admin stats are stubbed
> end-to-end so each layer talks to the next. Business logic, validation, and the real
> LLM prompts still need to be filled in per feature.

This is **not a mock** — controllers issue real parameterized SQL against a real schema,
auth uses real bcrypt + JWT, uploads go to a real Cloudinary integration, and the AI
service makes real calls to a local Ollama LLM server. But most features are functionally partial: happy
paths generally work, while validation, authorization edge cases, error handling, and
one entire feature (reminders) are incomplete or missing. See
[Feature status](#7-feature-status-summary) and [Current limitations](#8-current-limitations)
below.

## 7. Feature status summary

| Feature | Status |
|---|---|
| Auth (register/login/me) | Partially implemented — real bcrypt+JWT; registration's role-escalation gap is **fixed** (restricted to `patient`/`doctor`), remaining gap is submit-button loading state |
| Doctor search & filters | Implemented |
| Doctor profile self-service upsert | Implemented |
| Appointment booking | Partially implemented — DB-level double-booking prevention works; client hardcodes 30-min duration, no future-date validation |
| Doctor dashboard / appointment status & reschedule | Partially implemented — ownership check **fixed** (was an IDOR); remaining gap is dashboard loading/error UI |
| Medical document upload | Implemented |
| AI document summarization | Partially implemented — happy path works end-to-end against a local Ollama LLM (migrated from Claude 2026-08-17); error handling broadened to catch Ollama connect/HTTP/timeout errors (502/504); SSRF and file-size gaps **fixed** same day (Cloudinary-only host allowlist + 10MB streaming cap); not yet runtime-verified against a live Ollama server |
| Doctor–patient chat | Partially implemented — REST history/read-receipts correctly scoped; Socket.IO send path has no error handling, no payload validation |
| Appointment reminders | **Planned only** — a `reminders` table exists in the schema; no controller, route, scheduler, or notification code exists anywhere |
| Patient dashboard | Partially implemented — wired end-to-end, but fetches have no error/loading handling |
| Admin dashboard | Partially implemented — real aggregate SQL; client has no error handling on fetch failure |

Full evidence and file references for each item are in the canonical feature/synthesis
data used to generate this doc suite; see `docs/FEATURES.md` if present.

---

## 8. Full technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18.3.1 + Vite 5.3.3 | `react-router-dom` 6.24.1 for routing; `@vitejs/plugin-react` 4.3.1 |
| Frontend HTTP | axios 1.7.2 | Single shared instance with a request interceptor (Bearer token); **no response interceptor** |
| Frontend realtime | socket.io-client 4.7.5 | Singleton client, used by the chat window |
| Backend | Node.js, Express 4.19.2 | ESM (`type: module`); `node --watch index.js` for dev (no nodemon) |
| Backend auth | jsonwebtoken 9.0.2, bcryptjs 2.4.3 | Stateless JWT + bcrypt password hashing |
| Database | PostgreSQL | Accessed via `pg` 8.11.5 (connection pool) |
| File uploads | multer 1.4.5-lts.1 → Cloudinary 2.2.0 | In-memory storage, 10MB limit, MIME allowlist (PDF/JPEG/PNG) |
| Realtime | socket.io 4.7.5 | JWT-authenticated handshake; chat messages + typing indicator |
| Backend misc | cors 2.8.5, dotenv 16.4.5 | |
| AI layer | Python, FastAPI 0.141.1 | `uvicorn[standard]` 0.52.3 |
| AI layer validation | pydantic 2.13.4 | |
| AI layer HTTP client | httpx 0.28.1 | Used to fetch documents server-side for summarization, and to call the local Ollama server (`ollama_client.py`) |
| AI layer LLM | Ollama (local, default model `llama3.2-vision`) | Migrated from the Anthropic Claude API 2026-08-17; `ollama_client.py` POSTs to Ollama's `/api/chat` with `format: "json"`; vision-capable model handles both text and image/PDF requests |
| AI layer PDF rendering | pymupdf 1.28.2 | Rasterizes PDF pages to images for the vision model (Ollama has no native PDF understanding); capped at `MAX_PDF_PAGES = 8` per document, extra pages silently dropped |
| AI layer env | python-dotenv 1.2.3 | |
| Files | Cloudinary (implemented) / Amazon S3 (listed in README, not implemented) | Only Cloudinary is actually wired up |

**No test framework** is present in any of the three services (confirmed absent from
`server/package.json`, `client/package.json`, and `ai-service/requirements.txt`). **No
linter/formatter** is configured in any service.

### Ports (local dev)

| Service | URL |
|---|---|
| Client (Vite) | http://localhost:5173 |
| Server (Express) | http://localhost:5000 |
| AI service (FastAPI/uvicorn) | http://localhost:8000 |

### Repository structure

```
healthcare-app/
├── client/        # React app (patient/doctor/admin dashboards)
├── server/        # Express API (auth, appointments, documents, chat, admin)
├── ai-service/    # FastAPI (document summarization, appointment assistant)
├── docs/          # This documentation suite
└── README.md
```

---

## 9. Major architectural decisions

Summarized here; see `docs/DECISIONS.md` for full context, options considered, and
consequences of each.

1. **Three-service split** (React/Vite client, Express/Postgres server, FastAPI/Ollama
   ai-service) instead of a monolith or calling the LLM directly from Node — keeps the
   core transactional backend in Node while isolating LLM integration in Python. The
   ai-service originally called the Anthropic Claude API; it was migrated to a local
   Ollama server on 2026-08-17 (see `docs/DECISIONS.md`, ADR-007) without changing this
   split or the `/assistant/query` / `/summarize` HTTP contracts.
2. **DB-level `UNIQUE (doctor_id, starts_at)` constraint** to prevent double-booking,
   rather than relying on an application-level check — race-safe by construction.
3. **Stateless JWT authentication** (JWT + bcrypt) instead of server-side sessions —
   works uniformly across REST middleware and the Socket.IO handshake, but has no
   server-side revocation mechanism.
4. **Socket.IO** for realtime chat (message send + typing indicators) instead of raw
   WebSockets or polling — gives room-based broadcasting and auth-on-handshake, but has
   no Redis adapter, so it won't scale past a single server instance as-is.
5. **Cloudinary** for file storage (not Amazon S3, despite both being listed in the
   README's stack table) — only Cloudinary is actually implemented
   (`server/src/config/cloudinary.js`).
6. **Vite** for the client build/dev tooling instead of Create React App or a custom
   Webpack setup — faster dev server and HMR with minimal configuration.

---

## 10. Important constraints

- **AI summaries are informational only, not diagnostic.** The AI layer assists with
  document summarization and appointment/doctor-search discovery; it does not replace
  a doctor's judgment and must not be presented to users as a diagnosis.
- **Roles are enforced via JWT claims + route middleware**, not client-side checks
  alone. `requireAuth` verifies the token; `requireRole(role)` gates specific routes.
  The client's `ProtectedRoute` is a UX convenience, not a security boundary.
- **Double-booking is prevented at the database level** via a `UNIQUE (doctor_id,
  starts_at)` constraint on `appointments` — this guarantee holds even under concurrent
  requests and must not be re-implemented as an application-level check-then-insert.
- **The ai-service is currently unauthenticated.** Any caller (not only the Express
  server) can currently reach `/assistant/query` and `/summarize`. This is a known,
  open gap — see [Current limitations](#8-current-limitations) — and must not be
  treated as a trusted-internal-network assumption in production.
- **File type/size limits are enforced server-side** by multer (10MB limit, PDF/JPEG/PNG
  allowlist); the client's `accept` attribute is a UI hint only and is not a security
  control.

## 11. Assumptions

- Node.js version supports the built-in global `fetch` (Node ≥ 18), since
  `document.controller.js` relies on it; no `engines` field currently pins this in
  `server/package.json`.
- A single PostgreSQL instance is assumed for local development (`DATABASE_URL` in
  `server/.env.example`); no read-replica or connection-pooling strategy beyond the
  default `pg.Pool` is documented.
- A single, fixed `CLIENT_ORIGIN` is assumed for CORS on both the server and the
  ai-service — workable for one dev/staging environment at a time, not multi-origin.
- Admin accounts are currently assumed to be provisioned the same way as any other
  account (via public registration) — this is flagged as a security gap, not an
  intended design, per the canonical risk list.

## 12. Dependencies / external integrations

- **PostgreSQL** — primary datastore for users, doctor profiles/availability,
  appointments, documents (metadata + AI summary JSON), messages, and reminders.
  Connected via `DATABASE_URL`.
- **Cloudinary** — file storage for uploaded medical documents (PDF/JPEG/PNG).
  Configured via `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
  `CLOUDINARY_API_SECRET`.
- **Ollama (local LLM)** — invoked from `ai-service` via a thin httpx-based client
  (`ollama_client.py`, POSTs to Ollama's `/api/chat` with `format: "json"`) for two
  features: parsing natural-language doctor-search queries into structured filters
  (`POST /assistant/query`), and summarizing uploaded medical documents
  (`POST /summarize`). Configured via `OLLAMA_BASE_URL` (default
  `http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.2-vision` — chosen for
  vision support so one model handles both text and image/PDF requests). **Migrated off
  the Anthropic Claude API on 2026-08-17** (see `docs/DECISIONS.md`, ADR-007) — removes
  per-token API billing and keeps patient-uploaded documents on operator-controlled
  infrastructure, at the cost of new local hosting/compute requirements (see
  [Current limitations](#13-current-limitations)) and unverified output quality/JSON-mode
  reliability relative to Claude.
- **Server ↔ ai-service** — the Express server calls the ai-service over plain HTTP
  (`AI_SERVICE_URL`, default `http://localhost:8000`) with **no service-to-service
  authentication** and **no request timeout** on the server's side.

## 13. Current limitations

Being direct about these, per the project's own canonical assessment (overall score
4.5/10, updated 2026-08-17 — Security 5/10, Testing 0/10):

### Critical issues
- ~~**Privilege escalation**: `POST /api/auth/register` accepts a client-supplied `role` field including `admin` with zero restriction.~~ **FIXED (2026-08-14)** — now restricted to `patient`/`doctor`.
- ~~**IDOR**: `PATCH /api/appointments/:id/status` and `.../reschedule` only require a valid JWT, not ownership of the appointment.~~ **FIXED (2026-08-14)** — both now enforce ownership.
- ~~**ai-service has zero authentication** on any endpoint, including `/summarize`, which processes patient-supplied medical documents, and fetches an arbitrary client-supplied URL with no SSRF protection.~~ **FIXED (2026-08-17)** — both routes now require `Authorization: Bearer <AI_SERVICE_TOKEN>`; `/summarize` rejects any `fileUrl` outside `res.cloudinary.com` and caps the fetch at 10MB.
- **Zero automated tests** exist across all three services — no test framework is
  installed in any of the three manifests (this includes all three fixes above, which are
  syntax-checked only).
- **Appointment Reminders** — one of the ten named product features — has no
  implementation beyond a dangling `reminders` database table; no scheduler, worker, or
  notification code exists.

### Other known gaps
- No rate limiting on `/api/auth/login`, `/api/auth/register`, or either Ollama-backed
  ai-service endpoint.
- `JWT_SECRET` defaults to the literal placeholder `change-me` in `.env.example`, with
  nothing enforcing a stronger value.
- The global Express error handler returns raw `err.message` to clients, which can leak
  internal/Postgres error text.
- `socket.js`'s `message:send` handler has no try/catch around its DB write.
- No pagination anywhere (appointments, documents, chat history, doctor search all
  return unbounded result sets).
- No centralized input validation library on the server; ad hoc, inconsistent
  per-controller checks (e.g. booking never validates `startsAt < endsAt`).
- Client has no response interceptor for 401/expired-token handling, and most
  page-level data fetches have no `.catch()` or loading state (Admin/Doctor/Patient
  dashboards, chat history load).
- `DocumentCard.handleSummarize` has no catch block — a failed summarize call is an
  unhandled promise rejection.
- ~~ai-service only caught JSON-parse failures around the Claude response; SDK and
  network errors surfaced as raw 500s.~~ **IMPROVED (2026-08-17, Claude→Ollama
  migration)** — the anthropic SDK is gone; `assistant.py`/`summarizer.py` now also
  catch `httpx.ConnectError` (Ollama unreachable → 502), `httpx.HTTPStatusError`
  (Ollama error → 502), and `httpx.TimeoutException` (→ 504) instead of surfacing raw
  500s. Whether the new httpx-based `ollama_client.py` calls could still run
  synchronously inside the async route handlers and block the event loop (as the old
  Anthropic SDK calls did) was not verified in this migration.
- ~~`parse_json_response` is duplicated verbatim between `assistant.py` and
  `summarizer.py`.~~ **FIXED (2026-08-17)** — deduplicated into `ai-service/util.py`,
  imported by both.
- New PDF summarization gap introduced 2026-08-17: PDFs are rasterized page-by-page
  (via PyMuPDF) and capped at `MAX_PDF_PAGES = 8` per document, since Ollama has no
  native PDF understanding. Pages beyond the cap are silently dropped with no
  indication in the returned summary that the document was truncated.
- Self-hosting Ollama changes the deployment story (new as of the 2026-08-17
  migration, unsolved): ai-service now needs either Ollama running with enough
  RAM/VRAM for a vision model (`llama3.2-vision` is ~11B; realistically 8GB+ RAM or a
  GPU for usable latency) reachable at `OLLAMA_BASE_URL`, or a separately hosted Ollama
  instance. Free-tier PaaS hosting (e.g. Render/Railway free tier) is very unlikely to
  have the resources to run Ollama itself.
- No linter/formatter, no CI, and no `vite.config.js` dev-server proxy for `/api` in
  any service.

A full list of technical debt and risks is maintained in `docs/RISKS.md` /
`docs/DECISIONS.md` if present; treat this section as the authoritative honest summary
for onboarding purposes.

---

## 14. Terminology glossary

| Term | Meaning |
|---|---|
| **patient** | User role; searches doctors, books appointments, uploads documents, chats with their doctor |
| **doctor** | User role; manages profile/availability, views/updates their appointments, chats with patients |
| **admin** | User role; views platform-wide stats via `/api/admin/stats` |
| **JWT claims** | The decoded JWT payload (including `role`) attached to `req.user` by `requireAuth`; used by `requireRole` to gate routes |
| **appointment status** | One of: `scheduled`, `confirmed`, `completed`, `cancelled` (Postgres enum `appointment_status`) |
| **double-booking constraint** | The `UNIQUE (doctor_id, starts_at)` constraint on `appointments` that prevents two bookings for the same doctor at the same start time; a violation returns HTTP 409 |
| **doctor_profiles** | Table holding doctor-specific data (specialization, location, fee, experience, languages, bio), one row per doctor `user_id` |
| **doctor_availability** | Table of a doctor's weekly recurring available time slots (`day_of_week`, `start_time`, `end_time`, `slot_minutes`) |
| **ai_summary** | JSONB column on `documents` holding the LLM-generated structured summary (documentType, keyInfo, abnormalValues, followUp, disclaimer) — generated by Ollama as of 2026-08-17, previously Claude |
| **reminders** | Table (`appointment_id`, `send_at`, `sent`) for appointment reminders — schema-only, no application code implements sending them yet |
| **ai-service** | The FastAPI microservice wrapping a local Ollama LLM server (previously the Claude API, migrated 2026-08-17); called by the Express server, never directly by the client |
| **IDOR** | Insecure Direct Object Reference — an authorization bug where an endpoint accepts a resource ID without verifying the caller owns/may access that resource (was present on appointment status/reschedule; fixed 2026-08-14) |
| **SSRF** | Server-Side Request Forgery — was a risk on `/summarize`, which fetched an arbitrary client-supplied URL with no domain allowlist; fixed 2026-08-17 via a `res.cloudinary.com`-only allowlist |

---

*This document should be kept in sync with `README.md`, `docs/DECISIONS.md`, and any
other files in `docs/` as the project evolves. It reflects a point-in-time snapshot of
a freshly scaffolded codebase — update the status sections as features move from
"partially implemented" to "implemented" and as the critical issues above are resolved.*
