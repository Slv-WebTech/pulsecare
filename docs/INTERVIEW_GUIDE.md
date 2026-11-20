# Interview Guide — AI-Powered Healthcare Appointment & Patient Portal

> **Status note (2026-11-20):** this document was written during the early scaffold phase and parts of it
> are historical. For the current state see [`QA-REPORT.md`](./QA-REPORT.md) (what was tested, fixed and
> what remains), [`CHANGELOG.md`](./CHANGELOG.md) and the root [`README.md`](../README.md). Where this
> document disagrees with them, they win.

**Snapshot date:** 2026-08-14
**Project age at time of writing:** ~1 hour (freshly generated scaffold, no commit history, no `.git` directory yet)
**Overall project health score (canonical synthesis):** 4.5 / 10 *(as of 2026-08-17 — was 4.1 at the original 2026-08-14 snapshot; see `docs/PROJECT_SCORE.md` for the current, dated breakdown)*

> **Living document.** This guide is written at the moment the project is a scaffold: routing, schema, and controller shapes exist and a lot of it genuinely works end-to-end, but almost no business logic has been hardened, nothing has been deployed, and there is no debugging or user history to draw on yet. Every section below is scoped to what the current code actually shows. Sections that would normally hold war stories, metrics, or before/after growth narratives are explicitly marked **"Not yet available"** rather than filled with invented content. Re-run through this guide and fill in the marked sections as real implementation, debugging, and testing work happens — see the closing note.

> **Update (2026-08-17):** The ai-service's LLM backend was migrated from the paid Claude API to a locally-hosted Ollama model (this is the Claude-half of ADR-007's "replace Cloudinary and the paid Claude API with free/open-source alternatives" direction — the Cloudinary-half is still undone). All mentions of Claude/Anthropic below have been updated to reflect Ollama as the current provider; see the new "Why Ollama over the Claude API?" row in Section 14 and Story 6 in Section 4 for the full writeup.

> **Update (2026-08-17, later same day):** `ai-service` was also secured — both routes now require a shared bearer token (`AI_SERVICE_TOKEN`), and `/summarize` gained a Cloudinary-only SSRF allowlist plus a 10MB streaming size cap (see `docs/DECISIONS.md` ADR-009). This closed the last of the four originally-flagged critical access-control gaps, so scores in Sections 3 and 18 (Security, Architecture) and several rows in Section 16 have been updated accordingly — this guide's content is **not** frozen at the 2026-08-14 snapshot; it reflects the project's actual current state as of each dated update note.

---

## 1. Elevator Pitch (30 seconds)

"This is a healthcare appointment and patient portal — patients can search for doctors, book appointments, upload and get AI-assisted summaries of their medical documents, and chat with their providers in real time. It's built as three services: a React/Vite frontend, a Node/Express + PostgreSQL API for the core transactional logic, and a separate Python/FastAPI service that wraps a local Ollama LLM for document summarization and natural-language doctor search (this used to be the Claude API — migrated to a self-hosted model on 2026-08-17). The AI layer is deliberately isolated from the core API — it assists with summarization and search, it doesn't make clinical decisions. Right now it's a scaffold: the architecture and schema are in place and the core flows are wired end-to-end, but a lot of the hardening — validation, authorization edge cases, tests — is still ahead of it."

---

## 2. 60-Second Interview Explanation

**What it is:** A three-service full-stack app — React/Vite client, Express/PostgreSQL server, FastAPI/Ollama AI service — for booking doctor appointments, managing medical documents, and chatting with providers.

**Why:** Healthcare scheduling and document handling is a realistic domain for exercising full-stack + AI-integration skills: relational data with real constraints (no double-booking), role-based access (patient/doctor/admin), file upload/storage, real-time messaging, and an LLM integration that has to be scoped safely (assistive, not decision-making).

**Who it's for:** Patients (search/book/upload/chat), doctors (manage appointments, respond to chat), and admins (platform stats).

**Features:** Auth (register/login/JWT), doctor search & filtering, appointment booking with conflict prevention, document upload with AI-generated summaries, real-time doctor-patient chat, and an admin stats dashboard. A reminders table exists in the schema but has no implementation yet.

**Stack:** React + Vite (client), Node.js + Express (server), PostgreSQL (database), JWT + bcrypt (auth), Python + FastAPI + Ollama (local LLM) (AI layer), Cloudinary (file storage), Socket.IO (real-time chat).

**Architecture:** Client talks to the Express API over REST and to the server over Socket.IO for chat. The server never calls the LLM directly — it proxies document-summarization and search-assist requests to the FastAPI ai-service, which is the only thing that talks to the local Ollama server.

**Most challenging part:** *Not yet applicable.* No feature has gone through a real implementation-and-debugging cycle yet — this is a same-day scaffold. This will be filled in once actual feature work (not just wiring) has happened.

**Result / impact:** *Not yet applicable.* There are no users, no deployment, and no measured outcomes. This is pre-implementation, pre-launch scaffolding — see Section 9 for the explicit statement of that.

---

## 3. 2–3 Minute Detailed Explanation

### Problem
Coordinating doctor appointments and medical documents across patients, doctors, and administrative staff typically involves phone calls, paper/PDF records, and no unified real-time channel between patient and provider. The project's stated goal (per README) is a single portal where patients can discover doctors, book appointments, manage documents, get reminders, and chat with providers — with an AI layer assisting on document summarization and appointment discovery, explicitly **not** replacing doctors.

### Solution
A patient-portal web app split into three cooperating services (see Architecture below), backed by a relational schema that encodes the domain's core invariants at the database level — most notably, a `UNIQUE (doctor_id, starts_at)` constraint on `appointments` that makes double-booking impossible by construction rather than by application-level checking.

### Architecture (real, as implemented)
```
client (React + Vite, :5173)
   │  REST (axios, Bearer JWT)         │  Socket.IO (chat)
   ▼                                    ▼
server (Node/Express + PostgreSQL, :5000)
   │  proxies AI requests only (never calls the LLM directly)
   ▼
ai-service (Python/FastAPI + Ollama, :8000)
```
- **client/** — React 18 SPA, `react-router-dom` for routing, a single `AuthContext` for auth state, a thin axios wrapper (`services/api.js`) with a Bearer-token request interceptor, and a Socket.IO client singleton (`services/socket.js`) used by the chat window. Styling is one global hand-written CSS file with CSS custom properties — no framework.
- **server/** — Express API organized by resource (`auth`, `doctors`, `appointments`, `documents`, `chat`, `admin`), each with route → middleware (`requireAuth`/`requireRole`) → controller → parameterized SQL (`pg`) layering, wrapped in a `catchAsync` helper. Socket.IO is attached separately (`src/socket/socket.js`) for real-time chat.
- **ai-service/** — FastAPI service with two Ollama-backed endpoints: `/assistant/query` (natural-language search-filter parsing) and `/summarize` (document summarization), plus `/health`. It talks to a local Ollama server (`OLLAMA_BASE_URL`, default `http://localhost:11434`) rather than holding a third-party API key — as of the 2026-08-17 migration there's no `ANTHROPIC_API_KEY` anywhere in the system anymore. The vision-capable `llama3.2-vision` model (`OLLAMA_MODEL`) was chosen specifically so one model can serve both text (search-filter parsing) and image/PDF (document summarization) requests, preserving the multimodal capability the Claude API used to provide.
- **Database** — PostgreSQL, one hand-written `schema.sql` defining `users`, `doctor_profiles`, `doctor_availability`, `appointments`, `documents`, `messages`, and `reminders`, with enums for `user_role` and `appointment_status`, and indexes on the columns actually queried (patient/doctor id, specialization, location).

### Important Features (honest status)

| Feature | Status | Notes |
|---|---|---|
| Auth (register/login/JWT) | Partially implemented | Real bcrypt + JWT; register lets the caller pick `role`, including `admin` (privilege-escalation bug) |
| Doctor search & filters | Implemented | Dynamic SQL filters (specialization/location/fee/experience/language), wired client-to-server |
| Doctor profile upsert | Implemented | `ON CONFLICT (user_id) DO UPDATE`, restricted to doctor role |
| Appointment booking | Partially implemented | DB-level `UNIQUE(doctor_id, starts_at)` returns 409 on conflict; client hardcodes 30-min duration, no future-date validation |
| Appointment status/reschedule | Partially implemented | Ownership check now enforced (IDOR fixed); dashboard still lacks loading/error UI |
| Medical document upload | Implemented | Cloudinary storage + Postgres metadata, multer 10MB limit + MIME allowlist |
| AI document summarization | Partially implemented | Migrated from Claude to a local Ollama model (2026-08-17); PDFs are now rasterized page-by-page (PyMuPDF, capped at 8 pages) since Ollama has no native PDF understanding; error handling broadened to cover Ollama connection failures/timeouts (502/504); SSRF and file-size gaps fixed same day (Cloudinary-only host allowlist + 10MB streaming cap); code-verified (compiles, installs, rasterization + auth/SSRF logic unit-tested) but not yet runtime-verified against a live Ollama server |
| AI search-filter parsing | Partially implemented | Migrated from Claude to a local Ollama call (2026-08-17); error handling broadened (Ollama connection/timeout → 502/504); endpoint now requires a shared bearer token (fixed same day); not yet runtime-verified against a live Ollama server |
| Doctor-patient chat | Partially implemented | REST history + Socket.IO send/receive work; socket handler has no try/catch, client has no optimistic append |
| Admin dashboard stats | Partially implemented | Real aggregate SQL; client has no error handling on fetch failure |
| Appointment reminders | Planned | Only a `reminders` table exists — no controller, route, scheduler, or notification code anywhere |

### Technical Challenges
**TBD.** No implementation or debugging work has happened yet beyond scaffolding the routes, schema, and service boundaries — there is no war story to tell here honestly. This section should be rewritten once real feature work surfaces actual technical obstacles.

### Technical Decisions
See Section 14 for the full "why did you choose X" writeups. In short, five real architectural decisions were made during scaffolding:
1. Three-service split (React / Express+Postgres / FastAPI+Ollama) instead of a monolith or calling the LLM provider directly from Node.
2. PostgreSQL `UNIQUE` constraint (not application-level locking) to make double-booking impossible.
3. Stateless JWT + bcrypt instead of server-side sessions.
4. Socket.IO instead of raw WebSockets or polling for chat.
5. Cloudinary (over the README-listed alternative, S3) as the file store that's actually wired up.

A sixth decision was made later, outside the original scaffolding session: swapping the paid Claude API for a local Ollama LLM (2026-08-17) — see Section 14's "Why Ollama over the Claude API?" row and Story 6 in Section 4.

---

## 4. STAR Stories

### Story 1 — Designing the schema and service split (real, legitimate)
- **Situation:** The project needed a full-stack healthcare appointment and patient-portal architecture from scratch — covering auth/roles, appointment scheduling with no double-booking, document storage with AI summarization, and real-time chat.
- **Task:** Design a relational schema and a service split that (a) makes double-booking structurally impossible rather than "usually prevented," and (b) keeps the LLM/AI integration isolated from the core transactional API rather than mixed into Express controllers.
- **Action:** Modeled the domain in `schema.sql` with explicit enums (`user_role`, `appointment_status`), a foreign-key graph (`users` → `doctor_profiles` → `doctor_availability`/`appointments`, `appointments` → `documents`/`messages`/`reminders`), and a `UNIQUE (doctor_id, starts_at)` constraint on `appointments` so concurrent booking attempts for the same doctor/time slot can only ever have one winner at the database layer. Split AI concerns into a separate FastAPI service (`ai-service/`) — at the time, the only component holding the Anthropic API key, so the Express server proxied to it instead of calling Claude directly (that API key is gone entirely as of the 2026-08-17 Ollama migration — see Story 6). Designed role-based access control via JWT claims plus reusable `requireAuth`/`requireRole` Express middleware, mirrored on the client with a `ProtectedRoute` component.
- **Result:** A scaffold where the three services boot independently against documented env vars, the schema enforces its core business invariant (no double-booking) at the strongest possible layer, and the AI integration has a clean seam for adding service-to-service auth later — ready for feature-by-feature implementation, not yet a finished product.

### Story 2 — A difficult bug I tracked down
Not yet available — populate this once real implementation/debugging work has happened.

### Story 3 — A performance improvement I made
Not yet available — populate this once real implementation/debugging work has happened.

### Story 4 — A security problem I found and fixed
- **Situation:** A structured codebase review (reading every file across the client, server, and AI service, not just skimming) surfaced two concrete, exploitable gaps in the scaffold: `POST /api/auth/register` accepted a client-supplied `role` field with no restriction, so anyone could self-register as `admin`; and the appointment status/reschedule endpoints only checked that the caller was *logged in*, not that they *owned* the appointment being changed — a textbook IDOR (insecure direct object reference).
- **Task:** Fix both without breaking the legitimate flows they were meant to support (patients/doctors registering normally; doctors and patients managing their own appointments).
- **Action:** For registration, I narrowed the accepted `role` values from `{patient, doctor, admin}` to `{patient, doctor}` at the point where the input is validated, so `admin` is rejected before an account is ever created — admin accounts now have to be provisioned out-of-band. For the appointment endpoints, I added an ownership-resolution step that looks up the appointment's patient and doctor (joining through `doctor_profiles` to get the doctor's `user_id`) before allowing a mutation, returning 403 for anyone who isn't the appointment's patient, its doctor, or an admin.
- **Result:** Both privilege-escalation paths are closed with minimal, targeted diffs — no unrelated refactoring, no new dependencies. I verified the changes with `node --check` (no test database was available in this environment to run an integration test — writing one is now tracked as a near-term follow-up, so the fix stays regression-proof going forward).

See Section 16 for the fuller before/after limitation table, and `docs/CHANGELOG.md` for the dated entry.

### Story 5 — Working under a tight deadline / with ambiguous requirements
Not yet available — populate this once real implementation/debugging work has happened.

### Story 6 — Migrating the AI backend off a paid third-party API (real, but not yet runtime-verified)
- **Situation:** ADR-007 (see `docs/DECISIONS.md`) had flagged the paid, per-token Claude API — which received patient-supplied medical documents — as a cost and privacy concern, alongside Cloudinary, and agreed in principle to move to free/open-source alternatives without yet scoping the work. On 2026-08-17 the Claude half of that direction was implemented.
- **Task:** Swap `ai-service`'s LLM backend from the hosted Claude API to a locally-run Ollama model without breaking either of the two AI endpoint contracts (`POST /assistant/query`, `POST /summarize`) that the Express server and client already depend on, and without losing the image/PDF document-understanding capability Claude provided.
- **Action:** Wrote `ollama_client.py`, a thin `httpx`-based client against Ollama's local `/api/chat` endpoint (no new SDK dependency — `httpx` was already in use) using `format: "json"` to constrain output to valid JSON. Chose the vision-capable `llama3.2-vision` model specifically so one model could still handle both the text (search-filter parsing) and image/PDF (summarization) workloads Claude used to cover. Since Ollama has no native PDF understanding the way Claude did, added a `build_images()` step that rasterizes PDF pages into images with PyMuPDF, capped at 8 pages per document (a deliberate, code-commented scoping decision). Broadened `assistant.py`'s and `summarizer.py`'s exception handling to also catch `httpx.ConnectError`, `httpx.HTTPStatusError`, and `httpx.TimeoutException` — failure modes a self-hosted dependency introduces that a hosted API mostly doesn't — mapping them to 502/504 instead of leaving them uncaught. Deduplicated the `parse_json_response` helper (an existing, documented tech-debt item) into a shared `util.py` while both files were already being touched for the swap. Also had to bump several dated dependency pins in `requirements.txt` (`fastapi`, `uvicorn`, `pydantic`, `python-dotenv`, `httpx`) — the old `pydantic` pin had no prebuilt wheel for a current Python and failed building from source, so the service was actually uninstallable before this fix, not just outdated.
- **Result:** `python -m py_compile` passes on every changed file, a clean `pip install -r requirements.txt` succeeds on a fresh Python 3.14 venv (it didn't before), the FastAPI app imports and all three routes still register, and the deterministic pieces are unit-tested — PDF rasterization against a real synthetic PDF, image passthrough, and `parse_json_response` against both fenced and unfenced JSON. **What this result does not include:** an actual end-to-end call to a running Ollama server. Ollama isn't installed in this environment, so the real `/api/chat` response shape, the JSON-mode reliability of `llama3.2-vision`, and actual summary/parsing quality are all still unverified. This is honestly an "implemented and code-verified, not yet runtime-verified" story, not a "shipped and proven" one — see the "Why Ollama over the Claude API?" row in Section 14 for the fuller cost/privacy/trade-off writeup.

---

## 5. Technical Skills Demonstrated

| Skill | Current level | Basis |
|---|---|---|
| Relational schema design | Intermediate | Real, evaluated schema: enums, FKs, a DB-level uniqueness constraint used deliberately to enforce a business rule, purposeful indexes |
| Service/API architecture planning | Intermediate | Real three-service split with a deliberate boundary (server never calls the LLM provider directly); documented tradeoffs (see Section 14) |
| Express/Node backend development | Beginner/Scaffolding stage | Routes, middleware, controllers exist and issue real parameterized SQL, but validation, auth edge cases, and error handling are inconsistent |
| React/frontend development | Beginner/Scaffolding stage | Pages and components exist and call real APIs, but most lack loading/error states and there's no shared data layer |
| FastAPI/Python AI integration | Beginner/Scaffolding stage | Two working endpoints with real prompts, migrated from the Claude API to a local Ollama model (2026-08-17); error handling since broadened to cover connection/timeout failures and the duplicated JSON-parsing helper was extracted into a shared `util.py`, but there's still no auth on either endpoint, and the new backend hasn't been runtime-verified against a live Ollama server |
| Authentication/authorization design | Beginner/Scaffolding stage | JWT + bcrypt wired correctly for the happy path; role selection on registration and appointment ownership checks were identified as gaps and have since been fixed (see Story 4) |
| Real-time systems (Socket.IO) | Beginner/Scaffolding stage | Working auth-on-handshake chat, but no error handling in the message handler and no horizontal-scaling story (no Redis adapter) |
| Testing | Not started | Zero test frameworks installed in any of the three services |
| DevOps/deployment | Not started | No CI, no deployment target chosen, no containerization evident |

---

## 6. Skill Impact

- **Schema design:** Evidenced directly — the choice to enforce no-double-booking via a `UNIQUE` constraint (rather than an app-level check-then-insert, which is race-prone) shows an understanding of concurrency correctness at the data layer.
- **Service/API architecture planning:** Evidenced directly — the decision to keep all LLM connection details and calls (originally the Anthropic API key and Claude calls, now `OLLAMA_BASE_URL`/`OLLAMA_MODEL` and calls to a local Ollama server as of the 2026-08-17 migration) confined to `ai-service`, with the Express server acting as a proxy, shows deliberate boundary-drawing between "core transactional API" and "LLM-integration surface." That boundary held up unchanged across the provider swap — no server-side code needed to change.
- **Backend feature development, frontend UX, AI-prompt engineering, real-time systems hardening, security engineering, test engineering, deployment:** **TBD.** No evidence yet beyond initial wiring; these will have real impact statements once feature work, bug fixes, and hardening actually happen.

---

## 7. Engineering Skills

- **Demonstrated now:** data modeling with explicit invariants, drawing a service boundary around an external AI dependency (originally the third-party Claude API, now a self-hosted Ollama model) to limit blast radius, applying RBAC consistently across both client and server route layers, reading and following a stack's idiomatic patterns (parameterized `pg` queries, Express middleware chaining, FastAPI routers).
- **Not yet demonstrated:** debugging under real load or real user reports, writing and maintaining automated tests, performance tuning against real data volume, incident response, code review of others' work, CI/CD pipeline design. All marked TBD honestly rather than inferred from the scaffold.

---

## 8. Before vs. After

There is no "before" state to compare against — this is the first pass at the codebase, generated as a scaffold in a single session with no prior iteration. A before/after comparison would require either (a) a prior version of this project, or (b) enough elapsed development time to compare early vs. current code quality. **This section should be filled in retrospectively** once there has been at least one real round of implementation, review, and revision to compare against the current scaffold.

---

## 9. Project Impact

**No users. No deployment. No measured impact.** This is explicitly pre-launch scaffolding: three services that boot locally against documented `.env.example` files, a schema that has never been loaded against production data, and zero automated verification of any kind (per the canonical review, no test framework is installed in any of the three services). Any impact statement beyond "the architecture and core happy paths are wired end-to-end" would be fabricated. Section 10 keeps resume language scoped accordingly — capability statements only, no outcome or adoption claims.

---

## 10. Resume Bullets

Only claims that are true right now, with no invented metrics:

- Designed a normalized PostgreSQL schema for a healthcare appointment platform, including a database-level `UNIQUE` constraint that prevents doctor double-booking at the data layer rather than in application code.
- Architected a three-service full-stack system (React/Vite, Node/Express + PostgreSQL, Python/FastAPI + a self-hosted Ollama LLM) that isolates all LLM/AI integration behind a dedicated service, keeping the core transactional API free of direct AI-provider dependencies — a boundary that held up unchanged when the AI backend was later swapped from a paid Claude API to local Ollama.

*(Deliberately limited to two bullets — anything more would require claiming completed features, test coverage, or usage that doesn't exist yet.)*

---

## 11. LinkedIn / Portfolio Description

**Short (one line):**
"Building a full-stack healthcare appointment and patient-portal platform (React, Express, PostgreSQL, FastAPI, Ollama) — currently in early/scaffolding stage."

**Medium (2–3 sentences):**
"In-progress project: an AI-assisted healthcare appointment and patient portal. Architecture is a three-service split — React/Vite frontend, Express/PostgreSQL backend, and a dedicated FastAPI service wrapping a local Ollama LLM (migrated from the Claude API on 2026-08-17) for document summarization and search assistance — with a schema designed to enforce no-double-booking at the database level. Currently a working scaffold with core flows wired end-to-end; validation, authorization hardening, and test coverage are in progress."

**Detailed (portfolio write-up):**
"This is an early-stage, actively-developed project exploring how to combine a conventional transactional healthcare backend with an isolated LLM-integration layer. The system lets patients search for doctors, book appointments, upload medical documents, and chat with providers in real time, with a separate Python/FastAPI service handling Ollama-backed document summarization and natural-language search assistance (migrated from the Claude API on 2026-08-17) so the core Node/Express API never talks to the LLM provider directly. The PostgreSQL schema enforces double-booking prevention via a database constraint rather than application logic. As of this writing the project is a scaffold — most core flows are wired end-to-end and functional on the happy path, but input validation, authorization edge cases (documented below), and automated testing are still being built out. Not yet deployed; no users yet."

---

## 12. Common Interview Questions

**Beginner**
1. What does each of the three services in this project do?
2. Why did you use PostgreSQL instead of a NoSQL database here?
3. How does JWT authentication work in this app?
4. What's the difference between the `patient`, `doctor`, and `admin` roles and how are they enforced?
5. Walk me through what happens when a patient books an appointment.

**Intermediate**
1. Why is there a `UNIQUE (doctor_id, starts_at)` constraint instead of checking for conflicts in the controller before inserting?
2. Why did you split the AI/Ollama integration into its own FastAPI service instead of calling the LLM directly from the Express server?
3. How does real-time chat work, and what would break it under concurrent load or a server restart?
4. What happens today if two different roles (patient vs. doctor) both call `PATCH /api/appointments/:id/status` on an appointment that isn't theirs?
5. Why JWT + bcrypt instead of server-side sessions for this app?

**Advanced**
1. The registration endpoint used to let a client choose `role: "admin"` (fixed 2026-08-17 by restricting to `patient`/`doctor`). Admin accounts still have no dedicated provisioning path — how would you design one without reopening that gap or requiring a direct database write every time?
2. `ai-service`'s `/summarize` endpoint used to fetch an arbitrary client-supplied URL with no restriction (fixed 2026-08-17 with a `res.cloudinary.com`-only allowlist, checked before any fetch). What are the limits of a domain-allowlist approach to SSRF versus private-IP blocking or a signed-URL scheme, and what happens to this specific fix if the storage backend ever changes away from Cloudinary?
3. `ai-service`'s Ollama client (`ollama_client.py`, a thin `httpx`-based wrapper — it replaced the `anthropic` SDK in the 2026-08-17 migration) makes HTTP calls inside `async def` route handlers. If those use a synchronous `httpx.Client` rather than `httpx.AsyncClient`, what's the concrete performance consequence under concurrent requests, and how would you fix it?
4. How would you evolve `schema.sql` into a versioned migration strategy without downtime, given there's currently a single hand-written file and no migration tool?
5. If you needed to run more than one instance of the Express server for the Socket.IO chat feature, what would break, and what would you add to fix it?

---

## 13. Answers to Interview Questions

### Q1: Why a `UNIQUE (doctor_id, starts_at)` constraint instead of an application-level check?
- **Short answer:** Because a check-then-insert in application code has a race window; a database constraint doesn't.
- **Detailed answer:** If two requests to book the same doctor at the same start time arrive concurrently, an application-level "query for conflicts, then insert if none found" pattern can let both requests pass the check before either insert commits — resulting in a double-booking. A `UNIQUE` constraint at the database level guarantees that whichever insert commits second will fail with a constraint violation, which the controller then maps to an HTTP 409, regardless of request timing or how many server processes are running.
- **Project evidence:** `server/src/models/schema.sql` — `CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)` on the `appointments` table.
- **Follow-up they might ask:** "What does the client/server actually do with that constraint violation today?" Honest answer: the booking controller maps it to a 409, but the *global* Express error handler still returns raw Postgres error text for any conflict case that isn't specifically caught elsewhere — a known gap (see Section 16).

### Q2: Why isolate the AI/Ollama integration into a separate FastAPI service?
- **Short answer:** To keep the LLM provider's connection details (originally an Anthropic API key, now `OLLAMA_BASE_URL`/`OLLAMA_MODEL`) and all LLM-specific logic out of the core transactional API, and to use Python's stronger ecosystem for that kind of integration work.
- **Detailed answer:** The core backend (auth, appointments, documents, chat, admin stats) is a fairly conventional CRUD API best served by the team's primary Node/Express stack. The AI features (natural-language search parsing, document summarization) are a distinct concern with different dependencies (originally the `anthropic` SDK; now a thin `httpx`-based Ollama client, `ollama_client.py`, as of the 2026-08-17 migration), different failure modes (LLM latency, rate limits, malformed model output — and, since the migration, also Ollama connection failures and timeouts), and arguably different security requirements (the endpoint that handles patient medical documents). Putting that behind its own FastAPI service means the Express server proxies to it over HTTP rather than embedding LLM calls directly in Express controllers.
- **Project evidence:** `ai-service/main.py`, `ai-service/ollama_client.py`, `server/src/controllers/document.controller.js` (`fetch(`${process.env.AI_SERVICE_URL}/summarize`, ...)`).
- **Follow-up they might ask:** "Is that boundary actually enforced, security-wise?" As of 2026-08-17 (later same day as the Ollama migration): yes — `ai-service/auth.py`'s `require_service_token` dependency gates both `/assistant/query` and `/summarize` behind a shared `AI_SERVICE_TOKEN` bearer token, sent by the server on every call. Before that fix, the honest answer was no; see `docs/DECISIONS.md` ADR-009 for why a shared bearer token was chosen over JWT or mTLS.

### Q3: How does JWT-based auth and role enforcement work here?
- **Short answer:** Login issues a signed JWT containing the user's identity/role; `requireAuth` verifies it per request, `requireRole` gates specific routes.
- **Detailed answer:** `auth.controller.js` verifies the submitted password against a bcrypt hash and signs a JWT on success. `auth.middleware.js`'s `requireAuth` verifies the token on protected routes and attaches the decoded payload to `req.user`; `requireRole(role)` is a middleware factory used on routes like the doctor-profile upsert (`requireRole("doctor")`) and admin stats (`requireRole("admin")`). The same JWT is passed to Socket.IO's handshake `auth.token` for chat, so one token authenticates both REST and real-time.
- **Project evidence:** `server/src/middleware/auth.middleware.js`, `server/src/routes/*.routes.js`, `server/src/socket/socket.js`.
- **Follow-up they might ask:** "What happens if the JWT secret is left at its default?" Honest answer: `.env.example` ships `JWT_SECRET=change-me` with nothing in code that enforces a stronger value at startup — a documented risk, not yet fixed.

### Q4: What's the current state of authorization on appointment mutation endpoints?
- **Short answer:** Fixed — only the appointment's patient, its doctor, or an admin can mutate it.
- **Detailed answer:** `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` were originally behind `requireAuth` only — the controller ran `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *` with no clause tying `$2` to `req.user.id`, so any logged-in user could mutate any appointment by ID (a textbook IDOR). I added a `getAppointmentAccess(appointmentId, user)` helper that resolves the appointment's `patient_id` and its doctor's `user_id` (joining through `doctor_profiles`) and returns 403 unless the caller is the patient, the doctor, or an admin.
- **Project evidence:** `server/src/controllers/appointment.controller.js` (`getAppointmentAccess`), `server/src/routes/appointment.routes.js`.
- **Follow-up they might ask:** "How did you verify it?" Only with `node --check` (syntax) — no test database was available in this environment, so an integration test asserting a non-owner gets 403 is a tracked follow-up (`docs/PROJECT_PLAN.md`, N4), not yet written.

### Q5: Why Socket.IO instead of raw WebSockets for chat?
- **Short answer:** Socket.IO gives room-based broadcasting, handshake-time auth, and reconnection handling out of the box.
- **Detailed answer:** Doctor-patient chat needs bidirectional low-latency messaging plus a typing indicator, which benefits from Socket.IO's built-in rooms and event model rather than hand-rolling connection management, reconnection, and message framing over raw WebSockets.
- **Project evidence:** `server/src/socket/socket.js`, `client/src/services/socket.js`, `client/src/components/Chat/ChatWindow.jsx`.
- **Follow-up they might ask:** "What breaks if you scale to two server instances?" Honest answer: there's no Socket.IO adapter (e.g. Redis) configured, so messages broadcast on one instance wouldn't reach a client connected to another instance — a known scalability gap, not yet addressed.

### Q6: Why Cloudinary for file storage when the README also mentions S3?
- **Short answer:** Cloudinary is what actually got wired up during scaffolding — likely for faster setup with no bucket/IAM configuration needed.
- **Detailed answer:** `server/src/config/cloudinary.js` configures the Cloudinary SDK from `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, and `document.controller.js` uploads through it. The README's stack table still lists S3 as an option, which is a documentation/reality mismatch worth resolving one way or the other.
- **Project evidence:** `server/src/config/cloudinary.js`, `server/.env.example`.
- **Follow-up they might ask:** "Any risk tying file URLs to a third-party service?" There was — `ai-service`'s `/summarize` used to fetch whatever `fileUrl` it was given with no domain allowlist (an SSRF risk, documented in Section 16). Fixed 2026-08-17: `fileUrl` must now resolve to `res.cloudinary.com` — the only host documents are ever actually uploaded to — or the request is rejected before any fetch is attempted. That fix is tightly coupled to the Cloudinary decision, though: if the storage backend ever changes (see ADR-007's still-open Cloudinary half), the allowlist needs updating too.

### Q7: What's missing before this could go to production?
- **Short answer:** All four originally-flagged critical access-control gaps are fixed (admin self-registration, appointment IDOR, ai-service auth, ai-service SSRF); what's left is mainly a test suite — nothing from today's fixes has automated regression coverage.
- **Detailed answer:** See Section 16 for the full, prioritized list drawn from the canonical review's `criticalIssues` and `technicalDebt`, updated to reflect both same-day rounds of fixes (2026-08-17).
- **Project evidence:** Canonical synthesis `criticalIssues` array (this document's ground truth).
- **Follow-up they might ask:** "Which one would you fix first and why?" The public self-registration-as-admin bug — it's a full privilege-escalation path reachable by any unauthenticated caller, and the fix (restrict `VALID_ROLES` accepted from the request body) is small and low-risk to ship.

---

## 14. "Why Did You Choose X?"

| Choice | Context | Options considered | Reason | Consequence / tradeoff accepted |
|---|---|---|---|---|
| **Three-service split** (React / Express+Postgres / FastAPI+Ollama) | Needed both a conventional CRUD backend and LLM-backed features that benefit from Python's AI tooling | Single Node monolith calling the LLM provider directly; single Python backend for everything; the chosen split | Keeps the core backend in the team's primary stack while isolating LLM integration where prompt handling and the provider-specific client are most natural — originally the Anthropic SDK, now a thin Ollama `httpx` client, swapped on 2026-08-17 without touching this decision | Adds a network hop and a deployment unit with its own env vars/CORS; that hop is currently unauthenticated, and the server-side fetch to it has no timeout |
| **Ollama (self-hosted local LLM) over the Claude API** (2026-08-17, post-scaffolding) | ADR-007 (`docs/DECISIONS.md`) flagged the paid, per-token Claude API — which receives patient-supplied medical documents — as a cost and privacy concern alongside Cloudinary, and agreed in principle to move to free/open-source alternatives without yet scoping the work; this migration implements the Claude half | Stay on the Claude API; a text-only local model (drops image/scanned-PDF support); a vision-capable local model served via Ollama (`llama3.2-vision`) | No more per-token API billing; patient-supplied documents (images/PDFs) now go only to whichever machine runs Ollama — infrastructure the operator controls — instead of leaving that infrastructure to reach a third-party API; `llama3.2-vision` keeps one model serving both the text (search-filter parsing) and image/PDF (summarization) workloads, preserving the multimodal capability Claude provided | Deployment now needs a reachable Ollama instance with real RAM/VRAM (an ~11B vision model realistically needs 8GB+ RAM or a GPU for usable latency) — free-tier PaaS hosting is unlikely to have that, and this is a new, unsolved deployment question; a local model's output quality and JSON-mode reliability are very unlikely to match Claude's; and none of this has been runtime-verified against a live Ollama server in this environment — code compiles and installs cleanly and the deterministic logic (PDF rasterization, JSON parsing) is unit-tested, but the actual LLM round-trip is unverified |
| **PostgreSQL `UNIQUE` constraint for double-booking** | Must guarantee no two patients book the same doctor/time slot, even under concurrent requests | Application-level check-then-insert (race-prone); a NoSQL store; DB-level `UNIQUE` constraint | A `UNIQUE` constraint is race-safe by construction — concurrent inserts for the same doctor/time will always have exactly one winner | Conflicts surface as a Postgres constraint violation the controller maps to 409, but the global handler still leaks raw Postgres text for unhandled cases |
| **Stateless JWT + bcrypt** | Need to authenticate patients/doctors/admins across REST and a separate Socket.IO connection with no shared session store | Server-side sessions (e.g. Redis-backed `express-session`) vs. stateless JWTs | JWTs avoid a shared session-store dependency and work uniformly across `requireAuth` middleware and the Socket.IO handshake (`auth.token`) | No server-side revocation — a compromised token stays valid until expiry (`JWT_EXPIRES_IN=7d`), and `JWT_SECRET` currently defaults to the placeholder `change-me` |
| **Socket.IO for chat** | Need low-latency bidirectional messaging plus typing indicators | Raw WebSocket server; HTTP long/short-polling; Socket.IO | Room-based broadcasting, handshake auth, and reconnection handling out of the box, reducing custom realtime plumbing | `message:send` has no try/catch around its DB write, and there's no Redis adapter, so this won't scale past one server instance without more work |
| **Cloudinary for file storage** | Need durable, URL-retrievable storage for uploaded medical documents, usable by both the app and the ai-service's fetch | Cloudinary, Amazon S3 (both listed in the README stack table), or local/server-disk storage | Cloudinary was the one actually wired up (`server/src/config/cloudinary.js` + env vars) — likely chosen for faster setup with no bucket/IAM configuration during scaffolding | README still lists S3 as an alternative, a doc/reality mismatch; ties file URLs to a third-party service — `ai-service`'s fetch from that service now has a matching domain allowlist (`res.cloudinary.com` only, added 2026-08-17), which is itself coupled to this decision and would need updating if the storage backend ever changes |

---

## 15. "What Was the Hardest Part?"

Honestly: **implementation hasn't happened yet, so there isn't a real "hardest part" story to tell.** The closest thing to a genuine design decision that required weighing tradeoffs was reasoning through *where* to enforce the no-double-booking rule — application layer vs. database layer. The application-level option (query for existing appointments, then insert if clear) is simpler to reason about locally but has a race window under concurrent requests; the database-level `UNIQUE (doctor_id, starts_at)` constraint is slightly less visible in application code but is correct under concurrency by construction. That's a legitimate, defensible decision made during scaffolding — it's just not a "hardest part" in the sense of a debugged production incident, because none has happened yet.

---

## 16. "What Would You Improve?"

Drawn directly from the canonical review's critical issues and technical debt — this is the honest, substantive part of this guide:

| Limitation | Why it exists | How I'd improve it | Priority | Expected benefit |
|---|---|---|---|---|
| ~~`POST /api/auth/register` accepted client-supplied `role`, including `admin`~~ — **fixed** | Scaffold-stage shortcut — no role restriction had been added yet | Done: accepted roles restricted to `patient`/`doctor`. Still open: admin accounts have no out-of-band provisioning path (seed script or internal-only flow) | Medium (remaining half) | Closed a full privilege-escalation path reachable by any unauthenticated caller |
| ~~Appointment `status`/`reschedule` endpoints had no ownership check (IDOR)~~ — **fixed** | Only `requireAuth` was applied; per-resource ownership check had never been added | Done: added `getAppointmentAccess()` tying the target appointment to `req.user.id` (as patient, assigned doctor, or admin) | — | Prevented any authenticated user from mutating another user's appointment |
| ~~`ai-service` has zero authentication on any route~~ — **fixed** | It was scaffolded as an internal-only service without a trust boundary being implemented | Done (2026-08-17): added a shared-secret bearer-token check (`AI_SERVICE_TOKEN`, `ai-service/auth.py`) on requests from the Express server | — | Closed the gap between "architecturally separate" and "actually protected," especially since it processes patient medical documents |
| ~~`/summarize` fetches an arbitrary client-supplied `fileUrl` with no allowlist (SSRF risk)~~ — **fixed** | No domain/IP validation was added when the fetch was wired up | Done (2026-08-17): added a domain allowlist (`res.cloudinary.com` only, the actual configured host) checked before any fetch is attempted | — | Removed a server-side request forgery vector on an endpoint that touches sensitive documents |
| Zero automated tests in all three services | No test framework was installed during scaffolding | Add Vitest (client), a Node test runner or Jest (server), and pytest (ai-service); start with the two authorization gaps above as the first integration tests | High | Makes future refactors safe and gives objective proof the two known vulnerabilities are actually fixed |
| `JWT_SECRET=change-me` placeholder with nothing enforcing a stronger value | `.env.example` ships a placeholder and nothing validates it at startup | Fail fast at server boot if `JWT_SECRET` is unset or equals the placeholder | Medium | Prevents accidentally deploying with a guessable signing secret |
| No rate limiting on `/api/auth/login`, `/api/auth/register`, or the Ollama-backed ai-service endpoints | Not added during scaffolding | Add `express-rate-limit` on auth routes and a rate limiter in front of the Ollama-backed endpoints | Medium | Reduces brute-force/credential-stuffing exposure and unbounded compute load on the local Ollama server (no longer a per-token billing risk post-2026-08-17 migration, but still a resource-exhaustion risk) |
| Global Express error handler returns raw `err.message` to clients | Simplest possible error handler was written first and never revisited | Log full error detail server-side only; return a sanitized, generic message to the client | Medium | Prevents leaking internal error/constraint text (e.g. Postgres FK violations) to callers |
| No pagination on any list endpoint (appointments, documents, chat history, doctor search) | Not needed yet at zero data volume | Add limit/offset or cursor pagination before real data accumulates | Medium | Avoids unbounded result sets and slow queries as usage grows |
| No centralized input validation (server ad hoc, e.g. `bookAppointment` never checks `startsAt < endsAt`) | Validation was written per-controller without a shared library | Introduce `zod` or `express-validator` on the server; extend the existing pydantic models on ai-service | Medium | Consistent, testable validation instead of scattered ad hoc checks |
| ~~`ai-service`'s `parse_json_response` was duplicated verbatim across two files~~ — **fixed** | Copy-pasted while building the second endpoint | Done: extracted into a shared `util.py` module as a side effect of the 2026-08-17 Ollama migration (both `assistant.py` and `summarizer.py` were already being rewritten for the client swap, so deduplicating was low-cost) | — | Removed drift risk between the two copies |
| ~~Synchronous Anthropic SDK calls inside `async def` FastAPI handlers~~ — **fixed** | The sync SDK client was used directly without thread offload | Done: the `anthropic` SDK is gone entirely; `ollama_client.py`'s `chat_json()` uses `async with httpx.AsyncClient(...)` and `await client.post(...)` — confirmed genuinely non-blocking by direct code inspection | — | Event loop is no longer blocked by LLM calls under concurrent requests |
| Client has no response interceptor / centralized 401 handling | `services/api.js` only implements a request interceptor for the Bearer token | Add a response interceptor that detects 401s and forces a clean logout/redirect | Medium | Consistent behavior on token expiry instead of silent per-request failures |
| Most client page fetches use `.then()` with no `.catch()` and no loading state | Written as the fastest path to a working demo | Add `.catch()` + a visible error state and loading indicator to every data-fetching page/component | Medium | Failures become visible instead of an infinite "Loading..." or silently-empty list |
| No CI, no chosen deployment target | Not addressed yet — this is local-dev-only so far | Add a CI workflow (lint + test once tests exist) and pick a deployment target/containerization strategy | Low (until tests exist) | Establishes a repeatable, verifiable path to shipping |

---

## 17. "What Did You Learn?"

- **Technical:** Enforcing a business invariant (no double-booking) at the database layer via a `UNIQUE` constraint is both simpler and more correct under concurrency than an application-level check-then-insert — this was a concrete, applied lesson from designing `schema.sql`.
- **Architecture:** Drawing a service boundary around an external AI dependency (originally the third-party Anthropic API, now a self-hosted Ollama server) limits which parts of the system need that dependency's credentials/connection details and failure modes, and makes it possible to reason about the AI layer's security/authz needs separately from the core API. The 2026-08-17 provider swap tested this lesson concretely: the LLM client, its error handling, and even how documents get prepared (PDF rasterization) all changed, and zero lines outside `ai-service` needed to change — even though the boundary still isn't fully enforced (ai-service has no auth), the *reasoning* for why it should be a separate service held up under a real change, not just in theory.
- **Product:** Naming and scoping the AI layer explicitly as "assists... does not replace doctors" (per the README) forces a design conversation about where LLM output can and can't be trusted — relevant to how `/assistant/query` and `/summarize` should eventually validate and sanitize model output before it reaches patients or clinicians.
- **Engineering process:** TBD — no real iteration, code review, or debugging cycle has happened yet to draw a process lesson from.
- **Professional:** TBD — same reason; this section needs actual project history to be honest.

---

## 18. Interview Strength Score

Scored honestly against the current scaffold — not against the project's eventual potential. Where the canonical review scored a category directly, that score is carried over; other axes are estimated conservatively from the same evidence.

| Dimension | Score (0–10) | Note |
|---|---|---|
| Technical depth | 3 | Real schema/service-boundary reasoning exists; no deep feature-level engineering yet |
| Architecture | 7.5 | Matches canonical review (updated 2026-08-17) — clean 3-service split with a trust boundary that's now actually enforced (shared bearer token between server and ai-service, added same day) |
| Problem-solving | 3 | Evidenced only at the design-decision level (double-booking constraint); no debugging history |
| Real-world relevance | 5 | Realistic domain and feature set, but nothing has touched real users or real data |
| Complexity | 5 | Three coordinated services plus an LLM integration is non-trivial to reason about, even at scaffold stage |
| Code quality | 5.5 | Matches canonical review — consistent patterns where implemented, but duplication and no linter anywhere |
| Testing | 0 | Matches canonical review — zero test frameworks installed in any of the three services |
| Deployment | 0 | Nothing has been deployed; no CI, no chosen hosting target |
| Scalability | 3.5 | Matches canonical review — stateless JWT is scalability-friendly, but no pagination, no Socket.IO adapter, no caching |
| Security | 5 | Matches canonical review, updated 2026-08-17 — all four originally-flagged critical access-control gaps are now fixed (admin self-registration, appointment IDOR, ai-service auth, ai-service SSRF); a placeholder JWT secret and no rate limiting remain open |
| UI/UX | 4 | Matches canonical review — flows are wired but most pages lack loading/error states |
| Documentation | 9 | Matches canonical review — README and this doc suite are thorough and honest about status |
| Demonstration potential | 2 | Nothing is deployed or runnable end-to-end with real data in front of an interviewer yet |
| Resume value | 3 | Only architecture/schema-design claims are currently defensible (Section 10) |
| Learning value | 6 | Good scope for learning full-stack + AI-integration patterns going forward, independent of current completeness |

**Strongest interview areas:** schema design and the reasoning behind the double-booking constraint; service-boundary/architecture reasoning for isolating the AI layer; documentation discipline (this guide and the README are both explicit about status and gaps rather than overstating them).

**Weakest areas:** zero test coverage (including for all four security fixes made today — no test database or live Ollama server was available to write real integration tests against); not deployed anywhere (and self-hosting Ollama in production is a real, unsolved resource/hosting question — see `docs/DEPLOYMENT.md`); no real business-logic depth yet (most controllers are the minimum needed to prove the wiring works); client UI has no loading/error handling on most pages.

**Areas to improve before presenting this project in an interview:** add automated tests proving the four fixed access-control gaps (admin self-registration, appointment IDOR, ai-service auth, ai-service SSRF) actually stay fixed — none of them have regression coverage yet; take at least two or three features (e.g. appointment booking + document summarization) fully through validation, error handling, and a test suite so there's a real "before/after" and a real debugging story to tell; add basic loading/error UI to the client dashboards; verify the Ollama integration against a real running model instead of code-only checks; only then is this ready to walk an interviewer through as more than an architecture exercise.

---

## 19. Personal Skill Growth Summary

- **Before:** TBD — no prior version of this project exists to compare against.
- **During (this scaffolding session):** Practiced translating product requirements (patients/doctors/admins, booking, documents, chat, AI assist) into a relational schema and a service-boundary decision, and wiring role-based access control consistently across a REST API, a Socket.IO layer, and a React route guard.
- **Current:** Comfortable reasoning about schema invariants (constraints vs. app-level checks) and about where to draw a service boundary around a third-party AI dependency; not yet exercised on debugging, testing, or hardening a real feature under load or adversarial input.
- **Major skills developed:** Relational schema design with explicit invariants; multi-service architecture planning; consistent RBAC wiring across client and server.
- **Skills still needing improvement:** Input validation discipline, authorization edge-case coverage, automated testing (all three stacks), production error handling, deployment/CI, client-side loading/error UX patterns. All of these are visible as concrete gaps in Section 16 rather than abstract self-assessment.

---

## 20. Project Story

- **Idea:** A unified healthcare portal — patients discover doctors, book appointments, manage documents, get reminders, and chat with providers, with an AI layer that assists (summarization, search) but doesn't replace clinical judgment.
- **Problem:** Coordinating appointments and documents across patients/doctors/admins typically lacks a single real-time, structured channel; an LLM can help with document summarization and natural-language search without being handed decision-making authority.
- **Planning:** Modeled the domain as seven tables (`users`, `doctor_profiles`, `doctor_availability`, `appointments`, `documents`, `messages`, `reminders`) with enums for role and appointment status, and planned three cooperating services rather than a monolith.
- **Architecture:** Implemented as documented in Section 3 — React/Vite client, Express/PostgreSQL server, FastAPI/Ollama ai-service (migrated from the Claude API on 2026-08-17), with the server proxying all AI calls rather than calling the LLM provider directly.
- **Implementation:** Mostly *upcoming* — most controllers still implement the minimum needed to prove the wiring works end-to-end; deeper business logic (input validation, reminders) is not yet built. Two real slices of implementation have happened: the two authorization gaps found in review were fixed, and the AI backend was migrated off Claude to a local Ollama model with its own security hardening (see below).
- **Challenges:** Two real challenges faced so far — see Story 4 in Section 4: finding and closing a privilege-escalation gap (public self-registration as admin) and an IDOR (appointment mutation with no ownership check); and closing ai-service's authentication and SSRF gaps (see ADR-009) without a live Ollama server available to test against.
- **Debugging:** *Upcoming* — no debugging-under-load or adversarial-input history exists yet; every fix so far was identified by structured code review, not by reproducing a failure.
- **Testing:** *Upcoming* — no test framework is installed in any service yet; every fix made today is syntax-checked/smoke-tested only (`node --check`, an in-process `TestClient`), not covered by a committed automated test — no test database or live Ollama server was available in this environment.
- **Deployment:** *Upcoming* — no deployment target or CI pipeline chosen yet; self-hosting Ollama in production is a real, unsolved resource/hosting question (see `docs/DEPLOYMENT.md`).
- **Improvements made:** All four originally-flagged critical access-control issues from the canonical review are now fixed (admin self-registration, appointment IDOR, ai-service authentication, ai-service SSRF — see `docs/CHANGELOG.md`). The remaining critical issue (zero automated tests) and the rest of Section 16 are still tracked as planned, not done.
- **Current state:** A working local-only scaffold where the core happy paths (register/login, doctor search, booking with conflict prevention, document upload, AI summarization round-trip, chat, admin stats) are wired end-to-end, all four critical access-control vulnerabilities are fixed, and the AI layer runs on a self-hosted Ollama model instead of a paid API. Zero automated tests remain the single biggest gap — none of today's fixes have regression coverage.
- **Future vision:** Build out the `reminders` feature (currently just a database table with no code), add automated tests across all three services (starting with today's fixes, to lock them in), migrate off Cloudinary to a free/open-source alternative (the Claude-API half of ADR-007's direction was completed via the 2026-08-17 Ollama migration — see Story 6 in Section 4; the Cloudinary half remains agreed but unscoped — see `docs/DECISIONS.md` ADR-007), verify the Ollama integration against a real running model, and add pagination/caching/loading-state polish before considering this presentable as a finished product. See `docs/FUTURE_FEATURES.md` for the longer-term roadmap.

---

## 21. Closing Note

**This guide follows the rule that project narratives must never exaggerate.** Every status, score, and claim above is scoped to what the code in this repository actually demonstrates as of 2026-08-14, roughly one hour after the scaffold was generated: real schema and architecture decisions, real happy-path wiring across three services, and — just as importantly — real, named gaps (two unresolved authorization vulnerabilities, zero test coverage, no deployment). Sections that would normally hold STAR stories, before/after growth, or measured impact are explicitly marked "Not yet available" rather than invented, because no lived implementation, debugging, or user history exists yet to fill them honestly.

**Treat this file as a living document, not a one-time artifact.** Revisit and update it as real development happens — particularly Sections 3 (Technical Challenges), 4 (additional STAR stories), 8 (Before vs. After), 9 (Project Impact), 15 (Hardest Part), 17 (What Did You Learn), and 20 (Implementation → Deployment) — so that by the time this project is used in an actual interview, every claim in it is still backed by something a reviewer could point to in the code or in test results, not by aspiration.
