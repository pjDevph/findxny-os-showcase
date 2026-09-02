-- =============================================================
--  BOTTLED WATER + PACKAGING ADD  ·  paste into Supabase SQL Editor -> Run
--  Extends supabase/seed/mugthemug-coded-seed.sql (dev workspace only):
--   * Renames 'Bottled Beer' -> 'Bottled Drinks' (now covers beer + water)
--   * Adds Bottled Water 500ml as BB6 in that category
--   * Adds new 'Packaging' category (sort_order 23)
--   * Adds Take Out Tub as PK1 in Packaging
--  Idempotent: category insert is guarded, product insert upserts on
--  (workspace_id, sku), matching the pattern in mugthemug-coded-seed.sql.
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- 1. Rename Bottled Beer -> Bottled Drinks
  UPDATE product_categories
  SET name = 'Bottled Drinks'
  WHERE workspace_id = ws AND name = 'Bottled Beer';

  -- 2. New Packaging category
  INSERT INTO product_categories (workspace_id, name, sort_order)
  SELECT ws, 'Packaging', 23
  WHERE NOT EXISTS (
    SELECT 1 FROM product_categories
    WHERE workspace_id = ws AND name = 'Packaging'
  );

  -- 3. Products
  INSERT INTO products
    (workspace_id, category_id, name, sku, price, cost,
     purchase_unit, selling_unit, for_sale, kitchen_required,
     prep_station, active, archived, featured, is_pinned)
  SELECT
    ws,
    (SELECT id FROM product_categories
       WHERE workspace_id = ws AND name = v.cat
       ORDER BY created_at LIMIT 1),
    v.pname, v.sku, v.price, 0,
    v.unit, v.unit, TRUE, FALSE,
    'none', TRUE, FALSE, FALSE, FALSE
  FROM (VALUES
    ('Bottled Water 500ml', 'BB6', 'Bottled Drinks', 'bottle', 30),
    ('Take Out Tub',        'PK1', 'Packaging',       'pcs',    10)
  ) AS v(pname, sku, cat, unit, price)
  ON CONFLICT (workspace_id, sku) DO UPDATE SET
    name             = EXCLUDED.name,
    price            = EXCLUDED.price,
    category_id      = EXCLUDED.category_id,
    purchase_unit    = EXCLUDED.purchase_unit,
    selling_unit     = EXCLUDED.selling_unit,
    for_sale         = TRUE,
    kitchen_required = FALSE,
    prep_station      = 'none',
    active           = TRUE,
    archived         = FALSE;

  RAISE NOTICE 'Bottled water + packaging seeded into workspace %', ws;
END $$;
