# Technical Debt Register

**Project:** AI-Powered Healthcare Appointment & Patient Portal
**Scope:** `client/` (React/Vite), `server/` (Express/PostgreSQL/Socket.IO), `ai-service/` (FastAPI/Ollama)
**Codebase age:** ~1 hour old — a freshly generated scaffold with no git history, not a mature codebase
**Overall health score:** 4.3 / 10 *(as of 2026-08-17 — see `PROJECT_SCORE.md` for the current, dated breakdown; this file's category scores below are being refreshed after the same-day ai-service security fix)*

This document exists to surface every known shortcut, gap, and risk in the current scaffold without softening any of it. Every item below is grounded in the code that was actually reviewed — nothing is extrapolated beyond what the discovery passes and canonical scoring found. Items marked **(Critical)** are the ones flagged as blocking any real deployment.

Relevant category scores from the canonical review as of 2026-08-17 (see `PROJECT_SCORE.md` for full reasoning): **Security 5/10** *(up from 2/10 — three of four concrete access-control gaps are now fixed: admin self-registration, appointment IDOR, and ai-service auth/SSRF/file-size)*, **Testing 0/10**, **Error handling 2.5/10**, **Accessibility 2/10**, **Performance 4.5/10**, **Maintainability 4/10**, **Scalability 3.5/10**, **Code quality 6/10**.

---

## Critical issues (fix before anything else)

1. ~~Public self-registration lets anyone create an admin account.~~ **FIXED** — `POST /api/auth/register` now validates `role` against `REGISTERABLE_ROLES = {"patient", "doctor"}` in `server/src/controllers/auth.controller.js`; `role: "admin"` is rejected with 400.
2. ~~Appointment status/reschedule endpoints have no ownership check (IDOR).~~ **FIXED** — both handlers now call `getAppointmentAccess()` in `server/src/controllers/appointment.controller.js` and return 403 unless the caller is the appointment's patient, its doctor, or an admin.
3. ~~`ai-service` has zero authentication on any endpoint, including `/summarize`, which processes patient-supplied medical documents, and that endpoint fetches an arbitrary client-supplied URL with no SSRF protection.~~ **FIXED (2026-08-17)** — `/assistant/query` and `/summarize` now require `Authorization: Bearer <AI_SERVICE_TOKEN>` (checked by `ai-service/auth.py`, fails closed if unset); `/summarize` now rejects any `fileUrl` whose host isn't `res.cloudinary.com`, and caps the fetched file at 10MB before processing.
4. **Zero automated tests exist across all three services.** No test framework is installed in `server/package.json`, `client/package.json`, or `ai-service/requirements.txt` — nothing in the app has been regression-verified, including the two fixes above (syntax-checked only; no test DB available in this environment).
5. **Appointment Reminders — one of the ten named product features — has no implementation beyond a dangling database table.** No scheduler, worker, or notification-sending code exists anywhere.

> **Planned architecture change (ADR-007) — partially complete:** ADR-007 called for replacing Cloudinary and the paid Claude API with free/open-source alternatives. **Claude half: DONE.** As of 2026-08-17, `ai-service` was migrated off the Claude API onto a self-hosted Ollama backend (`ollama_client.py`, model `llama3.2-vision`) — see the now-updated items below (formerly referencing Anthropic SDK usage) under "Outdated / missing dependencies", "Performance issues", and "Refactoring opportunities". **Cloudinary half: NOT started.** File storage is unchanged. See `docs/DEV_CONTEXT.md` Section 10, item 0.

---

## 1. Hacks

- An orphaned `eslint-disable-next-line` comment exists in `server/index.js` even though **no ESLint dependency is installed anywhere in the repo** — a lint suppression for a linter that isn't configured.
- `client/src/pages/AdminDashboard.jsx` destructures `stats.popularSpecializations.map(...)` with no guard for that field being `undefined`/`null` if the backend response ever omits or renames it — will throw on any shape drift.
- `client/src/context/AuthContext.jsx`'s session-restore uses a single catch-all — `.catch(() => localStorage.removeItem("token"))` — that treats every `/auth/me` failure identically (network blip, 500, or a genuinely invalid token) and force-logs-out the user regardless of cause.
- `server/src/middleware/upload.middleware.js`'s multer `fileFilter` throws a plain `Error` with no `.status` on a disallowed MIME type, so it falls through the global error handler as a 500 instead of the correct 400.
- ~~`ai-service/assistant.py` and `ai-service/summarizer.py` only catch `json.JSONDecodeError` / `IndexError` / `AttributeError` around the Claude response — a narrow, happy-path-only exception net rather than a deliberate error-handling strategy.~~ **FIXED** — as part of the 2026-08-17 Claude→Ollama migration, both files now also catch `httpx.ConnectError` (Ollama unreachable → 502), `httpx.HTTPStatusError` (Ollama returned an error → 502), and `httpx.TimeoutException` (model too slow → 504).
- `ai-service/summarizer.py`'s `build_images()` (added in the same migration) caps PDF rasterization at `MAX_PDF_PAGES = 8` — a deliberate, code-commented scoping decision, but pages beyond the 8th are silently dropped with no indication in the returned summary that the document was truncated. A caller has no way to know their 20-page document was only partially read.
- `client/src/components/Appointment/BookingModal.jsx` hardcodes appointment duration to a client-side `30 * 60 * 1000` ms constant instead of deriving it from the doctor's `slot_minutes` (`doctor_availability` table) — works only because every doctor's slot length is currently assumed to be 30 minutes.

## 2. Duplicated code

- ~~`parse_json_response` (strips ```` ```json ```` fences and `json.loads`s the result) is implemented **verbatim** in both `ai-service/assistant.py` and `ai-service/summarizer.py` — it should be a single shared module.~~ **FIXED** — deduplicated into `ai-service/util.py` as a side effect of the 2026-08-17 Claude→Ollama migration (both files were already being rewritten for the client swap, so extracting the helper was incidental cleanup, not scope creep).
- No shared/typed API resource modules exist on the client (e.g. `doctors.js`, `appointments.js`, `documents.js`). Every page and component calls `api.get/post/patch` inline with hardcoded endpoint strings, effectively duplicating request-building logic across `PatientDashboard.jsx`, `DoctorDashboard.jsx`, `AdminDashboard.jsx`, `ChatWindow.jsx`, `DocumentCard.jsx`, `DocumentUpload.jsx`, and `BookingModal.jsx`.

## 3. Outdated / missing dependencies

- ~~`ai-service/requirements.txt` pins dated versions of `fastapi` (`0.111.0`) and `pydantic` (`2.7.4`).~~ **FIXED** — bumped as a necessary side effect of the 2026-08-17 Claude→Ollama migration: `fastapi` 0.111.0→0.141.1, `pydantic` 2.7.4→2.13.4, `uvicorn[standard]` 0.30.1→0.52.3, `python-dotenv` 1.0.1→1.2.3, `httpx` 0.27.0→0.28.1. This wasn't cosmetic — the old `pydantic` 2.7.4 pin has no prebuilt wheel for a current Python (verified against 3.14) and fails building from source (missing PyO3/Rust toolchain), meaning the service was actually uninstallable on a current Python before this bump.
- `server/package.json` declares **no `engines` field** despite `document.controller.js` relying on Node's built-in global `fetch`, which requires Node ≥18 — nothing declares or enforces the minimum runtime version.
- No test framework dependency exists in any of the three manifests: `server/package.json` (no Jest/Vitest/node:test beyond the bare `node --watch` dev script), `client/package.json` (no Vitest/Jest/Testing Library), `ai-service/requirements.txt` (no pytest).
- No linter/formatter dependency in any service: no ESLint/Prettier in `server/package.json` or `client/package.json`, no ruff/black in `ai-service/requirements.txt`.

## 4. Architectural problems

- ~~`ai-service` has no service-to-service authentication from the Express server — the "boundary" between `server` and `ai-service` is architectural in name only.~~ **FIXED (2026-08-17)** — both routes now require a shared-secret bearer token (`AI_SERVICE_TOKEN`), checked via `ai-service/auth.py`.
- No shared request/response contract (OpenAPI spec or shared types) exists between the three services, so response-shape drift (e.g. the `stats.popularSpecializations` field) can silently break a consumer.
- The database schema is a single hand-written `server/src/models/schema.sql` with no migration tool (e.g. node-pg-migrate, Prisma Migrate) — schema changes have no versioning or rollback path.
- No DB transactions wrap any multi-step server operation, despite multi-step flows existing (e.g. document upload + metadata insert).
- CORS is a single hardcoded origin from `CLIENT_ORIGIN` (server) and `CLIENT_ORIGIN`/`SERVER_ORIGIN` (ai-service) env vars, not a list — workable for one dev environment only, not multi-environment or multi-origin deployment.
- `client/vite.config.js` defines no dev-server proxy for `/api` — local development depends entirely on the backend's CORS allowlist being correctly configured.
- `client/src/components/Layout/ProtectedRoute.jsx` redirects a wrong-role authenticated user to `/`, but `/` (`App.jsx`) unconditionally redirects to `/login` regardless of auth state — an authenticated user who lands on the wrong dashboard route is bounced to the login page instead of their own dashboard.
- `client/src/services/socket.js` is a bare module-level singleton with no reconnection/error event listeners registered — connection failures or drops are architecturally invisible to the UI.
- `server/src/socket/socket.js` has no Redis (or other) adapter configured — the realtime chat layer cannot run across more than one server instance as currently designed.
- `client/src/components/Chat/ChatWindow.jsx`'s send flow has no optimistic local append — it structurally depends on the server echoing `message:new` back to the sender's own socket, an unverified assumption baked into the design (if the backend only broadcasts to the recipient, a user's own sent messages will never render).
- No logging/observability instrumentation exists anywhere in `ai-service`.
- No `helmet`/security-headers middleware and no structured request logging (morgan/winston) on the server — only `console.error` inside the global error handler.

## 5. Missing tests

- **No test framework is present in any of the three package manifests** — `server/package.json`, `client/package.json`, and `ai-service/requirements.txt` all confirmed to have zero test dependencies.
- No test files exist anywhere in the reviewed codebase across all three services.
- No CI configuration exists to run tests even if they existed.
- As a direct consequence: the three authorization/access-control fixes (register-as-admin, appointment IDOR, ai-service auth+SSRF+file-size-cap — all now fixed in code) and every "implemented" feature in this repo have **zero automated regression coverage** — everything has been verified by manual/code-level inspection only.
- The 2026-08-17 Claude→Ollama migration has been **code-verified only**: `python -m py_compile` passes on all `ai-service` files, a clean `pip install -r requirements.txt` succeeds on Python 3.14, the FastAPI app imports and registers all three routes, and deterministic logic (`build_images()`'s PDF rasterization, image passthrough, `parse_json_response()`) was unit-tested directly. It has **not** been verified against a live running Ollama server — none is installed in this dev environment — so real-world JSON-mode reliability and image/PDF summary quality with `llama3.2-vision` remain unknown until run against an actual local Ollama instance.
- Canonical Testing category score: **0 / 10**.

## 6. Performance issues

- No pagination anywhere: `listMyAppointments`, `listMyDocuments`, `getConversation`, and `searchDoctors` (server) all return unbounded result sets.
- ~~Synchronous Anthropic SDK `.messages.create()` calls are made inside `async def` route handlers in both `ai-service/assistant.py` and `ai-service/summarizer.py` with no thread offload — this blocks the FastAPI event loop per request.~~ **FIXED** — the 2026-08-17 migration to `ollama_client.py` replaced these with a proper async `httpx` call; the event loop is no longer blocked.
- ~~No `thinking`/effort configuration is set on either Claude call, and `max_tokens` (256 on `/assistant/query`, 1024 on `/summarize`) is a shared cap across thinking + output text — risk of the token budget being consumed before the JSON reply is produced.~~ **SUPERSEDED** — this was Claude-specific and no longer applies now that `ai-service` calls a local Ollama model. Replacement concern: no `num_predict`/context-length tuning has been done for `ollama_client.py`'s calls to `llama3.2-vision` — appropriate output-length and context-window sizing for the chosen model hasn't been validated, which carries a similar risk of truncated/incomplete JSON output.
- ~~`server/src/controllers/document.controller.js`'s `fetch()` call to `AI_SERVICE_URL` has no timeout/AbortController — a hung AI service call stalls the request indefinitely.~~ **FIXED (2026-08-17)** — the call now passes `signal: AbortSignal.timeout(30000)` and maps a timeout to a clean `504`.
- No caching/memoization exists on the client — all three role dashboards (`PatientDashboard`, `DoctorDashboard`, `AdminDashboard`) independently re-fetch their own data on every mount with no shared cache/store, no request deduplication, and no staleness handling.
- ~~`ai-service/summarizer.py` has no file-size limit on the fetched document before base64-encoding and sending it to the LLM backend.~~ **FIXED (2026-08-17)** — `/summarize` now streams the fetch and rejects (413) once 10MB is exceeded, before any of it is buffered or encoded.

## 7. Security concerns

### Input validation
- No centralized/schema-based input validation on the server (no express-validator/zod) — validation is ad hoc per controller; e.g. `bookAppointment` never checks that `startsAt < endsAt`.
- No schema/type validation on the JSON the LLM backend returns in `ai-service` (Ollama, as of the 2026-08-17 migration) before it's handed back to the frontend or used to build search filters.
- User input is interpolated directly into both ai-service prompt templates via `.format()` with no sanitization — a prompt-injection surface.
- `client/src/components/Document/DocumentUpload.jsx`'s file-type restriction is only the HTML `accept=".pdf,.jpg,.jpeg,.png"` attribute — a browser-side hint that can be bypassed; real enforcement depends entirely on the backend (multer's allowlist and 10MB limit).

### Rate limiting
- No rate limiting on `POST /api/auth/login` or `POST /api/auth/register` — brute-force/credential-stuffing exposure.
- No rate limiting on either ai-service endpoint (`/assistant/query`, `/summarize`). As of the 2026-08-17 Claude→Ollama migration this is no longer a paid-external-API cost exposure, but unbounded request volume can still exhaust the local/network-reachable Ollama server's compute (or GPU) capacity and degrade or deny service to every caller.

### Secret handling
- `server/.env.example` ships `JWT_SECRET=change-me` as a literal placeholder with nothing in the codebase enforcing a stronger value at startup.
- All three services rely entirely on `.env` files for secrets (`DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_API_SECRET` — `ANTHROPIC_API_KEY` was removed in the 2026-08-17 Claude→Ollama migration; the new `OLLAMA_BASE_URL`/`OLLAMA_MODEL` vars it added are configuration, not secrets) with no secrets-manager integration.
- No server-side token revocation mechanism exists — a compromised JWT remains valid for the full `JWT_EXPIRES_IN=7d` window.

### Document / data access control
- ~~**Privilege escalation (Critical):** `POST /api/auth/register` accepts a client-supplied `role` field including `"admin"` with zero restriction.~~ **FIXED** — see Critical issues above.
- ~~**IDOR (Critical):** `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` only require a valid JWT (`requireAuth`), not ownership of the appointment.~~ **FIXED** — see Critical issues above.
- ~~**No authentication on `ai-service` (Critical):** every endpoint, including `/summarize` which processes patient medical documents, is fully open.~~ **FIXED (2026-08-17)** — see Critical issues above.
- ~~**SSRF:** `ai-service/summarizer.py`'s `/summarize` fetches an arbitrary client-supplied `fileUrl` with no domain allowlist and no private-IP/internal-network blocking.~~ **FIXED (2026-08-17)** — `fileUrl`'s host must now be `res.cloudinary.com` (`ALLOWED_FILE_HOSTS` in `summarizer.py`) or the request is rejected with 400 before any fetch is attempted. Note this allowlist is Cloudinary-specific — it will need updating if/when the Cloudinary→self-hosted-storage half of ADR-007 lands.
- ~~`ai-service/summarizer.py` has no file-size limit on the fetched document before base64-encoding it and sending it to the LLM backend — a memory/compute DoS risk.~~ **FIXED (2026-08-17)** — see Performance issues above.
- The global Express error handler (`server/index.js`) returns raw `err.message` to the client for any unhandled error, including Postgres constraint/error text (e.g. FK or NOT NULL violations) — information disclosure.
- `server/src/socket/socket.js`'s `message:send` handler `await`s `pool.query` with no try/catch — a DB failure here is not caught by Express's `catchAsync` (this is a raw Socket.IO handler) and can crash the process.
- `client/src/services/api.js` has no response interceptor — there is zero centralized handling of 401/expired-token responses anywhere in the client.

## 8. Accessibility problems

No ARIA attributes, keyboard-navigation handling, focus management, alt-text conventions, or color-contrast consideration were found anywhere in the reviewed client code — this is a plain-CSS scaffold with no accessibility work done yet:

- No ARIA roles or labels on any custom component reviewed, including the modal (`BookingModal.jsx`), the chat window (`ChatWindow.jsx`), or any form.
- No documented focus trapping in `BookingModal.jsx` or any other overlay/dialog-like component.
- No alt-text or semantic-landmark conventions evident anywhere in the reviewed client code.
- The catch-all `*` route renders a bare, unstyled `<p>Page not found</p>` with no heading structure, no landmark, and no way back.
- Canonical Accessibility category score: **2 / 10**.

## 9. Temporary / stub solutions

- **Appointment Reminders (Critical gap):** a named product feature with only a dangling `reminders` table in `schema.sql` (`appointment_id`, `send_at`, `sent`) — no controller, route, scheduler/cron job, or notification-sending code exists anywhere in the codebase.
- Most client page-level fetches (`AdminDashboard.jsx`, `DoctorDashboard.jsx`, `PatientDashboard.jsx`, and `ChatWindow.jsx`'s history load) use `.then()` with no `.catch()` and no per-section loading indicator — failures present as either an infinite "Loading..." state or a silently-empty list.
- `client/src/components/Document/DocumentCard.jsx`'s `handleSummarize` has no catch block at all around its `await api.post(...)` — a failed summarize request is an unhandled promise rejection with zero user-facing error message.
- `Login.jsx` and `Register.jsx` submit buttons have no disabled/loading state during the async `login()`/`register()` call (inconsistent with `BookingModal.jsx` and `DocumentUpload.jsx`, which do implement a submitting state) — double-submit is possible.
- The catch-all `*` route (`App.jsx`) is a stub: bare `<p>Page not found</p>`, unstyled, no navigation back.
- `client/src/index.css` hardcodes `color-scheme: light` in `:root` with no dark-mode media query or toggle, despite using CSS custom properties that would make theming straightforward — a half-finished theming setup.

## 10. Refactoring opportunities

- ~~Extract `parse_json_response` (ai-service) into a shared module used by both `assistant.py` and `summarizer.py`.~~ **Done** — see `ai-service/util.py`, added in the 2026-08-17 Claude→Ollama migration.
- Introduce a consistent validation library across the server (zod or express-validator) and extend the ai-service's existing partial pydantic models to cover more request/response shapes.
- Create typed/shared API resource modules on the client (`doctors.js`, `appointments.js`, `documents.js`, `chat.js`) instead of scattering raw `api.get/post/patch` calls with hardcoded endpoint strings across pages and components.
- Add a client-side response interceptor in `services/api.js` for centralized 401/expired-token handling, replacing the current per-component silent-failure pattern.
- Introduce a lightweight client data layer (e.g. React Query) or shared context to dedupe the redundant per-mount refetching across `PatientDashboard`, `DoctorDashboard`, and `AdminDashboard`.
- Move from a single global `index.css` (generic class names like `.grid`, `.modal`, `.stat-card`) toward CSS Modules or another scoped styling approach before the component count grows further.
- Add a React error boundary — currently a render-time exception in any page yields a blank white screen with no fallback UI.
- Add TypeScript or PropTypes to the client — there is currently zero compile-time or runtime type safety on component props or API response shapes.
- ~~Broaden ai-service exception handling beyond `JSONDecodeError`/`IndexError`/`AttributeError` to also cover Anthropic SDK exceptions (`RateLimitError`, `AuthenticationError`, `APIConnectionError`, overloaded errors) and httpx connection/timeout errors, mapping each to an appropriate HTTP status instead of a raw 500.~~ **Done** — the Anthropic-specific half is moot now that the SDK is gone; the httpx half was implemented in the 2026-08-17 migration (`httpx.ConnectError`→502, `httpx.HTTPStatusError`→502, `httpx.TimeoutException`→504 — see "Hacks" and "Performance issues" above).

---

## Recommended remediation order

1. ~~Restrict registerable roles on `POST /api/auth/register` to `patient`/`doctor` only; add ownership checks to the appointment status/reschedule endpoints.~~ **Done.** Admin accounts still have no out-of-band provisioning path (open question, not blocking).
2. ~~Add authentication to `ai-service` (a shared service token from the Express server), plus a domain allowlist or private-IP block on `/summarize`'s `fileUrl` fetch and a file-size cap before base64-encoding.~~ **Done (2026-08-17).**
3. Introduce a centralized input-validation layer (zod or express-validator on the server; extend the existing pydantic models on ai-service), and wrap `socket.js`'s `message:send` handler in try/catch with payload validation so a DB failure can't crash the process.
4. Stand up automated test coverage across all three services — server integration tests against a test database, ai-service unit tests with a mocked Ollama/httpx client, and client component tests. Currently zero tests exist anywhere.
5. Implement the Appointment Reminders feature end-to-end: a scheduler/worker that reads the `reminders` table and sends notifications, since only the DB table currently exists.
6. Add pagination to the unbounded list endpoints (appointments, documents, chat history, doctor search), and add a response interceptor plus error boundaries/loading states on the client for consistent error and 401 handling.
