-- Remove duplicate URLs, keeping the oldest registration per URL
DELETE FROM agents
WHERE id NOT IN (
  SELECT DISTINCT ON (url) id
  FROM agents
  ORDER BY url, created_at ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_url_unique ON agents (url);
