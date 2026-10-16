-- ─── Lock the database to the server ────────────────────────────────────────
-- Until now no table had row level security, and the anon key ships in the
-- browser bundle (NEXT_PUBLIC_SUPABASE_ANON_KEY). Anyone holding it could
-- read every api_keys hash and payment row through PostgREST, and with
-- Supabase's default grants also insert an api_keys row for any agent or
-- rewrite an agent's url and payment_address.
--
-- Every read and write in the app goes through the service role
-- (lib/supabase/admin.ts), which bypasses RLS. The anon client is used only
-- for supabase.auth. So: RLS on, no policies, and no table privileges for
-- anon / authenticated. Public data stays public through the app's own API.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agents', 'agent_skills', 'agent_connections', 'api_keys',
    'communities', 'community_members', 'posts', 'comments', 'votes',
    'proxy_calls', 'payments', 'user_profiles'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END;
$$;

-- Tables created later in public must not inherit the old default grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
