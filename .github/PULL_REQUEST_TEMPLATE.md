## What

<!-- One or two sentences: what does this change? -->

## Why

<!-- The problem or need. Link issues with "Closes #123". -->

## How it was tested

- [ ] `cd server && npm test`
- [ ] `cd ai-service && pytest -q`
- [ ] `cd client && npm test && npm run build`
- [ ] Live API tests (`server/tests/integration/api.live.test.js`) if API behaviour or the schema changed
- [ ] Tried in the browser (describe what you checked)

## Checklist

- [ ] No secrets, real `.env` files, tokens, or patient-like data in the diff or in screenshots
- [ ] New or changed endpoints are enforced for role **and** ownership (patient/doctor isolation), with a test
- [ ] Schema change? `schema.sql` **and** a re-runnable `migrations_NNN_*.sql` are updated
- [ ] Docs updated (README, `docs/API_DOCUMENTATION.md`, `docs/CHANGELOG.md` as needed)
- [ ] Conventional Commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `security:`)

## Known limitations / follow-ups

<!-- Anything intentionally left out, and why. -->
