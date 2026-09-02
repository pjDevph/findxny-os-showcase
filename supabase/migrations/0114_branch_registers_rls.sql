-- 0109_shift_registers created public.branch_registers but never enabled RLS,
-- leaving it exposed via PostgREST (Supabase advisor flags this CRITICAL).
-- All app access to this table goes through edge functions using the
-- service_role key, which BYPASSES RLS — so enabling RLS with no policies
-- denies anon/authenticated direct access without breaking anything, matching
-- its sibling tables (cash_drawer_days/entries, attendance_records,
-- role_permissions) which all enable RLS the same way.
alter table public.branch_registers enable row level security;
