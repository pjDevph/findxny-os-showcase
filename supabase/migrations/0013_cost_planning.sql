-- 0013_cost_planning.sql — Business cost planning module
create table if not exists cost_items (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  category     text not null check (category in ('startup','fixed','variable','marketing','buffer','growth')),
  name         text not null,
  amount       numeric(12,2) not null default 0,
  frequency    text not null default 'monthly' check (frequency in ('one_time','monthly','per_sale')),
  notes        text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists cost_items_workspace_idx on cost_items(workspace_id, category);

alter table cost_items enable row level security;

create policy "cost_items workspace member read" on cost_items
  for select using (is_workspace_member(workspace_id));
create policy "cost_items owner/admin write" on cost_items
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]));
