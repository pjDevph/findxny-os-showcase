-- workspace_printers: per-workspace receipt/label/kitchen printer devices.
-- Referenced by the printers-create/update/delete/update-meta and test-printer
-- edge functions, which were deployed against this table before it was ever
-- migrated here — "Add printer" was failing with PGRST205 (table not found).

create table if not exists public.workspace_printers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  type          text not null check (type in ('receipt', 'label', 'kitchen')),
  connection    text not null check (connection in ('builtin', 'ethernet', 'bluetooth', 'usb', 'network')),
  mac_address   text,
  ip_address    text,
  is_enabled    boolean not null default true,
  is_default    boolean not null default false,
  last_test     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists workspace_printers_ws_idx
  on public.workspace_printers (workspace_id);

-- RLS — all access happens through service-role edge functions
-- (printers-create/update/delete/update-meta, test-printer). No direct client reads.
alter table public.workspace_printers enable row level security;
