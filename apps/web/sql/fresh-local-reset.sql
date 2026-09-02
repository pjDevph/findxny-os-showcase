-- Fresh test reset: clears all business data so you can recreate products,
-- ingredients, inventory, orders, and bookings from scratch.
-- Run in the Supabase SQL Editor (or psql) for the workspace you are testing.
--
-- Keeps: auth.users (not in the public schema, never touched), profiles,
--        workspaces, workspace_members, branches -- so logins, your workspace,
--        and branches survive for easy re-login.
-- Wipes: every other table in the public schema.
--
-- Schema-drift proof: builds the TRUNCATE from the tables that actually exist,
-- so it never fails if a migration is missing or a table was renamed. CASCADE
-- only cascades down to child tables, never up to the kept parents.

DO $$
DECLARE
  keep text[] := ARRAY['workspaces', 'branches', 'profiles', 'workspace_members'];
  tbls text;
BEGIN
  SELECT string_agg(format('%I', tablename), ', ')
    INTO tbls
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> ALL(keep);

  IF tbls IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tbls || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
