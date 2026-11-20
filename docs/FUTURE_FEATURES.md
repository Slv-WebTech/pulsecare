# Future Features & Backlog

**Last updated:** 2026-08-17
**Status of this document:** Backlog only. Nothing described below has been built, scheduled, or approved for implementation.

## Do not build from this document

Every item in this file is a candidate for a *future* phase of work, not the current one. This project started as a freshly generated scaffold (per `README.md`) and is still missing basic hardening on some of the features it already claims to have — see `docs/` for the current architecture/API/status docs and the canonical audit findings referenced there. As of 2026-08-17, the four originally-flagged critical access-control gaps are all **fixed** (public self-registration as `admin`, no ownership check on appointment status/reschedule, an unauthenticated `ai-service`, and its SSRF-prone `/summarize` endpoint) — but zero automated tests exist across all three services, none of today's fixes have regression coverage, and none of the ideas below should be started until that changes, and until a maintainer or product owner explicitly asks for a specific item on this list. Treat this document as an idea inventory, not a sprint plan.

## How to read each entry

Every backlog item below is described the same way:

- **Description** — what the feature would do.
- **User value** — who benefits and how.
- **Estimated complexity** — a rough Low / Medium / High / Very High judgment based on what already exists in the codebase versus what would need to be built from scratch (new infrastructure, third-party integrations, compliance surface).
- **Dependencies** — what would need to exist first (in this codebase or as a new external integration).
- **Possible risks** — security, compliance, cost, or reliability concerns specific to the item.
- **Reason for considering** — why it's on the list at all (spec origin, or a gap the codebase discovery surfaced).

Priority buckets are relative to each other and to the current state of the app, not an external deadline. Nothing here has a target date.

---

## High Priority

Items in this bucket build directly on infrastructure that already exists in the codebase (even if only partially), so the incremental work is smaller than starting from nothing. "High priority" describes leverage, not urgency — see the "Do not build" note above.

### 1. AI Appointment Assistant — beyond basic query parsing

**Description:** Extend the AI layer's role in appointment discovery beyond its current scope. Today, `ai-service`'s `POST /assistant/query` endpoint takes a single free-text message and returns a one-shot structured filter object (specialization, location, maxFee, minExperience, language, availableDay) via one call to the local Ollama model (this used the paid Claude API prior to a 2026-08-17 migration to self-hosted Ollama). A fuller "assistant" would support multi-turn conversation, follow-up clarification questions, and possibly direct booking suggestions surfaced back through the chat/search UI, rather than a single stateless parse.

**User value:** Patients who don't know medical terminology (specialization names, etc.) could describe their problem in plain language and get a conversational, iterative doctor-matching experience instead of filling out the existing `DoctorSearchFilters` form.

**Estimated complexity:** Medium. The LLM integration and prompt-templating pattern already exist (`ai-service/assistant.py`, `ollama_client.py` — this called `claude_client.py` before the 2026-08-17 migration to a local Ollama model); the new work is conversation-state management (multi-turn context), a richer UI on the client, and tighter output-schema validation than the current bare `json.loads()` parse.

**Dependencies:** The existing `/assistant/query` endpoint and Ollama client (`ollama_client.py`); a conversation-state store (currently nothing persists assistant turns); client-side chat/search UI work.

**Possible risks:** ~~The current endpoint still has no authentication~~ — fixed 2026-08-17 (`AI_SERVICE_TOKEN` bearer auth). It still has no rate limiting, though — a conversational version would multiply the number of LLM calls per user session and needs that gap closed first. (Previously this section also flagged that the handler only caught `JSONDecodeError`/`IndexError`/`AttributeError` around the model's response, with the Anthropic SDK's own network/connection errors unhandled; as of the 2026-08-17 Ollama migration this was broadened to also catch `httpx.ConnectError`, `httpx.HTTPStatusError`, and `httpx.TimeoutException`, so that specific gap is addressed, though it remains untested against a live Ollama server.) User input is also interpolated directly into the prompt template via `.format()` with no sanitization, which is a prompt-injection surface that gets more exposed with multi-turn input.

**Reason for considering:** Named directly in the original product spec's bonus-features list ("AI appointment assistant beyond basic summarization"). It's also the bonus item with the shortest distance from what's already implemented.

### 2. SMS / Email Appointment Reminders

**Description:** Actually deliver appointment reminders to patients (and optionally doctors) by SMS and/or email ahead of a scheduled appointment, based on the existing `reminders` table (`appointment_id`, `send_at`, `sent`).

**User value:** Reduces missed appointments and gives patients advance notice, which is the whole reason the `reminders` table exists in the schema.

**Estimated complexity:** Medium–High. Per the canonical project audit, "Appointment Reminders" currently has **no application code at all** — no controller, no route, no scheduler/cron job, and no notification-sending code anywhere in `server/`. This item requires building all of that from scratch: a scheduler/worker process that polls or is triggered by `reminders.send_at`, plus a new integration with an SMS provider and/or email provider (neither is present anywhere in `server/package.json`'s dependencies today).

**Dependencies:** A background job runner or scheduled task (nothing like this exists in the stack yet — the server is a single `node --watch index.js` process), and a new third-party SMS/email delivery integration (e.g., a transactional email or SMS API) with its own credentials and `.env` entries.

**Possible risks:** Sending reminders that reference protected health information (appointment time with a named doctor/specialization) over SMS/email raises data-handling questions that the current `.env`-only secrets approach and lack of any compliance tooling haven't addressed. A naive implementation could also double-send if the worker isn't idempotent against the `sent` flag under concurrent runs.

**Reason for considering:** Directly named in the spec's bonus list ("SMS/email reminders"), and it's the one bonus feature with a corresponding (currently empty) table already sitting in `schema.sql` — the intended shape of the feature is already partially defined in the data model, just not built.

---

## Medium Priority

Items here are reasonable next-phase additions but depend on new external integrations or meaningfully more UI work than the High Priority items, and don't build on an existing partial implementation the way items 1–2 do.

### 3. Calendar Sync

**Description:** Let patients and/or doctors sync booked appointments to an external calendar (Google Calendar, Outlook, or generic iCal export) so appointments show up alongside the rest of their schedule.

**User value:** Patients and doctors already keep their schedules in personal calendar apps; syncing avoids double-booking themselves outside the app and reduces missed appointments in a way that's complementary to reminders.

**Estimated complexity:** Medium. A one-way `.ics` export per appointment is straightforward given the existing `appointments` table (`starts_at`, `ends_at`, `status` are already there). Two-way sync with Google/Outlook would require OAuth integration with each provider, which is a larger, ongoing maintenance surface.

**Dependencies:** None for a simple `.ics` export beyond the existing `appointments` data. Two-way sync would require OAuth app registration with Google/Microsoft and a token-storage strategy — nothing like this exists in the current auth model, which is JWT-only with no external OAuth support.

**Possible risks:** Two-way sync introduces a second source of truth for scheduling data (external calendar vs. `appointments` table) with no existing conflict-resolution logic; the current booking flow's only concurrency safeguard is the `no_double_booking` unique constraint on `(doctor_id, starts_at)`, which doesn't account for an appointment changed externally.

**Reason for considering:** Named in the spec's bonus list ("calendar sync").

### 4. Analytics & Reporting (beyond current admin stats)

**Description:** Expand the existing admin dashboard's stats beyond the current aggregate query (patient/doctor counts, appointment completion rate, top specializations) into fuller reporting: trends over time, exportable reports, doctor-level performance views, or patient engagement metrics.

**User value:** Gives admins the ability to track platform health and growth over time rather than a single point-in-time snapshot, and gives doctors visibility into their own appointment patterns.

**Estimated complexity:** Medium. `admin.controller.js`'s `getDashboardStats` already demonstrates the aggregate-SQL pattern (`COUNT(*) FILTER (WHERE ...)`) this could extend from; the incremental work is more queries, time-series handling, and charting UI on a client that currently has no data-visualization library at all.

**Dependencies:** The existing admin stats endpoint and `requireRole('admin')` pattern; a charting/visualization library on the client (none is currently a dependency); likely pagination work first, since none of the underlying list endpoints (appointments, documents) currently support it, and per-doctor/time-series reporting would need to page through data that today is fetched unbounded.

**Possible risks:** None specific beyond standard reporting-feature scope creep; the main constraint is that today's admin dashboard has no error handling on its single stats fetch (a failed request leaves the page stuck on "Loading..." forever), so a richer reporting surface inherits that same fragility unless it's fixed first.

**Reason for considering:** Named in the spec's bonus list ("analytics"), and there's already a real (if minimal) stats endpoint to build outward from.

### 5. PWA Support

**Description:** Make the client installable and partially usable offline — a web app manifest, a service worker for asset caching, and an install prompt, so patients/doctors can add the portal to a home screen and get faster repeat loads.

**User value:** Improves mobile usability for patients checking appointments or doctors checking their schedule on the go, without building separate native apps.

**Estimated complexity:** Low–Medium relative to the other items here. Vite has first-party plugin support for PWA tooling, and the app is already a single-page React app with client-side routing (`react-router-dom`), which is a reasonable starting shape for this. The current single global `index.css` and lack of any offline-aware data layer (no caching library — every dashboard re-fetches on every mount) means "offline" would initially mean little more than cached static assets and a shell, not offline data access.

**Dependencies:** A service-worker/PWA build plugin for Vite (not currently a dependency); a web app manifest and icon set (none currently exists — there's no evidence of app icons or manifest in the discovery).

**Possible risks:** Low risk relative to other items on this list; mainly a maintenance cost (cache invalidation on deploy) rather than a security or compliance concern.

**Reason for considering:** Named in the spec's bonus list ("PWA support"). Placed in Medium rather than High priority because it's a UX/distribution improvement rather than something that unblocks or completes an existing partially-built feature.

---

## Low Priority

Items here carry real compliance, regulatory, or integration weight that's disproportionate to the current stage of the project — a scaffold that doesn't yet have authentication hardening, input validation, or tests. They're valid long-term product features but shouldn't be picked up before the foundational gaps are closed.

### 6. Digital Prescriptions

**Description:** Let doctors issue a structured digital prescription tied to an appointment, viewable and downloadable by the patient — conceptually similar to the existing document/AI-summary pattern but doctor-authored rather than patient-uploaded.

**User value:** Removes the need for a separate paper or out-of-band prescription process; keeps prescription history alongside the rest of a patient's records in the same portal used for documents and appointments.

**Estimated complexity:** High. There's no prescription-related table in `schema.sql` today (`documents` is patient-upload-oriented: `patient_id`, `file_url`, `ai_summary`), so this needs new schema, a new controller/route pair with doctor-only write access and patient-only read access, and a new UI surface. It would also need to interoperate carefully with controlled-substance and pharmacy-facing regulatory requirements, which is a materially different problem than "store a file."

**Dependencies:** New database table(s); doctor-authoring UI; potentially jurisdiction-specific validation and pharmacy-integration standards that aren't addressed anywhere in the current codebase or spec.

**Possible risks:** Highest compliance surface of any bonus item — digital prescriptions typically carry legal/regulatory requirements (e.g., controlled-substance handling, prescriber verification) well beyond what this app currently has any infrastructure for. The existing security gaps (public self-registration with an unrestricted `role` field, no ownership checks on appointment mutation) would need to be closed first, since prescription-writing access absolutely must be restricted to the correct, verified doctor.

**Reason for considering:** Named in the spec's bonus list ("digital prescriptions").

### 7. Payments

**Description:** Let patients pay consultation fees (the `fee` column already exists on `doctor_profiles`) online at booking time, and let the platform handle refunds/cancellations.

**User value:** Removes an in-person or out-of-band payment step; gives doctors/admins a record of what's been paid versus outstanding.

**Estimated complexity:** High. `fee` already exists on `doctor_profiles`, so the price data is there, but there is currently zero payment-processing code, no payment-provider dependency in `server/package.json`, and no transaction/order table in `schema.sql`. This also requires webhook handling, idempotency for retried payments, and refund flows tied to appointment cancellation — none of which exist today, and the audit noted the server has **no DB transactions wrapping any multi-step operation** anywhere yet, which payment + booking consistency would require.

**Dependencies:** A payment provider integration (e.g., a hosted checkout/payment-gateway SDK — none currently a dependency); new schema for transactions/receipts; webhook endpoint(s) with signature verification; DB transaction handling for the "charge + book" sequence, which the codebase doesn't use anywhere yet.

**Possible risks:** Handling payment data (even via a hosted/tokenized provider) raises PCI-DSS-adjacent scope; combined with the app's current lack of rate limiting, lack of a hardened error handler (the global Express handler currently returns raw `err.message` to the client, which must never happen on a payment endpoint), and lack of tests, this is not a safe surface to build until those foundational issues are addressed.

**Reason for considering:** Named in the spec's bonus list ("payments").

---

## Experimental

Items here are the least specified, carry the most open questions, and in one case run against an explicit product boundary already stated in `README.md`. Nothing in this section should be scoped into real work without a dedicated design/spike phase first.

### 8. Video Consultations

**Description:** In-app video calling between patient and doctor for a booked appointment, likely alongside the existing chat feature.

**User value:** Enables remote consultations without a third-party video tool, keeping the visit inside the same portal used for booking, chat, and documents.

**Estimated complexity:** Very High. This is the largest lift of any bonus item. The current real-time layer is Socket.IO used only for chat message delivery and typing indicators, running as an in-process singleton with no Redis (or other) adapter — the audit specifically notes this "will not scale past a single server instance without further work," and video adds an entirely new class of infrastructure (WebRTC signaling, TURN/STUN servers for NAT traversal, media relay/bandwidth costs) that nothing in the current stack touches.

**Dependencies:** WebRTC signaling built on top of (or alongside) the existing Socket.IO layer; TURN/STUN infrastructure; almost certainly a third-party video SDK/provider rather than a from-scratch WebRTC implementation, given the team's current stack has no media-streaming experience evidenced anywhere in the codebase; a Socket.IO scaling story (e.g., a Redis adapter) that doesn't exist yet even for chat.

**Possible risks:** Real-time video for a healthcare context typically implies stricter encryption-in-transit and session-security requirements than the rest of the app currently meets (the app doesn't yet enforce a non-placeholder `JWT_SECRET`, has no rate limiting, and has no ownership check on appointment mutation endpoints — a video call is tied to a specific appointment, so that IDOR gap would need to be closed first or a video session could potentially be joinable by the wrong party). Infrastructure and bandwidth costs also scale with usage in a way none of the other bonus items do.

**Reason for considering:** Named in the spec's bonus list ("video consultations"). Placed in Experimental rather than Low Priority specifically because of the scale of new infrastructure required relative to every other item on this list — it's less "a feature to schedule" and more "a separate infrastructure project."

---

## A boundary worth stating explicitly

`README.md` describes the AI layer's intended role plainly: *"An AI layer assists with document summarization and appointment discovery — it does not replace doctors."* Any future AI-related backlog item — including the assistant expansion above — should stay inside that boundary. Ideas that push the AI layer toward clinical interpretation, diagnosis, or triage (rather than summarization/discovery assistance) are out of scope for this backlog and aren't included above; if they come up in future planning, they warrant a separate, explicit product and compliance discussion before ever appearing on a feature list.

---

## Summary table

| # | Feature | Priority | Complexity | Builds on existing code? |
|---|---------|----------|------------|---------------------------|
| 1 | AI appointment assistant (beyond basic query parsing) | High | Medium | Yes — extends `ai-service` `/assistant/query` |
| 2 | SMS / email appointment reminders | High | Medium | Partial: in-app reminders and the worker exist; only a delivery provider is missing |
| 3 | Calendar sync | Medium | Medium | Partial — `appointments` data exists, no export/sync code |
| 4 | Analytics & reporting | Medium | Medium | Yes — extends `admin.controller.js` stats pattern |
| 5 | PWA support | Medium | Low–Medium | No — new client tooling |
| 6 | Digital prescriptions | Low | High | No — new schema, doctor-authoring UI |
| 7 | Payments | Low | High | Partial — `fee` column exists, no processing code |
| 8 | Video consultations | Experimental | Very High | No — new infrastructure class entirely |

---

*This document is a backlog inventory only. See the project's other `docs/` files for the current, factual state of implemented functionality and known issues. Nothing above should be implemented without an explicit request.*
