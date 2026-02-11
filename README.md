# Learn_Anything_API

Express + Postgres API for generating learning tracks, lessons, and progress for a custom GPT workflow.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` (example):
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/learn_anything
   PORT=3000
   ADMIN_KEY=change-me
   ```
3. Initialize schema:
   ```bash
   psql "$DATABASE_URL" -f src/schema.sql
   ```
4. Run migration for track admin metadata:
   ```bash
   psql "$DATABASE_URL" -f migrations/001_add_track_admin_columns.sql
   ```
5. Start API:
   ```bash
   npm run dev
   ```

## OpenAPI

OpenAPI 3.1 schema is available at:

- `openapi.yaml`

Internal endpoints require `X-ADMIN-KEY` header.

## Internal admin endpoints

### Ensure a track exists

```bash
curl -X POST http://localhost:3000/v1/internal/ensure-track \
  -H "Content-Type: application/json" \
  -H "X-ADMIN-KEY: $ADMIN_KEY" \
  -d '{
    "slug": "python",
    "title": "Python",
    "track_type": "official",
    "status": "active",
    "official_sources": ["https://docs.python.org/3/"],
    "owner_user_id": null
  }'
```

### Seed lessons for a track

```bash
curl -X POST http://localhost:3000/v1/internal/seed-lessons \
  -H "Content-Type: application/json" \
  -H "X-ADMIN-KEY: $ADMIN_KEY" \
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

## Existing API endpoints

- `GET /health`
- `GET /v1/tracks`
- `POST /v1/tracks`
- `GET /v1/me`
- `GET /v1/lessons/next`
- `POST /v1/attempts`
- `POST /v1/internal/ensure-track` (admin key required)
- `POST /v1/internal/seed-lessons` (admin key required)
