# Database Schema

This document describes the PostgreSQL schema for the healthcare-app project, as defined
in `server/src/models/schema.sql`. It is the single source of truth for the database —
there is currently no migration tool in use (see [Migrations](#migrations) below).

> **Scope note.** This document describes the schema exactly as written in `schema.sql`.
> Where a table exists but has no application code built on top of it yet (`reminders`),
> that is called out explicitly rather than implied.

## Contents

- [Overview](#overview)
- [Enums](#enums)
- [Tables](#tables)
  - [users](#users)
  - [doctor_profiles](#doctor_profiles)
  - [doctor_availability](#doctor_availability)
  - [appointments](#appointments)
  - [documents](#documents)
  - [messages](#messages)
  - [reminders](#reminders)
- [The `no_double_booking` constraint](#the-no_double_booking-constraint)
- [Indexes](#indexes)
- [Entity relationships](#entity-relationships)
- [Migrations](#migrations)

## Overview

The schema is a single file, `server/src/models/schema.sql`, containing 7 tables, 2 enum
types, 5 explicit indexes, and one named uniqueness constraint. It is applied directly
against a Postgres database with:

```
psql -U <user> -d <db> -f server/src/models/schema.sql
```

as documented in the project README's "Getting started" section. The server connects to
this database through a single shared `pg.Pool` (`server/src/config/db.js`), configured via
the `DATABASE_URL` environment variable.

## Enums

Two Postgres enum types constrain values that would otherwise be free-text columns:

### `user_role`

```sql
CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
```

Used by `users.role` to restrict every account to exactly one of three roles. These are
the same three roles enforced application-side via JWT claims and
`server/src/middleware/auth.middleware.js` (`requireAuth` / `requireRole`). Note that the
database itself places no restriction on *which* role a new row may take — the
enum only constrains the value to one of the three, not who is allowed to set it. The
canonical security review flagged that `POST /api/auth/register` originally accepted a
client-supplied `role` (including `admin`) with no server-side restriction, letting any
caller self-register an admin account — that has since been fixed at the application layer
(`REGISTERABLE_ROLES` in `auth.controller.js` now restricts self-registration to
`patient`/`doctor`). It's still worth understanding that the schema itself does not — and
structurally cannot by itself — enforce who may set which role; that responsibility stays
with the application layer.

### `appointment_status`

```sql
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled');
```

Used by `appointments.status`, defaulting to `'scheduled'`. This is the enum that backs
the status-transition actions surfaced in the client's `AppointmentCard` component and
mutated via `PATCH /api/appointments/:id/status`.

## Tables

### `users`

Stores every account in the system — patients, doctors, and admins share one table,
differentiated by `role`.

| Column          | Type            | Constraints                                  |
|-----------------|-----------------|-----------------------------------------------|
| `id`            | `SERIAL`        | `PRIMARY KEY`                                 |
| `name`          | `VARCHAR(150)`  | `NOT NULL`                                    |
| `email`         | `VARCHAR(255)`  | `UNIQUE`, `NOT NULL`                          |
| `password_hash` | `TEXT`          | `NOT NULL`                                    |
| `role`          | `user_role`     | `NOT NULL`, `DEFAULT 'patient'`               |
| `phone`         | `VARCHAR(30)`   | nullable                                      |
| `created_at`    | `TIMESTAMPTZ`   | `NOT NULL`, `DEFAULT now()`                   |

**Foreign keys:** none (this is the root entity every other table ultimately references).

**Purpose:** `password_hash` holds a bcrypt hash (bcryptjs is the server's password
library); no plaintext password is ever stored. `email` is the unique login identifier.
The `UNIQUE` constraint on `email` also creates an implicit unique index used by the
login lookup in `auth.controller.js`.

### `doctor_profiles`

Extends a `users` row (where `role = 'doctor'`) with doctor-specific fields. This is a
separate table rather than columns on `users` — a one-to-one extension.

| Column              | Type            | Constraints                                                  |
|---------------------|-----------------|-----------------------------------------------------------------|
| `id`                | `SERIAL`        | `PRIMARY KEY`                                                    |
| `user_id`           | `INTEGER`       | `NOT NULL`, `UNIQUE`, `REFERENCES users(id) ON DELETE CASCADE`   |
| `specialization`    | `VARCHAR(120)`  | `NOT NULL`                                                       |
| `location`          | `VARCHAR(150)`  | `NOT NULL`                                                       |
| `fee`               | `NUMERIC(10,2)` | `NOT NULL`, `DEFAULT 0`                                          |
| `experience_years`  | `INTEGER`       | `NOT NULL`, `DEFAULT 0`                                          |
| `languages`         | `TEXT[]`        | `NOT NULL`, `DEFAULT '{}'`                                       |
| `bio`               | `TEXT`          | nullable                                                         |

**Foreign keys:** `user_id → users(id)`, `ON DELETE CASCADE` — deleting a user deletes
their doctor profile.

**Purpose:** Backs doctor search/filter (`GET /api/doctors`, filtering by
specialization/location/fee/experience/language) and the doctor's self-service profile
upsert (`PUT /api/doctors/profile`, implemented as `INSERT ... ON CONFLICT (user_id) DO
UPDATE`). The `UNIQUE` constraint on `user_id` is what makes that `ON CONFLICT` upsert
possible and is what enforces the one-profile-per-doctor-account rule at the database
level.

### `doctor_availability`

A doctor's recurring weekly availability windows.

| Column         | Type       | Constraints                                                            |
|----------------|------------|--------------------------------------------------------------------------|
| `id`           | `SERIAL`   | `PRIMARY KEY`                                                             |
| `doctor_id`    | `INTEGER`  | `NOT NULL`, `REFERENCES doctor_profiles(id) ON DELETE CASCADE`           |
| `day_of_week`  | `SMALLINT` | `NOT NULL` — `0` (Sunday) through `6` (Saturday), per the schema comment |
| `start_time`   | `TIME`     | `NOT NULL`                                                                |
| `end_time`     | `TIME`     | `NOT NULL`                                                                |
| `slot_minutes` | `SMALLINT` | `NOT NULL`, `DEFAULT 30`                                                  |

**Foreign keys:** `doctor_id → doctor_profiles(id)`, `ON DELETE CASCADE` — deleting a
doctor profile deletes its availability rows.

**Purpose:** Backs `GET /api/doctors/:id/availability`. There is no `CHECK` constraint
enforcing `day_of_week` to the range 0–6 or `start_time < end_time` — the 0–6 convention
is documented only in a SQL comment, not enforced by the database.

### `appointments`

The core booking record linking a patient to a doctor for a specific time window.

| Column       | Type                  | Constraints                                                        |
|--------------|-----------------------|-----------------------------------------------------------------------|
| `id`         | `SERIAL`              | `PRIMARY KEY`                                                          |
| `patient_id` | `INTEGER`             | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE`                  |
| `doctor_id`  | `INTEGER`             | `NOT NULL`, `REFERENCES doctor_profiles(id) ON DELETE CASCADE`        |
| `starts_at`  | `TIMESTAMPTZ`         | `NOT NULL`                                                             |
| `ends_at`    | `TIMESTAMPTZ`         | `NOT NULL`                                                             |
| `status`     | `appointment_status`  | `NOT NULL`, `DEFAULT 'scheduled'`                                      |
| `notes`      | `TEXT`                | nullable                                                               |
| `created_at` | `TIMESTAMPTZ`         | `NOT NULL`, `DEFAULT now()`                                            |

Plus a table-level constraint:

```sql
CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)
```

**Foreign keys:** `patient_id → users(id)` and `doctor_id → doctor_profiles(id)`, both
`ON DELETE CASCADE`.

**Purpose:** Backs `POST /api/appointments` (booking), `GET /api/appointments`
(role-aware listing of the caller's own appointments), and the status/reschedule
mutation endpoints. Per the canonical review, `bookAppointment` never checks that
`starts_at < ends_at` — that ordering is not enforced by the schema (no `CHECK`
constraint) or, per the discovery, by the controller either. Also note: the
`updateAppointmentStatus` and `rescheduleAppointment` endpoints previously only required a
valid JWT (`requireAuth`), not ownership of the row being mutated — an application-layer
authorization gap (IDOR) that the schema itself could never prevent. That gap has since
been fixed in the controller (an ownership check was added); the schema itself is
unchanged and was never the layer responsible for it.

### `documents`

Patient-uploaded medical files, plus the AI-generated summary once one has been
requested.

| Column           | Type          | Constraints                                                         |
|------------------|---------------|-------------------------------------------------------------------------|
| `id`             | `SERIAL`      | `PRIMARY KEY`                                                            |
| `patient_id`     | `INTEGER`     | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE`                    |
| `appointment_id` | `INTEGER`     | nullable, `REFERENCES appointments(id) ON DELETE SET NULL`              |
| `file_url`       | `TEXT`        | `NOT NULL`                                                               |
| `file_type`      | `VARCHAR(20)` | `NOT NULL`                                                               |
| `original_name`  | `VARCHAR(255)`| `NOT NULL`                                                               |
| `ai_summary`     | `JSONB`       | nullable                                                                 |
| `uploaded_at`    | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()`                                              |

**Foreign keys:** `patient_id → users(id)` (`ON DELETE CASCADE`); `appointment_id →
appointments(id)` (`ON DELETE SET NULL` — a document survives if its linked appointment
is later deleted, just loses the association).

**Purpose:** `file_url` points at Cloudinary, where uploaded files are actually stored
(`server/src/config/cloudinary.js`); `ai_summary` holds the structured JSON returned by
the ai-service's `/summarize` endpoint (documentType, keyInfo, abnormalValues, followUp,
disclaimer, per the ai-service discovery) once `POST /api/documents/:id/summarize` has
been called. Until then `ai_summary` is `NULL`. This column is the persistence point for
the "AI Document Summarization" feature, which is functional on the happy path per the
canonical synthesis; its SSRF, file-size, and authentication gaps were fixed 2026-08-17
(see `docs/DECISIONS.md` ADR-009), and its error handling was broadened the same day as
part of the earlier Claude→Ollama migration — the AI integration is now code-verified but
not yet runtime-verified against a live Ollama server.

### `messages`

Chat messages between two users, optionally scoped to an appointment.

| Column           | Type          | Constraints                                                       |
|------------------|---------------|-----------------------------------------------------------------------|
| `id`             | `SERIAL`      | `PRIMARY KEY`                                                          |
| `appointment_id` | `INTEGER`     | nullable, `REFERENCES appointments(id) ON DELETE CASCADE`              |
| `sender_id`      | `INTEGER`     | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE`                   |
| `recipient_id`   | `INTEGER`     | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE`                   |
| `body`           | `TEXT`        | nullable                                                                |
| `file_url`       | `TEXT`        | nullable                                                                |
| `read_at`        | `TIMESTAMPTZ` | nullable                                                                |
| `created_at`     | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()`                                             |

**Foreign keys:** `appointment_id → appointments(id)` (`ON DELETE CASCADE` — unlike
`documents.appointment_id`, a message row is *deleted*, not detached, if its appointment
is deleted); `sender_id → users(id)` and `recipient_id → users(id)`, both `ON DELETE
CASCADE`.

**Purpose:** Backs `GET /api/chat/:userId` (fetch the two-party thread, correctly scoped
to `req.user.id` per the server discovery) and `PATCH /api/chat/:id/read` (mark read,
also correctly scoped). Real-time delivery of new rows is handled by the Socket.IO
`message:send` handler in `server/src/socket/socket.js`, which inserts into this table
and broadcasts `message:new` — per the canonical review, that handler currently has no
`try/catch` around its `pool.query` call and no payload validation.

### `reminders`

Scheduled appointment reminders.

| Column           | Type          | Constraints                                              |
|------------------|---------------|-------------------------------------------------------------|
| `id`             | `SERIAL`      | `PRIMARY KEY`                                                 |
| `appointment_id` | `INTEGER`     | `NOT NULL`, `REFERENCES appointments(id) ON DELETE CASCADE`   |
| `send_at`        | `TIMESTAMPTZ` | `NOT NULL`                                                     |
| `sent`           | `BOOLEAN`     | `NOT NULL`, `DEFAULT false`                                    |

**Foreign keys:** `appointment_id → appointments(id)`, `ON DELETE CASCADE`.

**Purpose:** Intended to track when a reminder for a given appointment should be sent
and whether it has been. **This table exists in the schema but has no application code
built on it anywhere in the codebase** — per the canonical synthesis, "Appointment
Reminders" is a `PLANNED` feature: there is no controller, route, scheduler/cron job, or
notification-sending logic that reads or writes this table. It is a dangling table
awaiting a feature implementation.

## The `no_double_booking` constraint

```sql
CONSTRAINT no_double_booking UNIQUE (doctor_id, starts_at)
```

This is a table-level `UNIQUE` constraint on `appointments` spanning `(doctor_id,
starts_at)`. It is the mechanism that prevents two patients from booking the same doctor
for the same start time.

**Why a database constraint instead of an application-level check:** the project's
architecture decisions record this explicitly — the team considered an application-level
"check, then insert" approach, a NoSQL store, and a DB-level `UNIQUE` constraint, and
chose the constraint because it is *race-safe by construction*: concurrent insert
attempts for the same `(doctor_id, starts_at)` pair will always resolve to exactly one
winner at the database level, a guarantee that an application-level "check if a slot is
free, then insert" sequence cannot provide (two concurrent requests can both pass the
check before either has inserted).

**How it surfaces in the API:** `POST /api/appointments` catches the resulting Postgres
unique-violation and maps it to an HTTP `409` response. One noted consequence from the
canonical review: any booking conflict that isn't specifically caught still falls
through to the server's global error handler, which currently returns the raw Postgres
error message to the client rather than a sanitized one — an information-disclosure gap
tracked separately in the security review, not a flaw in the constraint itself.

**Scope of what it guarantees:** the constraint matches on the exact `starts_at`
timestamp. It prevents two appointments from being booked for one doctor at the identical
start instant; it does not by itself express anything about overlapping time ranges with
different start times — that logic (along with the `starts_at < ends_at` ordering check)
lives, or currently does not live, in application code.

## Indexes

`schema.sql` defines five explicit indexes, all in support of the query patterns used by
the controllers that read from these tables:

| Index                                    | Table              | Column(s)         | Why it exists |
|-------------------------------------------|--------------------|--------------------|----------------|
| `idx_appointments_patient`                | `appointments`     | `patient_id`       | Speeds up `listMyAppointments` for the patient-role view (`WHERE patient_id = ...`). |
| `idx_appointments_doctor`                  | `appointments`     | `doctor_id`        | Speeds up `listMyAppointments` for the doctor-role view (`WHERE doctor_id = ...`). |
| `idx_messages_appointment`                 | `messages`         | `appointment_id`   | Speeds up looking up messages tied to a specific appointment thread. |
| `idx_doctor_profiles_specialization`       | `doctor_profiles`  | `specialization`   | Speeds up `searchDoctors` filtering by specialization. |
| `idx_doctor_profiles_location`             | `doctor_profiles`  | `location`          | Speeds up `searchDoctors` filtering by location. |

In addition, two `UNIQUE` constraints create implicit indexes not listed above:
`users.email` (used by the login lookup) and `doctor_profiles.user_id` (used by the
`ON CONFLICT (user_id)` upsert in `upsertDoctorProfile`), plus the `no_double_booking`
constraint's own implicit index on `(doctor_id, starts_at)`.

Per the canonical review, there is no pagination on any of the list endpoints
(`listMyAppointments`, `listMyDocuments`, `getConversation`, `searchDoctors`) — these
indexes speed up the `WHERE`/filter clauses of those queries, but the queries themselves
still return unbounded result sets.

## Entity relationships

```
 users (patient/doctor/admin)
   │
   ├──1:1──► doctor_profiles ──1:N──► doctor_availability
   │  (only for role='doctor'  (doctor_id)
   │   rows, by convention —
   │   not enforced by role)
   │
   ├──1:N──► appointments ◄──N:1── doctor_profiles
   │ (patient_id)         (doctor_id)
   │                          │
   │                          ├──0:N──► documents (appointment_id, nullable, SET NULL)
   │                          ├──0:N──► messages   (appointment_id, nullable, CASCADE)
   │                          └──1:N──► reminders  (appointment_id, NOT NULL, CASCADE)
   │
   ├──1:N──► documents (patient_id)
   │
   └──1:N──► messages (sender_id AND, separately, recipient_id)
```

In prose:

- A **user** may have at most one **doctor_profiles** row (`UNIQUE user_id`) — the
  application convention is that this only happens for `role = 'doctor'` users, though
  the schema does not enforce that pairing with a `CHECK` constraint.
- A **doctor_profiles** row has many **doctor_availability** rows (its weekly schedule
  blocks).
- An **appointment** always belongs to exactly one patient (`users.id` via
  `patient_id`) and one doctor (`doctor_profiles.id` via `doctor_id`); a patient or a
  doctor can have many appointments.
- A **document** always belongs to exactly one patient and may optionally reference the
  appointment it was uploaded in connection with; deleting that appointment does not
  delete the document (`ON DELETE SET NULL`).
- A **message** always has a sender and a recipient (both `users`) and may optionally
  reference an appointment; unlike documents, deleting that appointment *does* delete
  the message (`ON DELETE CASCADE`).
- A **reminder** always belongs to exactly one appointment and is deleted along with it.
- Deleting a **user** cascades to their `doctor_profiles` row (if any), their
  `appointments` (as patient), their `documents`, and any `messages` where they are
  sender or recipient. Deleting a **doctor_profiles** row cascades to its
  `doctor_availability` rows and to any `appointments` referencing it as `doctor_id`.

## Migrations

There is currently **no migration tool** in this project. `schema.sql` is the single,
hand-written source of schema truth, applied directly to a fresh database with:

```
psql -U <user> -d <db> -f server/src/models/schema.sql
```

There is no migration history, no version-tracking table, and no tool (e.g.
`node-pg-migrate`, Prisma Migrate, or similar) wired into the server's dependencies —
`server/package.json` lists only runtime dependencies (`pg`, `express`, `bcryptjs`,
`cloudinary`, `cors`, `dotenv`, `jsonwebtoken`, `multer`, `socket.io`), no migration
library. This is called out in the canonical technical-debt review as a gap: schema
changes currently have no versioned, repeatable path — evolving the schema means editing
`schema.sql` and re-applying it by hand, which does not track what has already been
applied to any given database instance.
