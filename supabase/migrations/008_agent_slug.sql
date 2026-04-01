-- Add slug column for human-readable relay URLs
ALTER TABLE agents ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Backfill: iterate agents, assign unique slug derived from name
DO $$
DECLARE
  r         RECORD;
  base_slug TEXT;
  candidate TEXT;
  counter   INT;
BEGIN
  FOR r IN SELECT id, name FROM agents WHERE slug IS NULL ORDER BY created_at ASC LOOP
    base_slug := TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(r.name, '[^a-z0-9]+', '-', 'gi')));
    candidate := base_slug;
    counter   := 2;
    WHILE EXISTS (SELECT 1 FROM agents WHERE slug = candidate) LOOP
      candidate := base_slug || '-' || counter;
      counter   := counter + 1;
    END LOOP;
    UPDATE agents SET slug = candidate WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents (slug);
