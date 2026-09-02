-- Backfill: seed inventory_items rows for any existing (branch, product) pair
-- that doesn't have one yet. New products auto-seed via products-upsert; this
-- catches anything created before that hook landed.

insert into inventory_items (workspace_id, branch_id, product_id, quantity, unit, low_stock_threshold)
select p.workspace_id, b.id, p.id, 0, 'pcs', 0
  from products p
  join branches b on b.workspace_id = p.workspace_id
 where not exists (
   select 1 from inventory_items i
    where i.branch_id = b.id and i.product_id = p.id
 );
