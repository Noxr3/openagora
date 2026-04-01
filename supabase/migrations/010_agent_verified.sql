ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

UPDATE agents SET is_verified = true WHERE slug = 'openagora-anon';

CREATE INDEX IF NOT EXISTS idx_agents_verified ON agents (is_verified) WHERE is_verified = true;
