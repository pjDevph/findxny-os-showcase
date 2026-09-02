-- 0014_ingredients_recipes.sql — Ingredient stock movement log + per-order-item auto-deduction

-- ── Ingredient stock movements ────────────────────────────────────────────────
create table ingredient_movements (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  type          text not null check (type in ('in','out','adjustment','order_deduct')),
  quantity      numeric(14,4) not null,
  reason        text,
  user_id       uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index on ingredient_movements(ingredient_id);
create index on ingredient_movements(workspace_id, created_at desc);

alter table ingredient_movements enable row level security;

create policy "ingredient_movements member read" on ingredient_movements
  for select using (is_workspace_member(workspace_id));
create policy "ingredient_movements manager write" on ingredient_movements
  for all using (
    is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[])
  );

-- ── Auto-deduct ingredients when an order item is placed ──────────────────────
-- Fires per order_item row (not per order), so each item deducts immediately.
create or replace function deduct_ingredients_on_order()
returns trigger language plpgsql security definer as $$
declare
  _workspace_id uuid;
begin
  if NEW.product_id is null then return NEW; end if;

  select o.workspace_id into _workspace_id
  from orders o where o.id = NEW.order_id;

  -- Deduct each recipe ingredient proportionally
  update ingredients i
  set
    quantity   = greatest(0, i.quantity - (pr.quantity * NEW.quantity)),
    updated_at = now()
  from product_recipes pr
  where pr.product_id    = NEW.product_id
    and pr.ingredient_id = i.id;

  -- Audit trail
  insert into ingredient_movements (workspace_id, ingredient_id, type, quantity, reason)
  select
    _workspace_id,
    pr.ingredient_id,
    'order_deduct',
    pr.quantity * NEW.quantity,
    'order_item:' || NEW.id
  from product_recipes pr
  where pr.product_id = NEW.product_id;

  return NEW;
end;
$$;

-- Drop the old per-order trigger from 0007 if it exists, replace with per-item trigger
drop trigger if exists trg_deduct_ingredients on orders;

create trigger trg_deduct_ingredients
  after insert on order_items
  for each row execute function deduct_ingredients_on_order();
