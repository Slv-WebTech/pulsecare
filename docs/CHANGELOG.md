# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project has not yet adopted formal semantic versioning guarantees (pre-1.0,
no external consumers) — version numbers below are informational.

## [Unreleased]

### Fixed

- **Security:** `POST /api/auth/register` no longer allows self-registering as `role: "admin"` — only `patient`/`doctor` are accepted; admin accounts must be provisioned out-of-band. (`server/src/controllers/auth.controller.js`)
- **Security:** `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` now enforce that the caller is the appointment's patient, its doctor, or an admin (IDOR fix). (`server/src/controllers/appointment.controller.js`)
- **Security, 2026-08-17:** `ai-service` no longer accepts unauthenticated requests — `/assistant/query` and `/summarize` now require `Authorization: Bearer <AI_SERVICE_TOKEN>`, checked by a new `ai-service/auth.py`; the check fails closed if the token is unset. (`ai-service/auth.py`, `ai-service/assistant.py`, `ai-service/summarizer.py`, `server/src/controllers/document.controller.js`)
- **Security, 2026-08-17:** `/summarize`'s SSRF gap is closed — `fileUrl` must now resolve to `res.cloudinary.com` (the only host documents are ever uploaded to) or the request is rejected with 400 before any fetch is attempted. (`ai-service/summarizer.py`)
- **Security/reliability, 2026-08-17:** `/summarize` now streams the fetched file and rejects it with 413 once it exceeds 10MB, instead of buffering an unbounded response into memory. (`ai-service/summarizer.py`)
- **Reliability, 2026-08-17:** `document.controller.js`'s call to `ai-service` now has an explicit 30s timeout (`AbortSignal.timeout`), mapped to a clean 504 instead of hanging indefinitely. (`server/src/controllers/document.controller.js`)

### Added

- **AI backend, 2026-08-17:** `ai-service/ollama_client.py` — a thin httpx-based client that calls a local Ollama server's `/api/chat` endpoint (`OLLAMA_BASE_URL`, default `http://localhost:11434`) with `format: "json"` to constrain output to valid JSON. Model is configurable via `OLLAMA_MODEL` (default `llama3.2-vision`), chosen specifically because it's vision-capable so one model handles both search-filter parsing (text) and document summarization (image/PDF), preserving the multimodal capability the Claude API provided. No new SDK dependency — built on `httpx`, already an `ai-service` dependency. (`ai-service/ollama_client.py`)
- **AI backend, 2026-08-17:** `ai-service/util.py` — a `parse_json_response` helper (strips markdown code fences, then `json.loads`), deduplicated out of `assistant.py` and `summarizer.py`. This duplication was an existing `docs/TECHNICAL_DEBT.md` item, resolved as a side effect of touching both files for the LLM swap. (`ai-service/util.py`)
- **AI backend, 2026-08-17:** PDF pages are now rasterized to images via PyMuPDF (`pymupdf`) before being sent to the model, since (unlike Claude) Ollama has no native PDF understanding; images (JPG/PNG) continue to be base64-encoded directly. Capped at `MAX_PDF_PAGES = 8` per document to bound request/context size — a deliberate, code-commented scoping decision. This introduces a new minor gap: PDFs longer than 8 pages have their extra pages silently dropped, with no indication in the returned summary that the document was truncated (tracked in `docs/TECHNICAL_DEBT.md`). (`ai-service/summarizer.py`)
- **Security, 2026-08-17 (later same day):** `ai-service/auth.py` — a `require_service_token` FastAPI dependency, applied to both `assistant.py`'s and `summarizer.py`'s routers, gating them behind a shared `AI_SERVICE_TOKEN` bearer token. New env var `AI_SERVICE_TOKEN` added to both `server/.env.example` and `ai-service/.env.example`. (`ai-service/auth.py`)

### Changed

- **AI backend, 2026-08-17:** `ai-service/assistant.py` and `ai-service/summarizer.py` now import `chat_json` from `ollama_client.py` and `parse_json_response` from `util.py` instead of the removed `claude_client.py`. Exception handling was broadened to also catch `httpx.ConnectError` (Ollama not running -> 502), `httpx.HTTPStatusError` (Ollama returned an error -> 502), and `httpx.TimeoutException` (model taking too long -> 504) — previously only JSON-parse errors were caught, and narrow exception handling was a documented tech-debt/risk item. The `FILTER_PROMPT` and `SUMMARY_PROMPT` prompt text itself is unchanged. (`ai-service/assistant.py`, `ai-service/summarizer.py`)
- **AI backend, 2026-08-17:** `ai-service/requirements.txt` — bumped several previously-dated pins that were an existing `docs/TECHNICAL_DEBT.md` item: `fastapi` 0.111.0 → 0.141.1, `uvicorn[standard]` 0.30.1 → 0.52.3, `pydantic` 2.7.4 → 2.13.4, `python-dotenv` 1.0.1 → 1.2.3, `httpx` 0.27.0 → 0.28.1. This was necessary, not cosmetic: the old `pydantic` 2.7.4 pin has no prebuilt wheel for a current Python (3.14 was used to verify) and fails building from source (PyO3/Rust toolchain gap) — the service was actually uninstallable on a current Python before this bump. This resolves the pre-existing `docs/TECHNICAL_DEBT.md` "dated pins" item.
- **AI backend, 2026-08-17:** `ai-service/.env.example` — removed `ANTHROPIC_API_KEY`; added `OLLAMA_BASE_URL=http://localhost:11434` and `OLLAMA_MODEL=llama3.2-vision`. `CLIENT_ORIGIN`/`SERVER_ORIGIN` are unchanged.
- **AI backend, 2026-08-17:** Root `README.md` (not a `/docs` file, but referenced by several docs here) — the stack table's "AI Layer" row now reads "Python, FastAPI, Ollama (local LLM)"; the AI-service getting-started step now instructs installing Ollama and running `ollama pull llama3.2-vision` and `ollama serve`, instead of filling in `ANTHROPIC_API_KEY`.

### Removed

- **AI backend, 2026-08-17:** `ai-service/claude_client.py` (deleted entirely), the `anthropic` pip dependency, and the `ANTHROPIC_API_KEY` env var — superseded by the Ollama integration described under Added/Changed above.

### Unchanged (called out explicitly to avoid overclaiming)

- The 2026-08-17 AI backend migration did not touch: `ai-service/main.py`; the two endpoint contracts (`POST /assistant/query`, `POST /summarize` keep the same request/response JSON shapes as before); `server/src/controllers/document.controller.js`'s response handling; the 3-service architecture split; or either authorization fix listed above under Fixed. (The AI service's lack of authentication and the `/summarize` SSRF gap were fixed later the same day — see the Security entries above — but were genuinely still open at the point the Claude→Ollama migration itself landed.)

### Verification (2026-08-17 AI backend migration)

- Verified: `python -m py_compile` passes on every `ai-service` `.py` file; a clean `pip install -r requirements.txt` into a fresh venv on Python 3.14 succeeds (previously failed with the old dated pins); the FastAPI app imports successfully with all three routes (`/health`, `/assistant/query`, `/summarize`) registered per the OpenAPI schema; unit-level tests of the deterministic logic — PDF rasterization via PyMuPDF against a real synthetic 2-page PDF, image (non-PDF) passthrough encoding, and `parse_json_response` against both fenced and unfenced JSON.
- Not verified: an actual end-to-end call to a running Ollama server. Ollama is not installed in this dev environment, so real runtime behavior (Ollama's actual `/api/chat` response shape, JSON-mode reliability of the configured model, image/PDF summary quality) has not been confirmed and remains to be checked against a real local Ollama instance.

### Verification (2026-08-17, ai-service security fix)

- Verified via an in-process `fastapi.testclient.TestClient` smoke test: `/health` responds with no auth; `/assistant/query` and `/summarize` both return 401 with no token or a wrong token (including a request with an SSRF-like `fileUrl`, confirming auth is checked before the SSRF guard runs); `/summarize` with valid auth but a disallowed `fileUrl` host returns 400 before any fetch; `/summarize` with valid auth and an allowed-but-unreachable host attempts the fetch and returns a clean 502, not a crash.
- Not verified: the 10MB streaming size cap against a real >10MB file (would require a real reachable large file), and everything already noted as unverified above (live Ollama server behavior).

### New deployment consideration (2026-08-17)

- Self-hosting Ollama changes the deployment story for `ai-service`. Previously it only needed to call a hosted Claude API; now it needs either (a) Ollama running on the same host/network with enough RAM/VRAM for a vision model (`llama3.2-vision` is an ~11B model; realistically 8GB+ RAM or a GPU for usable latency), or (b) a separately hosted/reachable Ollama instance via `OLLAMA_BASE_URL`. Free-tier PaaS hosting (e.g. Render/Railway free tier) is very unlikely to have enough resources to run Ollama itself. This is a new, real, unsolved constraint.

### Planned (not yet implemented)

- Replace Cloudinary with a self-hosted/open-source file-storage alternative. This was originally paired with replacing the paid Claude API under the same agreed-but-unscoped direction; the Claude half is now done (see the 2026-08-17 AI backend migration entries above). The Cloudinary half remains not started — see `docs/DEV_CONTEXT.md` Section 10, item 0.

## [0.1.0] - 2026-08-14

Initial scaffold. No prior releases; no breaking changes to report.

### Added

- **Client** (`client/`) — React + Vite single-page app: routing shell, auth
  context, layout/navbar, protected routes, and page/component stubs for
  patient, doctor, and admin dashboards, doctor search, appointment booking,
  document upload, and doctor-patient chat.
- **Server** (`server/`) — Express API with route/controller/middleware layers
  for auth (register/login/me), doctor search & profile, appointment booking
  and status/reschedule, document upload, chat, and admin stats. JWT + bcrypt
  authentication, Cloudinary file storage, and a Socket.IO layer for real-time
  chat (message send + typing indicator).
- **AI service** (`ai-service/`) — FastAPI microservice wrapping the Claude
  API: a health check, a natural-language doctor-search-filter parser
  (`POST /assistant/query`), and a document summarization endpoint
  (`POST /summarize`) that fetches a file, sends it to Claude, and returns a
  structured summary.
- **Database schema** (`server/src/models/schema.sql`) — initial PostgreSQL
  schema: `users`, `doctor_profiles`, `doctor_availability`, `appointments`,
  `documents`, `messages`, `reminders`; `user_role` and `appointment_status`
  enums; indexes on appointment/message/doctor-profile lookup columns; and a
  `UNIQUE (doctor_id, starts_at)` constraint on `appointments` preventing
  double-booking at the database level.
- **Environment templates** — `.env.example` for `client/`, `server/`, and
  `ai-service/` documenting required configuration (DB connection, JWT
  secret, Cloudinary credentials, AI service URL, Anthropic API key, CORS
  origins).
- **Documentation baseline** (`/docs`) — architecture, API reference,
  database, feature status, project score, site map, technical debt,
  deployment, and related reference docs, plus this changelog.

### Known limitations at this release

End-to-end wiring exists for auth, doctor search, appointment booking,
document upload, chat, and admin stats, but several parts are stubs or have
open gaps rather than finished, hardened features:

- Appointment reminders have a database table only — no scheduler, worker,
  or notification-sending code exists yet.
- Registration accepts a client-supplied `role` (including `admin`) with no
  restriction; appointment status/reschedule endpoints have no ownership
  check.
- The AI service has no authentication and no domain restriction on the file
  URL it fetches for summarization.
- No automated tests exist in any of the three services yet.

See `docs/FEATURES.md`, `docs/TECHNICAL_DEBT.md`, and `docs/PROJECT_SCORE.md`
for full detail.

### Migrations

- None beyond the initial `schema.sql`. No migration tooling is in place yet;
  schema changes are currently hand-applied.
