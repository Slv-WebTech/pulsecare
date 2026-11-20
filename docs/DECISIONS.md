# Architecture Decision Records

This log captures the key technical decisions made while scaffolding the AI-Powered Healthcare
Appointment & Patient Portal. The project is a freshly generated scaffold (created ~2026-08-14,
roughly one hour of file history at the time of writing), so every decision below reflects
choices baked into the initial structure rather than decisions revisited over a longer project
history. Each entry follows a fixed ADR template: Date, Context, Options Considered, Decision,
Reason, and Consequences.

---

## ADR-001: Three-service split (client / server / ai-service)

**Date:** 2026-08-14

**Context:** The product needs both a conventional CRUD backend (auth, appointments, documents,
chat) and LLM-backed features (search-query parsing, document summarization) that require
Python's stronger AI/ML tooling ecosystem and the official Anthropic SDK ergonomics.

**Options Considered:**
- A single Node monolith calling the Anthropic SDK directly from Express controllers
- A single Python backend handling everything (CRUD + AI)
- The chosen three-service split: client (React/Vite), server (Express/Postgres), ai-service (FastAPI/Claude)

**Decision:** Split the system into three independently-run services — client (React/Vite), server
(Express/Postgres), and ai-service (FastAPI/Claude) — rather than a monolith or a client+server-only
setup with Claude called directly from Node.

**Reason:** Keeps the core transactional backend in the team's primary stack (Node/Express) while
isolating LLM integration in Python where prompt/response handling and the Anthropic SDK are most
natural, without forcing the whole backend into Python.

**Consequences:** Adds an extra network hop and deployment unit (ai-service) with its own env vars
and CORS config. ~~That hop was entirely unauthenticated, and a hung ai-service call had no
timeout on the server side.~~ **Both fixed 2026-08-17 — see ADR-009**: the hop now requires a
shared bearer token, and `document.controller.js`'s fetch now has an explicit 30s timeout.

> **Note (2026-08-14, same-day follow-up):** the three-service split itself remains the
> architecture — only *which* LLM backend `ai-service` calls is changing (see ADR-007). Isolating
> LLM integration in its own Python service continues to make sense regardless of which model
> provider is used.

> **Note (2026-08-17, Claude → Ollama migration):** the Reason above cites "the official Anthropic
> SDK ergonomics" as part of why ai-service is Python — that specific reasoning is now moot:
> `ai-service/ollama_client.py` uses no SDK at all, just plain `httpx` calls to a local Ollama
> server's `/api/chat` endpoint. The broader Python-ecosystem reasoning still holds, though — e.g.
> PyMuPDF (`pymupdf`) is now used to rasterize PDF pages into images for the vision model. See
> ADR-008.

---

## ADR-002: Database-level UNIQUE constraint to prevent double-booking

**Date:** 2026-08-14

**Context:** Appointment booking must guarantee no two patients can book the same doctor at the
same start time, even under concurrent requests.

**Options Considered:**
- Application-level check-then-insert (race-prone)
- A NoSQL store
- A PostgreSQL database-level UNIQUE constraint on (doctor_id, starts_at)

**Decision:** Use PostgreSQL with a database-level UNIQUE constraint `(doctor_id, starts_at)` on
the `appointments` table to prevent double-booking, rather than enforcing it only in application
code.

**Reason:** A UNIQUE constraint is race-safe by construction — concurrent inserts for the same
doctor/time will always have exactly one winner, which application-level checks alone cannot
guarantee.

**Consequences:** Booking conflicts surface as a Postgres constraint violation that the controller
maps to a 409 response. However, the global error handler still leaks the raw Postgres error text
to the client for any conflict case not specifically caught (the global handler returns raw
`err.message` for any unhandled error).

---

## ADR-003: Stateless JWT authentication (JWT + bcrypt)

**Date:** 2026-08-14

**Context:** The API needs to authenticate patients, doctors, and admins across REST calls and a
separate Socket.IO connection without a shared session store between server processes.

**Options Considered:**
- Server-side sessions with a session store (e.g. Redis-backed express-session)
- Stateless JWTs verified per request

**Decision:** Use stateless JWT (JWT + bcrypt) for authentication instead of server-side sessions.

**Reason:** JWTs avoid a shared session-store dependency and work uniformly across both REST
middleware (`requireAuth`) and the Socket.IO handshake (`auth.token`), simplifying the realtime
integration.

**Consequences:** **Superseded by ADR-009 (2026-11-20).** Originally no server-side revocation existed and tokens lived 7 days. The server
now refuses to start with a missing or placeholder `JWT_SECRET`, access tokens live 15 minutes, and sessions are revocable
through a rotating refresh token.

---

## ADR-004: Socket.IO for realtime chat

**Date:** 2026-08-14

**Context:** Doctor-patient chat needs low-latency bidirectional messaging plus presence-style
features like typing indicators.

**Options Considered:**
- Raw WebSocket server
- HTTP long-polling/short-polling
- Socket.IO

**Decision:** Use Socket.IO for realtime chat (message send + typing indicators) rather than plain
WebSockets or polling.

**Reason:** Socket.IO provides room-based broadcasting, auth-on-handshake, and reconnection
handling out of the box, reducing custom realtime plumbing.

**Consequences:** The `socket.js` `message:send` handler has no try/catch around its DB write (a
DB failure can crash the process), and there is no Redis adapter configured, so this design will
not scale past a single server instance without further work.

---

## ADR-005: Cloudinary for file storage

> **Status: superseded (direction agreed 2026-08-14, not yet implemented).** See ADR-007 — the
> product direction is now to move away from Cloudinary to a free/open-source storage option.
> This entry is kept for historical context; do not treat Cloudinary as the long-term choice.

**Date:** 2026-08-14

**Context:** Patients need to upload medical documents (PDF/image) that must be durably stored and
retrievable by URL for both the app and the ai-service's summarization fetch.

**Options Considered:**
- Cloudinary
- Amazon S3 (both listed in the README's stack table)
- Local/server-disk storage

**Decision:** Store uploaded files in Cloudinary rather than a self-managed object store.

**Reason:** Cloudinary was the one actually wired up (`server/src/config/cloudinary.js`, env vars
`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`) — likely chosen for faster
setup (no bucket/IAM configuration) during initial scaffolding.

**Consequences:** The README still lists S3 as an alternative in the stack table even though only
Cloudinary is implemented, which is a documentation/reality mismatch worth resolving. This also
ties file URLs to a third-party service that the ai-service fetches from — ~~with no domain
allowlist (SSRF exposure on the `/summarize` endpoint)~~ **fixed 2026-08-17, see ADR-009**: the
fetch is now restricted to `res.cloudinary.com` only, which means that allowlist is coupled to
this Cloudinary decision and will need updating if the storage backend ever changes.

---

## ADR-006: Vite for client build/dev tooling

**Date:** 2026-08-14

**Context:** The client needed a fast local dev server and production build pipeline for a React
18 SPA.

**Options Considered:**
- Create React App (legacy, no longer actively maintained)
- A hand-rolled Webpack config
- Vite

**Decision:** Use Vite (not Create React App or a custom Webpack setup) for the client
build/dev tooling.

**Reason:** Vite offers substantially faster dev-server startup and HMR than CRA/Webpack for a
project of this size, with minimal configuration (`vite.config.js` is a handful of lines).

**Consequences:** No dev-server proxy for `/api` is configured, so local development depends
entirely on the backend's CORS allowlist (`CLIENT_ORIGIN`) being correct.

---

## ADR-007: Replace Cloudinary and the paid Claude API with free/open-source alternatives

**Status:** Partially implemented. The Claude-API half of this direction is now **done**
(2026-08-17) — see ADR-008 for what was implemented. The Cloudinary half remains **not
implemented** — see `docs/PROJECT_PLAN.md` (Blocked → B4) for the open scoping questions, and
`docs/DEV_CONTEXT.md` (Section 10, item 0) for how this fits into the near-term plan. Do not add
new Cloudinary-specific code without checking whether that half of the migration has started.

**Date:** 2026-08-14 (same-day follow-up to initial scaffold)

**Context:** The initial scaffold used Cloudinary for file storage (ADR-005) and the paid
Anthropic Claude API for document summarization and search-filter parsing (ADR-001) because they
were the fastest way to get the scaffold working end-to-end. The product owner has since decided
free/open-source alternatives should be used instead, to avoid ongoing per-use costs.

**Options Considered:** Not yet fully scoped. For storage: self-hosted disk storage served by the
Express server, or a self-hosted object store (e.g. MinIO). For the LLM: a self-hosted/local
open-weight model, or a free-tier hosted API. No specific option has been chosen yet.

**Decision:** Move away from Cloudinary and the paid Claude API as the long-term choice. The
specific replacements are not yet decided — this ADR records the *direction*, not an implementation
plan.

**Reason:** Cost — the product owner wants to avoid recurring paid third-party service costs where
a free/open-source alternative can reasonably substitute.

**Consequences:** This is a real architecture change, not a drop-in swap: `ai-service/summarizer.py`
and `ai-service/assistant.py` currently depend on Claude's structured JSON output quality for the
document-summary and search-filter-parsing features, and `server/src/controllers/document.controller.js`
/ `server/src/config/cloudinary.js` currently depend on Cloudinary's URL-based file hosting (which
`ai-service/summarizer.py` in turn fetches from). Whatever replacement is chosen must be evaluated
against that quality/behavior bar before implementation starts. This has **not been implemented** —
per this repo's development protocol, a plan will be presented before any code changes begin.

> **Update (2026-08-17):** the Claude-API portion of this ADR has since been implemented — see
> ADR-008 for the concrete decision, options considered, and consequences. The paragraph above is
> left as written for historical context on the state as of 2026-08-14; the Cloudinary/file-storage
> portion it describes is still accurate and still unresolved.

---

## ADR-008: Local Ollama (llama3.2-vision) replaces the Claude API

**Date:** 2026-08-17

**Context:** ADR-007 recorded the *direction*, agreed 2026-08-14, to move `ai-service` off the
paid Anthropic Claude API. This entry records the concrete implementation of the Claude-API half
of that direction. The Cloudinary/file-storage half of ADR-007 is a separate, still-open piece of
work — see ADR-007's updated status above; it is unaffected by this ADR.

**Options Considered:**
- A free-tier hosted LLM API
- A self-hosted/local open-weight model reached through a new dedicated client SDK
- A self-hosted/local open-weight model reached via plain HTTP calls (no new SDK dependency),
  using a vision-capable model so a single model could continue serving both the text
  (search-filter parsing) and image/PDF (document summarization) use cases Claude previously
  covered
- A text-only local model (rejected — would have dropped image/scanned-PDF summarization support)

**Decision:** Replace the Claude API with a local Ollama server. `ai-service/claude_client.py` was
deleted and replaced with `ai-service/ollama_client.py`, a thin `httpx`-based client (httpx was
already an ai-service dependency, so no new SDK was added) that POSTs to Ollama's `/api/chat`
endpoint with `format: "json"` to constrain output to valid JSON. The default model is
`llama3.2-vision`, chosen specifically for its vision capability so one model continues to serve
both `assistant.py` (text, search-filter parsing) and `summarizer.py` (image/PDF, document
summarization). Endpoint and model are configurable via `OLLAMA_BASE_URL` (default
`http://localhost:11434`) and `OLLAMA_MODEL` (default `llama3.2-vision`). Since Ollama, unlike
Claude, has no native PDF understanding, `summarizer.py` gained a `build_images()` function that
rasterizes PDF pages into images via PyMuPDF (`pymupdf`) before sending them to the model, capped
at `MAX_PDF_PAGES = 8` per document. The `anthropic` package and `ANTHROPIC_API_KEY` were removed.
The two endpoint contracts (`POST /assistant/query`, `POST /summarize`) and both prompt texts
(`FILTER_PROMPT`, `SUMMARY_PROMPT`) are unchanged.

**Reason:** Cost and privacy, per ADR-007's stated direction — no more per-token API billing for
AI features, and patient-supplied medical documents (images/PDFs sent for summarization) no
longer leave the operator's own infrastructure/network to reach a third-party API; they only go to
whatever machine runs Ollama, which the operator controls. A vision-capable model was chosen over
a text-only one specifically to avoid regressing the image/scanned-PDF summarization capability
Claude provided.

**Consequences:** The deployment story changes: `ai-service` now needs either (a) Ollama running
on the same host/network with enough RAM/VRAM for a vision model (llama3.2-vision is ~11B
parameters; realistically needs 8GB+ RAM or a GPU for usable latency), or (b) a separately
hosted/reachable Ollama instance via `OLLAMA_BASE_URL`. Free-tier PaaS hosting (Render/Railway free
tier) is very unlikely to have the resources to run Ollama itself — this is a new, real, unsolved
constraint. Local model output quality and JSON-mode reliability (`llama3.2-vision`) is very
unlikely to match Claude's structured-output reliability or document-understanding quality; that
is a realistic risk being named honestly here, not a solved problem. The `MAX_PDF_PAGES = 8` cap
also introduces a new minor gap: pages beyond 8 in a longer PDF are silently dropped, with no
indication in the returned summary that the document was truncated — worth adding to
`docs/TECHNICAL_DEBT.md`.

As a side effect of touching both `assistant.py` and `summarizer.py` for the client swap, two
pre-existing tech-debt items were also resolved: exception handling was broadened to also catch
`httpx.ConnectError` (→ 502), `httpx.HTTPStatusError` (→ 502), and `httpx.TimeoutException` (→
504), where previously only JSON-parse errors were caught; and the duplicated
`parse_json_response` helper was pulled out of both files into a new `ai-service/util.py`.
`requirements.txt` also had its previously-dated pins bumped (`fastapi`, `uvicorn[standard]`,
`pydantic`, `python-dotenv`, `httpx`) alongside removing `anthropic==0.28.0` and adding
`pymupdf==1.28.2` — necessary, not cosmetic, since the old `pydantic` 2.7.4 pin has no prebuilt
wheel for a current Python and fails building from source, meaning the service was actually
uninstallable on a current Python before this bump. This resolves the pre-existing
`TECHNICAL_DEBT.md` "dated pins" item.

Unchanged by this migration: `ai-service` still had zero authentication on any endpoint, and the
`/summarize` SSRF gap (arbitrary `fileUrl` fetch, no domain allowlist) was still open at the time
this migration landed. **Both were closed later the same day — see ADR-009.**

**Verification performed:** `python -m py_compile` passed on every `ai-service` file; a clean
`pip install -r requirements.txt` succeeded on Python 3.14 (previously failed with the old pins);
the FastAPI app imports successfully with all three routes registered (`/health`,
`/assistant/query`, `/summarize`); PDF rasterization (via a synthetic 2-page PDF) and image
passthrough were exercised directly and behaved correctly; `parse_json_response` was verified
against both fenced and unfenced JSON. **Not verified:** an actual end-to-end call to a running
Ollama server — Ollama is not installed in this environment. This is code-verified, not yet
runtime-verified against a live Ollama server; the real `/api/chat` response shape, JSON-mode
reliability, and summary quality still need confirming once run against an actual local Ollama
instance.

---

## ADR-009: Shared bearer token + Cloudinary-only host allowlist to secure ai-service

**Date:** 2026-08-17 (same day as, later than, ADR-008)

**Context:** `ai-service` had zero authentication on any route, and `/summarize` fetched
whatever `fileUrl` it was given with no restriction — a full SSRF surface on the one endpoint
that processes patient-supplied medical documents. This was flagged as a critical issue in the
original codebase assessment (2026-08-14) and remained open through the Claude→Ollama migration
(ADR-008), which was scoped narrowly to the LLM backend swap.

**Options Considered:**
- Service-to-service auth: a shared bearer-token secret (`AI_SERVICE_TOKEN`) vs. a full JWT
  issued by the server vs. mTLS between the two services.
- SSRF protection on `/summarize`: an explicit domain allowlist (only `res.cloudinary.com`,
  since that's the only host documents are ever uploaded to) vs. a generic private-IP/internal-
  network blocklist that would still permit arbitrary public hosts.

**Decision:** Gate `ai-service` behind a shared bearer token (`AI_SERVICE_TOKEN`) checked by a
new `require_service_token` FastAPI dependency (`ai-service/auth.py`), applied to
`/assistant/query` and `/summarize` but not `/health`. For SSRF, restrict `/summarize`'s
`fileUrl` to an explicit allowlist (`ALLOWED_FILE_HOSTS = {"res.cloudinary.com"}`) rather than a
blocklist, and check it *before* attempting any network fetch. Also stream the fetch and cap it
at 10MB (`MAX_FILE_BYTES`), and add an explicit 30s timeout on the server's call into ai-service.

**Reason:** A shared bearer token is the simplest mechanism that actually closes the gap, matches
the existing JWT-based auth pattern already used elsewhere in the app, and needs no new
infrastructure (no mTLS certificate management). An allowlist is strictly safer than a blocklist
here — the actual set of legitimate hosts is one specific domain (Cloudinary), so there is no
reason to accept "anything except known-bad" when "only this one known-good host" is exact and
just as easy to implement. Checking auth before the SSRF guard (rather than the other way round)
means an unauthenticated caller can't even use the endpoint's behavior (400 vs 401) to probe
whether a given host is allowlisted.

**Consequences:** `AI_SERVICE_TOKEN` is a new secret both `server/.env.example` and
`ai-service/.env.example` must agree on — same operational burden as `JWT_SECRET`, including the
same weakness (no rotation mechanism, no enforcement of a strong value beyond fail-closed
behavior if it's unset). The Cloudinary-only allowlist is tightly coupled to the current file-
storage decision (ADR-005) — if/when the Cloudinary-half of ADR-007 is eventually implemented (a
different storage backend), `ALLOWED_FILE_HOSTS` in `summarizer.py` will need updating, or
`/summarize` will start rejecting legitimate documents. This was verified via an in-process
`TestClient` smoke test (auth rejection, SSRF rejection, allowed-host fetch attempt all behave as
expected) but has no committed automated test and has not been exercised against a live Ollama
server.

---

## Summary table

| ID | Decision | Date |
|----|----------|------|
| ADR-001 | Three-service split (client / server / ai-service) | 2026-08-14 |
| ADR-002 | Database-level UNIQUE constraint to prevent double-booking | 2026-08-14 |
| ADR-003 | Stateless JWT authentication (JWT + bcrypt) | 2026-08-14 |
| ADR-004 | Socket.IO for realtime chat | 2026-08-14 |
| ADR-005 | Cloudinary for file storage — *superseded, see ADR-007* | 2026-08-14 |
| ADR-006 | Vite for client build/dev tooling | 2026-08-14 |
| ADR-007 | Replace Cloudinary + paid Claude API with free/open-source alternatives — *Claude half done, see ADR-008; Cloudinary half not implemented* | 2026-08-14 |
| ADR-008 | Local Ollama (llama3.2-vision) replaces the Claude API | 2026-08-17 |
| ADR-009 | Shared bearer token + Cloudinary-only host allowlist to secure ai-service | 2026-08-17 |

---

## ADR-009: Short-lived access token + rotating httpOnly refresh token, private documents, audit log

**Date:** 2026-11-20

**Context:** QA found a 7-day bearer token in `localStorage` (readable by any injected script, not revocable), public Cloudinary
document URLs, and no record of who read patient data.

**Decision:** keep the stateless JWT for per-request auth but shorten it to 15 minutes and hold it in memory only; add a rotating
refresh token in an `HttpOnly; SameSite=Lax` cookie stored hashed server-side (revocable, replay-detecting); store documents as
Cloudinary `authenticated` assets served only through an access-checked, audited, signed-URL endpoint; add an `audit_log` table.

**Consequences:** logout and theft really revoke the session; a stolen access token is useful for at most 15 minutes; documents are not
reachable by URL guessing. Costs: one extra table and a refresh round trip at page load, cookie/CORS configuration must match between
API and client origins, and signed URLs only expire if the Cloudinary plan supports token authentication.
