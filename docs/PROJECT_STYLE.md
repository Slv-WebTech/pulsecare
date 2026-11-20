# Project Style Guide

> **Status note (2026-11-20):** this document was written during the early scaffold phase and parts of it
> are historical. For the current state see [`QA-REPORT.md`](./QA-REPORT.md) (what was tested, fixed and
> what remains), [`CHANGELOG.md`](./CHANGELOG.md) and the root [`README.md`](../README.md). Where this
> document disagrees with them, they win.

**Project:** AI-Powered Healthcare Appointment & Patient Portal
**Scope of this document:** UI style, UX interaction patterns, and code style/conventions for the three services — `client/` (React + Vite), `server/` (Express + PostgreSQL + Socket.IO), and `ai-service/` (FastAPI + Ollama (local LLM)).

> **Status note.** This codebase is a freshly generated scaffold (files created within the same ~1 hour session, no git history). Conventions described below as "established in code" are drawn directly from what exists today across all three services. Conventions described as "recommended" or "going forward" do not exist in the codebase yet — they are prescribed here so that new work has a single target to build toward instead of each contributor inventing a different pattern. Where the two are in tension (e.g., a page that currently has no loading state), the recommendation is what new and modified code should do; it is not a claim about what the current page does.

---

## 1. UI Style

### 1.1 What is established in code today

The entire application styling layer is a single global stylesheet, `client/src/index.css` — there is no CSS framework, no CSS-in-JS, and no CSS Modules anywhere in the client. What can be confirmed about it:

| Aspect | Established fact |
|---|---|
| Styling approach | Plain hand-written CSS in one global file (`src/index.css`); no framework/library |
| Theming mechanism | CSS custom properties defined in `:root` (e.g. `--color-bg`, `--color-primary`, and others of the same pattern) |
| Color scheme | `color-scheme: light` is hardcoded in `:root`; there is no dark-mode media query or toggle, despite the custom-property structure being the kind of thing that would make theming straightforward later |
| Class naming | BEM-style block/element/modifier naming is used for component-scoped classes, e.g. `.appointment-card__status--completed` |
| Generic/utility classes | A handful of broad, non-namespaced class names also exist and are reused across features: `.grid`, `.modal`, `.stat-card` |
| Responsive strategy | Exactly one breakpoint: `@media (max-width: 768px)` |
| Component styling | Every component listed in the client discovery (cards, modals, forms, dashboards) relies on this one file; there are no per-component style files |

**Assessment:** beyond the two named custom properties and the BEM/utility naming split above, no documented color palette, typography scale, spacing scale, border-radius scale, or shadow tokens exist in the current file. This is a thin foundation, not a stub — the custom-property + BEM approach is a real, continuable pattern — but it is incomplete. The system below fills in the missing pieces. Anything in §1.2 not already listed in the table above is a **recommendation**, not a description of existing code.

### 1.2 Recommended design system (going forward)

Build directly on the existing custom-property + BEM approach; do not introduce a CSS framework, CSS-in-JS, or CSS Modules mid-project, since none of those are in use anywhere today.

**Color tokens.** Extend the existing `--color-bg` / `--color-primary` pattern in `:root` with a full set: a surface/background pair, a border color, primary/secondary text colors, and semantic colors for success, warning, danger, and info (used consistently for appointment status, form validation, and toast/banner feedback — see §1.2 Notifications). Pick and document concrete values the first time each token is actually needed in a component, rather than pre-defining values nobody has used yet.

**Typography.** No font family, size scale, or line-height is defined anywhere today. Introduce a small scale as custom properties (e.g. `--font-size-sm/base/lg/xl`, `--line-height-base`) and a single font stack, defined once in `:root` and referenced everywhere — not re-declared per component.

**Spacing.** No spacing scale exists today. Adopt a small consistent scale (e.g. a 4px or 8px base unit expressed as custom properties) instead of ad hoc pixel/`rem` values scattered per component.

**Radius & shadow.** Neither exists today. Define `--radius-sm/md/lg` and one or two `--shadow` tokens for cards and modals so elevation is consistent instead of per-component guesses.

**Buttons.** Define primary, secondary, and danger variants as classes, each with explicit `:hover`, `:focus-visible`, and `:disabled` states. This matters concretely today: `BookingModal` and `DocumentUpload` already implement a submitting/disabled state on their primary action button, but `Login.jsx` and `Register.jsx` do not — new form work should follow the `BookingModal`/`DocumentUpload` pattern (disable + relabel the button while a submit is in flight), not the `Login`/`Register` one.

**Forms.** Standardize a label + input + inline error-text pattern. Validation feedback should render next to the field it concerns, using the semantic "danger" color token, rather than only surfacing as a top-of-form error string.

**Cards.** Continue the existing BEM convention (`.appointment-card__status--completed`, etc.) for card-style components (`AppointmentCard`, `DoctorCard`, `DocumentCard`, admin `stat-card`). New cards should follow the same `block__element--modifier` shape rather than inventing flat utility classes.

**Navigation.** `Navbar` already renders role-aware links and a logout action. Extend it with a clear active-link style (not currently evidenced) rather than restyling navigation from scratch elsewhere.

**Tables.** No table-based UI is evidenced anywhere in the discovery (dashboards currently render lists/cards). If a tabular view is added (e.g., a denser admin view), define a single reusable table style (header row, zebra or border-based row separation, responsive overflow) rather than a one-off per page.

**Modals.** `BookingModal` is the only modal in the codebase today, using the `.modal` utility class. No focus trapping, `Escape`-to-close, or ARIA dialog role is evidenced — treat all of these as required going forward (see Accessibility below), and any new modal should reuse `.modal` rather than a new overlay pattern.

**Notifications / toasts.** No toast or banner system is evidenced anywhere in the client. Given that most page-level fetches currently have no error UI at all (see §2), introduce one consistent notification pattern (inline banner or toast) for both success and error feedback, and use it uniformly rather than each page inventing its own error string placement.

**Loading / empty / error states.** Per the discovery, most data-fetching pages (`AdminDashboard`, `DoctorDashboard`, `PatientDashboard`, `ChatWindow`'s history load) currently show no loading indicator and no error state — a failed request either leaves the page stuck on "Loading…" indefinitely (`AdminDashboard`) or silently renders an empty list. Every new or touched data-fetching component should implement three explicit states: a loading indicator while the request is in flight, an empty-state message when the result set is genuinely empty, and a visible error message (using the notification pattern above) when the request fails.

**Responsive breakpoints.** Only `max-width: 768px` exists today. Add at least one intermediate breakpoint for tablet-sized viewports, and specifically verify `BookingModal` and `ChatWindow` at small widths, since neither has documented responsive treatment.

**Accessibility.** No ARIA roles/labels, focus management, alt-text convention, or contrast consideration is evidenced anywhere in the client. At minimum going forward: add ARIA roles and focus trapping to `BookingModal` (and any future modal/dialog), use semantic landmark elements in the shared layout, and check color-token contrast when the palette above is filled in.

**Animation.** No transitions/animations are evidenced today. Keep any added motion minimal and purposeful (hover/focus state changes, modal enter/exit), and respect `prefers-reduced-motion` rather than adding decorative animation.

---

## 2. UX Style

### 2.1 Navigation — role-based dashboards

Access control is enforced by `ProtectedRoute` on the client (paired with `requireAuth`/`requireRole` on the server) and routes to three role-specific dashboards:

- `/patient` — doctor search/booking, own appointments, document upload/list
- `/doctor` — today's/upcoming appointments with status-change actions
- `/admin` — platform stats and popular specializations

`Navbar` renders role-aware links (e.g. `Dashboard` linking to `/${user.role}`), so navigation options should always be derived from `user.role` rather than hardcoded per page — that is the established pattern and new nav items should follow it.

Two known navigation gaps exist and should be fixed rather than replicated in new code: `/` unconditionally redirects to `/login` regardless of auth state, and `ProtectedRoute` sends a wrong-role authenticated user to `/` — which then bounces them straight to `/login` instead of their own dashboard. The catch-all `*` route is an unstyled bare `<p>Page not found</p>` with no link back; new work touching routing should give this a real page and a way home rather than leaving it as-is.

### 2.2 Feedback patterns

The established intent (visible in `BookingModal` and `DocumentUpload`, which both implement real loading + error state around their API calls) is: **every user-initiated action that hits the network should show an in-flight state and a resolved success/error state.** This is the pattern to extend, not the exception. Concretely, do not add a new fetch or form submission that follows the `.then()`-with-no-`.catch()` pattern seen in `AdminDashboard`, `DoctorDashboard`, `PatientDashboard`, and `ChatWindow`'s history load, or the no-catch-block-at-all pattern in `DocumentCard.handleSummarize` — both are documented gaps, not conventions to copy.

### 2.3 Error handling UX

There is currently no centralized 401/expired-token handling anywhere in the client (`services/api.js` has a request interceptor for the Bearer token but no response interceptor), so a stale token today just makes whichever request used it fail silently. New work should not add more of these silent failures; where a shared response-interceptor/global-logout pattern doesn't yet exist for a given flow, at minimum surface a visible error via the notification pattern in §1.2 rather than leaving the UI in an ambiguous state.

On the server, the global Express error handler (`server/index.js`) currently returns the raw `err.message` to the client for any unhandled error, including raw Postgres constraint text. New error paths should return a sanitized, user-appropriate message and rely on `console.error` (or a future structured logger) for the full detail server-side — not propagate raw internal errors to the client.

### 2.4 Confirmation behavior

`AppointmentCard` exposes status-transition actions (e.g. `scheduled → confirmed`/`cancelled`) with no confirmation step evidenced anywhere in the discovery. Any new destructive or hard-to-reverse action (cancelling an appointment, deleting a document, etc.) should get an explicit confirmation step (a confirm dialog or a two-step control) — this is a UX gap in the current scaffold, not a pattern to continue.

### 2.5 Mobile behavior

The only responsive behavior currently defined is the single `max-width: 768px` breakpoint in `index.css` (see §1). There is no documented mobile-specific treatment for the chat window or the booking modal. Until that's addressed, treat both as needing explicit mobile verification whenever they're touched, rather than assuming the single global breakpoint already covers them.

### 2.6 Known functional UX gaps to be aware of (not to replicate)

- `BookingModal` hardcodes a 30-minute appointment duration client-side and does not validate that the picked date/time is in the future.
- `ChatWindow`'s send flow has no optimistic local append — a sent message only appears in the sender's own UI if the server echoes `message:new` back to them, and the client cannot detect if that assumption breaks.
- Login/Register submit buttons stay enabled and unlabeled during the async call, unlike `BookingModal`/`DocumentUpload`, which disable and relabel — double-submission is possible on the former two today.

---

## 3. Code Style

New code across all three services should follow the conventions below rather than introducing new ones. Where a convention is explicitly marked absent/recommended, that marks a genuine current gap — adopting a *different* ad hoc pattern to fill it is worse than leaving it consistent with the existing (imperfect) approach until the project-wide fix lands.

### 3.1 Naming conventions

| Context | Convention | Evidence |
|---|---|---|
| JS/JSX variables & functions | `camelCase` | throughout client and server |
| React components | `PascalCase`, one component per file, filename matches component name | `AppointmentCard.jsx`, `BookingModal.jsx`, `ChatWindow.jsx`, `DoctorCard.jsx`, `DoctorSearchFilters.jsx`, `DocumentCard.jsx`, `DocumentUpload.jsx`, `Navbar.jsx`, `ProtectedRoute.jsx`, `AuthContext.jsx` |
| Server file roles | suffix names the layer: `*.controller.js`, `*.routes.js`, `*.middleware.js` | `auth.controller.js`/`auth.routes.js`, `upload.middleware.js`, `auth.middleware.js` |
| Server support modules | plain descriptive name, no suffix | `catchAsync.js` (utils), `db.js`/`cloudinary.js` (config), `socket.js` |
| SQL identifiers | `snake_case`, plural table names, singular-ish enum type names | `doctor_profiles`, `doctor_availability`, `starts_at`, `user_role`, `appointment_status` |
| SQL constraints | `snake_case`, descriptive | `no_double_booking` |
| SQL indexes | `idx_<table>_<column>` | `idx_appointments_patient`, `idx_appointments_doctor`, `idx_messages_appointment`, `idx_doctor_profiles_specialization`, `idx_doctor_profiles_location` |
| Python (ai-service) | `snake_case` for functions/modules | `parse_search_query`, `parse_json_response`, `build_images`, `chat_json`, `summarize_document`; files `main.py`, `assistant.py`, `summarizer.py`, `ollama_client.py`, `util.py` |
| Module-level constants (JS & Python) | `UPPER_SNAKE_CASE` | `VALID_ROLES`, `ALLOWED_MIME_TYPES`, `STATUS_ACTIONS`, `FILTER_PROMPT`, `SUMMARY_PROMPT`, `MODEL` |

### 3.2 Folder conventions

Client components are organized **by feature domain**, not by type:

```
client/src/
  components/
    Appointment/   AppointmentCard.jsx, BookingModal.jsx
    Chat/          ChatWindow.jsx
    Doctor/        DoctorCard.jsx, DoctorSearchFilters.jsx
    Document/      DocumentCard.jsx, DocumentUpload.jsx
    Layout/        Navbar.jsx, ProtectedRoute.jsx
  context/         AuthContext.jsx
  pages/           AdminDashboard.jsx, DoctorDashboard.jsx, Login.jsx,
                    PatientDashboard.jsx, Register.jsx
  services/        api.js, socket.js
```

New client components belong under `components/<Domain>/`, matching the existing domains where one applies, or a new domain folder if the feature doesn't fit an existing one — not a flat `components/` directory and not organized by component "type" (e.g. no `components/cards/`, `components/modals/` split).

Server code is organized **by architectural layer** under `server/src/`: `routes/`, `controllers/`, `middleware/`, `config/`, `models/` (schema), `socket/`, `utils/`. A new server feature adds one file to each relevant layer (e.g. `reminder.routes.js` + `reminder.controller.js`), following the existing auth/doctor/appointment/document/chat/admin pattern — it does not introduce a new top-level grouping style.

### 3.3 State management

The client uses **React Context only** — `AuthContext` (user, loading, `login`/`register`/`logout`, session restore from `localStorage` token) is the sole global-state mechanism. There is no Redux, Zustand, Recoil, or other state library anywhere in `package.json`. New global/cross-page state should extend the Context pattern (a new Context, or extending `AuthContext` if it's auth-adjacent) rather than introducing a state library.

Page-level fetched data (`AdminDashboard`, `DoctorDashboard`, `PatientDashboard`) is held in local `useState` per page with no shared cache — every dashboard independently re-fetches its own data on every mount. This is a known limitation (no request dedup/staleness handling), not a pattern to double down on; if a shared data layer is introduced later, that is a deliberate architectural change to make explicitly, not something to partially retrofit into one page at a time.

### 3.4 API pattern

**Client → server:** a single shared `axios` instance (`services/api.js`) with `baseURL` from `VITE_API_URL` and a request interceptor that attaches the Bearer token from `localStorage`. All components currently call `api.get/post/patch(...)` inline with hardcoded endpoint strings — there are no per-resource modules (e.g. no `doctors.js`/`appointments.js`/`documents.js` wrapping the raw calls) yet. New code should keep using the shared `api` instance (do not create a second axios instance or use raw `fetch`); grouping calls into resource modules is a reasonable improvement but should be done as a deliberate refactor, not invented ad hoc per new component. There is currently no response interceptor (no centralized 401 handling) — see §2.3.

**Client ↔ realtime:** a single Socket.IO singleton (`services/socket.js`) with `connectSocket(token)`/get/disconnect helpers, currently the only consumer of which is `ChatWindow`. New realtime features should reuse this singleton rather than opening a second socket connection.

**Server (Express):** REST endpoints are organized by resource — `routes/*.routes.js` mounts `requireAuth`/`requireRole` middleware (from `middleware/auth.middleware.js`) and wraps each controller in `catchAsync` (`utils/catchAsync.js`) so rejected promises reach the centralized error-handling middleware in `index.js` rather than crashing the process or hanging the request. New server routes should follow this exact chain: router → `requireAuth`/`requireRole` as needed → `catchAsync(controllerFn)` → controller issues parameterized SQL via the shared `pool` (`config/db.js`). Do not add a route that skips `catchAsync` on an `async` handler, and do not add a new authorization check outside the `requireAuth`/`requireRole` middleware pair (e.g. inline `if (req.user.role !== ...)` checks scattered in controllers) — use the middleware.

**ai-service (FastAPI):** routers (`assistant.py`, `summarizer.py`) define Pydantic request models and call `chat_json` from `ollama_client.py` — a thin `httpx`-based client that POSTs to a local Ollama server's `/api/chat` endpoint with `format: "json"` to constrain the response to valid JSON. (This replaced a `claude_client.py` wrapper around the paid Claude API; `ollama_client.py` needed no new dependency since `httpx` was already in use.) The `parse_json_response` helper (stripping markdown fences before `json.loads`) now lives in `util.py` and is imported by both `assistant.py` and `summarizer.py` — this used to be duplicated verbatim across the two files (previously called out here as tech debt) and was deduplicated as part of the same migration. New ai-service code should keep importing shared helpers from `util.py` rather than re-copying them into a router file.

### 3.5 Validation

Validation is currently **ad hoc and inconsistent per controller** on the server — there is no centralized/schema-based validation library (no `express-validator`, `zod`, etc.) anywhere in `server/package.json`. For example, `bookAppointment` never checks `startsAt < endsAt`. On `ai-service`, Pydantic request models provide some structural validation on the way in, but there is no schema validation on the JSON Ollama returns before it's used or returned to the client. New code should validate inputs at the controller/route-handler level consistent with whatever the neighboring controller already does (do not silently skip validation just because the surrounding code does), but should not introduce a validation library unilaterally — adopting one project-wide is listed as a future improvement, not something to do piecemeal in one controller.

### 3.6 Logging

There is no structured logging anywhere in the stack. The server's only logging is `console.error(err)` inside the global Express error handler; `ai-service` has no logging or observability instrumentation at all. New code should not introduce a logging library (e.g. `winston`, `morgan`, Python `logging` with custom handlers) unilaterally in one file — this is a documented gap to be addressed project-wide, not per-endpoint.

### 3.7 Testing

**No test framework exists in any of the three services** — confirmed absent from `server/package.json`, `client/package.json`, and `ai-service/requirements.txt` (no Jest/Vitest/Mocha, no `pytest`). There are no test files anywhere in the codebase. This is a stated gap in the canonical project assessment (Testing scored 0), not a convention — new code is not expected to match "no tests," and adding a test framework/tests is one of the next recommended actions for the project. Until a framework is chosen project-wide, do not introduce a single ad hoc test file/runner in isolation; treat test-infrastructure setup as a deliberate, project-wide decision.

### 3.8 Linting/formatting

No linter or formatter is configured in any service (no ESLint/Prettier despite an `eslint-disable-next-line` comment existing in `server/index.js`; no `ruff`/`black` for `ai-service`). Match the surrounding code's existing formatting by hand until a linter/formatter is adopted project-wide.

---

## 4. Summary — how to use this document

- **UI:** reuse the existing CSS-custom-property + BEM approach in `index.css`; fill in missing tokens (color, type, spacing, radius, shadow) the first time a component genuinely needs them, following the structure in §1.2, not a new styling technology.
- **UX:** every new network-driven interaction gets a loading state, an error state, and (for destructive actions) a confirmation step — extend the pattern `BookingModal`/`DocumentUpload` already demonstrate, not the gaps in `AdminDashboard`/`Login`/`Register`/`ChatWindow`.
- **Code:** follow the naming, folder, state-management, and API conventions in §3 exactly as they exist in the current codebase. Where a convention is marked absent (validation library, logging, tests, linting), that is a known project-wide gap to be closed deliberately — not license to invent a one-off local solution.

New code should follow this guide rather than inventing new patterns.
