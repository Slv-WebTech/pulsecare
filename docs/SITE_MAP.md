# Site Map — Client Routes

> **Status note (2026-11-20):** this document was written during the early scaffold phase and parts of it
> are historical. For the current state see [`QA-REPORT.md`](./QA-REPORT.md) (what was tested, fixed and
> what remains), [`CHANGELOG.md`](./CHANGELOG.md) and the root [`README.md`](../README.md). Where this
> document disagrees with them, they win.

`healthcare-app` / client (React + Vite, `react-router-dom` v6)
Scope: this document covers the routes defined in `client/src/App.jsx` only. It cross-references
components from `client/src` and API endpoints from `server/index.js` / `server/src/routes/*`.
Project state: fresh scaffold (~1 hour old at time of writing). Status labels below match the
canonical synthesis exactly — nothing here claims more than what the discovery evidence supports.

Last verified against discovery data: 2026-08-14.

---

## 1. Route tree

```
/                              Public   → unconditional redirect to /login (not role- or auth-aware)
├── /login                     Public   → Login page
├── /register                  Public   → Register page (role select: patient | doctor)
├── /patient                   ProtectedRoute(roles=["patient"]) → Patient Dashboard
├── /doctor                    ProtectedRoute(roles=["doctor"])  → Doctor Dashboard
├── /admin                     ProtectedRoute(roles=["admin"])   → Admin Dashboard
└── *  (catch-all)              Public   → 404 Not Found
```

There is no separate `/` landing page — `/` is a bare `<Navigate to="/login" replace />` regardless
of whether a session already exists. There is likewise no dedicated chat route; chat is a component
(`ChatWindow.jsx`), not a page (see §3.6 below).

### Gating mechanism — `ProtectedRoute`

`client/src/components/Layout/ProtectedRoute.jsx` wraps `/patient`, `/doctor`, and `/admin`. It reads
auth state from `AuthContext` and branches on loading / unauthenticated / wrong-role:

- Not authenticated → redirect to `/login`.
- Authenticated but `user.role` not in the route's allowed `roles` → `<Navigate to="/" replace />`.

That second branch is a documented client-side bug: `/` itself unconditionally redirects to
`/login`, so an authenticated user who lands on the wrong-role route is bounced to the login page
instead of their own dashboard, rather than being routed to `/${user.role}`.

---

## Status legend (matches canonical synthesis wording)

| Status | Meaning |
|---|---|
| **implemented** | Full happy-path wiring confirmed in discovery, no known functional gap on this axis |
| **partial** | Real, working code exists but with a confirmed gap (missing error/loading handling, missing validation, missing ownership check, etc.) |
| **stub** | Present in the route table but effectively unbuilt (bare placeholder) |

---

## 2. Cross-cutting / global (applies to every route)

These are not page-specific but affect the whole route tree:

- **`AuthProvider`** (`client/src/context/AuthContext.jsx`) wraps the entire router in `main.jsx`. On
  mount it attempts to restore a session from a `localStorage` token, presumably via
  `GET /api/auth/me` (server: auth required via `requireAuth`, implemented). Any failure of that
  call — network blip, 500, or actually-invalid token — is treated identically: the token is
  discarded and the user is logged out (`.catch(() => localStorage.removeItem("token"))`), with no
  distinction between transient and permanent failure.
- **`Navbar`** (`client/src/components/Layout/Navbar.jsx`) — role-aware top navigation with a
  `Dashboard` link to `/${user.role}` and logout; renders differently depending on auth state.
  Implemented.
- **`services/api.js`** — shared axios instance; attaches `Authorization: Bearer <token>` on every
  request. It has **no response interceptor**, so there is no centralized handling of an expired or
  invalid token anywhere in the client — a 401 fails silently in whichever component made the call.
- **`services/socket.js`** — singleton Socket.IO client (`connectSocket`/`getSocket`/`disconnectSocket`),
  authenticated via `auth: { token }` on connect. No reconnection or error listeners are registered.

---

## 3. Route detail

### 3.1 `/` — Root redirect

| | |
|---|---|
| **Route** | `/` |
| **Page** | (none — inline `<Navigate>`) |
| **Access** | Public |
| **Purpose** | Send every visitor to `/login` |
| **Components** | `<Navigate to="/login" replace />` inline in `App.jsx` |
| **API dependencies** | None |
| **Status** | **implemented** — but not role- or auth-aware: an already-logged-in user hitting `/` is still bounced to `/login` rather than to their dashboard |

---

### 3.2 `/login` — Login

| | |
|---|---|
| **Route** | `/login` |
| **Page** | `client/src/pages/Login.jsx` |
| **Access** | Public |
| **Purpose** | Authenticate an existing user and establish a session |
| **Components** | `Login.jsx` page form; calls `login()` from `AuthContext` |
| **API dependencies** | `POST /api/auth/login` — auth: none · status: **implemented** · verifies bcrypt password hash and issues a JWT |
| **Status** | **partial** — the form has real error state (a failed login surfaces a message via `catch`), but the submit button has no submitting/disabled state during the async call, so a double-submit is possible. Unlike `BookingModal`/`DocumentUpload`, no loading indicator is shown. |

---

### 3.3 `/register` — Register

| | |
|---|---|
| **Route** | `/register` |
| **Page** | `client/src/pages/Register.jsx` |
| **Access** | Public |
| **Purpose** | Create a new account, with a role selector (patient or doctor) |
| **Components** | `Register.jsx` page form; calls `register()` from `AuthContext` |
| **API dependencies** | `POST /api/auth/register` — auth: none · status: **implemented** · `role` restricted to `patient`/`doctor` (fixed same-day; previously caller-selectable including `admin`) |
| **Status** | **partial** — same button-state gap as Login (no submitting/disabled state). The underlying endpoint's privilege-escalation gap (`role` accepting `admin` with no restriction) is **fixed**; the remaining gap is UI-only. |

---

### 3.4 `/patient` — Patient Dashboard

| | |
|---|---|
| **Route** | `/patient` |
| **Page** | `client/src/pages/PatientDashboard.jsx` |
| **Access** | `ProtectedRoute(roles=["patient"])` |
| **Purpose** | Patient's main hub: doctor search/booking, own appointments, document upload/list |
| **Components** | `DoctorSearchFilters.jsx` (filter form), `DoctorCard.jsx` (search-result card), `BookingModal.jsx` (booking form), `AppointmentCard.jsx` (appointment list item with status-transition buttons), `DocumentUpload.jsx` (file upload), `DocumentCard.jsx` (uploaded-document display + AI summary trigger) |
| **API dependencies** | See table below |
| **Status** | **partial** — all three primary fetches (doctors, appointments, documents) are wired with real data but use `.then()` with **no `.catch()`** and there is no loading state anywhere on the page, per client discovery evidence. |

API calls made from this page and its child components:

| Method | Path | Auth (server) | Server status | Used by |
|---|---|---|---|---|
| GET | `/api/doctors` | none | implemented | Page-level search (`searchDoctors({})` on mount, refined via `DoctorSearchFilters`) |
| GET | `/api/appointments` | any authenticated | implemented | Page-level "own appointments" fetch (role-aware: returns patient's appointments) |
| GET | `/api/documents` | any authenticated | implemented | Page-level "own documents" fetch |
| POST | `/api/appointments` | patient only | implemented (409 on double-booking) | `BookingModal.jsx` |
| POST | `/api/documents` | any authenticated | implemented | `DocumentUpload.jsx` |
| POST | `/api/documents/:id/summarize` | any authenticated | implemented | `DocumentCard.jsx` |
| PATCH | `/api/appointments/:id/status` | owning patient, owning doctor, or admin (fixed same-day; previously any authenticated) | implemented | `AppointmentCard.jsx` status-transition buttons, if rendered here |

Known issues specific to this page's components (from discovery):
- `BookingModal` hardcodes a 30-minute appointment duration client-side and does not validate the
  chosen date/time is in the future.
- `DocumentCard.handleSummarize` has **no catch block at all** around its `await api.post(...)` —
  a failed summarize call is an unhandled promise rejection with zero user-facing error message.
- `DoctorSearchFilters` itself is complete for its scope (strips empty filter values before calling
  `onSearch`).

---

### 3.5 `/doctor` — Doctor Dashboard

| | |
|---|---|
| **Route** | `/doctor` |
| **Page** | `client/src/pages/DoctorDashboard.jsx` |
| **Access** | `ProtectedRoute(roles=["doctor"])` |
| **Purpose** | Doctor's view of today's and upcoming appointments with status-change actions |
| **Components** | `AppointmentCard.jsx` (appointment list item with `STATUS_ACTIONS` transition buttons, e.g. `scheduled → [confirmed, cancelled]`) |
| **API dependencies** | See table below |
| **Status** | **partial** — appointments fetch has no `.catch` and no loading indicator; the grid simply renders empty until data arrives. |

| Method | Path | Auth (server) | Server status | Used by |
|---|---|---|---|---|
| GET | `/api/appointments` | any authenticated | implemented | Page-level fetch (role-aware: returns doctor's appointments) |
| PATCH | `/api/appointments/:id/status` | owning patient, owning doctor, or admin (fixed same-day; previously any authenticated) | implemented | `AppointmentCard.jsx` status-transition buttons |

Note: `PUT /api/doctors/profile` (doctor-only, implemented server-side — self-service profile
upsert via `ON CONFLICT`) has **no confirmed client consumer** anywhere in the client discovery;
no doctor-profile-editing component was found. This endpoint appears to be implemented on the
server with no corresponding UI yet.

Known issues specific to this page:
- ~~Same IDOR exposure as noted above~~ — **fixed**: `PATCH /api/appointments/:id/status` now enforces ownership server-side, so the status-change buttons on this page can only mutate appointments the signed-in doctor actually owns (or that of an admin caller).
- No `.catch`/loading indicator on the initial fetch.

---

### 3.6 Chat — not a routed page

`ChatWindow.jsx` (`client/src/components/Chat/ChatWindow.jsx`) implements 1:1 chat (REST history
load + Socket.IO live send/receive) and is the sole confirmed consumer of `services/socket.js`.
However, **no route in `App.jsx` and no page purpose in the discovery data names a `/chat` path or
confirms which dashboard embeds this component.** It is documented here separately rather than
attributed to `/patient` or `/doctor` to avoid asserting a placement not evidenced in the discovery
pass.

| Method | Path | Auth (server) | Server status |
|---|---|---|---|
| GET | `/api/chat/:userId` | any authenticated | implemented (correctly scoped to `req.user.id`) |
| PATCH | `/api/chat/:id/read` | any authenticated | implemented (correctly scoped to `recipient_id = req.user.id`) |
| SOCKET | `message:send` | JWT via socket handshake `auth.token` | partial — persists + broadcasts `message:new`, but no try/catch or payload validation server-side |
| SOCKET | `typing` | JWT via socket handshake `auth.token` | implemented |

Known issues: `ChatWindow` loads history with `api.get()` and no `.catch`/loading state; its send
flow only does `socket?.emit("message:send", ...)` with no optimistic local append, so a sent
message only appears in the sender's own UI if the server echoes `message:new` back to them —
unverifiable from the client alone.

---

### 3.7 `/admin` — Admin Dashboard

| | |
|---|---|
| **Route** | `/admin` |
| **Page** | `client/src/pages/AdminDashboard.jsx` |
| **Access** | `ProtectedRoute(roles=["admin"])` |
| **Purpose** | Platform stats: patient/doctor counts, appointment completion rate, popular specializations |
| **Components** | None beyond the page itself (renders `stats` fields directly) |
| **API dependencies** | `GET /api/admin/stats` — auth: admin (`requireAuth` + `requireRole("admin")`) · status: **implemented** · real aggregate SQL (counts, completion rate via `FILTER`, top specializations) |
| **Status** | **partial** — the fetch has no `.catch`, so a failed request leaves the page stuck on "Loading…" forever with no error message. The page also destructures `stats.popularSpecializations.map(...)` with no guard for that field being undefined/null if the backend response omits or renames it. |

---

### 3.8 `*` — 404 Not Found

| | |
|---|---|
| **Route** | `*` (catch-all) |
| **Page** | Inline in `App.jsx` |
| **Access** | Public |
| **Purpose** | Fallback for unmatched paths |
| **Components** | Bare `<p>Page not found</p>` |
| **API dependencies** | None |
| **Status** | **stub** — unstyled, no navigation link back to the app |

---

## 4. Endpoints with no confirmed client consumer

For completeness, two real server-side endpoints were not matched to any client component or page
in the discovery data:

- `GET /api/doctors/:id/availability` (public, implemented) — lists a doctor's weekly availability
  slots. No component in the client discovery (including `BookingModal`) was confirmed to call it.
- `PATCH /api/appointments/:id/reschedule` (owning patient, owning doctor, or admin — fixed
  same-day; implemented) — no reschedule UI/form was found among the reviewed client units.
- `PUT /api/doctors/profile` (doctor-only, implemented) — see note under §3.5; no doctor-profile
  editing component exists in the client discovery.

These are documented as gaps in the discovery evidence, not as confirmed absences of functionality.

---

## 5. Summary table — all routes at a glance

| Route | Access | Status | Primary API calls |
|---|---|---|---|
| `/` | Public | implemented (not role-aware) | none |
| `/login` | Public | partial | `POST /api/auth/login` |
| `/register` | Public | partial | `POST /api/auth/register` |
| `/patient` | role: patient | partial | `GET /api/doctors`, `GET/POST /api/appointments`, `GET/POST /api/documents`, `POST /api/documents/:id/summarize` |
| `/doctor` | role: doctor | partial | `GET /api/appointments`, `PATCH /api/appointments/:id/status` |
| `/admin` | role: admin | partial | `GET /api/admin/stats` |
| `*` | Public | stub | none |

(Chat is a component, not a route — see §3.6.)
