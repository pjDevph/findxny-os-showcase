-- Multi-register support: a branch can run several concurrent shifts (one
-- per physical till), instead of the previous one-shift-per-branch model.
-- Also adds the reconciliation fields the manager-review flow needs — the
-- cashier's own close-shift no longer surfaces expected/variance (blind
-- count), a manager reviews it separately and marks it reconciled.
create table if not exists branch_registers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  branch_id    uuid not null references branches(id) on delete cascade,
  name         text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists branch_registers_branch_idx on branch_registers(branch_id, is_active);

alter table shifts add column if not exists register_id uuid references branch_registers(id) on delete set null;
alter table shifts add column if not exists reconciled_at timestamptz;
alter table shifts add column if not exists reconciled_by uuid references auth.users(id) on delete set null;

create index if not exists shifts_register_open_idx on shifts(register_id, status);
create index if not exists shifts_pending_reconcile_idx on shifts(workspace_id, status, reconciled_at);
