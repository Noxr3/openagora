-- ─── Calling agents that need their own key ─────────────────────────────────
-- Some A2A agents answer only with their own credential (a Dokki Agent wants
-- `Authorization: Bearer dka_...` on every call) and speak a different A2A
-- generation than the caller. The relay now holds that credential server-side
-- and translates between generations, so such agents can join as they are.
--
-- Nothing here is readable from the browser: RLS is on with no policies and no
-- privileges for anon / authenticated (as 015 set for every table). The app
-- reads these tables only through the service role.

-- What the relay needs to know about a target. All three are public facts.
ALTER TABLE agents
  -- A2A generation the agent speaks: 'legacy' (tasks/send), '0.3' (message/send)
  -- or '1.0' (SendMessage). NULL = unknown; the relay then forwards the
  -- caller's request unchanged, as it always has.
  ADD COLUMN IF NOT EXISTS a2a_version TEXT
    CHECK (a2a_version IS NULL OR a2a_version IN ('legacy', '0.3', '1.0')),
  -- How long the relay waits for an answer. NULL = the default (30 s).
  ADD COLUMN IF NOT EXISTS relay_timeout_seconds INT
    CHECK (relay_timeout_seconds IS NULL OR relay_timeout_seconds BETWEEN 5 AND 280),
  -- The Agent Card the profile was filled from, when registered by card URL.
  ADD COLUMN IF NOT EXISTS card_url TEXT;

-- The credential the relay attaches when it calls the agent. A separate table
-- on purpose: agents is read with select('*') all over the app, and a column
-- there would leave in the first API response that forgets to exclude it.
CREATE TABLE IF NOT EXISTS agent_outbound_credentials (
  agent_id    UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  -- An HTTP header name (RFC 9110 token), e.g. Authorization or X-API-Key.
  header_name TEXT NOT NULL CHECK (header_name ~ '^[A-Za-z0-9!#$%&''*+.^_`|~-]{1,64}$'),
  -- scheme://host[:port] of agents.url when the credential was set. The relay
  -- attaches the credential only to that origin.
  origin      TEXT NOT NULL CHECK (origin ~ '^https?://[^/?#]+$'),
  -- v1:<base64(iv | tag | ciphertext)>, AES-256-GCM under RELAY_CREDENTIALS_KEY,
  -- with the agent id and header name as additional authenticated data.
  sealed      TEXT NOT NULL CHECK (sealed LIKE 'v1:%'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_outbound_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_outbound_credentials FROM anon, authenticated;

-- A credential belongs to the endpoint it was set for. When the agent's URL
-- changes, the credential goes with the old URL and the owner sets it again.
CREATE OR REPLACE FUNCTION drop_outbound_credential_on_url_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.url IS DISTINCT FROM OLD.url THEN
    DELETE FROM agent_outbound_credentials WHERE agent_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_drop_outbound_credential ON agents;
CREATE TRIGGER agents_drop_outbound_credential
  AFTER UPDATE OF url ON agents
  FOR EACH ROW EXECUTE FUNCTION drop_outbound_credential_on_url_change();

-- A legacy caller (tasks/send) names its own task id and polls tasks/get with
-- it; a 0.3 / 1.0 target assigns the id itself. When the relay translates
-- between the two it remembers which is which, so the caller's own id works.
CREATE TABLE IF NOT EXISTS relay_task_aliases (
  caller_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  caller_task_id  TEXT NOT NULL CHECK (length(caller_task_id) BETWEEN 1 AND 200),
  target_task_id  TEXT NOT NULL CHECK (length(target_task_id) BETWEEN 1 AND 200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (caller_agent_id, target_agent_id, caller_task_id)
);

CREATE INDEX IF NOT EXISTS idx_relay_task_aliases_created ON relay_task_aliases (created_at);

ALTER TABLE relay_task_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON relay_task_aliases FROM anon, authenticated;
