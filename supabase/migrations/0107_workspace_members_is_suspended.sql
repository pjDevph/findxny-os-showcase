-- workspace_members.is_suspended is selected by supabase/functions/admin-data,
-- employees-update, and pos-data (staff-list) but was never actually added to
-- the table — every one of those queries has been failing (and silently
-- swallowed, since none of the callers check the query's `error`). Mirrors
-- is_archived's shape from 0018_staff_pin_archive.sql.

alter table workspace_members
  add column if not exists is_suspended boolean not null default false;
