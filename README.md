# AI-Powered Healthcare Appointment & Patient Portal

Patients discover doctors, book appointments, manage medical documents, get reminders,
and chat with providers. An AI layer assists with document summarization and appointment
discovery — it does not replace doctors.

## Stack

| Layer      | Tech                                              |
|------------|----------------------------------------------------|
| Frontend   | React + Vite                                       |
| Backend    | Node.js, Express                                   |
| Database   | PostgreSQL                                         |
| Auth       | JWT + bcrypt                                       |
| AI Layer   | Python, FastAPI, Ollama (local LLM)                |
| Files      | Cloudinary / Amazon S3                             |
| Real-time  | Socket.IO                                          |

## Structure

```
healthcare-app/
├── client/        # React app (patient/doctor/admin dashboards)
├── server/        # Express API (auth, appointments, documents, chat, admin)
├── ai-service/    # FastAPI (document summarization, appointment assistant)
└── README.md
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
(`server/src/middleware/auth.middleware.js`).

## Status

Auth (register/login), doctor search/filter, appointment booking, document upload with
AI summarization, admin stats, and real-time provider messaging (Socket.IO, reachable
from the UI via a "Message" action on each appointment) are wired end-to-end across all
three dashboards (patient/doctor/admin). The client has a full design system and
reusable UI component library (`client/src/styles/`, `client/src/components/ui/`)
layered on top of the original scaffold — tokens, forms, cards, modals, toasts,
skeleton/empty states, and a responsive layout shell. The server has basic hardening:
appointment-window validation, rate limiting on auth endpoints, a fail-fast
`JWT_SECRET` check, sanitized error responses, and a crash-safe chat socket handler.

Testing: `ai-service` has a real `pytest` suite (`cd ai-service && pytest -v`);
`server`/`client` do not yet have automated test coverage.

Business logic and the real LLM prompts still need further work per feature, and a
centralized validation library, pagination, and DB-integration tests remain open — see
`docs/` for the full, actively-maintained development history and roadmap
(`docs/DEV_CONTEXT.md` is the best starting point). This is a working scaffold, not a
production-hardened app.
