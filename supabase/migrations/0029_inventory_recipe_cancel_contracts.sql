-- 0029_inventory_recipe_cancel_contracts.sql
-- Align ingredient / recipe schema with current Web + POS + Edge Function contracts.

alter table ingredients
  add column if not exists cost_per_unit numeric(12,4) not null default 0,
  add column if not exists stock_qty numeric(14,4) not null default 0,
  add column if not exists archived boolean not null default false;

update ingredients
set
  cost_per_unit = case when cost_per_unit = 0 then coalesce(price_per_unit, 0) else cost_per_unit end,
  stock_qty = case when stock_qty = 0 then coalesce(quantity, 0) else stock_qty end;

create table if not exists recipe_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  qty_used      numeric(14,4) not null check (qty_used > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (product_id, ingredient_id)
);

insert into recipe_items (workspace_id, product_id, ingredient_id, qty_used)
select p.workspace_id, pr.product_id, pr.ingredient_id, pr.quantity
from product_recipes pr
join products p on p.id = pr.product_id
on conflict (product_id, ingredient_id) do nothing;

create index if not exists idx_recipe_items_workspace on recipe_items(workspace_id);
create index if not exists idx_recipe_items_product on recipe_items(product_id);
create index if not exists idx_recipe_items_ingredient on recipe_items(ingredient_id);

alter table recipe_items enable row level security;

do $$ begin
  create policy "recipe_items_member_read" on recipe_items for select
    using (is_workspace_member(workspace_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "recipe_items_manager_write" on recipe_items for all
    using (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]))
    with check (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]));
exception when duplicate_object then null; end $$;

create or replace function deduct_ingredients_on_order()
returns trigger language plpgsql security definer as $$
declare
  _workspace_id uuid;
begin
  if NEW.product_id is null then return NEW; end if;

  select o.workspace_id into _workspace_id
  from orders o where o.id = NEW.order_id;

  update ingredients i
  set
    stock_qty   = greatest(0, i.stock_qty - (ri.qty_used * NEW.quantity)),
    quantity    = greatest(0, i.quantity - (ri.qty_used * NEW.quantity)),
    updated_at  = now()
  from recipe_items ri
  where ri.product_id = NEW.product_id
    and ri.ingredient_id = i.id;

  insert into ingredient_movements (workspace_id, ingredient_id, type, quantity, reason)
  select
    _workspace_id,
    ri.ingredient_id,
    'order_deduct',
    ri.qty_used * NEW.quantity,
    'order_item:' || NEW.id
  from recipe_items ri
  where ri.product_id = NEW.product_id;

  return NEW;
end;
$$;
