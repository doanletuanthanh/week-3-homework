-- The app reaches Postgres only through its own server-side connection, which bypasses RLS.
-- RLS with no policies plus revoked grants means the Supabase Data API (publishable key) reads nothing.
-- Tables created by later migrations must enable RLS themselves; an integration test fails if one is missed.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
