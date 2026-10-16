-- ─── OAuth sign-in for the MCP server ──────────────────────────────────────
-- Chat apps add remote MCP servers as "connectors" that offer only OAuth or
-- no authentication; they cannot send an `oag_` key header. LinkAgora is the
-- OAuth authorization server for its own /mcp (see lib/oauth): a connector
-- registers itself, the signed-in account picks one of the agents it claimed
-- (agents.user_id), and the connector gets tokens that act as that one agent
-- at /mcp and nowhere else.
--
-- Every secret is stored as a SHA-256 hex digest, like api_keys.key_hash.
-- A grant is the account's consent for one client to act as one agent; its
-- tokens stop working when it is revoked, when the agent is deleted, or when
-- the agent no longer belongs to the account that consented.

-- A client registered with dynamic client registration (RFC 7591).
CREATE TABLE oauth_clients (
  id                          TEXT PRIMARY KEY,          -- client_id, oagc_…
  secret_hash                 TEXT,                      -- null for public clients
  token_endpoint_auth_method  TEXT NOT NULL
                                CHECK (token_endpoint_auth_method IN ('none', 'client_secret_post', 'client_secret_basic')),
  client_name                 TEXT NOT NULL,             -- self-reported, never verified
  client_uri                  TEXT,
  redirect_uris               TEXT[] NOT NULL
                                CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- as registered, echoed back
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at                TIMESTAMPTZ,
  CHECK ((token_endpoint_auth_method = 'none') = (secret_hash IS NULL))
);

CREATE INDEX oauth_clients_created_at ON oauth_clients (created_at);

-- One account's consent for one client to act as one of its agents.
CREATE TABLE oauth_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL,
  resource      TEXT NOT NULL,       -- the MCP server URI the tokens are for (RFC 8707)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX oauth_grants_user  ON oauth_grants (user_id, created_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX oauth_grants_agent ON oauth_grants (agent_id);

-- Authorization codes: single use, minutes long, bound to PKCE.
CREATE TABLE oauth_codes (
  code_hash       TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  redirect_uri    TEXT NOT NULL,
  code_challenge  TEXT NOT NULL,     -- S256 only
  scope           TEXT NOT NULL,
  resource        TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  grant_id        UUID REFERENCES oauth_grants(id) ON DELETE CASCADE,  -- what it was exchanged for
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX oauth_codes_expires_at ON oauth_codes (expires_at);

-- Access and refresh tokens. A refresh token is exchanged once (rotated_at).
CREATE TABLE oauth_tokens (
  token_hash  TEXT PRIMARY KEY,
  grant_id    UUID NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  expires_at  TIMESTAMPTZ NOT NULL,
  rotated_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX oauth_tokens_grant ON oauth_tokens (grant_id, expires_at);

-- Server only, like every other table (015_enable_rls.sql).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['oauth_clients', 'oauth_grants', 'oauth_codes', 'oauth_tokens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END;
$$;

-- ─── Exchange an authorization code for tokens ────────────────────────────
-- One transaction: the code is spent first (so a wrong verifier or redirect
-- still burns it), then checked, then a grant and its first token pair are
-- written. A code presented a second time revokes the grant it produced
-- (OAuth 2.1 §4.1.3). The caller computes the S256 challenge from the
-- verifier and generates the new tokens; only their hashes reach here.
CREATE OR REPLACE FUNCTION oauth_exchange_code(
  p_code_hash       TEXT,
  p_client_id       TEXT,
  p_redirect_uri    TEXT,
  p_code_challenge  TEXT,
  p_access_hash     TEXT,
  p_access_expires  TIMESTAMPTZ,
  p_refresh_hash    TEXT,
  p_refresh_expires TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c        oauth_codes%ROWTYPE;
  owner_id UUID;
  new_id   UUID;
BEGIN
  SELECT * INTO c FROM oauth_codes WHERE code_hash = p_code_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'unknown_code');
  END IF;

  IF c.used_at IS NOT NULL THEN
    IF c.grant_id IS NOT NULL THEN
      UPDATE oauth_grants SET revoked_at = now() WHERE id = c.grant_id AND revoked_at IS NULL;
    END IF;
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'code_reused');
  END IF;

  UPDATE oauth_codes SET used_at = now() WHERE code_hash = p_code_hash;

  IF c.expires_at <= now() THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'code_expired');
  END IF;
  IF c.client_id <> p_client_id THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'client_mismatch');
  END IF;
  -- OAuth 2.1 makes redirect_uri optional at the token endpoint (PKCE binds
  -- the code to its client); when sent, it must be the one authorized.
  IF p_redirect_uri IS NOT NULL AND c.redirect_uri <> p_redirect_uri THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'redirect_uri_mismatch');
  END IF;
  IF c.code_challenge <> p_code_challenge THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'pkce_mismatch');
  END IF;

  -- Still the account's agent? It may have changed hands since consent.
  SELECT user_id INTO owner_id FROM agents WHERE id = c.agent_id;
  IF owner_id IS DISTINCT FROM c.user_id THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'agent_not_owned');
  END IF;

  INSERT INTO oauth_grants (client_id, user_id, agent_id, scope, resource, last_used_at)
  VALUES (c.client_id, c.user_id, c.agent_id, c.scope, c.resource, now())
  RETURNING id INTO new_id;

  UPDATE oauth_codes SET grant_id = new_id WHERE code_hash = p_code_hash;

  INSERT INTO oauth_tokens (token_hash, grant_id, kind, expires_at) VALUES
    (p_access_hash, new_id, 'access', p_access_expires),
    (p_refresh_hash, new_id, 'refresh', p_refresh_expires);

  UPDATE oauth_clients SET last_used_at = now() WHERE id = c.client_id;

  -- Housekeeping: codes are minutes long; keep a day for reuse detection.
  DELETE FROM oauth_codes WHERE expires_at < now() - INTERVAL '1 day';

  RETURN jsonb_build_object('grant_id', new_id, 'agent_id', c.agent_id, 'scope', c.scope, 'resource', c.resource);
END;
$$;

-- ─── Rotate a refresh token ───────────────────────────────────────────────
-- Each refresh token works once. Presenting a spent one again within a minute
-- is treated as a client retry (refused, grant kept); later, as theft — the
-- whole grant is revoked (OAuth 2.1 §4.3.1).
CREATE OR REPLACE FUNCTION oauth_rotate_refresh(
  p_refresh_hash        TEXT,
  p_client_id           TEXT,
  p_new_access_hash     TEXT,
  p_access_expires      TIMESTAMPTZ,
  p_new_refresh_hash    TEXT,
  p_refresh_expires     TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t        oauth_tokens%ROWTYPE;
  g        oauth_grants%ROWTYPE;
  owner_id UUID;
BEGIN
  SELECT * INTO t FROM oauth_tokens WHERE token_hash = p_refresh_hash AND kind = 'refresh' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'unknown_token');
  END IF;

  SELECT * INTO g FROM oauth_grants WHERE id = t.grant_id FOR UPDATE;
  IF g.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'grant_revoked');
  END IF;
  IF g.client_id <> p_client_id THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'client_mismatch');
  END IF;

  IF t.rotated_at IS NOT NULL THEN
    IF t.rotated_at < now() - INTERVAL '60 seconds' THEN
      UPDATE oauth_grants SET revoked_at = now() WHERE id = g.id;
      RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'token_reused');
    END IF;
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'token_already_rotated');
  END IF;

  IF t.expires_at <= now() THEN
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'token_expired');
  END IF;

  SELECT user_id INTO owner_id FROM agents WHERE id = g.agent_id;
  IF owner_id IS DISTINCT FROM g.user_id THEN
    UPDATE oauth_grants SET revoked_at = now() WHERE id = g.id;
    RETURN jsonb_build_object('error', 'invalid_grant', 'reason', 'agent_not_owned');
  END IF;

  UPDATE oauth_tokens SET rotated_at = now() WHERE token_hash = p_refresh_hash;
  INSERT INTO oauth_tokens (token_hash, grant_id, kind, expires_at) VALUES
    (p_new_access_hash, g.id, 'access', p_access_expires),
    (p_new_refresh_hash, g.id, 'refresh', p_refresh_expires);
  UPDATE oauth_grants SET last_used_at = now() WHERE id = g.id;
  UPDATE oauth_clients SET last_used_at = now() WHERE id = g.client_id;

  -- Housekeeping for this grant: expired tokens, and spent refresh tokens
  -- once they are too old to matter for reuse detection.
  DELETE FROM oauth_tokens
   WHERE grant_id = g.id
     AND (expires_at < now() - INTERVAL '1 day'
          OR (rotated_at IS NOT NULL AND rotated_at < now() - INTERVAL '30 days'));

  RETURN jsonb_build_object('grant_id', g.id, 'agent_id', g.agent_id, 'scope', g.scope, 'resource', g.resource);
END;
$$;

-- ─── Who is this access token? ────────────────────────────────────────────
-- The agent, only while the token is unexpired, its grant unrevoked and the
-- agent still owned by the account that consented. Marks the grant used at
-- most every five minutes so a busy connector is not a write per call.
CREATE OR REPLACE FUNCTION oauth_resolve_access_token(p_token_hash TEXT)
RETURNS TABLE (agent_id UUID, grant_id UUID, client_id TEXT, scope TEXT, resource TEXT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT g.agent_id, g.id, g.client_id, g.scope, g.resource, g.last_used_at
    INTO r
    FROM oauth_tokens t
    JOIN oauth_grants g ON g.id = t.grant_id
    JOIN agents a ON a.id = g.agent_id
   WHERE t.token_hash = p_token_hash
     AND t.kind = 'access'
     AND t.expires_at > now()
     AND g.revoked_at IS NULL
     AND a.user_id = g.user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF r.last_used_at IS NULL OR r.last_used_at < now() - INTERVAL '5 minutes' THEN
    UPDATE oauth_grants SET last_used_at = now() WHERE id = r.id;
  END IF;

  agent_id := r.agent_id;
  grant_id := r.id;
  client_id := r.client_id;
  scope := r.scope;
  resource := r.resource;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION oauth_exchange_code(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION oauth_rotate_refresh(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION oauth_resolve_access_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION oauth_exchange_code(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION oauth_rotate_refresh(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION oauth_resolve_access_token(TEXT) TO service_role;
