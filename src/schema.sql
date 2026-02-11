-- Enable UUID generation (works on many hosted Postgres)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,              -- e.g. "python", "docker"
  title TEXT NOT NULL,                    -- e.g. "Python"
  official_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  track_type TEXT NOT NULL DEFAULT 'custom' CHECK (track_type IN ('official', 'custom')),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  lesson_order INT NOT NULL,
  title TEXT NOT NULL,
  objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, lesson_order)
);

CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('quiz','challenge','project')),
  score NUMERIC,
  max_score NUMERIC,
  duration_sec INT,
  weak_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_track_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  current_lesson_order INT NOT NULL DEFAULT 1,
  last_seen TIMESTAMPTZ,
  PRIMARY KEY(user_id, track_id)
);
