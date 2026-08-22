# Developer Context — Healthcare Appointment & Patient Portal

Last updated: 2026-08-22 (see update note below; original scaffold assessment was 2026-08-14)
Maintained for: continuity across development sessions. Read this file first when picking up work on this repo.

> **Update (2026-08-22 session):** Two sessions of work landed: (1) a full premium
> UI/UX redesign of `client/` — design system, reusable component library,
> responsive layout, and doctor-patient chat wired into the UI end-to-end for the
> first time — and (2) a remediation pass closing most of the named gaps in
> **In Progress → I1–I7** and **Next → N3** of `docs/PROJECT_PLAN.md`: appointment
> window validation, socket crash-safety, sanitized error responses, rate limiting,
> a fail-fast `JWT_SECRET` check, and resilient loading/error states across every
> client data fetch. `ai-service` also got its **first real, passing automated test
> suite** (13 tests, `ai-service/tests/`) — a genuine start on **Next → N4**, though
> still scoped to logic that doesn't need a live DB or Ollama server. See the new
> entry in Section 4 below for full detail, the updated Section 7 for what's still
> open, and Section 10 for the current next-action ranking. The repo is now also a
> git repository, pushed to `https://github.com/Slv-WebTech/pulsecare`.

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

**2026-08-22 session — Premium UI/UX redesign + chat wiring:**
- Rebuilt `client/` on a real design system (`client/src/styles/tokens.css`, `base.css`, `type.css`, `layout.css`, `components.css`, `overlay.css`, `patterns.css`, `pages.css`, aggregated via `client/src/index.css`) and a reusable component library (`client/src/components/ui/`: `Button`, `Field`, `Card`, `Badge`, `Avatar`, `Modal`, `Menu`, `Tabs`, `Skeleton`/`SkeletonCard`/`SkeletonStatCard`, `EmptyState`, `StatCard`, `PageHeader`, `Alert`, `ToastContext`, plus a hand-rolled icon set in `icons.jsx` — no new npm dependency for icons). Every page and component was redesigned on top of this: split-screen `Login`/`Register` sharing a new `AuthLayout.jsx`, a tabbed `PatientDashboard`, a filterable `DoctorDashboard`, `AdminDashboard` with real stat cards, and toast/skeleton/empty states added where none existed before.
- **Closed a real functional gap, not just a styling one:** `ChatWindow.jsx` existed as dead code — it was never reachable from any page, because `listMyAppointments` in `appointment.controller.js` returned `dp.specialization` but not the doctor's `users.id` (appointments only exposed `doctor_profiles.id`), so the client had no valid peer id to address a message to. Fixed with one additive join: the query now also returns `dp.user_id AS doctor_user_id` and `du.name AS doctor_name` (see `server/src/controllers/appointment.controller.js`). `AppointmentCard.jsx` gained an optional `onMessage` prop (a "Message" button); both `PatientDashboard` and `DoctorDashboard` now open `ChatWindow` in a `Modal` from it. The Socket.IO layer and `/api/chat` routes needed no changes — they were already fully built, just unreachable.
- Verification: `npm run build` (client) — clean, 151 modules (up from 150 once `ChatWindow` became an actual import target). No automated test coverage added for the client in this session (see Section 10).

**2026-08-22 session, continued — Remediation pass on `docs/PROJECT_PLAN.md`'s In Progress / Next items:**

Server (`server/`):
- **`index.js`** — added a fail-fast startup check: the process now refuses to start (`process.exit(1)`, logged) if `JWT_SECRET` is unset or still the literal placeholder `change-me` (closes the narrower fix named in `docs/PROJECT_PLAN.md` **Blocked → B3**, which explicitly didn't require B3's larger secrets-management decision). The global error handler was rewritten to only return `err.message` to the client when the error was deliberately flagged with a `.status` (by a controller or middleware); anything else — an unexpected DB error, a bug — is still logged server-side via `console.error` but the client now gets a generic `"Internal server error"` instead of the raw message (closes the `err.message` leak named in **Technical debt → Security concerns → Document/data access control** and **N3**). A `MulterError` without an explicit `.status` is now mapped to 400 in the same handler. The orphaned `// eslint-disable-next-line no-unused-vars` comment (flagged in **Technical debt → Hacks**, no ESLint is installed anywhere) was removed.
- **`src/middleware/upload.middleware.js`** — the exact gap named in **Technical debt → Hacks**: `fileFilter`'s rejection error now carries `.status = 400`, so a disallowed file type surfaces as 400 instead of falling through to 500.
- **`src/controllers/appointment.controller.js`** — added `validateAppointmentWindow(startsAt, endsAt)`, applied to both `bookAppointment` and `rescheduleAppointment`: rejects invalid dates, `startsAt >= endsAt`, and any `startsAt` in the past, all with a 400 before touching the database. This closes the `startsAt < endsAt` gap named in **I2** and the PROJECT_PLAN's `Doctor Search & Filters`/`Appointment Booking` acceptance criteria around past-date rejection. **Note:** the *duration* half of I2 (deriving appointment length from the doctor's real `slot_minutes` instead of a hardcoded 30 minutes) was fixed on the client side instead — see below — since duration isn't something the server enforces today; the server still accepts whatever `endsAt` the client sends, as long as it's after `startsAt` and in the future.
- **`src/socket/socket.js`** — `message:send` is now wrapped in try/catch (closes the process-crash risk named in **I5**: a DB failure here previously wasn't caught anywhere in the raw Socket.IO handler and could crash the process) and validates `recipientId` plus a `body` or `fileUrl` before touching the database, emitting a new `message:error` event back to the sender on either failure path instead of silently dropping the message or crashing.
- **`src/routes/auth.routes.js`** — added `express-rate-limit` (new dependency, `server/package.json`) on `POST /api/auth/login` and `POST /api/auth/register`: 20 requests per 15-minute window per IP. Closes the brute-force/credential-stuffing gap named in **Technical debt → Rate limiting**. Only these two routes are limited; no other endpoint was touched.
- **`server/package.json`** — added `"engines": { "node": ">=18" }` (closes the gap named in **Technical debt → Outdated/missing dependencies**: `document.controller.js` relies on Node's built-in `fetch`, which needs Node ≥18, and nothing previously declared that requirement) and a real `"test": "node --test"` script (Node's built-in test runner, zero new dependency — no tests were written against it this session; see Section 10 for why).
- **Verification:** every touched file passed `node --check`. The server was also actually booted (on a free port, with a placeholder `DATABASE_URL` — Postgres itself was not reachable in this environment) and smoke-tested live: confirmed the `JWT_SECRET=change-me` fail-fast triggers correctly; confirmed `POST /api/auth/register` with `role: "admin"` still returns 400 with no DB call needed (the role check runs before any query); confirmed `POST /api/appointments` rejects `endsAt` before `startsAt` and a past `startsAt`, both with 400, before any DB call; confirmed a request that passes validation but then fails at the (unreachable, by design in this test) DB layer returns a generic `{"error":"Internal server error"}` rather than the raw Postgres connection error — proving the sanitized error handler works as intended.

Client (`client/`):
- **`pages/PatientDashboard.jsx`, `pages/DoctorDashboard.jsx`, `pages/AdminDashboard.jsx`** — every page-level data fetch (doctors, appointments, documents, admin stats) now has a `.catch()`/try-catch with a per-section error state rendered via the `Alert` component, closing the gaps named in **I6**, **I7**, and the `DoctorDashboard` half of **I3**. `DoctorDashboard.handleStatusChange` and `AdminDashboard`'s stats fetch both previously had no failure path at all — a failed status change was an unhandled promise rejection, and a failed stats fetch left the page stuck on a loading state forever. `AdminDashboard.jsx` also now guards `stats.popularSpecializations` with `?? []` (closes the specific `undefined`-shape-drift risk named in **Technical debt → Hacks**), and `handleStatusChange` reports failures via a toast instead of throwing silently.
- **`components/Chat/ChatWindow.jsx`** — the message-history fetch now has a loading state and a `.catch()` (closes half of **I5**'s client-side gap); the component also listens for the new `message:error` socket event and surfaces it via a toast. **Not changed:** no optimistic local-append was added. Reading `socket.js`'s `message:send` handler directly during this session confirmed it already emits `message:new` to `` `user:${socket.user.id}` `` (the sender's own room) as well as the recipient's — so a sender's own messages were already guaranteed to render via the server echo; the "unverified assumption" framing in **I5**/**FEATURES.md** is resolved as **not a bug**, just an architectural coupling worth knowing about, and adding true optimistic-append/reconciliation was judged not worth the added complexity on top of an already-working path.
- **`components/Appointment/BookingModal.jsx`** — now fetches `GET /doctors/:id/availability` on open and derives the appointment's duration from the matching `day_of_week`'s `slot_minutes` (falling back to 30 minutes if that day has no configured availability, or if the fetch fails), instead of always hardcoding 30 minutes. This closes the duration half of **I2** / the exact gap named in **Technical debt → Hacks**. A hint under the date/time field now tells the patient how long the appointment will be.
- **Verification:** `npm run build` — clean. No automated client tests were added (Vitest/RTL are still not installed — see Section 10).

AI service (`ai-service/`):
- **First real automated test suite for this project**, `ai-service/tests/` (13 tests, `pytest.ini` with `pythonpath = .`), added `pytest==8.3.3` to `requirements.txt`. Deliberately scoped to logic that needs neither a live database nor a running Ollama server, so it's honest, fast, CI-ready coverage rather than untestable claims:
  - `tests/test_util.py` — `parse_json_response` against plain JSON, a ```` ```json ```` fence, a bare ```` ``` ```` fence, surrounding whitespace, and invalid JSON (asserts `json.JSONDecodeError`).
  - `tests/test_summarizer.py` — `build_images()` against a non-PDF passthrough, a real multi-page PDF (rasterized via PyMuPDF, one image per page), and the `MAX_PDF_PAGES = 8` cap on an oversized synthetic PDF; `fetch_file()`'s SSRF host allowlist rejects a disallowed host with 400 *before* any network call (via `asyncio.run()`, no `pytest-asyncio` dependency needed for this). Deliberately does **not** test the allowed-host path with a real network call to `res.cloudinary.com` — that would be a live external dependency in a unit test, which is bad practice regardless of environment; that path remains only manually smoke-tested (see the 2026-08-17 entry above).
  - `tests/test_auth.py` — `require_service_token` (the ai-service→server bearer-token gate) against: token env var unset, missing header, wrong token, and correct token. This is the ai-service equivalent of the server-side auth regression test `docs/TESTING.md` names as a top priority (**Critical flows → 2**) — the security logic is now actually locked in by a test, not just code-reviewed.
  - **Run with:** `cd ai-service && .venv\Scripts\activate && pytest -v` (or `pytest --cov=. --cov-report=term-missing` once/if `pytest-cov` is added). All 13 pass as of this session, verified live in a fresh venv in this environment.
- **Not done:** `pytest-asyncio`, mocking Ollama's `/api/chat` (e.g. via `respx`) to test `summarize_document`/`parse_search_query`'s full request/response cycle including the `httpx` failure-mode mapping, and everything else `docs/TESTING.md` scopes as integration-level work. This session's tests are unit-level only, by design — see Section 10.
- **Unchanged:** no ai-service business logic changed this session; only `requirements.txt` (added `pytest`), `pytest.ini` (new), and `tests/` (new) were added.

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
- `server/src/socket/socket.js` — `attachSocket`; `message:send` wrapped in try/catch as of 2026-08-22 (see Section 4), emits `message:error` on failure
- `server/src/utils/catchAsync.js` — async-handler error wrapper

### client/ (React + Vite)

- `client/index.html` — Vite HTML entry, mounts `#root`; Google Fonts (Inter) + inline SVG favicon added 2026-08-22
- `client/package.json` / `client/package-lock.json` — dependency manifest and scripts (no new client dependencies added 2026-08-22 — the redesign deliberately used zero new npm packages)
- `client/vite.config.js` — dev server config (port 5173, no `/api` proxy)
- `client/.env.example` — environment variable template
- `client/src/App.jsx` — top-level route table; as of 2026-08-22 renders `/login`/`/register` "bare" (no header/padded shell) so the full-bleed split-screen auth layout can fill the viewport
- `client/src/main.jsx` — React root render (BrowserRouter + `ToastProvider` (new, 2026-08-22) + AuthProvider + StrictMode)
- `client/src/index.css` — now a thin aggregator (`@import`) over `client/src/styles/*.css`, added 2026-08-22 — see below
- `client/src/styles/` — **new, 2026-08-22**: `tokens.css` (color/type/spacing/radius/shadow/motion custom properties), `base.css` (reset, focus-visible, reduced-motion), `type.css` (typographic utility classes), `layout.css` (header/shell/grid), `components.css` (buttons/forms/cards/badges/avatars), `overlay.css` (modal/toast/dropdown-menu), `patterns.css` (tabs/empty-state/stat-card/page-header), `pages.css` (auth split-screen, dashboard/chat/document layouts)
- `client/src/context/AuthContext.jsx` — global auth state (user, loading, login, register, logout) — unchanged 2026-08-22
- `client/src/components/ui/` — **new, 2026-08-22**, the reusable component library: `Button.jsx`, `Field.jsx`, `Card.jsx`, `Badge.jsx`, `Avatar.jsx`, `Modal.jsx`, `Menu.jsx`, `Tabs.jsx`, `Skeleton.jsx`, `EmptyState.jsx`, `StatCard.jsx`, `PageHeader.jsx`, `Alert.jsx`, `Spinner.jsx`, `ToastContext.jsx` (`useToast()` hook), `icons.jsx` (hand-rolled SVG icon set, no new dependency), `index.js` (barrel export)
- `client/src/components/Appointment/AppointmentCard.jsx` — redesigned 2026-08-22; gained an optional `onMessage` prop (renders a "Message" action) that both dashboards wire up to open `ChatWindow`
- `client/src/components/Appointment/BookingModal.jsx` — redesigned 2026-08-22; now fetches the doctor's real availability and derives slot duration from it (see Section 4) instead of a hardcoded 30 minutes
- `client/src/components/Chat/ChatWindow.jsx` — redesigned 2026-08-22; gained a `hideHeader` prop (for embedding in a `Modal`), a loading/error state on history fetch, and a `message:error` toast listener; **now actually reachable from the UI** for the first time (previously dead code — see Section 4)
- `client/src/components/Doctor/DoctorCard.jsx`, `client/src/components/Doctor/DoctorSearchFilters.jsx` — redesigned 2026-08-22 (visual only; same props/API calls)
- `client/src/components/Document/DocumentCard.jsx` — redesigned 2026-08-22; gained a `catch` block around `handleSummarize` (closes the gap named in **FEATURES.md** feature 6 / **I4**)
- `client/src/components/Document/DocumentUpload.jsx` — redesigned 2026-08-22; now supports drag-and-drop in addition to click-to-browse, same upload API call
- `client/src/components/Layout/Navbar.jsx` — redesigned 2026-08-22 (brand mark, user-menu dropdown via `Menu.jsx`)
- `client/src/components/Layout/AuthLayout.jsx` — **new, 2026-08-22**: shared split-screen visual/form-panel wrapper for `Login.jsx`/`Register.jsx`, replacing what had briefly been duplicated inline markup between the two pages
- `client/src/components/Layout/ProtectedRoute.jsx` — redesigned loading state 2026-08-22 (same auth/role logic)
- `client/src/pages/AdminDashboard.jsx` — redesigned 2026-08-22; gained a `.catch()` + error `Alert` on the stats fetch and a `?? []` guard on `popularSpecializations` (closes **I7**)
- `client/src/pages/DoctorDashboard.jsx` — redesigned 2026-08-22 into a single filterable list (was two stacked grids); gained a `.catch()` + error `Alert` on the appointments fetch and a try/catch + toast on `handleStatusChange` (closes the `DoctorDashboard` half of **I3**); wires `AppointmentCard`'s new `onMessage` prop to open a chat `Modal`
- `client/src/pages/Login.jsx`, `client/src/pages/Register.jsx` — redesigned 2026-08-22 onto `AuthLayout.jsx`; both submit buttons now have a `loading`/disabled state during the async call (closes the last named gap in **I1** — see **FEATURES.md**)
- `client/src/pages/NotFound.jsx` — **new, 2026-08-22**: the catch-all `*` route is no longer a bare `<p>Page not found</p>` (closes the stub named in **Technical debt → Temporary/stub solutions**)
- `client/src/pages/PatientDashboard.jsx` — redesigned 2026-08-22 into tabs (Find a doctor / My appointments / Documents); all three fetches gained `.catch()` + a per-section error `Alert` (closes **I6**); wires `AppointmentCard`'s new `onMessage` prop
- `client/src/services/api.js` — shared axios instance, Bearer-token request interceptor (no response interceptor — still open, see Section 7)
- `client/src/services/socket.js` — singleton Socket.IO client connect/get/disconnect helpers — unchanged 2026-08-22

### ai-service/ (Python, FastAPI)

- `ai-service/main.py` — FastAPI app entrypoint; CORS config; mounts routers; `/health` (no auth)
- `ai-service/assistant.py` — `POST /assistant/query` (`parse_search_query`); imports `chat_json` from `ollama_client`, `parse_json_response` from `util`; router requires `require_service_token`
- `ai-service/summarizer.py` — `POST /summarize` (`summarize_document`), `build_images()` (images pass through as base64; PDFs are rasterized page-by-page via PyMuPDF, capped at `MAX_PDF_PAGES = 8`), `fetch_file()` (SSRF host allowlist + streaming 10MB cap); router requires `require_service_token`
- `ai-service/ollama_client.py` — `chat_json` (thin `httpx`-based client, no SDK; POSTs to a local Ollama server's `/api/chat` with `format: "json"`; reads `OLLAMA_BASE_URL`/`OLLAMA_MODEL`) — **replaces `claude_client.py`, removed 2026-08-17**
- `ai-service/util.py` — `parse_json_response` helper (strips markdown fences, `json.loads`); added 2026-08-17, deduplicated out of `assistant.py`/`summarizer.py`
- `ai-service/auth.py` — `require_service_token`, a FastAPI dependency gating both routers behind `Authorization: Bearer <AI_SERVICE_TOKEN>`; added 2026-08-17, fails closed if the token is unset
- `ai-service/requirements.txt` — dependency pins; `pytest==8.3.3` added 2026-08-22
- `ai-service/pytest.ini` — **new, 2026-08-22**: `pythonpath = .`, `testpaths = tests`
- `ai-service/tests/` — **new, 2026-08-22**: `test_util.py`, `test_summarizer.py`, `test_auth.py` — 13 tests, all passing; see Section 4 for exact coverage and Section 10 for what's still not covered
- `ai-service/.env.example` — environment variable template

### Root

- `README.md`
- `.gitignore` — updated 2026-08-22 to ignore `.claude/` (local Claude Code tooling config, not project source) and broadened the Python cache patterns to `ai-service/**/__pycache__/` plus `.pytest_cache/`
- `docs/` — this documentation suite; several files updated 2026-08-22 alongside the code changes above (see each file's own "last updated" line)

## 6. Important Implementation Details

- **JWT role middleware pattern**: `server/src/middleware/auth.middleware.js` exports `requireAuth` (verifies the JWT via `jwt.verify(token, process.env.JWT_SECRET)`, attaches `req.user`, returns 401 on invalid/expired token) and `requireRole(role)` (a middleware factory used to gate routes to a specific role, e.g. `requireRole("doctor")`, `requireRole("admin")`). Roles are `patient`, `doctor`, `admin` (Postgres enum `user_role`).
- **`no_double_booking` DB constraint**: `appointments` has `CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)`. This is the authoritative, race-safe guarantee against double-booking a doctor at the same start time — the `bookAppointment` controller relies on this constraint and maps the resulting Postgres conflict to a 409 response.
- **`catchAsync` error wrapper**: `server/src/utils/catchAsync.js` wraps async Express handlers — `return (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); }` — so rejected promises are forwarded to the global Express error handler in `index.js` instead of crashing the process. This wrapper is used for HTTP route handlers only — it does not, and structurally cannot, cover the Socket.IO `message:send` handler in `socket.js`, since that's not an Express route. As of 2026-08-22, `message:send` has its own explicit try/catch instead (see Section 4) — it no longer relies on `catchAsync` and is no longer unguarded.
- **Socket.IO attach pattern**: `attachSocket(httpServer, clientOrigin)` (in `server/src/socket/socket.js`) attaches a JWT-authenticated Socket.IO server to the same HTTP server created in `index.js`. Auth is via the socket handshake's `auth.token`. Two events are implemented: `message:send` (validates the payload, persists a message to Postgres, and broadcasts `message:new` to both the recipient's and the sender's own room — the latter is what makes a sender's own messages render locally without a client-side optimistic append; emits `message:error` back to the sender on validation or DB failure, as of 2026-08-22) and `typing` (broadcasts a typing indicator to the recipient's room).
- **Axios service layer**: `client/src/services/api.js` exports a shared axios instance with `baseURL` from `VITE_API_URL` and a request interceptor that attaches `Authorization: Bearer <token>` from `localStorage`. There is currently no response interceptor, so there is no centralized handling of 401/expired-token responses anywhere in the client.
- **AI service is a separate process**: `ai-service` is an independently run FastAPI process (Python). As of 2026-08-17 it talks to a **local Ollama server** via plain `httpx` (`ai-service/ollama_client.py`, no SDK) instead of the Claude API — see the 2026-08-17 entry in Section 4. The Express server never calls the LLM backend directly — it proxies through `ai-service` over HTTP using the `AI_SERVICE_URL` env var (server's `document.controller.js` calls `fetch(`${process.env.AI_SERVICE_URL}/summarize`, ...)`), now with `signal: AbortSignal.timeout(30000)`. This swap also introduces a new deployment dependency: `ai-service` now needs a reachable Ollama instance (`OLLAMA_BASE_URL`) — see Section 7.
- **ai-service service-to-service auth**: as of 2026-08-17 (later same day), `ai-service/auth.py`'s `require_service_token` FastAPI dependency gates `/assistant/query` and `/summarize` (not `/health`) behind `Authorization: Bearer <AI_SERVICE_TOKEN>`; `server/src/controllers/document.controller.js` sends that header on every call. The check fails closed — if `AI_SERVICE_TOKEN` is unset on the ai-service side, every request is rejected rather than let through.

## 7. Known Issues / Current Blockers

These are the critical issues carried over from the canonical project assessment. They should be treated as blockers before any real deployment. Items 1–3 and several of the "additional notable risks" below are now **FIXED** (see Section 4); items 4 and 5 are bigger efforts still open.

1. ~~Public self-registration lets anyone create an admin account.~~ **FIXED** — `POST /api/auth/register` now only accepts `role: "patient" | "doctor"` (`server/src/controllers/auth.controller.js`, `REGISTERABLE_ROLES`). Admin accounts must be provisioned out-of-band (directly in the database).
2. ~~Appointment status/reschedule endpoints have no ownership check.~~ **FIXED** — `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` now call `getAppointmentAccess()` (`server/src/controllers/appointment.controller.js`) and return 403 unless the caller is the appointment's patient, its doctor, or an admin.
3. ~~ai-service has zero authentication on any endpoint, and `/summarize` fetches an arbitrary client-supplied `fileUrl` with no domain allowlist or private-IP blocking (SSRF risk).~~ **FIXED (2026-08-17)** — both routes now require `Authorization: Bearer <AI_SERVICE_TOKEN>` (`ai-service/auth.py`); `/summarize` rejects any `fileUrl` outside `res.cloudinary.com` and caps the fetch at 10MB. See Section 4.
4. **Automated test coverage is minimal.** As of 2026-08-22, `ai-service` has a real, passing, 13-test suite (`ai-service/tests/`) covering `parse_json_response`, `build_images()`, the PDF-page cap, the SSRF host guard, and `require_service_token` — but `server/package.json` and `client/package.json` still have no test framework installed, and even ai-service's suite is unit-level only (no live-Ollama or live-DB integration tests). Nothing has DB-integration-level regression coverage yet, including the auth/IDOR fixes in items 1–2 above. See Section 10 and `docs/TESTING.md`.
5. **Appointment Reminders has no implementation beyond a dangling database table.** The `reminders` table exists in `schema.sql`, but there is no controller, route, scheduler, or notification-sending code anywhere in the codebase. Unchanged this session — deliberately out of scope, see `docs/FUTURE_FEATURES.md`.
6. **New deployment consideration (2026-08-17): self-hosting Ollama.** Before the AI backend migration, `ai-service` just needed a small process calling a hosted Claude API. It now needs **either** (a) Ollama running on the same host/network as `ai-service` with enough RAM/VRAM for a vision model (`llama3.2-vision` is an ~11B model; realistically needs 8GB+ RAM or a GPU for usable latency), **or** (b) a separately hosted/reachable Ollama instance via `OLLAMA_BASE_URL`. Free-tier PaaS hosting (Render/Railway free tier) is very unlikely to have enough resources to run Ollama itself. This is a new, real, **unsolved** constraint — no specific hosting solution has been chosen yet.

Additional notable (non-critical) risks, updated 2026-08-22:
- ~~Default `JWT_SECRET=change-me` placeholder with nothing enforcing a stronger secret.~~ **FIXED** — `server/index.js` now refuses to start if `JWT_SECRET` is unset or still `change-me`.
- ~~No rate limiting on `/api/auth/login` or `/api/auth/register`.~~ **FIXED** — both now go through `express-rate-limit` (20 requests / 15 min / IP). Still open: neither ai-service endpoint (`/assistant/query`, `/summarize`) has rate limiting.
- ~~The global Express error handler leaking raw `err.message` (including Postgres constraint text) to clients.~~ **FIXED** — only errors explicitly flagged with a `.status` (by a controller or middleware) have their message returned; everything else is logged server-side and returns a generic message.
- ~~`socket.js`'s `message:send` handler having no try/catch around its `pool.query` await.~~ **FIXED** — wrapped, plus basic payload validation; emits `message:error` on failure instead of crashing or silently dropping.
- **Still open:** `client/src/services/api.js` has no response interceptor, so there is still no centralized handling of 401/expired-token responses anywhere in the client. No pagination on any list endpoint (appointments, documents, chat history, doctor search). No centralized validation library (zod/express-validator) — the validation added this session (`validateAppointmentWindow`, `message:send`'s payload check) is hand-written per-call-site, not a general framework, by deliberate scope choice (see Section 10, item 3). `multer` (server dependency) emits a deprecation warning on install — 1.x has known vulnerabilities patched in 2.x; not upgraded this session because 2.x has breaking API changes and there's no way to verify the upload path still works without a live server to test against.

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
3. **Introduce a centralized input-validation layer** — **partially done (2026-08-22)**: the two concrete, named validation gaps are fixed by hand (`validateAppointmentWindow` in `appointment.controller.js`; payload checks in `socket.js`'s `message:send`, now wrapped in try/catch so a DB failure can't crash the process), plus `upload.middleware.js`'s file-type rejection and the global error handler are both fixed alongside it — see Section 4. **Not done:** adopting an actual validation library (zod/express-validator on the server; broader pydantic coverage on ai-service) for consistent validation across every controller, which is what this item originally called for — today's fixes are targeted, hand-written checks at the two specific gaps that were named, not a framework-level change.
4. **Stand up automated test coverage across all three services** — **started (2026-08-22)**: `ai-service` now has a real 13-test suite (`ai-service/tests/`, see Section 4) covering `parse_json_response`, PDF rasterization/page-cap, the SSRF host guard, and the service-token auth gate — all unit-level, no live DB/Ollama needed. **Not done:** `server/package.json` and `client/package.json` still have no test framework installed (only a bare `node --test` script was added to `server/package.json`, unused so far); no integration tests exist against a real/test Postgres database, so the auth/IDOR fixes from items 1–2 still have zero regression coverage; no ai-service tests mock a live Ollama `/api/chat` call yet (`assistant.py`/`summarizer.py`'s full request/response cycle, including the `httpx` failure-mode mapping, is still untested). See `docs/TESTING.md` for the full prioritized plan this only partially executes.
5. **Implement the Appointment Reminders feature end-to-end**: a scheduler/worker that reads the `reminders` table and sends notifications, since only the DB table currently exists. Unchanged/not started — deliberately out of scope for the 2026-08-22 session, see `docs/FUTURE_FEATURES.md`.
6. **Add pagination** to the unbounded list endpoints (appointments, documents, chat history, doctor search) and add a response interceptor plus error boundaries/loading states on the client for consistent error and 401 handling. **Partially done (2026-08-22):** every page-level fetch now has a loading state and a visible error state (`PatientDashboard`, `DoctorDashboard`, `AdminDashboard`, `ChatWindow` — see Section 4), and `ProtectedRoute`'s wrong-role redirect gap was not touched. **Still not done:** pagination on any list endpoint, a centralized `api.js` response interceptor for 401 handling, and a React error boundary (a render-time exception in any page still yields a blank screen with no fallback UI).

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

### Testing and linting — ai-service has a real suite as of 2026-08-22; server/client still don't

- `server/package.json` — has a `"test": "node --test"` script (added 2026-08-22, Node's built-in test runner, zero new dependency) but **no test files exist yet** to run against it — `npm test` currently discovers and runs nothing. No ESLint/Prettier devDependency either.
- `client/package.json` — only `dev`, `build`, `preview` scripts; no test framework (no Vitest/Jest/Testing Library) in `dependencies` or `devDependencies`.
- `ai-service/` — **`pytest` is now installed and configured** (`requirements.txt`, `pytest.ini`). Run the real suite:
  ```
  cd ai-service
  .venv\Scripts\activate
  pytest -v
  ```
  13 tests, all passing as of 2026-08-22 (see Section 4 for exact coverage). No linter (ruff/black) configured.

Server integration tests, client component tests, and ai-service tests that mock a live Ollama call are all still not written — see Section 10, item 4.

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
