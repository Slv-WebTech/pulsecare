# Deployment

## Status: NOT YET DEPLOYED

**Nothing described in this document is live.** The application exists only as local
source code — this directory is not currently a git repository, and all files were
generated within the last ~1 hour as a fresh scaffold. There is no CI/CD pipeline, no
platform account linkage, and no platform-specific config files (`vercel.json`,
`render.yaml`, `railway.json`, `Procfile`, etc.) present anywhere in the repo.

This document is a **target deployment plan** derived from the stack declared in the
root `README.md`: **client → Vercel**, **server + ai-service → Render/Railway**,
**PostgreSQL → a managed instance**. It records the build/start commands, required
environment variables, and cross-service origin wiring needed to stand the system up,
plus a checklist to work through before any real deployment is attempted.

Before deploying, also read the [Known Blockers](#known-blockers-fix-before-deploying)
section — several issues documented elsewhere in this repo's audit are security-critical
and should be fixed first, not discovered in production.

---

## Target architecture

Three independently deployed services plus one managed database:

| Service      | Target platform  | Why not elsewhere |
|--------------|-------------------|--------------------|
| `client/`    | Vercel            | Static Vite build; ideal fit for Vercel's static/edge hosting. |
| `server/`    | Render or Railway | Runs a persistent Socket.IO server (real-time chat) — needs a long-lived process, not a serverless function, so it targets Render/Railway rather than Vercel. |
| `ai-service/`| Render or Railway | Long-running FastAPI/uvicorn process calling a local/self-hosted Ollama server; same long-lived-process requirement as the server. |
| PostgreSQL   | Managed instance (e.g. Render/Railway/other managed Postgres) | Persistent relational store for all app data; schema defined in `server/src/models/schema.sql`. |

Traffic flow: browser → client (Vercel) → server (Render/Railway) → Postgres (managed) and
→ ai-service (Render/Railway) → Ollama (self-hosted, see
[AI-backend note](#ai-backend-migration-claude-api-to-ollama-2026-08-17) below). The client
never calls the ai-service or Ollama directly — all AI requests are proxied through the
server via `AI_SERVICE_URL`.

> **AI backend migration (2026-08-17):** the ai-service no longer calls the Claude API — it
> now calls a local/self-hosted Ollama instance. This changes the deployment story
> meaningfully; see [AI backend migration: Claude API → Ollama (2026-08-17)](#ai-backend-migration-claude-api-to-ollama-2026-08-17)
> under the AI service section below before deploying.

---

## Client (`client/`) — Vercel

**Framework:** Vite + React (auto-detected by Vercel).

| Setting | Value | Source |
|---|---|---|
| Install command | `npm install` | — |
| Build command | `npm run build` | `client/package.json` script `build` → `vite build` |
| Output directory | `dist` | Vite's default build output |
| Local dev equivalent (not for prod) | `npm run dev` (`vite`) | for reference only |

### Required environment variables (verbatim from `client/.env.example`)

```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

In production these must be repointed at the deployed server, e.g.:
- `VITE_API_URL=https://<your-server-domain>/api`
- `VITE_SOCKET_URL=https://<your-server-domain>`

Both are Vite build-time env vars (`VITE_` prefix) — they must be set in Vercel's
project environment variables **before** the build runs, since Vite inlines them at
build time, not at runtime.

---

## Server (`server/`) — Render or Railway

| Setting | Value | Source |
|---|---|---|
| Install/build command | `npm install` | — |
| Start command (production) | `npm start` | `server/package.json` script `start` → `node index.js` |
| Local dev equivalent (not for prod) | `npm run dev` (`node --watch index.js`) | for reference only — `--watch` is a dev convenience, not a process manager |
| Health check path | `GET /health` → `{"status":"ok"}` | `server/index.js` |
| Listens on | `process.env.PORT` (defaults to `5000`) | `server/index.js` |

`server/package.json` declares no `engines` field, so the platform's default Node
version applies unless explicitly configured. `document.controller.js` relies on
Node's built-in global `fetch`, which requires **Node ≥18** — set the platform's Node
version explicitly rather than assuming the default satisfies this.

### Required environment variables (verbatim from `server/.env.example`)

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

In production:
- `PORT` — set by the platform (Render/Railway typically inject their own `PORT`; the
  app already reads `process.env.PORT` with a `5000` fallback, so this is compatible).
- `CLIENT_ORIGIN` — must be the deployed Vercel URL (used as the single CORS allow-origin
  in `cors({ origin: clientOrigin })`; only one origin is supported — see
  [CORS wiring](#cross-service-origin--cors-wiring) below).
- `DATABASE_URL` — connection string for the managed Postgres instance, **not** the
  example `user:password@localhost` placeholder.
- `JWT_SECRET` — must be rotated to a strong, unique secret. The example value
  `change-me` is a literal placeholder with nothing in the code enforcing a stronger
  value at startup.
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — real
  Cloudinary credentials; document upload is non-functional without them.
- `AI_SERVICE_URL` — must be the deployed ai-service URL.
- `AI_SERVICE_TOKEN` — **added 2026-08-17**; must be a real, strong secret in production
  and must exactly match `AI_SERVICE_TOKEN` in the deployed ai-service's environment (see
  the ai-service env-vars table below) — sent as `Authorization: Bearer <token>` on every
  call to ai-service.

---

## AI service (`ai-service/`) — Render or Railway

| Setting | Value | Source |
|---|---|---|
| Install/build command | `pip install -r requirements.txt` | `ai-service/requirements.txt` |
| Local dev command (as documented in README) | `uvicorn main:app --reload --port 8000` | root `README.md` |
| Start command (production) | `uvicorn main:app --host 0.0.0.0 --port $PORT` | adapted from the README's local command |
| Health check path | `GET /health` → `{"status":"ok"}` | ai-service discovery |

The README's documented command is for local development only and is **not** directly
suitable for production: `--reload` enables file-watching auto-restart, which is a dev
convenience with a performance cost, and the hardcoded `--port 8000` will not match
whatever port the hosting platform assigns via `$PORT`. The production start command
above drops `--reload`, binds `0.0.0.0` so the platform can route external traffic in,
and reads the port from the platform-provided `$PORT` environment variable.

### Required environment variables (verbatim from `ai-service/.env.example`)

```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2-vision
CLIENT_ORIGIN=http://localhost:5173
SERVER_ORIGIN=http://localhost:5000
AI_SERVICE_TOKEN=change-me
```

**`ANTHROPIC_API_KEY` was removed as of the 2026-08-17 AI-backend migration** (see below)
and is no longer read anywhere in `ai-service/`. Do not set it — it has no effect.
**`AI_SERVICE_TOKEN` was added later the same day** (see the security-hardening note
below) — it has no default; if it's unset, every request to `/assistant/query` and
`/summarize` is rejected.

In production:
- `OLLAMA_BASE_URL` — base URL of the Ollama server ai-service talks to (defaults to
  `http://localhost:11434` if unset). Both AI-backed endpoints
  (`POST /assistant/query`, `POST /summarize`) fail without a reachable Ollama server at
  this URL. See [AI backend migration](#ai-backend-migration-claude-api-to-ollama-2026-08-17)
  below for what "reachable" requires in production.
- `OLLAMA_MODEL` — the model Ollama is asked to run (defaults to `llama3.2-vision` if
  unset). Must be a model already pulled on the target Ollama instance
  (`ollama pull llama3.2-vision`) — ai-service does not pull it automatically.
- `CLIENT_ORIGIN` — the deployed Vercel URL.
- `SERVER_ORIGIN` — the deployed server URL.
- `AI_SERVICE_TOKEN` — **must be a real, strong secret in production, not the `change-me`
  placeholder.** Must exactly match `AI_SERVICE_TOKEN` in the deployed server's
  environment (see the server env-vars table above) — the server sends it as
  `Authorization: Bearer <token>` on every call to ai-service.

Both `CLIENT_ORIGIN` and `SERVER_ORIGIN` feed `CORSMiddleware`'s `allow_origins` list
(with a `localhost:5173` / `localhost:5000` fallback if unset — do not rely on that
fallback in production). See the CORS note below: CORS restricts browser origins, but
**the actual access-control mechanism for this service is `AI_SERVICE_TOKEN`** (added
2026-08-17), not CORS.

### AI backend migration: Claude API to Ollama (2026-08-17)

As of 2026-08-17, `ai-service/` no longer calls the Claude API. It calls a local Ollama
server instead (`ollama_client.py`, using `httpx` against Ollama's `/api/chat` endpoint),
using a single vision-capable model (`llama3.2-vision` by default) for both search-filter
parsing and image/PDF document summarization. The two endpoint contracts
(`POST /assistant/query`, `POST /summarize`) are unchanged. This was the "Claude-half" of
ADR-007 (replace Cloudinary and the paid Claude API with free/open-source alternatives);
**the Cloudinary-half is separate and not yet done** — `CLOUDINARY_CLOUD_NAME` /
`CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` in the server's env are still required, see
the [server section](#server-server--render-or-railway) above.

This changes what "deploying ai-service" requires, and it is not yet solved by this repo:

- **Self-hosting Ollama is a new, real constraint.** Previously ai-service just needed a
  small process calling a hosted Claude API — no local model to run. Now it needs
  **either** (a) an Ollama server co-located with or otherwise reachable from ai-service,
  with enough RAM/VRAM for a vision model (`llama3.2-vision` is roughly an 11B-parameter
  model; realistically **8GB+ RAM or a GPU** for usable response latency), **or** (b) a
  separately hosted/reachable Ollama instance pointed to via `OLLAMA_BASE_URL`.
- **Free-tier PaaS hosting (Render/Railway free tier) is very unlikely to have enough
  memory/compute to run Ollama itself.** This document intentionally does not prescribe a
  specific fix (e.g. a specific GPU host, a smaller model, or a hosted-Ollama provider) —
  that decision has not been made yet. Plan for where Ollama will actually run before
  attempting to deploy ai-service; do not assume the same Render/Railway free-tier plan
  that was fine for a thin Claude-API-calling process will also run Ollama.
- **Verification status:** the migration is code-verified (compiles, dependencies install
  cleanly, routes register, `build_images()` PDF rasterization and JSON-response parsing
  were exercised directly) but has **not** been end-to-end tested against a live Ollama
  server — Ollama is not installed in the environment this migration was done in. Actual
  runtime behavior (Ollama's real `/api/chat` response shape, JSON-mode reliability of the
  chosen model, image/PDF summary quality) still needs verification against a real local
  Ollama instance before this is trusted in production.
- **Cost/privacy trade-off:** there is no more per-token API billing for AI features, and
  patient-supplied documents sent for summarization now stay within infrastructure the
  operator controls rather than being sent to a third-party API. In exchange, local
  compute/hosting cost and capacity planning replace API cost, and local model quality
  (`llama3.2-vision`) is unlikely to match Claude's structured-output reliability or
  document-understanding quality — treat JSON-mode failures and lower summary quality as
  realistic risks, not hypothetical ones.

---

## Database — managed PostgreSQL

The schema is defined in full in `server/src/models/schema.sql` (users, doctor_profiles,
doctor_availability, appointments, documents, messages, reminders, plus enums and
indexes). There is no migration tool — `schema.sql` is applied directly, per the
README's documented step:

```
psql -U <user> -d <db> -f server/src/models/schema.sql
```

Run this once against the managed instance before the server is started, pointing
`<user>`/`<db>` (or a full connection string) at the managed database rather than a
local one. The server's `DATABASE_URL` env var must then be set to that same managed
instance's connection string.

---

## Cross-service origin / CORS wiring

The three services reference each other exclusively through environment variables —
there is no service discovery or shared config. Each variable must be updated from its
localhost default to the corresponding production URL, in both directions:

| Variable | Set on | Points at | Local default |
|---|---|---|---|
| `VITE_API_URL` | client | server's `/api` base | `http://localhost:5000/api` |
| `VITE_SOCKET_URL` | client | server's base URL (Socket.IO) | `http://localhost:5000` |
| `CLIENT_ORIGIN` | server | client's deployed URL (CORS allow-origin) | `http://localhost:5173` |
| `AI_SERVICE_URL` | server | ai-service's deployed URL | `http://localhost:8000` |
| `CLIENT_ORIGIN` | ai-service | client's deployed URL (CORS allow-origin) | `http://localhost:5173` |
| `SERVER_ORIGIN` | ai-service | server's deployed URL (CORS allow-origin) | `http://localhost:5000` |

Notes:
- The server's CORS config accepts a **single origin string** (`cors({ origin:
  clientOrigin })`), not a list — it supports exactly one client origin at a time. This
  is workable for one production client deployment but has no built-in support for
  staging + production or preview-deployment origins simultaneously.
- The ai-service's CORS config accepts a list (`CLIENT_ORIGIN`/`SERVER_ORIGIN` combined
  into `allow_origins`) with a hardcoded localhost fallback if both are unset — verify
  both are actually set in the platform's environment so the fallback is never reached
  in production.
- **CORS restricts which browser origins may call an endpoint; it does not authenticate
  the caller.** ~~The ai-service currently has no authentication on any route~~ — **fixed
  2026-08-17**: `/assistant/query` and `/summarize` now require `Authorization: Bearer
  <AI_SERVICE_TOKEN>` (see the required-env-vars table above), so a scripted or
  server-to-server call without that token is now rejected regardless of origin. Treat
  the CORS variables as origin hygiene for browser callers specifically — the actual
  access-control layer for non-browser callers is the bearer token, not CORS.
- ~~The server's `fetch()` call to `AI_SERVICE_URL` has no timeout/`AbortController`.~~ —
  **fixed 2026-08-17**: `document.controller.js` now passes
  `signal: AbortSignal.timeout(30000)`, so a slow or unreachable ai-service now fails
  fast with a clean `504` instead of stalling the request indefinitely.

---

## Pre-deployment checklist

- [ ] **Environment variables set on all three platforms**, using the tables above —
      none of `server/.env.example`, `client/.env.example`, or `ai-service/.env.example`
      should be deployed with blank/placeholder values.
- [ ] **DB schema applied**: `server/src/models/schema.sql` has been run against the
      managed Postgres instance (`psql -U <user> -d <db> -f server/src/models/schema.sql`),
      and `DATABASE_URL` on the server points at that same instance.
- [ ] **Secrets rotated from example placeholders**:
  - [ ] `JWT_SECRET` is a strong, unique value — not the literal `change-me` from
        `server/.env.example`.
  - [ ] `DATABASE_URL` uses real managed-instance credentials — not the example
        `user:password@localhost:5432/healthcare`.
  - [ ] `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are
        real Cloudinary credentials.
- [ ] **Ollama is reachable from ai-service** (as of the 2026-08-17 AI-backend migration,
      `ANTHROPIC_API_KEY` no longer applies and should not be set):
  - [ ] Decided where Ollama itself will run — co-located with ai-service (needs 8GB+
        RAM or a GPU for `llama3.2-vision`) or a separately hosted instance — **before**
        deploying ai-service; see
        [AI backend migration](#ai-backend-migration-claude-api-to-ollama-2026-08-17) above.
        Free-tier Render/Railway is very unlikely to be sufficient on its own.
  - [ ] `OLLAMA_BASE_URL` on ai-service points at that Ollama instance.
  - [ ] `OLLAMA_MODEL` (`llama3.2-vision` by default) has been pulled on that instance
        (`ollama pull llama3.2-vision`).
- [ ] **CORS origins updated to production URLs** (all localhost defaults replaced):
  - [ ] Server's `CLIENT_ORIGIN` → deployed Vercel client URL.
  - [ ] Server's `AI_SERVICE_URL` → deployed ai-service URL.
  - [ ] ai-service's `CLIENT_ORIGIN` → deployed Vercel client URL.
  - [ ] ai-service's `SERVER_ORIGIN` → deployed server URL.
  - [ ] Client's `VITE_API_URL` / `VITE_SOCKET_URL` → deployed server URL.
- [ ] **Node runtime version** explicitly set on the server's hosting platform to
      Node ≥18 (no `engines` field exists in `server/package.json` to enforce this
      automatically), since `document.controller.js` depends on the built-in global
      `fetch`.
- [ ] **AI-service start command** uses the production form
      (`uvicorn main:app --host 0.0.0.0 --port $PORT`), not the README's `--reload`
      dev command.
- [ ] **Health checks configured** on the server and ai-service platforms against
      `GET /health` on each.
- [ ] Reviewed the [Known Blockers](#known-blockers-fix-before-deploying) below.

---

## Known blockers (fix before deploying)

These are not deployment-configuration gaps — they are functional/security issues in
the application code itself that a deployment plan should not paper over. Deploying
without addressing them exposes the issues to real traffic:

- ~~**Public self-registration as admin.**~~ **FIXED (2026-08-14):** `POST /api/auth/register`
  now rejects `role: "admin"` — only `patient`/`doctor` are self-registerable.
- ~~**No ownership check on appointment mutation.**~~ **FIXED (2026-08-14):** `PATCH
  /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule` now verify
  the caller is the appointment's patient, its doctor, or an admin before mutating it.
- ~~**ai-service has no authentication on any endpoint.**~~ **FIXED (2026-08-17):**
  `/assistant/query` and `/summarize` now require `Authorization: Bearer
  <AI_SERVICE_TOKEN>` (`ai-service/auth.py`, fails closed if unset). Make sure
  `AI_SERVICE_TOKEN` is set to a real value (not the `change-me` placeholder) before
  deploying — see the required-env-vars table above.
- ~~**SSRF exposure in `/summarize`.**~~ **FIXED (2026-08-17):** it now rejects any
  `fileUrl` whose host isn't `res.cloudinary.com` (`ALLOWED_FILE_HOSTS` in
  `summarizer.py`) before attempting any fetch, and streams the download with a 10MB
  cap rather than buffering an unbounded response.
- **`JWT_SECRET=change-me` placeholder** — nothing in the code currently enforces a
  stronger secret; a deployment that forgets to override this env var is trivially
  compromised.
- **No rate limiting** on `/api/auth/login`, `/api/auth/register`, or either
  ai-service AI endpoint — brute-force exposure on the auth routes, and (as of the
  2026-08-17 Ollama migration) compute/DoS exposure against the Ollama backend rather
  than API-cost exposure, once publicly reachable.

These are documented in full elsewhere in this repo's project audit; they are repeated
here only as a "do not deploy publicly until addressed" flag for anyone following this
plan.
