-- Adds internal-admin metadata columns for tracks.
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS track_type TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracks_track_type_check'
  ) THEN
    ALTER TABLE tracks
      ADD CONSTRAINT tracks_track_type_check CHECK (track_type IN ('official', 'custom'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracks_status_check'
  ) THEN
    ALTER TABLE tracks
      ADD CONSTRAINT tracks_status_check CHECK (status IN ('draft', 'active', 'archived'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracks_owner_user_id_fkey'
  ) THEN
    ALTER TABLE tracks
      ADD CONSTRAINT tracks_owner_user_id_fkey
      FOREIGN KEY (owner_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;
