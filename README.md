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
- If both `learner_id` and `user_id` are provided in query params, they must be the same UUID or the API returns `400`.
- Privacy note: no personal data is stored. Progress is linked only to the Learner ID.

## Security limitations (MVP)

This MVP intentionally does **not** use OAuth. That keeps setup simple, but it introduces known security limitations that you should accept explicitly before production use:

- Learner identity is currently possession-based (`learner_id` UUID). If a UUID is leaked/shared, another client can read or submit progress for that learner.
- Current rate limiting is in-memory per process, so protection is basic and not coordinated across multiple instances.
- Database TLS should stay enabled with certificate validation (`PG_SSL_MODE=require` or `verify-full`).

### Prioritized patch plan (preserving no OAuth)

1. **P0 — Harden DB transport security**
   - Enforce strict TLS verification for Postgres in production environments (provider-recommended CA/cert settings).

2. **P1 — Add signed learner proof (no OAuth)**
   - Keep UUID `learner_id` UX, but also issue an HMAC-signed token from `/v1/me` (bound to `learner_id` + expiry).
   - Require that signature on write/progress routes (`/v1/lessons/next`, `/v1/attempts`) to prevent easy UUID-only hijacking.

3. **P1 — Move rate limiting to shared storage/edge**
   - Keep current limits but back them with Redis or platform edge controls so limits persist across restarts/instances.

4. **P2 — Reduce identifier leakage in logs**
   - Avoid logging raw learner IDs where not necessary; use hashed/shortened request-correlation identifiers.

5. **P2 — Tighten CORS for known clients**
   - If frontend origins are known, restrict CORS allowlist instead of allowing all origins by default.

## Quickstart

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env`:
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/learn_anything
   PG_SSL_MODE=disable
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

## Database TLS environment configuration

`src/db.js` uses `PG_SSL_MODE` to decide TLS behavior:

- `disable` → no TLS (local-only; blocked in production)
- `require` → TLS enabled with certificate validation (`rejectUnauthorized: true`)
- `verify-full` → TLS enabled with certificate validation (`rejectUnauthorized: true`)

Optional provider-recommended certificate paths:

- `PG_SSL_CA_PATH`
- `PG_SSL_CERT_PATH`
- `PG_SSL_KEY_PATH`

### Render/Neon secure example

```env
NODE_ENV=production
DATABASE_URL=postgres://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
PG_SSL_MODE=verify-full
# Optional if your provider asks for explicit cert files:
# PG_SSL_CA_PATH=/etc/secrets/neon-ca.pem
# PG_SSL_CERT_PATH=/etc/secrets/client-cert.pem
# PG_SSL_KEY_PATH=/etc/secrets/client-key.pem
ADMIN_KEY=replace-with-strong-admin-key
PORT=10000
```

### Local development override example

```env
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/learn_anything
PG_SSL_MODE=disable
ADMIN_KEY=replace-with-strong-admin-key
PORT=3000
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
