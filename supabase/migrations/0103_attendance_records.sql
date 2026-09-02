-- attendance_records: simple staff time in/out (no selfie capture — see
-- docs/utak-analysis-staff.md for that future scope). Self-service: any
-- authenticated workspace member clocks themselves in/out via ctx.userId,
-- resolved through the attendance-clock edge function.
--
-- Distinct from migration 0046's shift_events table, which is hard-coupled to
-- an open POS-terminal `shifts` row (cash-drawer float session tracking).
-- This is a personal daily attendance log, not a cash-reconciliation session —
-- the two clock-in/out concepts intentionally coexist.

create table if not exists public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  branch_id    uuid references public.branches(id) on delete set null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  clock_in     timestamptz not null default now(),
  clock_out    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists attendance_records_ws_idx
  on public.attendance_records (workspace_id, user_id);

-- Fast lookup for "does this user already have an open clock-in?"
create index if not exists attendance_records_open_idx
  on public.attendance_records (user_id) where clock_out is null;

-- RLS — all access happens through the attendance-clock edge function
-- (service role). No direct client reads/writes, no policies needed.
alter table public.attendance_records enable row level security;
