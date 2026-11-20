# QA Report: PulseCare healthcare-app

Scope: client, server and ai-service, tested live against a throwaway Postgres 17 with the UI driven in Chrome.
Pass 1 (2026-11-20) found the issues; pass 2 (same day) fixed every open item that could be fixed and re-tested
it. Nothing is committed. **Status key: Fixed = changed and re-tested; Limit = cannot be fixed or verified here, with the reason.**

## Summary

| Area | Pass 1 | After pass 2 |
|---|---|---|
| Server unit tests | 10 | **14** |
| Live API integration tests | 20 | **26** (incl. stubbed Cloudinary upload, signed delivery, summarizer, assistant, reminders, sessions) |
| ai-service tests | 13 | **39** (endpoint tests with Ollama/Cloudinary mocked) |
| Client tests | 0 | **21** (Vitest) |
| CI | none | `.github/workflows/ci.yml` runs all of the above |
| Load test | none | `server/tests/load/load.mjs`: 50 concurrent clients, 0 errors |

## 1. UI (Chrome; 375 / 768 / 1280 via same-origin iframes)

| Item | Status |
|---|---|
| Doctor dashboard overflowed at 375px (segmented filter) | Fixed in pass 1 (scrolls inside its box) |
| Chat message with only a file was an empty bubble | Fixed in pass 1 ("Attachment" link) |
| "Documents" tab clipped on mobile with no scroll hint | **Fixed**: right-edge fade on the tab strip at 520px and below |
| No skip-to-content link / no `<nav>` landmark | **Fixed**: skip link (`#main`, focusable `<main>`) and a labelled `<nav>` in the header |
| Doctor greeting wrong for names starting "Dr" | **Fixed**: `doctorSalutation()` ("Dr. Ravi UI"); verified live |
| Logged-out nav links flashed while the session was restoring | **Fixed**: nav actions hidden while loading |
| Booking used a bare date-time picker | **Fixed**: date picker + real free-slot buttons; confirm disabled until a slot is chosen; verified live at 1280 and 375 (bottom-sheet modal, 3-column grid, no overflow) |
| Newly booked appointment card had an empty title | **Fixed** (found during live test): list refetched after book/reschedule |
| No cancel / reschedule for patients | **Fixed**: Cancel (two-step inline confirm, no browser dialog) and Reschedule (slot picker); verified live |
| No doctor-side document viewer; patients could not share documents | **Fixed**: "Share with a doctor" on upload; "Documents" action on the doctor's appointment card; opens a signed URL; verified live |
| No pagination UI | **Fixed**: "Show more doctors / appointments" (24 / 100 per page) |
| Assistant had no UI | **Fixed**: "Ask assistant" box with graceful fallback; verified live (stubbed AI) |
| Contrast / labels / modal keyboard behaviour | Passed in pass 1; new components use the same tokens and labelled controls |
| Admin dashboard | **Tested live**: stats and specialization chart render correctly |
| Production bundle behaviour | **Tested live** (`vite build` + `vite preview`) under the strict CSP: no violations, login, refresh, REST and socket all succeed |
| Real devices, Safari, Firefox, screen readers | **Limit**: only Chrome desktop with iframe-emulated widths is available here; needs manual/device-lab testing |

## 2. API security and contracts

| Item | Status |
|---|---|
| Anonymous access, role gates, tampered/`alg:none` tokens, IDOR, SQL injection, oversized/malformed bodies, headers, rate limit | Passed (pass 1), still passing in all 26 live tests |
| Non-numeric ids caused 500; profile validation; public doctor emails | Fixed in pass 1 |
| Long-lived JWT in `localStorage`, no revocation/refresh | **Fixed**: 15-minute in-memory access token + rotating 7-day refresh token in an `HttpOnly; SameSite=Lax` cookie, stored hashed; logout revokes; replay of an old token revokes the whole family; refresh/logout accept only `CLIENT_ORIGIN`. Tests: rotation, hashing, reuse, logout, wrong origin. A benign race (two tabs, hot reload) gets a soft 409 with one client retry instead of killing the session. **Limit:** an access token already issued stays valid up to 15 minutes after logout (stateless JWT) |
| No CSP | **Fixed**: API sends `default-src 'none'; frame-ancestors 'none'`; production client build embeds a strict CSP `<meta>` (verified live). **Limit:** also send the policy as an HTTP header from your static host (a meta tag cannot set `frame-ancestors`) |
| Cloudinary files at public URLs | **Fixed**: uploaded as `authenticated` assets; API never returns storage URLs; `GET /api/documents/:id/file` issues a signed URL after an access check (owner, or doctor via a shared appointment); the summarizer also receives a signed URL. Tested with a stubbed Cloudinary over TLS. **Limit:** not verified against real Cloudinary, and signed URLs do not expire unless the Cloudinary plan has token authentication |
| No PHI audit logging | **Fixed**: `audit_log` table; uploads, file access, summaries, chat reads, patient-document listings, login/logout/failed login/token reuse; `GET /api/admin/audit` (admin only). **Limit:** no audit viewer UI (API only) |
| Assistant proxy and summarizer only tested for error paths | **Fixed**: stubbed ai-service in live tests (contract, token forwarding, failure to 502) and 26 new ai-service endpoint tests. **Limit:** real model output quality needs Ollama |
| Silent truncation of long PDFs (first 8 pages) | **Fixed**: ai-service returns `pagesRead`/`totalPages`/`truncated`; the document card shows "Only the first N of M pages were summarized" |
| ai-service accepted `http://` Cloudinary URLs | **Fixed**: https only (SSRF test matrix added) |

## 3. Business logic

| Item | Status |
|---|---|
| Cancelled slot stayed blocked; concurrent overlap race; terminal states | Fixed in pass 1 (exclusion constraint, lifecycle rules) |
| Single fixed UTC offset: no DST, no per-doctor timezone | **Fixed**: `doctor_profiles.timezone` (IANA, validated), Intl-based and DST-aware; falls back to `DEFAULT_TIMEZONE`. Unit tests cover India, New York summer/winter, London; live test confirms a Pacific/Auckland doctor's 09:00 |
| Slot length not enforced | **Fixed**: bookings must be exactly one aligned slot inside a window (else 400); the UI only offers valid slots; DB exclusion constraint remains as defence |
| No reminder worker | **Fixed**: `src/jobs/reminders.js` (24 h before; `FOR UPDATE SKIP LOCKED`; skips cancelled/past; delivered once); reminders created on book and updated on reschedule; verified live (toast: "Reminder: appointment with Uma UI on Nov 26, 2026, 2:00 PM"). **Limit:** no email/SMS provider is configured. That needs a product/vendor decision; `deliver()` in the worker is the seam |
| No booking limits | **Fixed**: `MAX_ACTIVE_APPOINTMENTS` (default 10), 409 beyond it; tested |
| Migrations | `migrations_001` and `migrations_002` verified on a database built from the original schema, and re-runnable |

## 4. Performance

| Item | Status |
|---|---|
| Unbounded lists | Fixed in pass 1 (`limit`/`offset`), now with UI paging |
| `ILIKE '%x%'` could not use an index | **Fixed**: `pg_trgm` GIN indexes on specialization and location |
| Load behaviour | **Measured** (2,000 doctors, 50 concurrent clients, 8 s each, single Node process): `/api/doctors` 659 req/s p95 129 ms; filtered search 1,040 req/s p95 69 ms; `/api/appointments` 486 req/s p95 154 ms; `/api/auth/me` 2,626 req/s p95 31 ms; **0 errors**. The default 10-connection pg pool is the first thing to raise if appointments become the bottleneck |
| Bundle | Production bundle 306 KB JS (99 KB gzip) + 36 KB CSS; single chunk, acceptable |

## 5. UX

Covered in section 1 (slot picker, cancel, reschedule, sharing, doctor documents, paging, assistant, reminders as toasts).
Error copy stays specific ("This slot is already booked", "…not an available slot for this doctor").

## 6. Tests

- `server`: `npm test` (14 unit; 26 live tests are skipped unless `E2E_API` is set). Live: `E2E_API=… E2E_STUBS=1 DATABASE_URL=… node --test tests/integration/api.live.test.js` (header of that file shows how to start the server under test). Self-signed throwaway cert in `tests/integration/certs/` exists only for the fake Cloudinary.
- `ai-service`: `pytest` (39).
- `client`: `npm test` (21): session/refresh interceptor (single-flight, replay, 409 retry, expiry event), booking flow, cancel/reschedule, doctor documents action, assistant.
- Final run: 14/14 unit, 26/26 live, 39/39 pytest, 21/21 Vitest, client production build passes.

## 7. Remaining limits (cannot be closed in this environment)

| Item | Why |
|---|---|
| Real Cloudinary (upload, signed-URL behaviour, expiry) | No Cloudinary account/credentials; stubbed over TLS instead |
| Real Ollama output | Ollama is not installed; endpoints are tested with mocks |
| Email/SMS reminders | Needs a provider and product decision; in-app delivery is done |
| Revoking an already-issued access token | JWT is stateless by design; mitigated by the 15-minute lifetime |
| CSP as an HTTP header for the client | Depends on where the static site is hosted |
| Real devices, Safari/Firefox, screen readers | Not available here; needs manual testing |
| Audit-log viewer UI | Not requested in the report; API exists |
