<div align="center">

# PulseCare

**AI-Powered Healthcare Appointment & Patient Portal**

Patients discover doctors, book appointments, manage medical documents, and message
their care team. An AI layer assists with document summarization and appointment
discovery — it does not replace doctors.

[![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)](client/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=nodedotjs&logoColor=white)](server/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](server/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-database-4169E1?logo=postgresql&logoColor=white)](server/src/models/schema.sql)
[![FastAPI](https://img.shields.io/badge/FastAPI-ai--service-009688?logo=fastapi&logoColor=white)](ai-service/)
[![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-000000)](ai-service/ollama_client.py)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-010101?logo=socketdotio&logoColor=white)](server/src/socket/socket.js)

</div>

---

## Contents

- [Features](#features)
- [Stack](#stack)
- [Structure](#structure)
- [Getting started](#getting-started)
- [Roles](#roles)
- [Testing](#testing)
- [Status](#status)
- [Documentation](#documentation)

## Features

- **Doctor search** — filter by specialization, location, fee, experience, and language
- **Appointment booking** — race-safe double-booking prevention at the database level; slot duration derived from each doctor's real availability
- **Medical document upload** — PDF/JPG/PNG, stored via Cloudinary
- **AI document summarization** — a local Ollama vision model turns an uploaded document into a plain-language summary (document type, key info, abnormal values, follow-up), never a diagnosis
- **Real-time messaging** — patients and doctors message each other about a specific appointment over Socket.IO, with persisted history
- **Role-based dashboards** — separate patient, doctor, and admin experiences, all gated by JWT + role middleware
- **Admin overview** — platform-wide stats: patient/doctor counts, completion rate, popular specializations

## Stack

| Layer      | Tech                                 |
|------------|---------------------------------------|
| Frontend   | React + Vite                          |
| Backend    | Node.js, Express                      |
| Database   | PostgreSQL                            |
| Auth       | JWT + bcrypt                          |
| AI Layer   | Python, FastAPI, Ollama (local LLM)   |
| Files      | Cloudinary                            |
| Real-time  | Socket.IO                             |

## Structure

```
healthcare-app/
├── client/        # React app (patient/doctor/admin dashboards)
├── server/        # Express API (auth, appointments, documents, chat, admin)
├── ai-service/    # FastAPI (document summarization, appointment assistant)
└── docs/          # Architecture, API reference, roadmap, and development history
```

## Getting started

### 1. Database

Create a PostgreSQL database, then run the schema:

```bash
psql -U <user> -d <db> -f server/src/models/schema.sql
```

### 2. Server

```bash
cd server
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, etc.
npm install
npm run dev             # http://localhost:5000
```

> The server refuses to start if `JWT_SECRET` is unset or left as the `change-me`
> placeholder — set a real value in `.env` first.

### 3. Client

```bash
cd client
cp .env.example .env
npm install
npm run dev              # http://localhost:5173
```

### 4. AI service

Requires [Ollama](https://ollama.com) running locally with a vision-capable model pulled
(default `llama3.2-vision` — override via `OLLAMA_MODEL` in `.env` if you use a different one):

```bash
ollama pull llama3.2-vision
ollama serve   # if not already running as a background service
```

Then:

```bash
cd ai-service
cp .env.example .env     # defaults point at http://localhost:11434 — override OLLAMA_BASE_URL/OLLAMA_MODEL if needed
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Roles

`patient`, `doctor`, `admin` — enforced via JWT claims + route middleware
(`server/src/middleware/auth.middleware.js`). Admin accounts are provisioned directly
in the database; there is no public admin-registration path.

## Testing

```bash
cd ai-service
.venv\Scripts\activate
pytest -v          # 13 tests: JSON parsing, PDF rasterization, SSRF guard, service-token auth
```

`server/` and `client/` don't have automated test coverage yet — see
[`docs/TESTING.md`](docs/TESTING.md) for the current state and plan.

## Status

Auth, doctor search/filter, appointment booking, document upload with AI summarization,
admin stats, and real-time provider messaging are wired end-to-end across all three
dashboards. The client runs on a full design system and reusable UI component library
(`client/src/styles/`, `client/src/components/ui/`). The server has baseline hardening:
appointment-window validation, rate limiting on auth endpoints, a fail-fast `JWT_SECRET`
check, sanitized error responses, and a crash-safe chat socket handler.

Still open: a centralized input-validation library, pagination on list endpoints, and
DB-integration test coverage. This is a working scaffold, not a production-hardened app.

## Documentation

The `docs/` directory is the source of truth for architecture, API contracts, the
database schema, and active development history — start with
[`docs/DEV_CONTEXT.md`](docs/DEV_CONTEXT.md) if you're picking up work on this repo.
