-- cash_drawer_days / cash_drawer_entries: real persistence for the web admin
-- Cash Drawer page (apps/web/app/(admin)/cash-drawer), replacing its
-- localStorage-only state (key `cash-drawer:${date}`). Distinct from
-- pos-shift's `shifts`/`cash_drawer_events` (POS-terminal shift-scoped) — this
-- is workspace(+branch)+calendar-day-scoped, for office/admin end-of-day cash
-- reconciliation, not a per-terminal cash drawer session.

create table if not exists public.cash_drawer_days (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  drawer_date     date not null,
  starting_cash   numeric(12,2) not null default 0,
  net_cash_manual numeric(12,2),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, branch_id, drawer_date)
);

create index if not exists cash_drawer_days_ws_idx
  on public.cash_drawer_days (workspace_id, drawer_date);

create table if not exists public.cash_drawer_entries (
  id           uuid primary key default gen_random_uuid(),
  day_id       uuid not null references public.cash_drawer_days(id) on delete cascade,
  kind         text not null check (kind in ('cash_in', 'expense')),
  label        text not null,
  amount       numeric(12,2) not null check (amount > 0),
  remarks      text,
  expense_type text check (expense_type in ('Cash', 'Non-Cash')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists cash_drawer_entries_day_idx
  on public.cash_drawer_entries (day_id);

-- RLS — all access happens through the cash-drawer edge function (service
-- role). No direct client reads/writes, no policies needed.
alter table public.cash_drawer_days enable row level security;
alter table public.cash_drawer_entries enable row level security;
