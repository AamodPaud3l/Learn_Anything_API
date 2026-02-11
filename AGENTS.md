[# Project rules for Codex
- Use CommonJS (require/module.exports).
- Keep changes minimal and focused.
- Prefer adding new files over huge edits.
- Update OpenAPI schema when endpoints change.
- Add curl examples for new endpoints.
- Do not expose secrets in code or docs.
- Ensure server still starts with `npm start`.
](Task: Harden the Learn Anything API for public release + add portfolio-grade docs. Create a PR with all changes.

Context:
- Repo is an Express (CommonJS) API deployed to Render, Postgres on Neon.
- Internal endpoints exist:
  - POST /v1/internal/ensure-track
  - POST /v1/internal/seed-lessons
- Public endpoints exist:
  - GET /health
  - GET /v1/me
  - GET /v1/tracks
  - POST /v1/tracks (this should NOT be public anymore)
  - GET /v1/lessons/next
  - POST /v1/attempts
- Admin auth uses header X-ADMIN-KEY (env ADMIN_KEY). Internal endpoints already should require it.
- OpenAPI 3.1 exists in the repo and is used for GPT Actions.

Goals (Definition of Done):
1) Security hardening
   a) Protect ALL write operations that can mutate catalog content:
      - Make POST /v1/tracks admin-only (require X-ADMIN-KEY) OR remove/disable it; keep GET /v1/tracks public.
      - Keep /v1/internal/* admin-only (require X-ADMIN-KEY).
   b) Add rate limiting:
      - Apply a general limiter to public endpoints (reasonable defaults).
      - Apply a stricter limiter to internal admin endpoints.
      - Ensure trust proxy is set appropriately for Render (so limiter uses correct IP).
   c) Ensure request body parsing is enabled and internal endpoints validate input properly (already using Zod).

2) Observability
   - Add minimal structured logging (console is fine) for:
     - ensure-track (created vs updated, slug)
     - seed-lessons (track_slug, count inserted/updated)
     - submitAttempt (user_id, lesson_id, advanced)

3) OpenAPI alignment
   - Update OpenAPI 3.1 file:
     - Add security scheme AdminKey if missing (apiKey in header X-ADMIN-KEY).
     - Mark POST /v1/tracks as requiring AdminKey OR remove it from schema if endpoint removed.
     - Ensure operationIds exist and match routes.
     - Ensure /v1/me, /v1/lessons/next, /v1/attempts are included and accurate.
   - Ensure schema no longer includes redundant manual header parameters for X-ADMIN-KEY; rely on securitySchemes.

4) Developer experience / portfolio polish
   - Add a GET endpoint to serve the OpenAPI spec at /openapi.yaml (or /openapi.yml) from the repo file.
   - Update README:
     - What the project is (Duolingo-style learning backend for GPT Actions).
     - Architecture overview (GPT Actions -> API -> Neon Postgres, deployed on Render).
     - Security model (admin key protects internal + catalog writes, rate limits).
     - Quickstart: env vars (DATABASE_URL, ADMIN_KEY), install/run, migrations note.
     - cURL examples for key endpoints including ensureTrack/seedLessons (with placeholder ADMIN_KEY).
   - Add a small “seed” script (node script) that can seed 1 demo track + 3 lessons using direct DB queries or existing endpoints (your choice). It should be safe to run multiple times (idempotent).

Constraints:
- Keep CommonJS style (require/module.exports).
- Keep changes minimal and easy to review.
- Do not add paid services.
- Do not log secrets.
- Prefer lightweight deps (express-rate-limit is okay).
- If there is an existing test command, run it; otherwise at least run the server locally and do a basic lint/check if available.
- Ensure the app still boots on Render.

Deliverables:
- A PR with code changes + updated OpenAPI + README + any new scripts.
- In the PR description, include: summary, how to test locally (commands + curl), and what changed for security.

Before finishing:
- Run: npm test (if exists) and npm run lint (if exists). If not present, run a basic node start check.
- Confirm internal endpoints return 401 without X-ADMIN-KEY.
)