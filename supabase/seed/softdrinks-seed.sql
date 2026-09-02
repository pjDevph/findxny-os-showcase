-- =============================================================
--  SOFTDRINKS  ·  paste into Supabase SQL Editor -> Run
--  Adds category "Softdrinks" (BD codes) + 6 ready-to-serve items.
--  Idempotent: guarded category insert + upsert on (workspace_id, sku).
--  prep_station = 'none' -> no kitchen/drinks prep ticket (like Bottled Beer).
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- 1) Category (no unique(name) on product_categories -> guarded insert)
  INSERT INTO product_categories (workspace_id, name, sort_order)
  SELECT ws, 'Softdrinks', 22
  WHERE NOT EXISTS (
    SELECT 1 FROM product_categories c
    WHERE c.workspace_id = ws AND c.name = 'Softdrinks'
  );

  UPDATE product_categories SET sort_order = 22
   WHERE workspace_id = ws AND name = 'Softdrinks';
  UPDATE product_categories SET sort_order = 23
   WHERE workspace_id = ws AND name = 'Beverage Add-ons';

  -- 2) Products
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
    v.unit, v.unit, TRUE,
    (v.prep = 'kitchen'),
    v.prep, TRUE, FALSE, FALSE, FALSE
  FROM (VALUES
    ('Royal Mismo',        'BD1', 'Softdrinks', 'bottle',  30, 'none'),
    ('Coke Mismo',         'BD2', 'Softdrinks', 'bottle',  30, 'none'),
    ('Mountain Dew Mismo', 'BD3', 'Softdrinks', 'bottle',  30, 'none'),
    ('Sprite Mismo',       'BD4', 'Softdrinks', 'bottle',  30, 'none'),
    ('Coke 1.5L',          'BD5', 'Softdrinks', 'bottle', 120, 'none'),
    ('Coke in Can',        'BD6', 'Softdrinks', 'can',     55, 'none')
  ) AS v(pname, sku, cat, unit, price, prep)
  ON CONFLICT (workspace_id, sku) DO UPDATE SET
    name             = EXCLUDED.name,
    price            = EXCLUDED.price,
    category_id      = EXCLUDED.category_id,
    purchase_unit    = EXCLUDED.purchase_unit,
    selling_unit     = EXCLUDED.selling_unit,
    for_sale         = TRUE,
    kitchen_required = EXCLUDED.kitchen_required,
    prep_station     = EXCLUDED.prep_station,
    active           = TRUE,
    archived         = FALSE;

  RAISE NOTICE 'Softdrinks seeded: 1 category, 6 products.';
END $$;

-- verify
SELECT p.sku, p.name, p.price, p.selling_unit, c.name AS category
  FROM products p
  JOIN product_categories c ON c.id = p.category_id
 WHERE p.workspace_id = '00000000-0000-0000-0000-000000000001'
   AND p.sku LIKE 'BD%'
 ORDER BY p.sku;
