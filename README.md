# Learn Anything API

A Duolingo-style learning backend built for GPT Actions. It lets a GPT create structured tracks and lessons, then track learner progress via attempts and lesson advancement.

## Architecture

```text
GPT Actions client -> Learn Anything API (Express) -> Neon Postgres
                                     \
                                      -> Render deployment
```

- **API**: Express (CommonJS)
- **Database**: Postgres (Neon)
- **Deployment**: Render
- **Contract**: OpenAPI 3.1 (`openapi.yaml`), also served from `GET /openapi.yaml`

## Security model

- `X-ADMIN-KEY` (from `ADMIN_KEY`) is required for:
  - `POST /v1/tracks`
  - `POST /v1/internal/ensure-track`
  - `POST /v1/internal/seed-lessons`
- Read endpoints stay public (`/health`, `/v1/me`, `/v1/tracks`, `/v1/lessons/next`).
- In-memory IP rate limits are applied:
  - General public routes: 300 requests / 15 minutes
  - Internal admin routes: 60 requests / 15 minutes
- `trust proxy` is enabled for Render-compatible client IP handling.

## Authentication (MVP)

- No OAuth is used by design in this MVP.
- Learners resume progress using a **Learner ID** (a full UUID).
- `learner_id` is currently the same value as `user_id` for backward compatibility.
- Privacy note: no personal data is stored. Progress is linked only to the Learner ID.

## Quickstart

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env`:
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/learn_anything
   PORT=3000
   ADMIN_KEY=replace-with-strong-admin-key
   ```
3. Initialize DB schema + migration:
   ```bash
   psql "$DATABASE_URL" -f src/schema.sql
   psql "$DATABASE_URL" -f migrations/001_add_track_admin_columns.sql
   ```
4. Start API:
   ```bash
   npm start
   ```

## OpenAPI

- Source file: `openapi.yaml`
- Runtime route: `GET /openapi.yaml`

## Demo seeding script (idempotent)

Seed one demo track + three lessons:

```bash
npm run seed
```

This script is idempotent and can be run multiple times safely.

## cURL examples

### Health

```bash
curl http://localhost:3000/health
```

### Get/OpenAPI schema

```bash
curl http://localhost:3000/openapi.yaml
```

### Get current user / learner ID

```bash
curl "http://localhost:3000/v1/me"
```

### List tracks

```bash
curl http://localhost:3000/v1/tracks
```

### Create track (admin-only)

```bash
curl -X POST http://localhost:3000/v1/tracks \
  -H "Content-Type: application/json" \
  -H "X-ADMIN-KEY: <ADMIN_KEY>" \
  -d '{
    "slug": "python",
    "title": "Python",
    "official_sources": ["https://docs.python.org/3/"]
  }'
```

### Ensure track (internal admin)

```bash
curl -X POST http://localhost:3000/v1/internal/ensure-track \
  -H "Content-Type: application/json" \
  -H "X-ADMIN-KEY: <ADMIN_KEY>" \
  -d '{
    "slug": "python",
    "title": "Python",
    "track_type": "official",
    "status": "active",
    "official_sources": ["https://docs.python.org/3/"],
    "owner_user_id": null
  }'
```

### Seed lessons (internal admin)

```bash
curl -X POST http://localhost:3000/v1/internal/seed-lessons \
  -H "Content-Type: application/json" \
  -H "X-ADMIN-KEY: <ADMIN_KEY>" \
  -d '{
    "track_slug": "python",
    "lessons": [
      {
        "lesson_order": 1,
        "title": "Python basics",
        "objectives": ["Install Python", "Run first script"],
        "tags": ["syntax", "setup"],
        "source_urls": ["https://docs.python.org/3/tutorial/"]
      }
    ]
  }'
```

### Resume from a Learner ID

```bash
curl "http://localhost:3000/v1/resume?learner_id=<LEARNER_UUID>"
```

### Get next lesson

```bash
curl "http://localhost:3000/v1/lessons/next?track=python&learner_id=<LEARNER_UUID>"
```

### Submit attempt

```bash
curl -X POST http://localhost:3000/v1/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "lesson_id": "<LESSON_ID>",
    "attempt_type": "quiz",
    "score": 8,
    "max_score": 10,
    "duration_sec": 240,
    "weak_tags": ["loops"]
  }'
```
