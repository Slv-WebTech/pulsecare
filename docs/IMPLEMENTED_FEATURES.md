# Implemented Features

This document lists **only** the functionality in the healthcare-app scaffold that discovery has confirmed as real, working, end-to-end code as of 2026-08-14 — foundational wiring, a working database schema, health checks, working middleware, and the two product features whose server *and* client sides are both fully wired with no known functional gap. Everything else — every feature with a partial gap (auth/registration, appointment booking, doctor/admin dashboards, chat, AI summarization) and everything not yet built (appointment reminders) — is deliberately **excluded** from this file. See `FEATURES.md` and `PROJECT_PLAN.md` for that material.

**Project age:** this is a scaffold generated roughly one hour before this document, per file timestamps and the README's own "Status" section. Nothing here should be read as production-hardened.

**Testing status (applies to every item below):** No automated test framework is installed in any of the three services — `server/package.json`, `client/package.json`, and `ai-service/requirements.txt` all confirm zero test dependencies, and no test files exist anywhere in the repository. Nothing described in this document has been verified by anything beyond manual code inspection.

---

## 1. Project & Service Bootstrapping

The three services start up, wire their routes/middleware together, and talk to their respective data stores. This is plumbing, not a product feature, but it is real and functional.

**Server (`server/`)**
- `server/index.js` — Express app created; CORS restricted to a single `CLIENT_ORIGIN`; JSON body parsing; all six route groups mounted (`/api/auth`, `/api/doctors`, `/api/appointments`, `/api/documents`, `/api/chat`, `/api/admin`); a global error-handling middleware; an HTTP server created and Socket.IO attached via `attachSocket`; listens on `PORT` (default `5000`).
- `server/src/config/db.js` — shared `pg.Pool` built from `DATABASE_URL`, with an idle-client error listener that logs to `console.error`.
- `server/src/config/cloudinary.js` — Cloudinary SDK configured from `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`.
- `server/src/utils/catchAsync.js` — wraps async Express handlers so a rejected promise is forwarded to `next(err)`; used consistently by every route file.

**Client (`client/`)**
- `client/index.html` — Vite entry point, mounts `#root`.
- `client/src/main.jsx` — renders the app inside `BrowserRouter` + `AuthProvider` + `StrictMode`.
- `client/src/App.jsx` — top-level route table wiring every page (login, register, three role dashboards, catch-all).
- `client/vite.config.js` — dev server on port 5173; no `/api` proxy configured.
- `client/src/services/api.js` — shared axios instance with `baseURL` from `VITE_API_URL`, and a request interceptor that attaches a Bearer token from `localStorage` when present.
- `client/src/services/socket.js` — singleton Socket.IO client with `connectSocket` / `getSocket` / `disconnectSocket` helpers, reading `VITE_SOCKET_URL`.
- `client/src/index.css` — global stylesheet: plain CSS with custom properties and BEM-style class names, one responsive breakpoint (`max-width: 768px`).

**AI service (`ai-service/`)**
- `ai-service/main.py` — FastAPI app created; CORS configured from `CLIENT_ORIGIN` / `SERVER_ORIGIN` with a localhost fallback; the summarizer and assistant routers are mounted.
- `ai-service/ollama_client.py` — thin `httpx`-based client that POSTs to a local Ollama server's `/api/chat` endpoint (`OLLAMA_BASE_URL`, default `http://localhost:11434`) with `format: "json"` to constrain output, using `OLLAMA_MODEL` (default `llama3.2-vision`). As of 2026-08-17 this replaces the former `claude_client.py` (deleted) / Anthropic SDK integration, which is no longer part of the codebase.

**Known limitations**
- Single hardcoded CORS origin per service (not a list) — workable for local dev only.
- No dev-server proxy for `/api` in `vite.config.js`; the client depends entirely on the server's CORS config.
- No response interceptor in `api.js`, so there is no centralized handling of expired/invalid tokens anywhere in the client.
- `socket.js` registers no reconnection or error event listeners.
- `server/package.json` declares no `engines` field despite `document.controller.js` relying on Node's built-in global `fetch` (Node ≥ 18).
- The global Express error handler returns the raw `err.message` to callers for any unhandled error.

---

## 2. Database Schema

**File:** `server/src/models/schema.sql`

A complete, hand-written relational schema, applied manually (`psql -f server/src/models/schema.sql`) — there is no migration tool. It defines:

- Enums: `user_role` (`patient` / `doctor` / `admin`), `appointment_status` (`scheduled` / `confirmed` / `completed` / `cancelled`).
- Tables: `users`, `doctor_profiles`, `doctor_availability`, `appointments`, `documents`, `messages`, `reminders`.
- Five indexes: `appointments` by patient, `appointments` by doctor, `messages` by appointment, `doctor_profiles` by specialization, `doctor_profiles` by location.
- A `UNIQUE (doctor_id, starts_at)` constraint on `appointments` (named `no_double_booking`), enforced at the database level — this guarantees no two bookings can collide for the same doctor/time under concurrent requests, independent of whatever validation the application layer does or doesn't perform.

**Known limitations**
- No versioned migration path — `schema.sql` is the single, hand-maintained source of schema truth.
- The `reminders` table exists in the schema with no application code anywhere that reads or writes it (no controller, route, or scheduler) — appointment reminders are planned, not built; see `PROJECT_PLAN.md`.

---

## 3. Health Check Endpoints

| Method | Path | Service | Auth | Response |
|--------|------|---------|------|----------|
| GET | `/health` | server (`server/index.js`) | none | `{ "status": "ok" }` |
| GET | `/health` | ai-service (`ai-service/main.py`) | none | `{ "status": "ok" }` |

Both are static liveness checks with no dependencies on the database, Cloudinary, or Ollama.

---

## 4. Authentication & Role-Based Access Control Middleware

**Files:** `server/src/middleware/auth.middleware.js`, `client/src/components/Layout/ProtectedRoute.jsx`, `client/src/components/Layout/Navbar.jsx`

- `requireAuth` verifies the incoming JWT with `jwt.verify(token, process.env.JWT_SECRET)`, attaches the decoded payload to `req.user`, and returns `401 Invalid or expired token` on failure.
- `requireRole(role)` is a middleware factory that gates a route to a single role; it is applied consistently — e.g. `router.use(requireAuth, requireRole("admin"))` on the admin router, `requireRole("doctor")` on the doctor-profile route, `requireRole("patient")` on appointment booking.
- On the client, `ProtectedRoute.jsx` implements loading/unauthenticated/wrong-role branches, redirecting unauthenticated users to `/login`.
- `Navbar.jsx` renders role-aware navigation links and a logout action driven by `AuthContext`'s `user.role`.

**API/DB dependencies:** JWT signed/verified with `JWT_SECRET` (server `.env`); no database lookup is required to authorize a request beyond the JWT payload itself.

**Known limitations**
- This middleware correctly enforces whichever role is already encoded in a user's JWT. Which role a new account can self-assign at registration is governed separately by `REGISTERABLE_ROLES` in `auth.controller.js` (now restricted to `patient`/`doctor` — previously accepted `admin` too; see `FEATURES.md` / `PROJECT_PLAN.md` for that fix's history). Admin accounts still have no dedicated provisioning path — they must be created directly in the database.
- `ProtectedRoute`'s wrong-role redirect target (`"/"`) itself unconditionally redirects to `/login` regardless of auth state, so an authenticated user who lands on the wrong dashboard route is bounced to the login screen instead of their own dashboard.

---

## 5. Doctor Search, Availability & Profile Management

**Status:** IMPLEMENTED (matches canonical feature "Doctor Search & Filters")

**Files:**
- `server/src/controllers/doctor.controller.js` (`searchDoctors`, `getDoctorAvailability`, `upsertDoctorProfile`)
- `server/src/routes/doctor.routes.js`
- `client/src/components/Doctor/DoctorSearchFilters.jsx`
- `client/src/components/Doctor/DoctorCard.jsx`
- `client/src/pages/PatientDashboard.jsx` (consumer — search/results wiring only; this page's other data fetches are covered separately in `FEATURES.md`)

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/doctors` | none | Dynamic SQL filters by specialization, location, fee, experience, language |
| GET | `/api/doctors/:id/availability` | none | Lists a doctor's weekly availability slots |
| PUT | `/api/doctors/profile` | doctor (`requireAuth` + `requireRole("doctor")`) | Upserts the caller's own doctor profile via `ON CONFLICT (user_id) DO UPDATE` |

**Client behavior:** `DoctorSearchFilters` strips empty filter fields before invoking the search callback; `DoctorCard` is a presentational result card (renders languages, fee, experience, etc.); `PatientDashboard` wires the search form to the results list end-to-end.

**DB dependencies:** `doctor_profiles`, `doctor_availability` tables; indexes on `specialization` and `location`.

**Known limitations**
- No pagination — `searchDoctors` returns an unbounded result set.
- No centralized input validation on filter parameters beyond ad hoc controller logic.

---

## 6. Medical Document Upload

**Status:** IMPLEMENTED (matches canonical feature "Medical Document Upload" — upload/list only; AI summarization of these documents is a separate, partially-implemented feature covered in `FEATURES.md`, not here)

**Files:**
- `server/src/controllers/document.controller.js` (`uploadDocument`, `listMyDocuments` only)
- `server/src/middleware/upload.middleware.js`
- `server/src/config/cloudinary.js`
- `server/src/routes/document.routes.js`
- `client/src/components/Document/DocumentUpload.jsx`

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/documents` | any authenticated (`requireAuth`) | `upload.single("file")` (multer) → uploads to Cloudinary → persists `file_url`/`file_type`/`original_name` to `documents` |
| GET | `/api/documents` | any authenticated (`requireAuth`) | Lists the caller's own uploaded documents |

**Middleware:** `upload.middleware.js` configures multer with in-memory storage, a 10MB file-size limit, and a MIME allowlist (`application/pdf`, `image/jpeg`, `image/png`).

**Client behavior:** `DocumentUpload.jsx` has real API wiring plus both an `uploading` loading state and an error state (`err.response?.data?.error || "Upload failed"`).

**DB/external dependencies:** `documents` table; Cloudinary (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).

**Known limitations**
- Multer `fileFilter` rejections (bad MIME type) throw a plain `Error` with no `.status`, so they surface as a `500` rather than a `400` through the global error handler.
- No pagination on `listMyDocuments`.
- The client's `accept=".pdf,.jpg,.jpeg,.png"` attribute is only a browser-level hint — actual type/size enforcement happens server-side only.

---

## What's intentionally not in this document

The following exist in code but have a confirmed functional or security gap and are documented instead in `FEATURES.md` / `PROJECT_PLAN.md`: registration/login (the `role`-selection privilege-escalation gap is **fixed**, but `Login.jsx`/`Register.jsx` submit buttons still have no loading/disabled state — a remaining client-side functional gap), appointment booking and status/reschedule (the missing-ownership-check IDOR is **fixed**, but this file still requires a full fresh verification pass — including a DB integration test — before being promoted here), doctor and admin dashboards (missing client-side loading/error handling), doctor-patient chat (unvalidated socket handler, no optimistic client send), AI document summarization (its authentication, SSRF, and file-size gaps are all **fixed** as of 2026-08-17, but the client's `DocumentCard` still has no catch block on failure and the Ollama integration hasn't been runtime-verified against a live model — see `FEATURES.md`), and appointment reminders (database table only, no application code).
