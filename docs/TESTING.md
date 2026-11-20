# Testing

## Current state: `ai-service` has real tests as of 2026-08-22; `server`/`client` still don't

This project had **zero automated test coverage** in any of its three services from 2026-08-14 through 2026-08-17. As of **2026-08-22**, that's no longer true across the board — `ai-service` has a real, passing, 13-test suite. `server` and `client` remain exactly as before. Confirmed directly from each service's dependency manifest:

| Service      | Manifest                     | Test framework present? |
|--------------|-------------------------------|--------------------------|
| `server/`    | `server/package.json`         | Partially — a `"test": "node --test"` script was added 2026-08-22 (Node's built-in test runner, zero new dependency), and as of this change `server/tests/` holds 14 unit tests that run with `npm test`, plus 26 live API integration tests (`tests/integration/api.live.test.js`, opt-in via `E2E_API`, with stubbed Cloudinary/AI; see `docs/QA-REPORT.md`). `client/` has 21 Vitest tests and `ai-service/` 39 pytest tests; CI runs all of them. No ESLint/Prettier devDependency. |
| `client/`    | `client/package.json`         | No — `dependencies` are limited to `axios`, `react`, `react-dom`, `react-router-dom`, `socket.io-client`; `devDependencies` are limited to `@vitejs/plugin-react` and `vite`. `scripts` only defines `dev`, `build`, `preview`. No `test` script exists. |
| `ai-service/`| `ai-service/requirements.txt` | **Yes, as of 2026-08-22** — `pytest==8.3.3`, with `pytest.ini` (`pythonpath = .`, `testpaths = tests`) and a real `ai-service/tests/` directory (`test_util.py`, `test_summarizer.py`, `test_auth.py` — 13 tests, all passing). Run with `cd ai-service && .venv\Scripts\activate && pytest -v`. The rest of the pinned dependency list (as of the 2026-08-17 Ollama migration) is `fastapi==0.141.1`, `uvicorn[standard]==0.52.3`, `pydantic==2.13.4`, `python-dotenv==1.2.3`, `httpx==0.28.1`, `pymupdf==1.28.2`. |

Still true: no CI configuration exists to run tests even where they now do exist, and the `ai-service` suite is deliberately unit-level — nothing in it requires a live database or a running Ollama server (see the "What's now covered" section below for exactly what that means and doesn't mean). The canonical review scored **Testing at 0/10** as of 2026-08-17 for the reason described in the paragraph above; that number has not been re-run since the 2026-08-22 addition and should be read as stale for `ai-service` specifically.

Every statement below that is **not** explicitly marked "done" or "as of 2026-08-22" is a **recommendation for work that has not started**, not a description of anything currently implemented. Where this document names a specific bug or gap as a "test priority," that bug/gap is real and already documented elsewhere in this docs suite (see the architecture/API/risk docs) — most such gaps still don't have a test catching them, with the specific exceptions called out below.

## What's now covered (2026-08-22)

`ai-service/tests/` — 13 tests, all pure unit tests (no DB, no live Ollama, no network calls to external hosts):

- **`test_util.py`** — `parse_json_response` against plain JSON, a fenced ` ```json ` block, a bare fenced block, surrounding whitespace, and invalid JSON (asserts it raises `json.JSONDecodeError`).
- **`test_summarizer.py`** — `build_images()` against a non-PDF passthrough (base64-encodes unchanged), a real multi-page synthetic PDF (rasterized via PyMuPDF, one image per page, each verified as valid base64), and the `MAX_PDF_PAGES = 8` cap on an oversized synthetic PDF. `fetch_file()`'s SSRF host allowlist rejects a disallowed host with 400 *before* any network call is attempted (driven via `asyncio.run()`, no `pytest-asyncio` dependency needed for this specific case since the rejection happens synchronously before the first `await`). Deliberately does **not** test the allowed-host path against the real `res.cloudinary.com` — that would be a live external network call inside a unit test, which is bad practice regardless of environment; that path remains only manually smoke-tested (see `docs/DEV_CONTEXT.md`'s 2026-08-17 entry).
- **`test_auth.py`** — `require_service_token` (the ai-service→server bearer-token gate named as a top testing priority below, in "Critical flows → 2") against: token env var unset, missing `Authorization` header, wrong token, and correct token — using pytest's built-in `monkeypatch` fixture, no extra dependency.

**What this does *not* cover**, so the rest of this document's recommendations still stand: `assistant.py`/`summarizer.py`'s full request/response cycle through a mocked-or-live Ollama `/api/chat` call (including the `httpx.ConnectError`/`HTTPStatusError`/`TimeoutException` → 502/502/504 mapping); anything server-side (`auth`, `doctor`, `appointment`, `document`, `chat`, `admin` controllers, both middleware files, the Socket.IO layer); anything client-side; and anything requiring a real or test Postgres database, which remains unavailable in this environment exactly as it was in every prior session.

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
| `ai-service/` | **pytest** (installed 2026-08-22, `ai-service/tests/`), plus **pytest-asyncio** (not yet added) and FastAPI's `TestClient` (`httpx`, already a dependency) | pytest is the de facto standard for FastAPI projects and pairs directly with FastAPI's own testing docs; `httpx` is already pinned in `requirements.txt` so `TestClient`/`AsyncClient` needs no new dependency beyond `pytest` and `pytest-asyncio`. The 13 tests added 2026-08-22 avoided needing `pytest-asyncio` by only testing async functions whose relevant code path completes before their first `await` (e.g. `fetch_file`'s host check, driven via a plain `asyncio.run()`) — a real integration test of the full async request cycle will need it. |
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

2. **JWT auth / RBAC.** `requireAuth` and `requireRole` in `server/src/middleware/auth.middleware.js` gate every non-public route. Tests should cover: missing token → `401`; invalid/expired token → `401`; valid token with wrong role hitting a role-gated route (e.g. a patient calling `PUT /api/doctors/profile`, or a non-admin calling `GET /api/admin/stats`) → `403`/rejected. This is also where the registration role-restriction fix belongs as a regression test: `POST /api/auth/register` **used to accept** a client-supplied `role` field including `"admin"` with no restriction; that's now fixed in code (`REGISTERABLE_ROLES`), but has zero automated coverage — write the test that asserts `role: "admin"` is rejected so the fix can't silently regress. **This item's server-side half is still entirely untested as of 2026-08-22** — it's DB-coupled and there's no test database in this environment. **Its ai-service equivalent, however, is now done:** `require_service_token` (the shared-secret gate on `/assistant/query`/`/summarize`) is DB-independent and is now covered by four passing tests in `ai-service/tests/test_auth.py` (unset token, missing header, wrong token, correct token) — proof that this pattern of test is both valuable and achievable once the DB dependency is removed from the picture, which is exactly why the server-side equivalent is still the highest-value gap left.

3. **Document access control scoped to `patient_id`.** `listMyDocuments` and related document routes are documented as authenticated but should be tested to prove they return only the caller's own documents — that `patient_id` scoping is actually enforced in the SQL `WHERE` clause, not just assumed. This directly parallels the appointment IDOR bug that was found and fixed (`PATCH /api/appointments/:id/status` and `/reschedule` now enforce an ownership check via `getAppointmentAccess()`, but the fix itself has **no automated test** proving a non-owner gets `403`); document endpoints should get the same ownership-check test treatment even where scoping is currently believed correct, and locking in the appointment ownership fix with a regression test is a top priority.

4. **AI summary error handling.** `POST /api/documents/:id/summarize` (server) and `POST /summarize` (ai-service) previously only handled the JSON-happy-path plus a narrow set of parse exceptions (`json.JSONDecodeError`, `IndexError`, `AttributeError`), with Anthropic SDK errors named as an unhandled gap. Since the 2026-08-17 Ollama migration, ai-service's exception handling has been broadened to also catch `httpx.ConnectError` (Ollama not running → `502`), `httpx.HTTPStatusError` (Ollama returned an error → `502`), and `httpx.TimeoutException` (model taking too long → `504`) — this closes the "narrow exception handling" gap that was previously documented. As of 2026-08-22, the server's `fetch()` call to `AI_SERVICE_URL` **does** now have a timeout (`AbortSignal.timeout(30000)`, added alongside the ai-service auth fix on 2026-08-17 — this document's wording was stale on that point) — but that fix, like everything else in this item, still has **no automated coverage**. What 2026-08-22 *did* add coverage for, adjacent to this item: `build_images()`'s PDF-rasterization path and page cap, and the SSRF host guard on `fetch_file()` — both are exercised by real tests now (`ai-service/tests/test_summarizer.py`), which is part of this same error-handling surface even though it doesn't touch the `httpx` exception-mapping tested above. Still genuinely untested: all three Ollama/`httpx` failure-mode mappings (needs a mocked Ollama `/api/chat`, e.g. via `respx` — not yet added), and the server-side `fetch()` timeout behavior itself. Tests here should assert that a hung or failing AI service produces a bounded, well-formed error response rather than a hang or a raw `500`.

Everything else (doctor search/filter correctness, chat message persistence/scoping, admin stats aggregation, Socket.IO `message:send`/`typing` events) is lower priority than the four flows above, but should follow once they're covered — particularly `socket.js`'s `message:send` handler, which currently has **no try/catch around its `pool.query` call**, meaning a DB failure there is unhandled and can crash the process; this is both a test target and a fix target together.

---

## Known untested areas

As stated at the top of this document: **currently, everything is untested.** To make that concrete rather than rhetorical, here is what "untested" covers today, service by service, based on the current implementation status of each feature:

- **Server** — all controllers (`auth`, `doctor`, `appointment`, `document`, `chat`, `admin`), all middleware (`auth.middleware.js`, `upload.middleware.js`), the Socket.IO layer (`socket.js`), and the global error handler in `index.js`. This includes both features documented as fully working (doctor search, document upload, admin stats) and features documented as having known gaps — including the appointment status/reschedule ownership check and registration role restriction, which are now fixed in code but still have zero automated coverage — as well as unhandled socket errors, which remain unfixed.
- **Client** — every page (`Login`, `Register`, `PatientDashboard`, `DoctorDashboard`, `AdminDashboard`) and every component (`BookingModal`, `DocumentUpload`, `DocumentCard`, `ChatWindow`, `AppointmentCard`, `DoctorCard`, `DoctorSearchFilters`, `ProtectedRoute`, `Navbar`), plus `AuthContext` and both service modules (`api.js`, `socket.js`). This includes components already known to have gaps worth testing against directly — e.g. `DocumentCard.handleSummarize` has no `catch` block at all around its API call, and most page-level fetches use `.then()` with no `.catch()`, so there is no error state to even assert against yet in several of these components without first adding one.
- **ai-service** — as of 2026-08-22, no longer fully untested: `parse_json_response` (`test_util.py`), `build_images()` including the PDF-rasterization path and the `MAX_PDF_PAGES = 8` cap's *existence* (`test_summarizer.py`), the SSRF host guard on `fetch_file()` (`test_summarizer.py`), and `require_service_token` (`test_auth.py`) are all now covered by real, passing tests. **Still untested:** both routes' full request/response cycle (`/assistant/query`, `/summarize`) against a mocked or live Ollama `/api/chat` call, including the `httpx.ConnectError`/`HTTPStatusError`/`TimeoutException` failure-mode mapping; the page cap's *silent-truncation UX behavior* (that pages beyond 8 are dropped with no indication in the returned summary) is untested even though the cap's mechanics are.
- **Appointment Reminders** — worth calling out separately: this feature has **no application code to test at all**. Only a `reminders` table exists in `schema.sql` (`appointment_id`, `send_at`, `sent`); there is no controller, route, scheduler, or notification-sending code anywhere in the codebase yet, so there is nothing to write a test against until that feature is implemented.
- **Cross-service integration** — nothing currently verifies the server → ai-service round trip (`document.controller.js`'s `summarizeDocument` calling ai-service's `/summarize`) end-to-end, including its failure modes (ai-service down, ai-service slow/hung, ai-service returning malformed data).

---

## Summary

This was true through 2026-08-17: no test framework, test file, or CI configuration existed anywhere in this repository. **As of 2026-08-22, that's no longer true for `ai-service`** — it has a real, passing, 13-test suite (`ai-service/tests/`) covering `parse_json_response`, PDF rasterization and the page cap, the SSRF host guard, and the `require_service_token` auth gate, all unit-level and DB/Ollama-independent. `server/` and `client/` remain exactly as before: no framework, no tests, no CI. This document is still mostly a plan rather than a status report — the 2026-08-22 addition executes a small, honest slice of it (the DB-independent half of ai-service unit testing), not the whole thing. The two most valuable next steps, in order, haven't changed: (1) stand up Vitest+Supertest for the server and write the four critical-flow tests above — starting with the double-booking constraint and the two known authorization gaps, still entirely uncovered — and (2) add `pytest-asyncio` plus a mocked outbound Ollama `/api/chat` call (e.g. via `respx`) to `ai-service`'s existing `pytest` setup, to lock down its connection-refused, non-2xx, timeout, and invalid-JSON failure paths, which the 2026-08-22 suite deliberately didn't attempt.
