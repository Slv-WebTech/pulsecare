# Project Score — Healthcare Appointment & Patient Portal

This scorecard evaluates the healthcare-app scaffold as it stands today: a freshly generated
project (~1 hour old, not yet a git repository) spanning a React/Vite client, an Express/PostgreSQL
server, and a FastAPI/Ollama ai-service. Scores reflect actual evidence found in the codebase during
discovery — not aspirational targets. Nothing here is inflated; several categories score low because
the scaffold genuinely has not reached that stage of maturity yet.

**Overall Score: 4.5 / 10** *(updated 2026-08-17, same day — see Security/Architecture/Error handling notes below; was 4.3)*

## Score Summary

| Category | Score /10 | Reasoning |
|---|---|---|
| Architecture | 7.5 | *(was 7)* Clean 3-service split (React/Vite client, Express/Postgres server, FastAPI/Ollama ai-service) with a sensible boundary: Node never calls the LLM directly, it proxies through ai-service, which itself talks to a local Ollama server over plain httpx (no LLM SDK dependency, since the 2026-08-17 migration off the Claude API). REST is organized by resource with consistent route/controller/middleware layering. The server↔ai-service boundary is now a real security boundary, not just an architectural one — ai-service requires a shared bearer token (`AI_SERVICE_TOKEN`) on every route, fixed same-day. Remaining weak points: no API gateway/shared contract between services, and only a single schema.sql with no migration tooling. |
| Code quality | 6 | *(was 5.5)* Server controllers issue real parameterized SQL with consistent patterns (catchAsync wrapper, ON CONFLICT upserts) and the client uses a consistent component/page structure. The previously-duplicated `parse_json_response` helper is now deduplicated into a shared `ai-service/util.py` module (fixed during the 2026-08-17 Ollama migration). Remaining gaps: no linter configured anywhere, and validation logic is ad hoc and inconsistent per controller. |
| Maintainability | 4 | No tests, no linter, duplicated logic, and a single global CSS file with generic class names all raise the cost of future change. The codebase is small and consistent enough to still be tractable today, but there is no safety net for refactors. |
| UI/UX | 4 | All core flows (search, book, upload, chat, dashboards) are wired end-to-end with a real form/page structure, but almost every page-level fetch has no loading state and the 404 page is a bare unstyled `<p>`. Login/Register buttons don't disable during submission, risking double-submits. |
| Accessibility | 2 | No evidence anywhere in the discovery of ARIA attributes, keyboard-navigation handling, focus management (notably in modals), alt text conventions, or color-contrast consideration. This is a plain-CSS scaffold with no accessibility work done yet. |
| Performance | 4.5 | *(was 4)* Reasonable DB indexing exists (patient/doctor/appointment/specialization/location indexes) and JWT auth avoids server-side session lookups. The ai-service's LLM calls now use a proper async `httpx.AsyncClient` and no longer block the event loop (fixed during the 2026-08-17 Ollama migration). Remaining gaps: there is still no pagination anywhere, and the client re-fetches everything on every mount with no caching. |
| Security | 5 | *(was 3.5, same day)* Three of the four originally-flagged concrete access-control gaps are now fixed: admin self-registration, appointment IDOR, and — as of this update — ai-service's lack of authentication plus its SSRF-prone, uncapped document fetch (`AI_SERVICE_TOKEN` bearer auth, a Cloudinary-only host allowlist, and a 10MB streaming size cap on `/summarize`). Still open: a placeholder JWT secret with nothing enforcing a stronger value, no rate limiting anywhere, and the global Express error handler leaking raw error text. Still pre-production, but meaningfully improved twice in one day. |
| Testing | 0 | No test framework is present in any of the three package manifests (server package.json, client package.json, ai-service requirements.txt all confirmed to have zero test dependencies), and no test files were found in either discovery pass. There is no automated verification of any kind. |
| Documentation | 9 | Scored assuming the comprehensive `/docs` suite generated in this phase is thorough and accurate. The README already provides an honest, well-structured baseline (stack table, structure, getting-started steps, roles, explicit status caveat), which this canonical doc set expands into full architecture, API, feature, and risk documentation. |
| Scalability | 3.5 | JWT stateless auth and a service-per-concern split are scalability-friendly foundations, but unbounded queries everywhere, no caching layer, and an in-process Socket.IO singleton with no multi-instance adapter all cap how far this scales without rework. |
| Developer experience | 5 | Getting-started steps in the README are clear and accurate (DB seed, three independent dev servers with correct ports), and `.env.example` files exist for all three services. But there's no linter/formatter, no test runner, no CI, and no dev-server proxy for `/api` on the client. |
| Error handling | 3 | *(was 2.5)* Error handling is present but still narrow and inconsistent in most places: the socket.js message handler has no try/catch at all, most client page fetches use `.then` with no `.catch`, DocumentCard's summarize call has no catch block, and the global Express error handler leaks raw error messages. Two concrete gaps closed same-day: ai-service's previously-narrow exception handling around its LLM calls was broadened during the Ollama migration, and `document.controller.js`'s call to ai-service — previously able to hang indefinitely — now has an explicit 30s timeout mapped to a clean `504`. |
| Responsive design | 3 | The entire app relies on a single global CSS file with exactly one `@media(max-width:768px)` breakpoint. That provides basic mobile adaptation but no evidence of a broader responsive strategy. |
| Feature completeness | 4.5 | Of the 10 canonical features, roughly half have real end-to-end happy paths (auth, doctor search, document upload, admin stats aggregation) while the rest are partially wired with real functional gaps, or entirely missing implementation code (Appointment Reminders — schema table only, no controller/route/scheduler anywhere). |

---

## Category Detail

### Architecture — 7.5 / 10 *(was 7)*

Clean 3-service split (React/Vite client, Express/Postgres server, FastAPI/Ollama ai-service) with a
sensible boundary: Node never calls the LLM directly, it proxies through ai-service. As of the
2026-08-17 migration off the Claude API, ai-service itself talks to a local Ollama server via a thin
httpx client — there is no LLM SDK dependency anywhere in the stack anymore. REST is organized
by resource with consistent route/controller/middleware layering (requireAuth/requireRole,
catchAsync). Realtime chat is cleanly separated into its own Socket.IO module. The server↔ai-service
boundary, previously architectural in name only, is now enforced: ai-service requires a shared
`AI_SERVICE_TOKEN` bearer token on every route (fixed the same day as this update). Remaining weak
points: no API gateway/shared contract between services, and the schema has no migration tooling
beyond a single schema.sql.

**Weaknesses**
- No shared validation/contract layer between client, server, and ai-service response shapes
- Single schema.sql with no versioned migration path

**Fixed**
- ~~ai-service has no authentication from the server, so the boundary between server and ai-service is architectural in name only~~ — ai-service now requires `Authorization: Bearer <AI_SERVICE_TOKEN>` on `/assistant/query` and `/summarize` (fails closed if unset)

**Recommended improvements**
- Adopt a migration tool (e.g. node-pg-migrate, Prisma migrate) instead of a single schema.sql
- Define shared request/response contracts (OpenAPI or shared types) across the three services

---

### Code quality — 6 / 10 *(was 5.5)*

Server controllers issue real parameterized SQL with consistent patterns (catchAsync wrapper,
ON CONFLICT upserts). Client uses consistent component/page structure. The verbatim code duplication
that used to exist (parse_json_response duplicated in assistant.py/summarizer.py) is now fixed: the
2026-08-17 Ollama migration extracted it into a shared `ai-service/util.py` module while both files
were already being rewritten for the LLM client swap. Remaining gaps: no linter configured
anywhere despite an eslint-disable comment existing in index.js, and validation logic is ad hoc and
inconsistent per controller.

**Weaknesses**
- No ESLint/Prettier/ruff configured in any of the three services
- Ad hoc, inconsistent input validation per controller (e.g. bookAppointment never checks startsAt < endsAt)
- No shared API resource modules on the client; raw api.get/post calls scattered with hardcoded endpoint strings

**Fixed**
- ~~`parse_json_response` duplicated verbatim across ai-service files~~ — extracted into shared `ai-service/util.py` as part of the 2026-08-17 Ollama migration

**Recommended improvements**
- Add and enforce a linter/formatter in all three services
- Introduce a validation library (zod/express-validator, pydantic models already partially used) applied consistently
- Create typed API resource modules on the client (doctors.js, appointments.js, documents.js)

---

### Maintainability — 4 / 10

No tests, no linter, duplicated logic, and a single global CSS file with generic class names all raise
the cost of future change. The codebase is small and consistent enough to still be tractable today, but
there is no safety net for refactors.

**Weaknesses**
- Zero automated tests across all three services means every change is manually verified
- Single global index.css with generic class names (.grid, .modal, .stat-card) risks collisions as the app grows
- No shared cache/store on the client — every dashboard independently re-fetches its own data on every mount
- ~~Duplicated parse_json_response logic in ai-service~~ — fixed: extracted into shared `ai-service/util.py` during the 2026-08-17 Ollama migration

**Recommended improvements**
- Add a test suite before further feature work to make refactors safe
- Move to CSS Modules or scoped styling as component count grows
- Introduce a lightweight client data layer (React Query or a shared context) to dedupe fetches

---

### UI/UX — 4 / 10

All core flows (search, book, upload, chat, dashboards) are wired end-to-end with a real form/page
structure, but almost every page-level fetch has no loading state and the 404 page is a bare unstyled
`<p>`. Login/Register buttons don't disable during submission, risking double-submits.

**Weaknesses**
- Most dashboards show no loading indicator while fetching, and show a silently-empty list or a stuck "Loading..." on failure
- Catch-all 404 route is an unstyled `<p>Page not found</p>` with no way back
- Login/Register submit buttons lack a disabled/loading state during the async call
- BookingModal hardcodes a 30-minute appointment duration and allows past-date selection

**Recommended improvements**
- Add loading and error states to every data-fetching page (Admin/Doctor/Patient dashboards, ChatWindow)
- Style the 404 page and add a link home
- Add submitting/disabled states to Login and Register forms
- Validate booking date is in the future and surface duration explicitly in the UI

---

### Accessibility — 2 / 10

No evidence anywhere in the discovery of ARIA attributes, keyboard-navigation handling, focus
management (notably in modals), alt text conventions, or color-contrast consideration. This is a
plain-CSS scaffold with no accessibility work done yet.

**Weaknesses**
- No ARIA roles/labels found on any custom component (modal, chat window, forms)
- No documented focus trapping in BookingModal or any other overlay
- No alt-text or semantic-landmark conventions evident in the discovery output

**Recommended improvements**
- Add focus trapping and ARIA roles to BookingModal and any other dialog-like component
- Run an automated accessibility audit (axe) once the docs suite lands and fix flagged issues
- Establish semantic HTML/landmark conventions in a shared layout component

---

### Performance — 4.5 / 10 *(was 4)*

Reasonable DB indexing exists (patient/doctor/appointment/specialization/location indexes) and JWT
auth avoids server-side session lookups. The synchronous Anthropic SDK calls that used to block the
ai-service event loop are gone: the 2026-08-17 Ollama migration replaced them with a proper async
`httpx.AsyncClient` call in `ollama_client.py`. There is still no pagination anywhere, and the client
re-fetches everything on every mount with no caching.

**Weaknesses**
- No pagination on any list endpoint (appointments, documents, chat history, doctor search) — unbounded result sets
- No caching/memoization on the client — every dashboard mount triggers full re-fetch of all its data

**Fixed**
- ~~Synchronous Anthropic `.messages.create()` calls inside async FastAPI route handlers block the event loop per request~~ — `ollama_client.py` now makes a proper async `httpx.AsyncClient` call
- ~~document.controller.js's fetch to AI_SERVICE_URL has no timeout, so a hung AI call stalls the request indefinitely~~ — now passes `signal: AbortSignal.timeout(30000)`, mapped to a clean `504` on timeout

**Recommended improvements**
- Add pagination (limit/offset or cursor) to all list endpoints
- Add a client-side cache layer (React Query) to avoid redundant refetches

---

### Security — 5 / 10 *(was 3.5, updated again same day)*

**Update (same day, second pass):** three of the four originally-flagged concrete, exploitable gaps
are now fixed: public registration can no longer self-assign `role: "admin"`, appointment
status/reschedule now enforce ownership, and — as of this pass — ai-service now requires a shared
bearer token on every route and its `/summarize` endpoint rejects any `fileUrl` outside Cloudinary's
domain with a 10MB streaming size cap before any data is buffered or sent to the model. What remains
is real but narrower: a placeholder JWT secret, no rate limiting anywhere, and the global error
handler leaking raw internal text. Still pre-production, but no longer has a full remote
privilege-escalation or SSRF path.

**Weaknesses (remaining)**
- JWT_SECRET defaults to the literal placeholder 'change-me' with nothing enforcing a stronger value
- No rate limiting on /api/auth/login, /api/auth/register, or either ai-service endpoint
- Global error handler returns raw err.message to the client, leaking internal error/constraint text
- Admin accounts still have no dedicated out-of-band provisioning path (must be created directly in the database)
- No schema/type validation on the JSON the LLM returns before it's used to build search filters or shown to the user
- User input is interpolated into ai-service prompt templates with no sanitization — a prompt-injection surface

**Fixed**
- ~~POST /api/auth/register accepts a client-supplied role including 'admin' with no restriction~~ — now validated against `REGISTERABLE_ROLES = {patient, doctor}`
- ~~PATCH /api/appointments/:id/status and /reschedule have no ownership check~~ — now gated by `getAppointmentAccess()`
- ~~ai-service has zero authentication on any endpoint, including one that processes patient medical documents~~ — now requires `Authorization: Bearer <AI_SERVICE_TOKEN>` on `/assistant/query` and `/summarize` (fails closed if the token is unset), checked via `ai-service/auth.py`
- ~~/summarize fetches an arbitrary client-supplied fileUrl with no domain allowlist or private-IP blocking (SSRF)~~ — now rejects any `fileUrl` whose host isn't `res.cloudinary.com` with a 400, before attempting any fetch
- ~~/summarize has no file-size limit before base64-encoding and sending the file to the model~~ — now streams the fetch and rejects (413) once 10MB is exceeded

**Recommended improvements**
- Enforce a strong JWT_SECRET at startup (fail fast if unset or equal to the placeholder)
- Add rate limiting (e.g. express-rate-limit) to auth and AI-backed endpoints
- Sanitize error responses so raw internal messages never reach the client

---

### Testing — 0 / 10

No test framework is present in any of the three package manifests (server package.json, client
package.json, ai-service requirements.txt all confirmed to have zero test dependencies), and no test
files were found in either discovery pass. There is no automated verification of any kind.

**Weaknesses**
- No test runner/framework in server, client, or ai-service
- No test files found anywhere in the reviewed codebase
- No CI configuration evident to run tests even if they existed

**Recommended improvements**
- Add a test framework per service (e.g. Vitest for client, a Node test runner or Jest for server, pytest for ai-service)
- Start with integration tests locking in the two recently-fixed authorization gaps (register-as-admin, appointment IDOR) so they can't silently regress
- Add CI to run tests on every change once they exist

---

### Documentation — 9 / 10

Per task instructions, scored assuming the comprehensive `/docs` suite generated in the next phase is
thorough and accurate. The README already provides an honest, well-structured baseline (stack table,
structure, getting-started steps, roles, explicit status caveat), which this canonical doc expands into
full architecture, API, feature, and risk documentation.

**Weaknesses**
- Not yet published as of this scoring pass — this score assumes the planned suite lands as specified
- No in-code API documentation (docstrings/JSDoc/OpenAPI spec) exists in the application code itself

**Recommended improvements**
- Generate and publish the planned /docs suite (architecture, API reference, setup, feature status)
- Add lightweight in-code documentation (OpenAPI spec for server/ai-service routes) to keep docs and code in sync going forward

---

### Scalability — 3.5 / 10

JWT stateless auth and a service-per-concern split are scalability-friendly foundations, but unbounded
queries everywhere, no caching layer, a single Postgres instance with no read replicas/pooling
strategy discussed, and an in-process Socket.IO singleton with no multi-instance adapter all cap how
far this scales without rework.

**Weaknesses**
- No pagination means result sets grow unbounded with data volume
- Socket.IO has no adapter (e.g. Redis) for running multiple server instances
- No caching layer anywhere in the stack
- Single hardcoded CORS origin, not designed for multi-environment/multi-origin deployment

**Recommended improvements**
- Add pagination before data volume grows
- Add a Socket.IO Redis adapter if horizontal scaling of the server is planned
- Introduce a caching layer for read-heavy endpoints (doctor search, admin stats)

---

### Developer experience — 5 / 10

Getting-started steps in the README are clear and accurate (DB seed, three independent dev servers
with correct ports), and .env.example files exist for all three services. But there's no
linter/formatter, no test runner, no CI, and no dev-server proxy for /api on the client, so local setup
works but ongoing development lacks guardrails.

**Weaknesses**
- No linter/formatter configured in any service
- No CI pipeline evident anywhere in the repo
- No dev-server proxy for /api in vite.config.js — client relies entirely on backend CORS config for local dev
- No test runner to give fast feedback during development

**Recommended improvements**
- Add ESLint/Prettier (client+server) and ruff/black (ai-service)
- Add a CI workflow running lint+test on every push once tests exist
- Add a Vite dev-server proxy for /api to simplify local development

---

### Error handling — 3 / 10 *(was 2.5)*

Error handling is present but still narrow and inconsistent in the places that haven't been touched:
the socket.js message handler has no try/catch at all, most client page fetches use .then with no
.catch, DocumentCard's summarize call has no catch block, and the global Express error handler leaks
raw error messages instead of sanitizing them. Two gaps here are now fixed: ai-service exception
handling was broadened during the 2026-08-17 Ollama migration to also catch `httpx.ConnectError`
(-> 502), `httpx.HTTPStatusError` (-> 502), and `httpx.TimeoutException` (-> 504) from the LLM
backend, not just JSON-parse failures; and, same day, `document.controller.js`'s call to ai-service —
previously able to hang indefinitely — now has an explicit 30s timeout mapped to a clean `504`.

**Weaknesses**
- socket.js's message:send handler awaits pool.query with no try/catch — a DB failure can crash the process
- Most client dashboards (Admin/Doctor/Patient) and ChatWindow use .then() with no .catch()
- DocumentCard.handleSummarize has no catch block at all — unhandled promise rejection on failure
- Global Express error handler returns raw err.message to clients instead of a sanitized message

**Fixed**
- ~~ai-service only caught JSONDecodeError/IndexError/AttributeError; SDK and httpx errors surfaced as raw 500s~~ — broadened during the 2026-08-17 Ollama migration to also catch connection, HTTP-status, and timeout errors from the LLM backend
- ~~document.controller.js's fetch to ai-service has no timeout — a hung call stalls the request indefinitely~~ — now has an explicit 30s timeout (`AbortSignal.timeout`), mapped to a clean 504

**Recommended improvements**
- Wrap socket.js's async handler body in try/catch and emit a structured error event on failure
- Add .catch() and a visible error state to every client data fetch
- Add a catch block to DocumentCard's summarize flow
- Sanitize the global error handler's client-facing message, logging full detail server-side only

---

### Responsive design — 3 / 10

The entire app relies on a single global CSS file with exactly one `@media(max-width:768px)`
breakpoint. That provides basic mobile adaptation but no evidence of a broader responsive strategy
(tablet breakpoints, fluid typography, responsive nav, etc.).

**Weaknesses**
- Only one breakpoint (768px) exists across the entire stylesheet
- No responsive testing evidence for tablet-sized viewports
- No responsive treatment mentioned for the chat window or modal on small screens

**Recommended improvements**
- Add intermediate breakpoints for tablet-sized viewports
- Verify and adjust BookingModal/ChatWindow layouts on small screens
- Consider a fluid/utility-based layout approach as the UI grows

---

### Feature completeness — 4.5 / 10

Of the 10 canonical features, roughly half have real end-to-end happy paths (auth, doctor search,
document upload, admin stats aggregation) while the rest are partially wired with real functional gaps
(booking validation, IDOR on status/reschedule, chat error handling) or entirely missing implementation
code (Appointment Reminders — schema table only, no controller/route/scheduler anywhere).

**Weaknesses**
- Appointment Reminders has no application code anywhere — only a dangling reminders DB table
- AI Document Summarization's SSRF and size-limit gaps are now fixed (same day), but it's still code-verified only — not yet runtime-tested against a live Ollama server — and the client's `DocumentCard` still has no catch block on a failed summarize call
- ~~Appointment status/reschedule work functionally but have no ownership enforcement~~ — fixed
- ~~Registration technically works but allows selecting role=admin~~ — fixed
- ~~AI Document Summarization lacks hardening (SSRF, no request/document size limits)~~ — fixed same day (host allowlist + 10MB streaming cap on `/summarize`, plus `AI_SERVICE_TOKEN` auth)

**Recommended improvements**
- Implement the Appointment Reminders feature end-to-end (scheduler/worker + notification delivery)
- Add a catch block to `DocumentCard`'s summarize call and verify the AI summarization path against a live Ollama server

---

## Overall Score: 4.5 / 10 *(was 4.3, both updates same day)*

### Overall Health

healthcare-app is a genuinely functional scaffold, not a mock: real bcrypt/JWT auth, parameterized SQL
against a real schema, a working Cloudinary upload path, an authenticated Socket.IO chat layer, and two
genuinely-invoked AI integrations all exist and work on their happy paths — as of a 2026-08-17
migration, these are backed by a local Ollama model instead of the Claude API. Architecture (7.5/10)
and Documentation (9/10, contingent on this doc suite) are the clear strengths. This document has been
updated twice in one day: first the Claude→Ollama migration deduplicated the long-standing
`parse_json_response` helper (Code quality 5.5 → 6), replaced blocking synchronous LLM calls with a
proper async httpx client (Performance 4 → 4.5), and broadened ai-service's exception handling
(Error handling 2.5 → 3, alongside a same-day fix adding a timeout to the server's ai-service call).
Then, in a second same-day pass, ai-service was locked down: it now requires a shared bearer token on
every route and its `/summarize` endpoint rejects any file URL outside Cloudinary's domain with a 10MB
streaming cap before anything is buffered — closing out the fourth (and last) of the originally-flagged
concrete access-control gaps (Security 2 → 3.5 → 5, Architecture 7 → 7.5). What's left still pulls the
average down hard: Testing sits at 0/10 with no test framework installed anywhere in the three services
— none of today's fixes have automated regression coverage, including the AI integration itself, which
remains code-verified only, not yet runtime-tested against a live Ollama server. Accessibility (2/10)
has received no attention yet, and real remaining security gaps persist (placeholder JWT secret, no
rate limiting, error-message leakage). Given the project is roughly one day old, this profile still
reflects an early scaffold, not a production-ready system — but every originally-flagged critical
access-control vulnerability is now closed. The highest-leverage next step is standing up automated
test coverage (starting with the four fixed authorization/access-control gaps, none of which are
regression-tested yet) before further feature work proceeds.
