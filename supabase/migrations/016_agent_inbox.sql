-- ─── Pull delivery: agents that come to us ─────────────────────────────────
-- Some agents have no public endpoint but do have initiative: consumer agents
-- with a browser or a terminal (OpenAI dots, Grok Bot, Meta Muse), a laptop
-- process, a cron job. They register with delivery = 'pull'. A call to them
-- through the relay is written to agent_tasks and answered with an A2A Task in
-- state "submitted"; the agent polls GET /api/inbox, replies, and the caller
-- reads the result with tasks/get.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS delivery TEXT NOT NULL DEFAULT 'push'
    CHECK (delivery IN ('push', 'pull')),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- A pull agent has no endpoint of its own. The unique index on url already
-- allows any number of NULLs.
ALTER TABLE agents ALTER COLUMN url DROP NOT NULL;
ALTER TABLE agents ADD CONSTRAINT agents_push_has_url
  CHECK (delivery = 'pull' OR url IS NOT NULL) NOT VALID;
ALTER TABLE agents VALIDATE CONSTRAINT agents_push_has_url;

CREATE TABLE agent_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq              BIGINT GENERATED ALWAYS AS IDENTITY,
  target_agent_id  UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  caller_agent_id  UUID REFERENCES agents(id) ON DELETE SET NULL,
  context_id       TEXT NOT NULL,
  state            TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (state IN ('submitted', 'working', 'input-required',
                                      'completed', 'failed', 'canceled', 'rejected')),
  request          JSONB NOT NULL,          -- the caller's A2A Message
  response         JSONB,                   -- the agent's A2A Message (reply)
  proxy_call_id    UUID REFERENCES proxy_calls(id) ON DELETE SET NULL,
                                            -- the call row; its status and latency are
                                            -- filled in when the agent answers, so pull
                                            -- agents get the same track record as push ones
  claimed_until    TIMESTAMPTZ,             -- lease while the agent works on it
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX agent_tasks_inbox  ON agent_tasks (target_agent_id, seq) WHERE state IN ('submitted', 'working');
CREATE INDEX agent_tasks_caller ON agent_tasks (caller_agent_id, created_at DESC);

ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_tasks FROM anon, authenticated;

-- Claim up to p_limit open tasks for one agent. A task is open when it was
-- never claimed or its lease ran out; claiming moves it to "working".
-- SKIP LOCKED so two pollers of one agent never get the same task.
CREATE OR REPLACE FUNCTION claim_agent_tasks(p_agent UUID, p_limit INT, p_lease_seconds INT)
RETURNS SETOF agent_tasks
LANGUAGE sql
SET search_path = public
AS $$
  WITH picked AS (
    SELECT id FROM agent_tasks
    WHERE target_agent_id = p_agent
      AND expires_at > now()
      AND (state = 'submitted'
           OR (state = 'working' AND claimed_until < now()))
    ORDER BY seq
    LIMIT GREATEST(1, LEAST(p_limit, 20))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE agent_tasks t
     SET state = 'working',
         claimed_until = now() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 3600))),
         updated_at = now()
    FROM picked
   WHERE t.id = picked.id
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION claim_agent_tasks(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
