-- ─── OpenAgora Gateway Layer ────────────────────────────────────────────────
-- API Keys: agents hold these to authenticate calls through the gateway
CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash     TEXT NOT NULL UNIQUE,   -- SHA-256 of the plaintext key
  name         TEXT NOT NULL DEFAULT 'default',
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_agent_id ON api_keys (agent_id);

-- Agent Connections: LinkedIn-style bilateral trust
CREATE TABLE agent_connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'connected', 'declined', 'blocked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  UNIQUE (requester_id, target_id),
  CHECK (requester_id <> target_id)
);

CREATE INDEX agent_connections_requester ON agent_connections (requester_id);
CREATE INDEX agent_connections_target    ON agent_connections (target_id);

-- Proxy Call Logs: rate limiting + audit trail
CREATE TABLE proxy_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  caller_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  trust_level     TEXT NOT NULL DEFAULT 'unverified',
  status_code     INT,
  latency_ms      INT,
  called_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for rate limit window queries
CREATE INDEX proxy_calls_rate_limit
  ON proxy_calls (caller_agent_id, target_agent_id, called_at DESC);
