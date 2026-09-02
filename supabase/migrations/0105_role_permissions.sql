-- role_permissions: persists per-workspace overrides of the Staff Permissions
-- matrix (apps/web/app/(admin)/employees/page.tsx PERMISSION_FEATURES x
-- ROLE_DEFAULTS). Overrides only — edge functions' hardcoded Roles checks in
-- _shared/permissions.ts are NOT touched by this table and keep enforcing
-- access exactly as before. Toggling a checkbox here changes what the admin
-- UI displays as "granted" for a role, nothing more.

create table if not exists public.role_permissions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role         text not null,
  feature      text not null,
  granted      boolean not null,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (workspace_id, role, feature)
);

create index if not exists role_permissions_ws_idx
  on public.role_permissions (workspace_id);

-- RLS — all access happens through the admin-data / role-permissions-upsert
-- edge functions (service role). No direct client reads/writes, no policies
-- needed.
alter table public.role_permissions enable row level security;
