-- 0096_drop_legacy_stock_columns.sql
--
-- CONTRACT step of the inventory-catalog unification (see 0095). Run only
-- after every edge function has been updated to stop reading:
--   products.stock_behavior / products.is_ingredient
--   inventory_items.product_id / inventory_items.unit
--   inventory_catalog.quantity / .price_per_unit / .stock_qty (legacy pairs,
--     superseded by cost_per_unit and the per-branch sum of inventory_items.quantity)

ALTER TABLE products
  DROP COLUMN IF EXISTS stock_behavior,
  DROP COLUMN IF EXISTS is_ingredient;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_branch_id_product_id_key,
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS unit;

ALTER TABLE inventory_catalog
  DROP COLUMN IF EXISTS quantity,
  DROP COLUMN IF EXISTS price_per_unit,
  DROP COLUMN IF EXISTS stock_qty;
