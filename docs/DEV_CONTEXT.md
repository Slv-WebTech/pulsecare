# Developer Context — Healthcare Appointment & Patient Portal

Last updated: 2026-08-17 (see update note below; original scaffold assessment was 2026-08-14)
Maintained for: continuity across development sessions. Read this file first when picking up work on this repo.

> **Update (same day, later session):** The two most severe security gaps listed in
> Section 7 (admin self-registration, appointment IDOR) have been fixed. See the
> changelog entry below and the updated Section 7/10. A separate direction has also
> been agreed with the product owner: **swap paid third-party services for free/
> open-source alternatives** (self-hosted file storage instead of Cloudinary, and a
> free/open-source or locally-run LLM instead of the paid Claude API for document
> summarization and search-filter parsing). This has **not** been implemented yet —
> it needs its own scoping pass (see Section 10, item 0) — but it supersedes the
> Cloudinary/Claude decisions recorded in `docs/DECISIONS.md` as the long-term
> direction. Do not add new Cloudinary- or Claude-specific code without checking
> whether this migration has started.

> **Update (2026-08-17 session):** The **Claude-half** of the migration described
> above is now **done** — `ai-service` calls a local Ollama server instead of the
> Claude API. See the new 2026-08-17 entry in Section 4 for what changed and how it
> was verified, Section 5 for the updated file inventory, and Section 12 for the
> updated `ai-service/.env.example`. The **Cloudinary/storage half is still not
> started** — `server/src/config/cloudinary.js` and `document.controller.js`'s
> upload path are untouched. Section 10, item 0 has been split to reflect this.

> **Update (2026-08-17 session, continued):** `ai-service` is now also secured —
> both routes require a shared bearer token (`AI_SERVICE_TOKEN`), and `/summarize`
> has an SSRF domain allowlist plus a streaming 10MB file-size cap. This closes the
> last of the four originally-flagged critical access-control gaps. See the second
> 2026-08-17 entry in Section 4, and the updated Section 7 (item 3 is now fixed).

---

## 1. Current Objective

Finish filling in the real business logic behind the scaffold. The three services (client, server, ai-service) and the database schema are wired end-to-end so each layer talks to the next, but — per the project's own README — "business logic, validation, and the real LLM prompts still need to be filled in per feature." Several endpoints have functional gaps or outright missing authorization checks (see Section 7).

## 2. Current Development Phase

**Post-scaffold, pre-implementation — documentation baseline just established.**

This is a freshly generated scaffold, not a mature codebase. The project directory is **not** a git repository (no `.git` folder). All files were created within roughly the last hour (timestamps ~17:14–17:22 on the day this scaffold was generated). This `docs/` suite (of which this file is a part) is the first documentation pass over that scaffold.

## 3. Current Task

None in progress. Awaiting the next feature request. See Section 11 for the ranked list of recommended next actions.

## 4. Recently Completed Work

Initial 3-service scaffold, generated in a single pass:

- **client** — React + Vite SPA with routing, auth context, and role-gated dashboards, wired to the server's REST API and Socket.IO.
- **server** — Express + PostgreSQL API covering auth, doctor search, appointments, documents, chat, and admin stats, plus a Socket.IO layer for real-time chat.
- **ai-service** — FastAPI microservice wrapping the Claude API for two features: natural-language doctor-search-filter parsing and AI document summarization.
- **DB schema** (`server/src/models/schema.sql`) — full relational schema: `users`, `doctor_profiles`, `doctor_availability`, `appointments`, `documents`, `messages`, `reminders`, plus enums and indexes.

Each layer talks to the next (client → server → ai-service, server → Postgres), but per the README this is explicitly a stub-level scaffold, not finished business logic.

**Same-day follow-up session:** fixed the two most severe security gaps identified in the baseline assessment:
- `server/src/controllers/auth.controller.js` — registration now rejects `role: "admin"`; only `patient`/`doctor` are self-registerable (`REGISTERABLE_ROLES`).
- `server/src/controllers/appointment.controller.js` — added `getAppointmentAccess()` and applied it to `updateAppointmentStatus` and `rescheduleAppointment`, so only the appointment's patient, its doctor, or an admin can mutate it (fixes the IDOR).
- Verified with `node --check` on both files (syntax only — no test DB is available in this environment to run an integration test).

**2026-08-17 session — AI backend migration (Claude API → local Ollama):** implemented the Claude-half of the free/open-source migration agreed in the update note above (the ADR-007 direction). The Cloudinary/storage half is a separate, unrelated piece of work and is still **not** started.
- Removed `ai-service/claude_client.py` and the `anthropic` dependency entirely. Added `ai-service/ollama_client.py` — a thin `httpx`-based client (no new SDK; `httpx` was already a dependency) that POSTs to a local Ollama server's `/api/chat` with `format: "json"`. `assistant.py` and `summarizer.py` now import `chat_json` from it instead of the old Claude client, and their exception handling was **broadened** to also catch `httpx.ConnectError` (Ollama not running → 502), `httpx.HTTPStatusError` (Ollama returned an error → 502), and `httpx.TimeoutException` (model too slow → 504) — previously only JSON-parse errors were caught, which was a documented tech-debt/risk item.
- Deduplicated the `parse_json_response` helper (previously copy-pasted in both `assistant.py` and `summarizer.py`, itself an already-documented tech-debt item) into a new `ai-service/util.py`.
- `summarizer.py` gained `build_images()`: images (JPG/PNG) still base64-encode directly as before, but PDFs are now rasterized page-by-page into images with PyMuPDF (`pymupdf==1.28.2`, `import pymupdf`), capped at `MAX_PDF_PAGES = 8` per document, since Ollama has no native PDF understanding the way Claude did. All rendered pages are sent to the vision model as one multi-image chat message. Note: pages beyond the 8-page cap are silently dropped with no indication in the returned summary that the document was truncated — a small new gap worth tracking (candidate `TECHNICAL_DEBT.md` item; not yet added there).
- `llama3.2-vision` was chosen specifically because it's vision-capable, so **one model** serves both text (search-filter parsing) and image/PDF (document summarization) requests — preserving the multimodal capability Claude provided. This was an explicit product choice over a text-only model that would have dropped image/scanned-PDF support.
- `ai-service/requirements.txt`: removed `anthropic==0.28.0`, added `pymupdf==1.28.2`. Also bumped the previously-dated pins that were an existing `TECHNICAL_DEBT.md` item (`fastapi` 0.111.0→0.141.1, `uvicorn[standard]` 0.30.1→0.52.3, `pydantic` 2.7.4→2.13.4, `python-dotenv` 1.0.1→1.2.3, `httpx` 0.27.0→0.28.1). This bump was **necessary, not cosmetic**: the old `pydantic==2.7.4` pin has no prebuilt wheel for a current Python (3.14 was used to verify) and fails building from source (PyO3/Rust toolchain gap) — the service was actually uninstallable on a current Python before this bump. Resolves the pre-existing "dated pins" tech-debt item.
- `ai-service/.env.example`: removed `ANTHROPIC_API_KEY`; added `OLLAMA_BASE_URL` and `OLLAMA_MODEL` (see Section 12). `CLIENT_ORIGIN`/`SERVER_ORIGIN` unchanged.
- Root `README.md` (not a `/docs` file, but referenced by several docs): stack table's "AI Layer" row now reads "Python, FastAPI, Ollama (local LLM)"; the getting-started AI-service step now instructs installing Ollama, running `ollama pull llama3.2-vision` and `ollama serve`, instead of filling in `ANTHROPIC_API_KEY`.
- **Unchanged:** `ai-service/main.py`; both endpoint **contracts** (`POST /assistant/query`, `POST /summarize` — same request/response JSON shapes as before, so `server/src/controllers/document.controller.js` needed no changes to its response handling); the 3-service architecture split; every fix/finding from the earlier 2026-08-14 session. At the time of this entry, `ai-service` still had zero authentication and the `/summarize` SSRF gap was still open — **both were closed later the same day, see the next entry below.**
- **Verification performed:** `python -m py_compile` on every `ai-service` `.py` file (passed); a clean `pip install -r requirements.txt` into a fresh venv on Python 3.14 (succeeded — previously failed with the old dated pins); imported `main.app` and confirmed all three routes (`/health`, `/assistant/query`, `/summarize`) are registered via the OpenAPI schema; unit-level tests of the deterministic logic that doesn't need a live model — built a real 2-page synthetic PDF with PyMuPDF and confirmed `build_images()` rasterizes it into 2 base64 page images, confirmed image (non-PDF) passthrough encodes correctly, confirmed `parse_json_response` handles both fenced and unfenced JSON. **Not verified: an actual end-to-end call to a running Ollama server** — Ollama itself is not installed in this dev sandbox. This is **code-verified, not yet runtime-verified against a live Ollama server**; real runtime behavior (Ollama's actual `/api/chat` response shape, JSON-mode reliability of the chosen model, image/PDF summary quality) still needs to be confirmed against an actual local Ollama instance.
- **New deployment consideration:** self-hosting Ollama changes the deployment story — see Section 7.

**2026-08-17 session, continued — Secured `ai-service` (N2):** implements **Next → N2** from Section 10.
- Added `ai-service/auth.py` (`require_service_token`), a FastAPI dependency applied to both `assistant.py`'s and `summarizer.py`'s `APIRouter(dependencies=[Depends(require_service_token)])` — checks `Authorization: Bearer <AI_SERVICE_TOKEN>`, fails closed (401) if the token is unset, missing, or wrong. `/health` is intentionally left open for liveness checks.
- `server/src/controllers/document.controller.js`'s call to `/summarize` now sends that header (`AI_SERVICE_TOKEN`, added to both `server/.env.example` and `ai-service/.env.example` — see Section 12) and passes `signal: AbortSignal.timeout(30000)`, with a `try/catch` mapping a timeout to a clean `504` instead of hanging.
- `ai-service/summarizer.py`: `fetch_file()` now checks `urlparse(fileUrl).hostname` against `ALLOWED_FILE_HOSTS = {"res.cloudinary.com"}` — the only host documents are ever uploaded to (`server/src/config/cloudinary.js`) — and rejects with 400 *before* attempting any network fetch (so an unauthenticated or disallowed-host request never even reaches the network layer). The fetch itself was rewritten to stream via `httpx.AsyncClient.stream()` and reject (413) once `MAX_FILE_BYTES = 10 * 1024 * 1024` is exceeded, so an oversized file is never fully buffered into memory.
- **Verification performed:** `python -m py_compile` passed; an in-process `fastapi.testclient.TestClient` smoke test confirmed: `/health` works with no auth; `/assistant/query` and `/summarize` both 401 with no token and with a wrong token (including a request whose `fileUrl` was an SSRF-like link-local address — confirming auth is checked *before* the SSRF guard runs); `/summarize` with valid auth but a disallowed host returns 400 before any fetch; `/summarize` with valid auth and an allowed-but-unreachable host correctly attempts the fetch and returns a clean 502, not a crash. This was a one-off manual smoke test during implementation, not a committed automated test (see Section 10, item 4/N4).
- **Unchanged:** everything else about the ai-service, including its dependence on a running local Ollama server — this fix is orthogonal to that.

## 5. Full File Inventory

### server/ (Node.js, Express)

- `server/index.js` — app entrypoint; mounts all route groups, global error handler, HTTP server, Socket.IO attach
- `server/package.json` — dependency manifest and scripts
- `server/.env.example` — environment variable template
- `server/src/config/cloudinary.js` — Cloudinary SDK configuration
- `server/src/config/db.js` — shared `pg.Pool`, connected via `DATABASE_URL`
- `server/src/controllers/admin.controller.js` — `getDashboardStats`
- `server/src/controllers/appointment.controller.js` — `bookAppointment`, `listMyAppointments`, `updateAppointmentStatus`, `rescheduleAppointment`
- `server/src/controllers/auth.controller.js` — `register`, `login`, `me`
- `server/src/controllers/chat.controller.js` — `getConversation`, `markRead`
- `server/src/controllers/doctor.controller.js` — `searchDoctors`, `getDoctorAvailability`, `upsertDoctorProfile`
- `server/src/controllers/document.controller.js` — `uploadDocument`, `listMyDocuments`, `summarizeDocument`
- `server/src/middleware/auth.middleware.js` — `requireAuth`, `requireRole`
- `server/src/middleware/upload.middleware.js` — multer config (memory storage, 10MB limit, MIME allowlist)
- `server/src/models/schema.sql` — full DB schema
- `server/src/routes/admin.routes.js`
- `server/src/routes/appointment.routes.js`
- `server/src/routes/auth.routes.js`
- `server/src/routes/chat.routes.js`
- `server/src/routes/doctor.routes.js`
- `server/src/routes/document.routes.js`
- `server/src/socket/socket.js` — `attachSocket`
- `server/src/utils/catchAsync.js` — async-handler error wrapper

### client/ (React + Vite)

- `client/index.html` — Vite HTML entry, mounts `#root`
- `client/package.json` — dependency manifest and scripts
- `client/vite.config.js` — dev server config (port 5173, no `/api` proxy)
- `client/.env.example` — environment variable template
- `client/src/App.jsx` — top-level route table
- `client/src/main.jsx` — React root render (BrowserRouter + AuthProvider + StrictMode)
- `client/src/index.css` — global stylesheet (plain CSS, CSS custom properties, BEM-ish classnames)
- `client/src/context/AuthContext.jsx` — global auth state (user, loading, login, register, logout)
- `client/src/components/Appointment/AppointmentCard.jsx`
- `client/src/components/Appointment/BookingModal.jsx`
- `client/src/components/Chat/ChatWindow.jsx`
- `client/src/components/Doctor/DoctorCard.jsx`
- `client/src/components/Doctor/DoctorSearchFilters.jsx`
- `client/src/components/Document/DocumentCard.jsx`
- `client/src/components/Document/DocumentUpload.jsx`
- `client/src/components/Layout/Navbar.jsx`
- `client/src/components/Layout/ProtectedRoute.jsx`
- `client/src/pages/AdminDashboard.jsx`
- `client/src/pages/DoctorDashboard.jsx`
- `client/src/pages/Login.jsx`
- `client/src/pages/PatientDashboard.jsx`
- `client/src/pages/Register.jsx`
- `client/src/services/api.js` — shared axios instance, Bearer-token request interceptor (no response interceptor)
- `client/src/services/socket.js` — singleton Socket.IO client connect/get/disconnect helpers

### ai-service/ (Python, FastAPI)

- `ai-service/main.py` — FastAPI app entrypoint; CORS config; mounts routers; `/health` (no auth)
- `ai-service/assistant.py` — `POST /assistant/query` (`parse_search_query`); imports `chat_json` from `ollama_client`, `parse_json_response` from `util`; router requires `require_service_token`
- `ai-service/summarizer.py` — `POST /summarize` (`summarize_document`), `build_images()` (images pass through as base64; PDFs are rasterized page-by-page via PyMuPDF, capped at `MAX_PDF_PAGES = 8`), `fetch_file()` (SSRF host allowlist + streaming 10MB cap); router requires `require_service_token`
- `ai-service/ollama_client.py` — `chat_json` (thin `httpx`-based client, no SDK; POSTs to a local Ollama server's `/api/chat` with `format: "json"`; reads `OLLAMA_BASE_URL`/`OLLAMA_MODEL`) — **replaces `claude_client.py`, removed 2026-08-17**
- `ai-service/util.py` — `parse_json_response` helper (strips markdown fences, `json.loads`); added 2026-08-17, deduplicated out of `assistant.py`/`summarizer.py`
- `ai-service/auth.py` — `require_service_token`, a FastAPI dependency gating both routers behind `Authorization: Bearer <AI_SERVICE_TOKEN>`; added 2026-08-17, fails closed if the token is unset
- `ai-service/requirements.txt` — dependency pins
- `ai-service/.env.example` — environment variable template

### Root

- `README.md`
- `.gitignore`

## 6. Important Implementation Details

- **JWT role middleware pattern**: `server/src/middleware/auth.middleware.js` exports `requireAuth` (verifies the JWT via `jwt.verify(token, process.env.JWT_SECRET)`, attaches `req.user`, returns 401 on invalid/expired token) and `requireRole(role)` (a middleware factory used to gate routes to a specific role, e.g. `requireRole("doctor")`, `requireRole("admin")`). Roles are `patient`, `doctor`, `admin` (Postgres enum `user_role`).
- **`no_double_booking` DB constraint**: `appointments` has `CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)`. This is the authoritative, race-safe guarantee against double-booking a doctor at the same start time — the `bookAppointment` controller relies on this constraint and maps the resulting Postgres conflict to a 409 response.
- **`catchAsync` error wrapper**: `server/src/utils/catchAsync.js` wraps async Express handlers — `return (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); }` — so rejected promises are forwarded to the global Express error handler in `index.js` instead of crashing the process. Note: this wrapper is used for HTTP route handlers only; it does **not** cover the Socket.IO `message:send` handler in `socket.js`, which has no try/catch at all.
- **Socket.IO attach pattern**: `attachSocket(httpServer, clientOrigin)` (in `server/src/socket/socket.js`) attaches a JWT-authenticated Socket.IO server to the same HTTP server created in `index.js`. Auth is via the socket handshake's `auth.token`. Two events are implemented: `message:send` (persists a message to Postgres and broadcasts `message:new`) and `typing` (broadcasts a typing indicator to the recipient's room).
- **Axios service layer**: `client/src/services/api.js` exports a shared axios instance with `baseURL` from `VITE_API_URL` and a request interceptor that attaches `Authorization: Bearer <token>` from `localStorage`. There is currently no response interceptor, so there is no centralized handling of 401/expired-token responses anywhere in the client.
- **AI service is a separate process**: `ai-service` is an independently run FastAPI process (Python). As of 2026-08-17 it talks to a **local Ollama server** via plain `httpx` (`ai-service/ollama_client.py`, no SDK) instead of the Claude API — see the 2026-08-17 entry in Section 4. The Express server never calls the LLM backend directly — it proxies through `ai-service` over HTTP using the `AI_SERVICE_URL` env var (server's `document.controller.js` calls `fetch(`${process.env.AI_SERVICE_URL}/summarize`, ...)`), now with `signal: AbortSignal.timeout(30000)`. This swap also introduces a new deployment dependency: `ai-service` now needs a reachable Ollama instance (`OLLAMA_BASE_URL`) — see Section 7.
- **ai-service service-to-service auth**: as of 2026-08-17 (later same day), `ai-service/auth.py`'s `require_service_token` FastAPI dependency gates `/assistant/query` and `/summarize` (not `/health`) behind `Authorization: Bearer <AI_SERVICE_TOKEN>`; `server/src/controllers/document.controller.js` sends that header on every call. The check fails closed — if `AI_SERVICE_TOKEN` is unset on the ai-service side, every request is rejected rather than let through.

## 7. Known Issues / Current Blockers

These are the critical issues carried over from the canonical project assessment. They should be treated as blockers before any real deployment. Items 1-3 below are **FIXED** (see Section 4); item 4 is a bigger effort still open.

1. ~~Public self-registration lets anyone create an admin account.~~ **FIXED** — `POST /api/auth/register` now only accepts `role: "patient" | "doctor"` (`server/src/controllers/auth.controller.js`, `REGISTERABLE_ROLES`). Admin accounts must be provisioned out-of-band (directly in the database).
2. ~~Appointment status/reschedule endpoints have no ownership check.~~ **FIXED** — `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` now call `getAppointmentAccess()` (`server/src/controllers/appointment.controller.js`) and return 403 unless the caller is the appointment's patient, its doctor, or an admin.
3. ~~ai-service has zero authentication on any endpoint, and `/summarize` fetches an arbitrary client-supplied `fileUrl` with no domain allowlist or private-IP blocking (SSRF risk).~~ **FIXED (2026-08-17)** — both routes now require `Authorization: Bearer <AI_SERVICE_TOKEN>` (`ai-service/auth.py`); `/summarize` rejects any `fileUrl` outside `res.cloudinary.com` and caps the fetch at 10MB. See Section 4.
4. **Zero automated tests exist across all three services.** No test framework is installed in `server/package.json`, `client/package.json`, or `ai-service/requirements.txt` — nothing has been regression-verified beyond manual/code-level inspection (including all three fixes above, which were only syntax-checked/smoke-tested, not covered by a committed automated test — there is no test DB in this environment, and no live Ollama server to integration-test against).
5. **Appointment Reminders has no implementation beyond a dangling database table.** The `reminders` table exists in `schema.sql`, but there is no controller, route, scheduler, or notification-sending code anywhere in the codebase.
6. **New deployment consideration (2026-08-17): self-hosting Ollama.** Before the AI backend migration, `ai-service` just needed a small process calling a hosted Claude API. It now needs **either** (a) Ollama running on the same host/network as `ai-service` with enough RAM/VRAM for a vision model (`llama3.2-vision` is an ~11B model; realistically needs 8GB+ RAM or a GPU for usable latency), **or** (b) a separately hosted/reachable Ollama instance via `OLLAMA_BASE_URL`. Free-tier PaaS hosting (Render/Railway free tier) is very unlikely to have enough resources to run Ollama itself. This is a new, real, **unsolved** constraint — no specific hosting solution has been chosen yet.

Additional notable (non-critical) risks are catalogued in the project's risk register (see `docs/` sibling files if present), including: default `JWT_SECRET=change-me` placeholder with nothing enforcing a stronger secret; no rate limiting on `/api/auth/login`, `/api/auth/register`, or either Ollama-backed ai-service endpoint (`/assistant/query`, `/summarize`); the global Express error handler leaking raw `err.message` (including Postgres constraint text) to clients; and `socket.js`'s `message:send` handler having no try/catch around its `pool.query` await.

## 8. Decisions Made Recently

Architectural and technology decisions made during scaffolding (three-service split, Postgres UNIQUE constraint for double-booking, stateless JWT auth, Socket.IO for chat, Cloudinary for file storage, Vite for the client build) are recorded with full context, options considered, and consequences in **`docs/DECISIONS.md`**. Refer to that file for the reasoning behind these choices before proposing to change them.

## 9. Things That Must NOT Be Changed Without a Strong Reason

- **The DB double-booking `UNIQUE (doctor_id, starts_at)` constraint** on `appointments` (`no_double_booking`). This is the race-safe guarantee against double-booking; do not replace it with an application-level check-then-insert without an equally strong concurrency guarantee.
- **The 3-service split** (client / server / ai-service). The Express server intentionally never calls the LLM backend (Ollama, as of 2026-08-17; previously Claude) directly — all LLM interaction is isolated in the Python `ai-service` process, reached via `AI_SERVICE_URL`.
- **JWT-based RBAC** (roles: `patient`, `doctor`, `admin`, enforced via `requireAuth`/`requireRole` middleware and JWT claims). This is stateless by design — there is currently no session store and no revocation mechanism, which is a known tradeoff, not a bug to silently "fix" by introducing sessions without discussion.
- **The REST route prefixes under `/api/*`** (`/api/auth`, `/api/doctors`, `/api/appointments`, `/api/documents`, `/api/chat`, `/api/admin`), as mounted in `server/index.js`. The client's `VITE_API_URL` and the overall API contract depend on this prefix structure.

## 10. Next Recommended Action (Ranked)

0. **Free/open-source stack migration — status split as of 2026-08-17.** This item covered two independent halves; they are no longer at the same stage:
   - ~~AI-model half~~ — **DONE.** The paid Claude API has been replaced with a local Ollama server (`ai-service/ollama_client.py`, model `llama3.2-vision`). See the 2026-08-17 entry in Section 4 for what changed and how it was verified (code-verified; not yet runtime-verified against a live Ollama server).
   - **Cloudinary/storage half — still NOT started.** `server/src/config/cloudinary.js` and `server/src/controllers/document.controller.js`'s upload path are unchanged. Still needs its own scoping pass: decide the replacement for Cloudinary (e.g. self-hosted storage) before touching code. See `docs/DECISIONS.md` for the current (partially superseded) reasoning behind Cloudinary.
1. ~~Fix the two concrete authorization gaps~~ — **done**, see Section 7.
2. ~~Add authentication and SSRF protection to the ai-service~~ — **done (2026-08-17)**, see Section 7, item 3.
3. **Introduce a centralized input-validation layer** (zod or express-validator on the server; extend the existing pydantic models on ai-service to cover more cases), and wrap `socket.js`'s `message:send` handler in try/catch with payload validation so a DB failure can't crash the process.
4. **Stand up automated test coverage across all three services** (server integration tests against a test database, ai-service unit tests with a mocked LLM client, client component tests) — currently zero tests exist anywhere.
5. **Implement the Appointment Reminders feature end-to-end**: a scheduler/worker that reads the `reminders` table and sends notifications, since only the DB table currently exists.
6. **Add pagination** to the unbounded list endpoints (appointments, documents, chat history, doctor search) and add a response interceptor plus error boundaries/loading states on the client for consistent error and 401 handling.

## 11. Exact Commands to Run / Test / Build / Deploy

All three services are run independently, each in its own terminal.

### Database

```
psql -U <user> -d <db> -f server/src/models/schema.sql
```

### Server (Node.js, Express) — http://localhost:5000

```
cd server
cp .env.example .env
npm install
npm run dev      # node --watch index.js
```

Alternative: `npm start` runs `node index.js` (no watch).

### Client (React, Vite) — http://localhost:5173

```
cd client
cp .env.example .env
npm install
npm run dev       # vite
npm run build      # vite build
npm run preview    # vite preview
```

### AI service (Python, FastAPI) — http://localhost:8000

```
cd ai-service
cp .env.example .env
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Testing and linting — none configured

There is currently **no test command and no lint command** in any of the three services:

- `server/package.json` — only `dev` and `start` scripts; no test framework in `dependencies` (no Jest/Vitest/node:test runner wired up), no ESLint/Prettier devDependency.
- `client/package.json` — only `dev`, `build`, `preview` scripts; no test framework (no Vitest/Jest/Testing Library) in `dependencies` or `devDependencies`.
- `ai-service/requirements.txt` — no `pytest` or any test framework listed.

Any `npm test` / `pytest` invocation will fail or do nothing meaningful until a test framework is added (see Section 10, item 4).

## 12. Environment Requirements

### Runtimes

- **Node.js** — required for `server` (Express, `type: module`) and `client` (Vite). Note: `document.controller.js` on the server relies on Node's built-in global `fetch`, which requires **Node >= 18**; there is currently no `engines` field in `server/package.json` enforcing this.
- **Python** with `venv` — required for `ai-service`. Activate via `.venv\Scripts\activate` (Windows).
- **PostgreSQL** — required for the server's database, initialized via `server/src/models/schema.sql`.
- **Ollama** — required as of 2026-08-17 for `ai-service`'s LLM calls: either a local Ollama server (default `http://localhost:11434`, model `llama3.2-vision` pulled) or a reachable remote instance via `OLLAMA_BASE_URL`. Not installed in this dev environment — see Section 7, item 6 for the resulting resource/hosting constraint.

### Environment variables — `server/.env.example` (verbatim)

```
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://user:password@localhost:5432/healthcare
JWT_SECRET=change-me
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TOKEN=change-me
```

`AI_SERVICE_TOKEN` was added 2026-08-17 — it must match `AI_SERVICE_TOKEN` in `ai-service/.env.example` exactly; it's sent as `Authorization: Bearer <token>` on every server→ai-service call.

Note: `JWT_SECRET=change-me` is a placeholder value only — it must be overridden with a strong secret before any non-local use (see Section 7, risk list).

### Environment variables — `client/.env.example` (verbatim)

```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### Environment variables — `ai-service/.env.example` (verbatim, updated 2026-08-17)

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2-vision
CLIENT_ORIGIN=http://localhost:5173
SERVER_ORIGIN=http://localhost:5000
AI_SERVICE_TOKEN=change-me
```

`ANTHROPIC_API_KEY` was removed as part of the 2026-08-17 Claude→Ollama migration (see Section 4). `OLLAMA_BASE_URL` and `OLLAMA_MODEL` default to the values shown above (in `ai-service/ollama_client.py`) if left unset. `llama3.2-vision` was chosen specifically because it's vision-capable, so one model serves both text (search-filter parsing) and image/PDF (document summarization) requests — the closest match to prior Claude behavior. `AI_SERVICE_TOKEN` was added later the same day (see Section 4) — unlike the others it has **no default**; if it's unset, `require_service_token` fails every request closed (401) rather than silently allowing them through.

### Notes

- `.env` files (and `**/.env`) are gitignored; only the `.env.example` templates above are committed.
- Cloudinary is the only file-storage backend actually implemented (`server/src/config/cloudinary.js`), configured via the three `CLOUDINARY_*` vars above — although the README's stack table also lists Amazon S3 as an option, it is not wired up anywhere in the code.
