# Architecture

> **Project status:** this is a freshly generated scaffold (all files created within roughly one hour on 2026-08-14). Every status marker in this document (`IMPLEMENTED` / `PARTIALLY_IMPLEMENTED` / `PLANNED`) reflects what is actually present in the code today, not the intended end state. See `README.md` for the stated project status caveat: "Business logic, validation, and the real LLM prompts still need to be filled in per feature."

## 1. System overview

The application is split into **three independently-run services** rather than a single monolith:

| Service | Path | Stack | Responsibility |
|---|---|---|---|
| Client | `client/` | React 18 + Vite | Patient/doctor/admin dashboards, booking UI, chat UI, document upload UI |
| Server | `server/` | Node.js + Express + PostgreSQL + Socket.IO | Auth, appointments, documents, chat, admin stats — the system of record |
| AI service | `ai-service/` | Python + FastAPI + local Ollama (`llama3.2-vision`) | Natural-language doctor-search parsing, document summarization |

**Why three services instead of one backend:** the product needs both a conventional CRUD backend (auth, appointments, documents, chat) and LLM-backed features (search-query parsing, document summarization) that lean on Python's broader AI/ML tooling ecosystem — e.g. PyMuPDF for PDF rasterization — rather than on any particular vendor SDK. (This split was originally reasoned around the ergonomics of the Anthropic SDK; as of the 2026-08-17 migration off the Claude API to a local Ollama backend, `ai-service` calls Ollama directly over HTTP via `httpx` and uses no vendor SDK at all, so Python's AI/ML tooling ecosystem is now the standing rationale — see `CHANGELOG.md`.) The alternatives considered were a single Node monolith calling Ollama directly from Express controllers, or a single Python backend for everything. The chosen split keeps the core transactional backend in the team's primary stack (Node/Express) while isolating LLM integration in Python, without forcing the whole backend into Python. The tradeoff: this adds an extra network hop and deployment unit (`ai-service`) with its own env vars and CORS config — and, as currently built, that hop is entirely unauthenticated, and the server's call to it has no timeout (see [Security boundaries](#8-security-boundaries)).

The Node server **never calls the LLM directly** — it proxies AI requests through `ai-service`. This keeps LLM/prompt logic out of the Node codebase entirely; since the 2026-08-17 migration off the Claude API, there is no longer an API key to isolate either — `ai-service` instead makes a local/network HTTP call to `OLLAMA_BASE_URL` (see §10).

```
Browser (React/Vite client)
   │  REST (axios, Bearer JWT)         │  WebSocket (Socket.IO, JWT in handshake)
   ▼                                   ▼
Express server (Node.js) ──────────────┘
   │  SQL (pg)             │  HTTP (fetch, no timeout)
   ▼                       ▼
PostgreSQL              ai-service (FastAPI)
                            │  HTTP (httpx) → OLLAMA_BASE_URL
                            ▼
                         Ollama (local LLM, llama3.2-vision)
```

---

## 2. Frontend architecture

**Location:** `client/` — React 18.3 + Vite 5.3, built with `@vitejs/plugin-react`. No CSS framework, no CSS-in-JS, no state-management library beyond React's own Context API, no TypeScript, no PropTypes.

**Why Vite:** chosen over Create React App (legacy, no longer actively maintained) or a hand-rolled Webpack config for its faster dev-server startup and HMR at this project size, with a minimal `vite.config.js`. Tradeoff: no dev-server proxy for `/api` is configured, so local development depends entirely on the backend's CORS allowlist (`CLIENT_ORIGIN`) being correct.

### Layout

```
client/src/
├── App.jsx                 # route table (react-router-dom v6)
├── main.jsx                 # ReactDOM root: <StrictMode><BrowserRouter><AuthProvider>
├── index.css                 # single global stylesheet (CSS custom properties, BEM-ish classes)
├── context/
│   └── AuthContext.jsx       # global auth state: user, loading, login, register, logout
├── components/
│   ├── Appointment/
│   │   ├── AppointmentCard.jsx     # status display + status-transition action buttons
│   │   └── BookingModal.jsx        # booking form (modal)
│   ├── Chat/
│   │   └── ChatWindow.jsx          # 1:1 chat: REST history load + Socket.IO live send/receive
│   ├── Doctor/
│   │   ├── DoctorCard.jsx          # presentational search-result card
│   │   └── DoctorSearchFilters.jsx # filter form (specialization/location/fee/experience/language)
│   ├── Document/
│   │   ├── DocumentCard.jsx        # document display + trigger/show AI summary
│   │   └── DocumentUpload.jsx      # file input + upload handler
│   └── Layout/
│       ├── Navbar.jsx              # role-aware nav + logout
│       └── ProtectedRoute.jsx      # auth + role route guard
├── pages/
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── PatientDashboard.jsx        # doctor search/booking + own appointments + documents
│   ├── DoctorDashboard.jsx         # today's/upcoming appointments + status actions
│   └── AdminDashboard.jsx          # platform stats
└── services/
    ├── api.js                      # shared axios instance, Bearer-token request interceptor
    └── socket.js                   # singleton Socket.IO client (connect/get/disconnect)
```

### Component architecture

The client follows a conventional **pages → components → services** layering:

- **Pages** (`src/pages/`) own data fetching (via `services/api.js`) and compose feature components.
- **Feature components** (`src/components/<Feature>/`) are grouped by domain (Appointment, Chat, Doctor, Document, Layout), each pairing a presentational card (`DoctorCard`, `AppointmentCard`) with an interactive counterpart (`BookingModal`, `DocumentUpload`) where relevant.
- **Services** (`src/services/`) are the only modules that talk to the network: `api.js` wraps axios with a request interceptor that attaches `Authorization: Bearer <token>` from `localStorage`; `socket.js` wraps `socket.io-client` as a module-level singleton.
- There are **no shared/typed API resource modules** (e.g. a `doctors.js`, `appointments.js`) — every page/component calls `api.get/post/patch` directly with hardcoded endpoint strings, which is a known source of drift risk (see `docs` technical-debt tracking).

### State management

State is handled entirely with **React Context** — no Redux, Zustand, or React Query:

- `AuthContext` (`src/context/AuthContext.jsx`) is the single global store: it exposes `user`, `loading`, `login`, `register`, `logout`, and restores a session from the `localStorage` token on mount by calling `GET /api/auth/me`.
- Every other page independently fetches and holds its own local (`useState`) data — there is no shared cache between, e.g., the Patient dashboard's appointment list and the Doctor dashboard's. Navigating away and back always re-fetches from scratch.
- There is no response interceptor in `api.js` and consequently **no centralized 401/expired-token handling** — a stale token fails silently per-request rather than triggering a global logout/redirect. `AuthContext`'s session-restore also treats *any* `/auth/me` failure (network blip or true invalid token) the same way: silently clearing the token.

### Routing and access control

`react-router-dom` v6 defines the route table in `App.jsx`; `ProtectedRoute.jsx` gates access by auth state and, optionally, an allowed-roles list, redirecting unauthenticated users to `/login` and wrong-role users to `/`. Because `/` itself unconditionally redirects to `/login`, an authenticated user who lands on the wrong-role route currently gets bounced to the login page rather than their own dashboard. See the [site map](#9-routes--pages) below for the full route table.

---

## 3. Backend architecture

**Location:** `server/` — Node.js (ESM, `"type": "module"`) + Express 4.19, PostgreSQL via `pg` 8.11, Socket.IO 4.7. Started with `node --watch index.js` in dev (no nodemon dependency) and `node index.js` in production. No test framework, no linter configured.

### Layout

```
server/
├── index.js                        # app bootstrap: middleware, route mounting, error handler, HTTP+Socket.IO server
├── package.json
├── .env.example
└── src/
    ├── config/
    │   ├── db.js                   # pg.Pool from DATABASE_URL, idle-client error logging
    │   └── cloudinary.js           # Cloudinary SDK config from env vars
    ├── controllers/
    │   ├── auth.controller.js      # register / login / me
    │   ├── doctor.controller.js    # searchDoctors / getDoctorAvailability / upsertDoctorProfile
    │   ├── appointment.controller.js  # bookAppointment / listMyAppointments / updateAppointmentStatus / rescheduleAppointment
    │   ├── document.controller.js  # uploadDocument / listMyDocuments / summarizeDocument
    │   ├── chat.controller.js      # getConversation / markRead
    │   └── admin.controller.js     # getDashboardStats
    ├── middleware/
    │   ├── auth.middleware.js      # requireAuth (JWT verify) / requireRole (factory)
    │   └── upload.middleware.js    # multer: in-memory storage, 10MB limit, MIME allowlist
    ├── routes/
    │   ├── auth.routes.js
    │   ├── doctor.routes.js
    │   ├── appointment.routes.js
    │   ├── document.routes.js
    │   ├── chat.routes.js
    │   └── admin.routes.js
    ├── socket/
    │   └── socket.js               # attachSocket: JWT-authenticated Socket.IO (message:send, typing)
    ├── models/
    │   └── schema.sql              # full Postgres schema (see §4 and DATABASE.md)
    └── utils/
        └── catchAsync.js           # wraps async handlers -> forwards rejections to next(err)
```

### Request lifecycle

`index.js` wires the app in a fixed order: CORS (single allowed origin from `CLIENT_ORIGIN`) → `express.json()` → `GET /health` → six resource routers mounted under `/api/*` → a global error-handling middleware that logs the error server-side and returns `{ error: err.message }` with `err.status || 500`. Every route handler is wrapped in `catchAsync` so a rejected promise reaches the global handler instead of crashing the process — except the Socket.IO `message:send` handler, which is *not* wrapped in try/catch (see [Security boundaries](#8-security-boundaries)).

Each resource follows the same three-layer pattern: **route → middleware (requireAuth/requireRole) → controller**, with controllers issuing parameterized SQL directly against `pg` (no ORM). This is consistent across all six resource areas.

### Why a DB-level constraint for double-booking

Appointment booking must guarantee no two patients can book the same doctor at the same start time, even under concurrent requests. The alternatives were an application-level check-then-insert (race-prone under concurrency) or a NoSQL store; the schema instead uses a **Postgres `UNIQUE (doctor_id, starts_at)` constraint**, which is race-safe by construction — concurrent inserts for the same doctor/time will always have exactly one winner. The tradeoff: a conflict surfaces as a raw Postgres constraint violation, which `bookAppointment` maps to `409`, but for any *other* unmapped constraint violation the global error handler still leaks raw Postgres error text to the client.

---

## 4. Database architecture

**Engine:** PostgreSQL, schema defined in `server/src/models/schema.sql` — a single hand-written file with **no migration tool** (no node-pg-migrate, no Prisma migrate); schema changes currently have no versioning path.

### Tables (summary — see `docs/DATABASE.md` for full column-level detail)

| Table | Purpose | Key relationships |
|---|---|---|
| `users` | All accounts (patient/doctor/admin), bcrypt `password_hash`, `role` enum | referenced by `doctor_profiles`, `appointments`, `documents`, `messages` |
| `doctor_profiles` | One-to-one extension of a `doctor` user: specialization, location, fee, experience, languages, bio | `user_id` → `users.id` (unique) |
| `doctor_availability` | Weekly recurring availability slots per doctor | `doctor_id` → `doctor_profiles.id` |
| `appointments` | Booking record: patient, doctor, time range, status | `patient_id`/`doctor_id` → `users`/`doctor_profiles`; `UNIQUE (doctor_id, starts_at)` prevents double-booking |
| `documents` | Uploaded medical files + optional `ai_summary` JSONB | `patient_id` → `users`; optional `appointment_id` → `appointments` (`ON DELETE SET NULL`) |
| `messages` | Chat messages between two users, optionally tied to an appointment | `sender_id`/`recipient_id` → `users`; `appointment_id` → `appointments` |
| `reminders` | Scheduled reminder record (`send_at`, `sent` flag) | `appointment_id` → `appointments` — **table exists but no application code reads or writes it anywhere** (see §6, Appointment Reminders) |

Two enum types back the schema: `user_role` (`patient`/`doctor`/`admin`) and `appointment_status` (`scheduled`/`confirmed`/`completed`/`cancelled`). Indexes exist on `appointments(patient_id)`, `appointments(doctor_id)`, `messages(appointment_id)`, `doctor_profiles(specialization)`, and `doctor_profiles(location)` to support the search and dashboard queries. There is no pagination built on top of any of these — `listMyAppointments`, `listMyDocuments`, `getConversation`, and `searchDoctors` all return unbounded result sets.

For the full column list, types, defaults, and constraints, see **`docs/DATABASE.md`**.

---

## 5. API architecture

All server HTTP routes are namespaced under **`/api/*`**, plus an unnamespaced `GET /health` liveness check. Base route groups (mounted in `index.js`):

| Base path | Router file | Resource |
|---|---|---|
| `/api/auth` | `auth.routes.js` | Registration, login, current-user profile |
| `/api/doctors` | `doctor.routes.js` | Doctor search, availability, profile self-service |
| `/api/appointments` | `appointment.routes.js` | Booking, listing, status/reschedule updates |
| `/api/documents` | `document.routes.js` | Upload, list, AI summarization trigger |
| `/api/chat` | `chat.routes.js` | Conversation history, mark-read |
| `/api/admin` | `admin.routes.js` | Dashboard stats (admin-only) |

### Endpoint inventory

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/health` | none | implemented |
| POST | `/api/auth/register` | none | implemented (`role` restricted to `patient`/`doctor`, fixed same-day — see §8) |
| POST | `/api/auth/login` | none | implemented |
| GET | `/api/auth/me` | any authenticated | implemented |
| GET | `/api/doctors` | none | implemented |
| GET | `/api/doctors/:id/availability` | none | implemented |
| PUT | `/api/doctors/profile` | doctor | implemented |
| POST | `/api/appointments` | patient | implemented (409 on double-booking) |
| GET | `/api/appointments` | any authenticated | implemented (own appointments only) |
| PATCH | `/api/appointments/:id/status` | owning patient, owning doctor, or admin | implemented (fixed same-day; previously an IDOR) |
| PATCH | `/api/appointments/:id/reschedule` | owning patient, owning doctor, or admin | implemented (fixed same-day; previously an IDOR) |
| POST | `/api/documents` | any authenticated | implemented |
| GET | `/api/documents` | any authenticated | implemented (own documents only) |
| POST | `/api/documents/:id/summarize` | any authenticated | implemented (calls `ai-service`) |
| GET | `/api/chat/:userId` | any authenticated | implemented (scoped to `req.user.id`) |
| PATCH | `/api/chat/:id/read` | any authenticated | implemented (scoped to `recipient_id = req.user.id`) |
| GET | `/api/admin/stats` | admin | implemented |
| SOCKET | `message:send` | JWT via handshake | partial (no try/catch, no payload validation) |
| SOCKET | `typing` | JWT via handshake | implemented |

The AI service exposes its own separate API surface (`GET /health`, `POST /assistant/query`, `POST /summarize`) that the Express server calls server-to-server — see §7.

---

## 6. Feature status snapshot

For full detail see the dedicated feature-status document; summarized here for architectural context:

- **Implemented end-to-end:** Doctor search & filters, medical document upload (Cloudinary + Postgres), admin stats aggregation, role-based route protection (server middleware + client `ProtectedRoute`), appointment status/reschedule ownership enforcement (fixed same-day).
- **Partially implemented (real code, functional gaps):** Auth/registration (role escalation gap is **fixed**; remaining gap is submit-button loading state only), appointment booking (no future-date validation, hardcoded 30-min duration client-side), doctor dashboard (remaining gap is client-side fetch error handling, not authorization — that's fixed), AI document summarization (no SSRF protection/size cap/broad error handling), doctor-patient chat (no server-side try/catch, no client optimistic send), patient dashboard and admin dashboard (both missing fetch error handling on the client).
- **Reminders:** a worker (`server/src/jobs/reminders.js`) delivers in-app reminders over Socket.IO; email/SMS delivery is not configured.

---

## 7. Data flow

Three distinct data-flow paths exist in the system:

### 7.1 Client → Express API → PostgreSQL (REST)

The dominant path for auth, doctor search, appointments, documents metadata, and admin stats:

```
React component → services/api.js (axios, Bearer JWT) → Express route
   → requireAuth/requireRole middleware → controller → pg.Pool query → PostgreSQL
```

Responses flow straight back through the same chain as JSON. No caching layer sits anywhere in this path — every dashboard mount triggers a fresh round trip.

### 7.2 Client → Socket.IO (realtime chat)

```
ChatWindow.jsx → services/socket.js (io client, auth.token in handshake)
   → attachSocket (server/src/socket/socket.js) → pool.query (persist message) → message:new broadcast
```

Chat history itself is loaded over REST (`GET /api/chat/:userId`); only live send/receive and typing indicators go over the socket. **Why Socket.IO** (over raw WebSockets or polling): it provides room-based broadcasting, auth-on-handshake, and reconnection handling out of the box, reducing custom realtime plumbing needed for chat + typing indicators. Tradeoff: the `message:send` handler has no try/catch around its database write (a DB failure is unhandled), and there is no Redis adapter configured, so this will not scale past a single server instance without further work. On the client, `ChatWindow` has no optimistic local append — a sent message only appears in the sender's own UI if the server echoes `message:new` back to the sender's socket.

### 7.3 Server → AI service → Ollama (local LLM) (document summarization & search parsing)

```
document.controller.js (fetch, no timeout/AbortController)
   → ai-service POST /summarize → httpx fetch of documents.file_url
   → build_images() (PyMuPDF rasterizes PDFs page-by-page, capped at 8 pages; JPG/PNG pass through as-is)
   → ollama_client.chat_json() (httpx POST to OLLAMA_BASE_URL/api/chat, format: "json", multi-image message) → structured JSON summary
   → persisted to documents.ai_summary
```

and separately:

```
(planned client integration) → ai-service POST /assistant/query
   → ollama_client.chat_json() (Ollama, FILTER_PROMPT) → structured search filters JSON
```

Both `ai-service` routes call `ollama_client.chat_json()` — a thin `httpx`-based wrapper around the local Ollama server's `/api/chat` endpoint (`format: "json"` constrains output to valid JSON) — from inside `async def` FastAPI handlers. As of the 2026-08-17 migration off the Claude API, exception handling was broadened: both routes now also catch `httpx.ConnectError` (Ollama not running → 502), `httpx.HTTPStatusError` (Ollama returned an error → 502), and `httpx.TimeoutException` (model too slow → 504); JSON-parsing (previously a narrow `except (json.JSONDecodeError, IndexError, AttributeError)` duplicated in both `assistant.py` and `summarizer.py`) is now handled by a single shared `parse_json_response()` helper in `util.py`. This was code-verified (`py_compile`, a fresh `pip install`, and an offline test of `build_images()`/`parse_json_response()`) but has **not** been runtime-verified against a live Ollama server — Ollama is not installed in the dev sandbox this was built in. A PDF longer than `MAX_PDF_PAGES = 8` is silently truncated with no indication of that in the returned summary (see `TECHNICAL_DEBT.md`).

---

## 8. Authentication

**Flow:** JWT + bcrypt, implemented in `server/src/controllers/auth.controller.js` and `server/src/middleware/auth.middleware.js`.

1. **Register** (`POST /api/auth/register`): password is hashed with `bcryptjs`; a row is inserted into `users` with the caller-supplied `role`.
2. **Login** (`POST /api/auth/login`): bcrypt comparison; on success a short-lived access JWT (`JWT_EXPIRES_IN`, default `15m`) is returned in the body and a random refresh token is set as an `HttpOnly; SameSite=Lax` cookie (`Path=/api/auth`). Only its SHA-256 is stored (`refresh_tokens`).
3. **Client storage**: the access token lives in memory only (`client/src/services/session.js`); nothing is written to `localStorage`. `services/api.js` attaches it as `Authorization: Bearer <token>`; on a `401` it refreshes once (single-flight) and replays the request.
4. **Verification**: `requireAuth` calls `jwt.verify` on every protected route and populates `req.user`.
5. **Session restore**: on client mount, `AuthContext` calls `POST /api/auth/refresh` (cookie). The server rotates the refresh token; replaying an old token revokes the whole session family (a replay within 10 s is treated as a benign tab race and answered with `409`). `POST /api/auth/logout` revokes the token. `refresh`/`logout` only accept requests from `CLIENT_ORIGIN`.
6. **Realtime**: the Socket.IO handshake sends the current access token; the server disconnects the socket when it expires and the client reconnects with a refreshed one.
6. **Socket auth**: the Socket.IO handshake carries the same JWT (`auth.token`), verified before a socket connection is accepted.

**Why stateless JWT over server-side sessions:** the API needs to authenticate patients, doctors, and admins across both REST calls and a separate Socket.IO connection without a shared session store between processes. JWTs avoid a shared session-store dependency (e.g. Redis-backed `express-session`) and work uniformly across `requireAuth` middleware and the Socket.IO handshake, simplifying the realtime integration. Tradeoff: there is no server-side revocation mechanism — a compromised token remains valid until it expires — and `JWT_SECRET` currently defaults to the literal placeholder `change-me` in `.env.example` with nothing enforcing a stronger value at startup.

---

## 9. Authorization

Role-based access control is enforced via **JWT claims + Express middleware**, per the README: *"patient, doctor, admin — enforced via JWT claims + route middleware (`server/src/middleware/auth.middleware.js`)."*

- **`requireAuth`**: verifies the JWT is present and valid; attaches `req.user`. Applied to every route except `POST /api/auth/register`, `POST /api/auth/login`, and the public doctor-search/availability endpoints.
- **`requireRole(role)`**: a middleware factory gating a route to a single role — used for `PUT /api/doctors/profile` (`doctor`), `POST /api/appointments` (`patient`), and all of `/api/admin/*` (`admin`).
- **Resource ownership scoping** is implemented ad hoc *inside* controllers (not as reusable middleware) — done correctly for chat (`getConversation`/`markRead` scope by `req.user.id`), for listing appointments/documents, and (as of a same-day fix) for `PATCH /api/appointments/:id/status` and `PATCH /api/appointments/:id/reschedule`: both now call a `getAppointmentAccess()` helper that resolves the appointment's patient and doctor and returns 403 unless the caller is one of them (or an admin). Previously, both only required *a* valid JWT, not ownership of the specific appointment row.
- **Registration role restriction — fixed same-day**: `POST /api/auth/register` previously accepted a client-supplied `role` field that included `admin` with no server-side check, allowing any unauthenticated caller to self-register as an admin (this had been the most severe access-control gap in the codebase). It now validates against `REGISTERABLE_ROLES = {patient, doctor}`; admin accounts still have no dedicated provisioning path and must be created directly in the database.

### Routes and pages (client-side authorization mirror)

| Route | Access | Status |
|---|---|---|
| `/` | public | implemented — unconditional redirect to `/login`, not role-aware |
| `/login` | public | partial — no submitting/loading state on the button |
| `/register` | public | partial — same gap as Login |
| `/patient` | role: patient (`ProtectedRoute`) | partial — wired, no loading/error handling on fetches |
| `/doctor` | role: doctor (`ProtectedRoute`) | partial — wired, no loading/error handling on fetch |
| `/admin` | role: admin (`ProtectedRoute`) | partial — wired, no error handling, stuck "Loading..." on failure |
| `*` | public | stub — bare unstyled `<p>Page not found</p>`, no link back |

---

## 10. External services

| Service | Used by | Purpose | Notes |
|---|---|---|---|
| **Cloudinary** | `server/src/config/cloudinary.js`, `document.controller.js` | Stores uploaded medical documents (PDF/JPEG/PNG); `documents.file_url` points here | The only implemented file store — Amazon S3 is listed in the README's stack table as an alternative but has no implementation in the codebase (documentation/reality mismatch). Chosen, per the underlying decision, likely for faster setup (no bucket/IAM configuration) during initial scaffolding. Ties file URLs to a third party that `ai-service`'s `/summarize` fetches from — that fetch is now restricted to a `res.cloudinary.com`-only allowlist (fixed 2026-08-17, closing the prior SSRF exposure; see §13/Security), which also means this allowlist is coupled to the Cloudinary decision and would need updating if the storage backend ever changes. |
| **Ollama (local LLM server)** | `ai-service/ollama_client.py`, called from `assistant.py` and `summarizer.py` | Powers natural-language doctor-search filter parsing (`/assistant/query`) and document summarization (`/summarize`) — one vision-capable model (`llama3.2-vision` by default) handles both text and image/PDF input | Not a hosted third-party API: a local/network-reachable Ollama server addressed via `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL`. No SDK and no API key — `ai-service` talks to it over plain `httpx`. Accessed only from `ai-service`, never directly from the Node server or the client. |

*Prior to the 2026-08-17 migration, this row was the **Anthropic Claude API** (`ai-service/claude_client.py`, `anthropic` SDK pinned to `0.28.0`), a hosted third-party API reached with a dedicated `ANTHROPIC_API_KEY`. See `CHANGELOG.md` for the migration record.*

---

## 11. Folder structure (actual, as scaffolded)

```
healthcare-app/
├── README.md
├── docs/
│   └── ARCHITECTURE.md            # this file
├── client/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── components/
│       │   ├── Appointment/
│       │   │   ├── AppointmentCard.jsx
│       │   │   └── BookingModal.jsx
│       │   ├── Chat/
│       │   │   └── ChatWindow.jsx
│       │   ├── Doctor/
│       │   │   ├── DoctorCard.jsx
│       │   │   └── DoctorSearchFilters.jsx
│       │   ├── Document/
│       │   │   ├── DocumentCard.jsx
│       │   │   └── DocumentUpload.jsx
│       │   └── Layout/
│       │       ├── Navbar.jsx
│       │       └── ProtectedRoute.jsx
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── PatientDashboard.jsx
│       │   ├── DoctorDashboard.jsx
│       │   └── AdminDashboard.jsx
│       └── services/
│           ├── api.js
│           └── socket.js
├── server/
│   ├── index.js
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── config/
│       │   ├── db.js
│       │   └── cloudinary.js
│       ├── controllers/
│       │   ├── auth.controller.js
│       │   ├── doctor.controller.js
│       │   ├── appointment.controller.js
│       │   ├── document.controller.js
│       │   ├── chat.controller.js
│       │   └── admin.controller.js
│       ├── middleware/
│       │   ├── auth.middleware.js
│       │   └── upload.middleware.js
│       ├── routes/
│       │   ├── auth.routes.js
│       │   ├── doctor.routes.js
│       │   ├── appointment.routes.js
│       │   ├── document.routes.js
│       │   ├── chat.routes.js
│       │   └── admin.routes.js
│       ├── socket/
│       │   └── socket.js
│       ├── models/
│       │   └── schema.sql
│       └── utils/
│           └── catchAsync.js
└── ai-service/
    ├── main.py
    ├── assistant.py
    ├── summarizer.py
    ├── ollama_client.py
    ├── util.py
    ├── requirements.txt
    └── .env.example
```

---

## 12. Deployment architecture (target — nothing is deployed yet)

**Nothing in this repository has been deployed.** There is no CI/CD configuration, no Dockerfile, and no infrastructure-as-code anywhere in the reviewed codebase — only local dev instructions (`npm run dev` / `uvicorn --reload`) exist in the README. The following is the **target** deployment topology per project scope, not a description of a live system:

| Service | Target platform | Notes |
|---|---|---|
| `client/` | Vercel | Static build via `vite build`; would need `VITE_API_URL` / `VITE_SOCKET_URL` set to the deployed server's origin |
| `server/` | Render or Railway | Long-running Node process (needed for the Socket.IO connection); would need `DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_*`, and `AI_SERVICE_URL` set |
| `ai-service/` | Render or Railway | Long-running FastAPI/uvicorn process; would need `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `CLIENT_ORIGIN`, `SERVER_ORIGIN` — plus a reachable Ollama server, which is a new, currently unsolved requirement (see below) |
| Database | Managed PostgreSQL | Would replace the local `psql`-seeded instance from `server/src/models/schema.sql` |

**New deployment consideration since the 2026-08-17 Claude→Ollama migration:** self-hosting the LLM changes this picture. Previously `ai-service` only needed to reach a hosted Claude API over the internet; now it needs a running Ollama server, either (a) co-located on the same host/network as `ai-service` — `llama3.2-vision` is an ~11B-parameter vision model, realistically needing 8GB+ RAM or a GPU for usable latency — or (b) a separately hosted/reachable Ollama instance pointed to via `OLLAMA_BASE_URL`. Free-tier PaaS hosting (Render/Railway free tier) is very unlikely to have the resources to run Ollama itself. This is a real, currently **unsolved** constraint on the target topology above — no specific hosting solution for Ollama has been chosen.

Before any of this is production-viable, the open items in §8 (placeholder `JWT_SECRET`, no ai-service auth, no rate limiting), the missing migration tooling (§4), and the unresolved Ollama-hosting question above would need to be addressed — none of that infrastructure currently exists in the repo.

---

## 13. Security boundaries

Three boundaries exist (or are supposed to exist) in the system; their current state:

1. **Client ↔ Server (JWT at Express middleware).** `requireAuth` verifies every protected request's JWT before it reaches a controller; `requireRole` adds a role gate on top where needed (`doctor` profile upsert, `patient`-only booking, `admin`-only stats). This boundary is real and functioning for authentication. Two concrete authorization gaps existed here and are now **fixed** (same-day follow-up): (a) `POST /api/auth/register` no longer lets any caller choose `role: "admin"`, and (b) appointment status/reschedule routes now check *ownership*, not just authentication. CORS further restricts browser callers to a single configured `CLIENT_ORIGIN`.

2. **Document access scoped to `patient_id`.** `documents.patient_id` ties every uploaded file's metadata to the uploading user; `listMyDocuments` and the summarize trigger query by the authenticated `req.user.id`, so one patient cannot list or trigger a summary for another patient's document row through the REST API as implemented. This scoping now also extends to `ai-service`, as of a same-day follow-up fix (2026-08-17): `/summarize` validates `fileUrl`'s host against an allowlist (`res.cloudinary.com` only — the one host documents are ever uploaded to) before attempting any fetch (closing the SSRF exposure), and streams the fetch with a 10MB cap before any of it is base64-encoded (closing the missing-size-cap gap). PDFs are separately capped at 8 rendered pages before being sent to Ollama, which bounds request/context size on top of the byte-level cap.

3. **AI service isolated as its own process/origin, now with real authentication.** `ai-service` runs as a separate Python process on its own port, with its own CORS configuration (`CLIENT_ORIGIN`/`SERVER_ORIGIN` env vars). As of the 2026-08-17 migration off the Claude API, `ai-service` no longer holds any API key at all — it calls a local/network-reachable Ollama server (`OLLAMA_BASE_URL`) instead of a hosted third-party API. Later the same day, the process/network isolation described above was backed by an actual security boundary: `ai-service/auth.py`'s `require_service_token` dependency requires `Authorization: Bearer <AI_SERVICE_TOKEN>` on `/assistant/query` and `/summarize` (not `/health`), failing closed if the token is unset. A caller who can reach the port can no longer invoke either AI-backed route without that token.

Additional points relevant to these boundaries: the global Express error handler returns raw `err.message` to clients (information disclosure risk for unmapped DB errors); there is no rate limiting on `/api/auth/login`, `/api/auth/register`, or either `ai-service` endpoint; ~~`document.controller.js`'s call to `AI_SERVICE_URL` has no timeout, so a hung AI service stalls the originating request indefinitely~~ — **fixed 2026-08-17**, the call now has an explicit 30s timeout mapped to a clean `504`.

---

## 14. Key architectural decisions (why, not just what)

| Decision | Why | Tradeoff accepted |
|---|---|---|
| Three-service split (client / server / ai-service) instead of a monolith | Keeps the core transactional backend in Node/Express while isolating LLM integration in Python, where its AI/ML tooling ecosystem (e.g. PyMuPDF for PDF rasterization) and prompt handling are most natural — no longer tied to any particular vendor SDK since the 2026-08-17 Claude→Ollama migration | Extra network hop and deployment unit; that hop is currently unauthenticated with no request timeout |
| Postgres exclusion constraint (`doctor_id` + overlapping `tstzrange`, non-cancelled only) for double-booking | Race-safe by construction under concurrent booking requests, unlike an application-level check-then-insert | Constraint violations not explicitly mapped to a friendly error still leak raw Postgres text via the global error handler |
| Short-lived stateless access JWT + rotating hashed refresh token in an httpOnly cookie | Stateless verification on every request and in the Socket.IO handshake, with real server-side revocation through the refresh token | An access token already issued stays valid until it expires (at most 15 minutes after logout) |
| Socket.IO (not raw WebSockets or polling) for chat | Room-based broadcasting, handshake auth, and reconnection handling out of the box for message send + typing indicators | No try/catch around the DB write in `message:send`; no Redis adapter, so it won't scale past one server instance as-is |
| Cloudinary (not Amazon S3, despite both being in the README stack table) for file storage | The one actually wired up (`server/src/config/cloudinary.js`), likely for faster setup without bucket/IAM configuration | README/stack-table vs. implementation mismatch; ties document URLs to a third party fetched by `ai-service` with no allowlist |
| Vite (not Create React App or hand-rolled Webpack) for client tooling | Faster dev-server startup and HMR at this project's size, minimal config | No dev-server proxy for `/api`; local dev depends entirely on backend CORS being correctly configured |

---

*This document describes the system as scaffolded on 2026-08-14. It should be revised as features move from `PARTIALLY_IMPLEMENTED`/`PLANNED` to `IMPLEMENTED` and as the deployment target in §12 becomes real infrastructure. Updated 2026-08-17 to reflect the `ai-service` AI backend migration from the Claude API to a local Ollama server; see `CHANGELOG.md` for the full migration record.*
