# Documentation Index

This directory documents the **AI-Powered Healthcare Appointment & Patient Portal** — a
three-service scaffold (React/Vite client, Express/PostgreSQL server, FastAPI/Ollama
ai-service) that is roughly one hour old as of this writing. The docs below record what
actually exists in the code today, not what is aspired to. Where a feature is partial or
missing, the relevant doc says so explicitly — see `PROJECT_SCORE.md` and `FEATURES.md`
for the authoritative status of everything in the app.

## Documents

| File | Contents |
|---|---|
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | What the product is, who uses it (patients/doctors/admins), and the AI layer's supporting (non-diagnostic) role. |
| [PROJECT_PLAN.md](./PROJECT_PLAN.md) | The intended scope of the scaffold — which features and layers were meant to be stubbed end-to-end in this initial pass. |
| [PROJECT_STYLE.md](./PROJECT_STYLE.md) | Coding conventions and existing patterns (controller/route/middleware layering, error wrapping, component structure) to follow when extending the app. |
| [PROJECT_SCORE.md](./PROJECT_SCORE.md) | Scored assessment of the codebase across 15 categories (overall 4.1/10), with reasoning, weaknesses, and improvements per category. |
| [DEV_CONTEXT.md](./DEV_CONTEXT.md) | Running snapshot of implementation state, intended as the first thing a human or AI reads before continuing development. |
| [SITE_MAP.md](./SITE_MAP.md) | Every client route, its access/role requirement, and its implementation status. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The three-service architecture (client/server/ai-service), how they talk to each other, and the reasoning behind the split. |
| [FEATURES.md](./FEATURES.md) | The full list of product features with current status (implemented / partially implemented / planned) and supporting evidence. |
| [IMPLEMENTED_FEATURES.md](./IMPLEMENTED_FEATURES.md) | Detail on the features that are verified working end-to-end today. |
| [FUTURE_FEATURES.md](./FUTURE_FEATURES.md) | Features that are planned but not yet built, such as Appointment Reminders (schema table only, no application code). |
| [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md) | Catalogued shortcuts and gaps across all three services — missing validation, pagination, tests, linting, and more. |
| [DECISIONS.md](./DECISIONS.md) | Key architecture decisions (service split, JWT auth, DB-level double-booking constraint, Socket.IO, Cloudinary, Vite) with context and consequences. |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Endpoint-by-endpoint reference for the server and ai-service routes, including auth requirements and known gaps. |
| [DATABASE.md](./DATABASE.md) | The PostgreSQL schema — tables, relationships, constraints, and indexes defined in `schema.sql`. |
| [TESTING.md](./TESTING.md) | Current automated test coverage (none, in any of the three services) and a recommended path to add it. |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Required environment variables and steps to run the client, server, and ai-service locally. |
| [CHANGELOG.md](./CHANGELOG.md) | Dated log of meaningful changes made to the project. |
| [INTERVIEW_GUIDE.md](./INTERVIEW_GUIDE.md) | Talking points for walking someone through this codebase's design tradeoffs and known gaps. |

## Working Agreement

For anyone — human or AI — continuing this project:

1. **Read before you build.** Before implementing a feature, read `PROJECT_CONTEXT.md`,
   `PROJECT_PLAN.md`, `DEV_CONTEXT.md`, `PROJECT_STYLE.md`, `FEATURES.md`, and
   `IMPLEMENTED_FEATURES.md` so new work fits the existing product intent and codebase
   state.
2. **Reuse before you add.** Follow existing patterns (controller/middleware structure,
   component conventions, error handling) rather than introducing new ones, and avoid
   duplicating logic that already exists elsewhere in the codebase.
3. **"Implemented" means verified.** Never mark a feature IMPLEMENTED unless it has been
   checked to actually work — partial or happy-path-only work stays labeled partial.
4. **Leave a trail.** After every meaningful change, update `DEV_CONTEXT.md`,
   `IMPLEMENTED_FEATURES.md`, and `CHANGELOG.md` so the docs stay a reliable source of
   truth.
5. **Prefer small, targeted changes.** Favor minimal, consistent edits scoped to the task
   at hand over speculative or unrelated refactors.
