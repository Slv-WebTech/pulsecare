# Testing

## Current state: no automated tests exist

This project has **zero automated test coverage**, in any of its three services, as of this writing. That is not an approximation — it is confirmed directly from each service's dependency manifest:

| Service      | Manifest                     | Test framework present? |
|--------------|-------------------------------|--------------------------|
| `server/`    | `server/package.json`         | No — no test runner in `dependencies`, no `devDependencies` block at all, and `scripts` only defines `dev` (`node --watch index.js`) and `start` (`node index.js`). No `test` script exists. |
| `client/`    | `client/package.json`         | No — `dependencies` are limited to `axios`, `react`, `react-dom`, `react-router-dom`, `socket.io-client`; `devDependencies` are limited to `@vitejs/plugin-react` and `vite`. `scripts` only defines `dev`, `build`, `preview`. No `test` script exists. |
| `ai-service/`| `ai-service/requirements.txt` | No — `pytest` is not listed. As of the 2026-08-17 Ollama migration (see below), the pinned dependency list is `fastapi==0.141.1`, `uvicorn[standard]==0.52.3`, `pydantic==2.13.4`, `python-dotenv==1.2.3`, `httpx==0.28.1`, `pymupdf==1.28.2`. `anthropic` has been removed. |

No test files exist anywhere in the codebase, and there is no CI configuration to run tests even if they existed. This matches the project's actual age: it is a scaffold generated roughly an hour before this document was written, with business logic and hardening still to be filled in. The canonical review scores **Testing at 0/10** for exactly this reason — not as a stylistic judgment, but because the infrastructure to verify any behavior automatically does not exist yet.

Every statement below is a **recommendation for work that has not started**, not a description of anything currently implemented. Where this document names a specific bug or gap as a "test priority," that bug/gap is real and already documented elsewhere in this docs suite (see the architecture/API/risk docs) — the test does not exist to catch it yet.

---

## Why this matters here specifically

This is a healthcare-adjacent app handling patient identity, medical documents, and appointment scheduling. Two categories of defect are especially expensive to ship silently:

1. **Authorization gaps** — the codebase had two known, concrete ones (public self-registration as `admin`, and appointment status/reschedule endpoints with no ownership check); both are now fixed in code, but **neither fix has automated regression coverage** — nothing runs the code except manual use and a syntax check, so a future change could silently reintroduce either gap.
2. **Data-integrity guarantees that look correct but aren't verified under concurrency or failure** — e.g., the double-booking constraint is enforced at the database level (good design), but there is no test proving the controller actually surfaces that constraint violation as a clean `409` rather than a leaked Postgres error via the global handler's raw `err.message` passthrough.

A test suite is the difference between "the demo works" and "this is safe to run."

---

## Recommended strategy

Three layers, scoped per service. None of this exists yet — the structure below is a plan, ordered so that the highest-risk, highest-value coverage lands first.

### 1. Unit tests
Fast, no network/DB/external services. Target pure logic: request validation, SQL WHERE-clause construction, JWT payload shape, prompt-template formatting, JSON-response parsing (e.g. `parse_json_response` in `ai-service/assistant.py` / `ai-service/summarizer.py`), status-transition rules in `AppointmentCard.jsx`'s `STATUS_ACTIONS` map.

### 2. Integration tests
Exercise a real (or containerized/test) Postgres instance for the server, and a real FastAPI test client with the outbound Ollama HTTP call mocked for ai-service. This is where the two known authorization bugs, the double-booking constraint, and document-ownership scoping should be proven — these are exactly the kind of defect that unit tests with mocked dependencies would miss, because the bug lives in the interaction between the route, the middleware, and the actual SQL `WHERE` clause.

> Since the 2026-08-17 Ollama migration, mocking ai-service's LLM dependency is actually *simpler* than it was with the Claude SDK: `ollama_client.py` is a thin `httpx` wrapper that POSTs to Ollama's local `/api/chat` endpoint, so tests can mock that HTTP call directly — e.g. with `httpx`'s built-in `MockTransport` or a library like `respx` — instead of mocking a vendor SDK client object. This is a minor testability improvement that falls out of the migration; it does not change the fact that no such test exists yet.

### 3. End-to-end (E2E) tests
Drive the client against a running server (and ideally a running ai-service) to verify a full user journey: register → login → search doctors → book appointment → upload document → request AI summary → chat. Lowest priority given the current state — there is no value in E2E coverage before the unit/integration layers exist, since E2E tests are the slowest to write, run, and diagnose, and right now every layer underneath them is unverified.

---

## Suggested frameworks (consistent with the existing stack)

No framework choice has been made yet in the codebase; these are recommendations chosen to fit each service's existing tooling with minimal new dependencies.

| Service       | Unit / integration                                  | Rationale |
|---------------|-------------------------------------------------------|-----------|
| `server/`     | **Vitest** or **Jest**, plus **Supertest**             | The server already uses ESM (`"type": "module"` in `package.json`) and native `fetch`/Node 18+ conventions; Vitest has first-class ESM support with less config than Jest. Supertest drives `server/index.js`'s Express `app` directly over HTTP without needing a live network port. |
| `client/`     | **Vitest** + **React Testing Library**                 | The client is already a Vite project (`vite ^5.3.3`, `@vitejs/plugin-react`), so Vitest shares Vite's config/transform pipeline with zero extra bundler setup. React Testing Library matches the component-per-file structure already in `client/src/components` and `client/src/pages`. |
| `ai-service/` | **pytest**, plus **pytest-asyncio** and FastAPI's `TestClient` (`httpx`, already a dependency) | pytest is the de facto standard for FastAPI projects and pairs directly with FastAPI's own testing docs; `httpx` is already pinned in `requirements.txt` so `TestClient`/`AsyncClient` needs no new dependency beyond `pytest` and `pytest-asyncio`. |
| E2E (cross-service, later) | **Playwright** | Not yet justified given current coverage is zero; note it here only as the eventual choice once unit/integration layers exist, since it can drive the real Vite dev build against a real running server. |

---

## Test commands to add

None of these scripts exist today. Proposed additions:

**`server/package.json`** — add to `scripts` (and add the frameworks above to a new `devDependencies` block, which does not currently exist):
```json
"scripts": {
  "dev": "node --watch index.js",
  "start": "node index.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**`client/package.json`** — add to `scripts`:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**`ai-service/`** — no `pyproject.toml` currently exists (dependencies are pinned in `requirements.txt` only). Recommend adding a minimal `pyproject.toml` for pytest configuration, plus a `requirements-dev.txt` (or a `[dev]` extra) listing `pytest`, `pytest-asyncio`, and `pytest-cov`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```
Run with: `pytest` / `pytest --cov=. --cov-report=term-missing`.

---

## Coverage expectations

There is no coverage baseline today (0%, since no test runner exists). Recommended targets once the suite is stood up, scoped realistically to this project's size and risk profile rather than an arbitrary blanket number:

- **Auth, appointment, and document controllers/routes (server)** — these guard privilege escalation, IDOR, and patient data access; treat as the highest bar. Aim for coverage of every branch in `auth.controller.js`, `appointment.controller.js`, and `document.controller.js`, plus both middleware functions in `auth.middleware.js`.
- **Route/middleware wiring (server)** — every route file should have at least one test proving the *correct* middleware chain is applied (e.g. that `/api/admin/stats` actually 403s a non-admin, that `/api/appointments` booking actually 401s an unauthenticated caller).
- **ai-service endpoints** — both `/assistant/query` and `/summarize` need tests covering the happy path (mocked Ollama `/api/chat` response) and the failure paths now explicitly caught since the 2026-08-17 Ollama migration: connection refused (`httpx.ConnectError`, Ollama not running → `502`), non-2xx status (`httpx.HTTPStatusError` → `502`), request timeout (`httpx.TimeoutException` → `504`), and invalid/non-JSON model output — none of these have automated coverage yet, and they should not ship untested.
- **Client components with real logic** — `BookingModal`, `DocumentUpload`, `ProtectedRoute`, `AuthContext`, `AppointmentCard`'s status-transition map, and `api.js`'s request interceptor are the components with actual conditional logic worth testing; purely presentational components (`DoctorCard`, `Navbar`) are lower priority.
- Do not chase a percentage figure before the critical-flow list below is covered — a high coverage number over untested-for-correctness assertions is worse than an honest partial suite that proves the auth and booking guarantees actually hold.

---

## Critical flows to prioritize first

In order, based on what is currently a known, real gap or a load-bearing guarantee in the system:

1. **Appointment double-booking prevention.** `schema.sql` enforces `CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)`, and `bookAppointment` is documented as mapping a conflict to `409`. Write an integration test that books the same doctor/time twice concurrently (or sequentially) and asserts a clean `409` response — not a raw Postgres error string leaking through the global error handler. This is the single most important server guarantee to lock in before anything else, because it's the one place the design already relies on a database constraint rather than application logic, and nothing currently proves the controller translates that constraint failure correctly.

2. **JWT auth / RBAC.** `requireAuth` and `requireRole` in `server/src/middleware/auth.middleware.js` gate every non-public route. Tests should cover: missing token → `401`; invalid/expired token → `401`; valid token with wrong role hitting a role-gated route (e.g. a patient calling `PUT /api/doctors/profile`, or a non-admin calling `GET /api/admin/stats`) → `403`/rejected. This is also where the registration role-restriction fix belongs as a regression test: `POST /api/auth/register` **used to accept** a client-supplied `role` field including `"admin"` with no restriction; that's now fixed in code (`REGISTERABLE_ROLES`), but has zero automated coverage — write the test that asserts `role: "admin"` is rejected so the fix can't silently regress.

3. **Document access control scoped to `patient_id`.** `listMyDocuments` and related document routes are documented as authenticated but should be tested to prove they return only the caller's own documents — that `patient_id` scoping is actually enforced in the SQL `WHERE` clause, not just assumed. This directly parallels the appointment IDOR bug that was found and fixed (`PATCH /api/appointments/:id/status` and `/reschedule` now enforce an ownership check via `getAppointmentAccess()`, but the fix itself has **no automated test** proving a non-owner gets `403`); document endpoints should get the same ownership-check test treatment even where scoping is currently believed correct, and locking in the appointment ownership fix with a regression test is a top priority.

4. **AI summary error handling.** `POST /api/documents/:id/summarize` (server) and `POST /summarize` (ai-service) previously only handled the JSON-happy-path plus a narrow set of parse exceptions (`json.JSONDecodeError`, `IndexError`, `AttributeError`), with Anthropic SDK errors named as an unhandled gap. Since the 2026-08-17 Ollama migration, ai-service's exception handling has been broadened to also catch `httpx.ConnectError` (Ollama not running → `502`), `httpx.HTTPStatusError` (Ollama returned an error → `502`), and `httpx.TimeoutException` (model taking too long → `504`) — this closes the "narrow exception handling" gap that was previously documented, but **none of it has automated coverage yet**. Untested today: all three of the above Ollama/`httpx` failure modes, `httpx` timeout/connection failures fetching the source file for summarization, and the server's `fetch()` call to `AI_SERVICE_URL`, which still has no timeout at all. Tests here should assert that a hung or failing AI service produces a bounded, well-formed error response rather than a hang or a raw `500`.

Everything else (doctor search/filter correctness, chat message persistence/scoping, admin stats aggregation, Socket.IO `message:send`/`typing` events) is lower priority than the four flows above, but should follow once they're covered — particularly `socket.js`'s `message:send` handler, which currently has **no try/catch around its `pool.query` call**, meaning a DB failure there is unhandled and can crash the process; this is both a test target and a fix target together.

---

## Known untested areas

As stated at the top of this document: **currently, everything is untested.** To make that concrete rather than rhetorical, here is what "untested" covers today, service by service, based on the current implementation status of each feature:

- **Server** — all controllers (`auth`, `doctor`, `appointment`, `document`, `chat`, `admin`), all middleware (`auth.middleware.js`, `upload.middleware.js`), the Socket.IO layer (`socket.js`), and the global error handler in `index.js`. This includes both features documented as fully working (doctor search, document upload, admin stats) and features documented as having known gaps — including the appointment status/reschedule ownership check and registration role restriction, which are now fixed in code but still have zero automated coverage — as well as unhandled socket errors, which remain unfixed.
- **Client** — every page (`Login`, `Register`, `PatientDashboard`, `DoctorDashboard`, `AdminDashboard`) and every component (`BookingModal`, `DocumentUpload`, `DocumentCard`, `ChatWindow`, `AppointmentCard`, `DoctorCard`, `DoctorSearchFilters`, `ProtectedRoute`, `Navbar`), plus `AuthContext` and both service modules (`api.js`, `socket.js`). This includes components already known to have gaps worth testing against directly — e.g. `DocumentCard.handleSummarize` has no `catch` block at all around its API call, and most page-level fetches use `.then()` with no `.catch()`, so there is no error state to even assert against yet in several of these components without first adding one.
- **ai-service** — both routes (`/assistant/query`, `/summarize`), now backed by a local Ollama server via `ollama_client.py` (previously Claude via `claude_client.py`, removed in the 2026-08-17 migration — see the "Integration tests" note above), the shared JSON-parsing helper (`parse_json_response`, now deduplicated into `util.py` rather than duplicated across `assistant.py` and `summarizer.py`), and `summarizer.py`'s new `build_images()` function, which rasterizes PDF pages via PyMuPDF (capped at 8 pages per document) — none of this, including the PDF-rasterization path or the page cap's silent-truncation behavior, has any test coverage.
- **Appointment Reminders** — worth calling out separately: this feature has **no application code to test at all**. Only a `reminders` table exists in `schema.sql` (`appointment_id`, `send_at`, `sent`); there is no controller, route, scheduler, or notification-sending code anywhere in the codebase yet, so there is nothing to write a test against until that feature is implemented.
- **Cross-service integration** — nothing currently verifies the server → ai-service round trip (`document.controller.js`'s `summarizeDocument` calling ai-service's `/summarize`) end-to-end, including its failure modes (ai-service down, ai-service slow/hung, ai-service returning malformed data).

---

## Summary

No test framework, test file, or CI configuration exists in this repository today — this remains true after the 2026-08-17 Claude→Ollama migration to `ai-service`; that migration changed which failure modes need covering, not the fact that zero automated tests exist for any of them. This document is a starting plan, not a status report on work in progress. The two most valuable first steps, in order, are: (1) stand up Vitest+Supertest for the server and write the four critical-flow tests above — starting with the double-booking constraint and the two known authorization gaps — and (2) add pytest with the outbound Ollama `/api/chat` call mocked (e.g. via `respx`) to ai-service, to lock down its connection-refused, non-2xx, timeout, and invalid-JSON failure paths before any further feature work builds on top of it.
