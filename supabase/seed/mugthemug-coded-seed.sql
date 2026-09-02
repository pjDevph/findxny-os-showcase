-- =============================================================
--  MUGTHEMUG CODED MENU SEED  ·  paste into Supabase SQL Editor -> Run
--  Source of truth: "Mugthemug Menu Coding System (with Prices)"
--
--  22 categories · 132 products · item codes (FB1, BF3, ...) stored in
--  products.sku so they print on receipts and show on the Products screen.
--
--  SAFE / IDEMPOTENT:
--   * Categories: guarded insert (product_categories has NO unique(name),
--     so a plain ON CONFLICT would duplicate on re-run) + sort_order sync.
--   * Products:   upsert keyed on (workspace_id, sku). Re-running just
--     corrects name/price/category/prep_station in place.
--   * Old menu:   the previous MTM-<descriptive> catalog and the original
--     demo seed items are DEACTIVATED (active/for_sale = FALSE), not deleted
--     -- order_items.product_id is ON DELETE RESTRICT, so historical sales
--     keep pointing at those rows. Nothing in sales history is lost.
--
--  prep_station drives drink-label / kitchen-ticket printing and the
--  Products screen Kitchen/Drinks filters -- set explicitly per category.
--    kitchen -> food, drinks -> cold/hot beverages, none -> beer & add-ons.
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  RAISE NOTICE 'Seeding coded menu into workspace %', ws;

  -- ════════════════════════════════════════════════════════════
  --  1  CATEGORIES (22)  -- guarded insert (no unique(name) exists)
  -- ════════════════════════════════════════════════════════════
  INSERT INTO product_categories (workspace_id, name, sort_order)
  SELECT ws, v.name, v.sort
  FROM (VALUES
    ('Breakfast',                 1),
    ('Pasta',                     2),
    ('Pizza',                     3),
    ('Pancit / Noodles',          4),
    ('Chicken Wings',             5),
    ('Smoke & Grill',             6),
    ('Appetizers',                7),
    ('Main Course',               8),
    ('Soup',                      9),
    ('Rice',                     10),
    ('Sharing Bundles',          11),
    ('Frappes',                  12),
    ('Premium Lattes',           13),
    ('Iced Coffee & Refreshers', 14),
    ('Milk Tea',                 15),
    ('Hot Drinks',               16),
    ('Brewed Coffee',            17),
    ('Tea',                      18),
    ('Matcha',                   19),
    ('Lemon Soda',               20),
    ('Bottled Beer',             21),
    ('Beverage Add-ons',         22)
  ) AS v(name, sort)
  WHERE NOT EXISTS (
    SELECT 1 FROM product_categories c
    WHERE c.workspace_id = ws AND c.name = v.name
  );

  -- keep sort_order in sync for categories that already existed
  UPDATE product_categories c SET sort_order = v.sort
  FROM (VALUES
    ('Breakfast',1),('Pasta',2),('Pizza',3),('Pancit / Noodles',4),
    ('Chicken Wings',5),('Smoke & Grill',6),('Appetizers',7),('Main Course',8),
    ('Soup',9),('Rice',10),('Sharing Bundles',11),('Frappes',12),
    ('Premium Lattes',13),('Iced Coffee & Refreshers',14),('Milk Tea',15),
    ('Hot Drinks',16),('Brewed Coffee',17),('Tea',18),('Matcha',19),
    ('Lemon Soda',20),('Bottled Beer',21),('Beverage Add-ons',22)
  ) AS v(name, sort)
  WHERE c.workspace_id = ws AND c.name = v.name;

  -- ════════════════════════════════════════════════════════════
  --  2  PRODUCTS (132)  -- upsert on (workspace_id, sku = item code)
  -- ════════════════════════════════════════════════════════════
  INSERT INTO products
    (workspace_id, category_id, name, sku, price, cost,
     purchase_unit, selling_unit, for_sale, kitchen_required,
     prep_station, active, archived, featured, is_pinned)
  SELECT
    ws,
    (SELECT id FROM product_categories
       WHERE workspace_id = ws AND name = v.cat
       ORDER BY created_at LIMIT 1),           -- LIMIT 1: tolerate any pre-existing dup category
    v.pname, v.sku, v.price, 0,
    v.unit, v.unit, TRUE,
    (v.prep = 'kitchen'),                       -- kitchen_required
    v.prep, TRUE, FALSE, FALSE, FALSE
  FROM (VALUES
    -- ══ FOOD  (prep_station = kitchen) ══
    -- Breakfast (FB)
    ('Tapsilog',               'FB1', 'Breakfast', 'serving', 190, 'kitchen'),
    ('Boneless Chicksilog',    'FB2', 'Breakfast', 'serving', 180, 'kitchen'),
    ('Lechon Silog',           'FB3', 'Breakfast', 'serving', 190, 'kitchen'),
    ('Bangsilog',              'FB4', 'Breakfast', 'serving', 250, 'kitchen'),
    ('Hungarian Silog',        'FB5', 'Breakfast', 'serving', 180, 'kitchen'),
    -- Pasta (FP)
    ('Aglio Olio',             'FP1', 'Pasta', 'serving', 320, 'kitchen'),
    ('Arrabbiata',             'FP2', 'Pasta', 'serving', 335, 'kitchen'),
    ('Carbonara',              'FP3', 'Pasta', 'serving', 335, 'kitchen'),
    ('Creamy Pesto',           'FP4', 'Pasta', 'serving', 355, 'kitchen'),
    -- Pizza (FZ)
    ('Margherita',             'FZ1', 'Pizza', 'serving', 350, 'kitchen'),
    ('Hawaiian',               'FZ2', 'Pizza', 'serving', 395, 'kitchen'),
    ('Quattro Formaggi',       'FZ3', 'Pizza', 'serving', 395, 'kitchen'),
    ('Pepperoni',              'FZ4', 'Pizza', 'serving', 450, 'kitchen'),
    ('Supreme',                'FZ5', 'Pizza', 'serving', 650, 'kitchen'),
    -- Pancit / Noodles (FN)
    ('Pancit Canton',          'FN1', 'Pancit / Noodles', 'serving', 250, 'kitchen'),
    ('Pancit Bihon',           'FN2', 'Pancit / Noodles', 'serving', 250, 'kitchen'),
    ('Mixed Pancit',           'FN3', 'Pancit / Noodles', 'serving', 300, 'kitchen'),
    -- Chicken Wings (FW) -- 6 pcs per order
    ('Classic Buffalo',        'FW1', 'Chicken Wings', 'serving', 230, 'kitchen'),
    ('Salted Egg',             'FW2', 'Chicken Wings', 'serving', 230, 'kitchen'),
    ('Garlic Parmesan',        'FW3', 'Chicken Wings', 'serving', 230, 'kitchen'),
    ('Buttered Garlic',        'FW4', 'Chicken Wings', 'serving', 230, 'kitchen'),
    -- Smoke & Grill (FG)  -- FG5 Grilled Squid menu range 180-200, base 180
    ('Pork Barbecue',          'FG1', 'Smoke & Grill', 'serving', 100, 'kitchen'),
    ('Chicken Barbecue',       'FG2', 'Smoke & Grill', 'serving', 100, 'kitchen'),
    ('Bacolod Chicken Inasal', 'FG3', 'Smoke & Grill', 'serving', 180, 'kitchen'),
    ('Grilled Liempo',         'FG4', 'Smoke & Grill', 'serving', 180, 'kitchen'),
    ('Grilled Squid',          'FG5', 'Smoke & Grill', 'serving', 180, 'kitchen'),
    ('Grilled Tuna Panga',     'FG6', 'Smoke & Grill', 'serving', 600, 'kitchen'),
    -- Appetizers (FA)
    ('Cajun Corn',             'FA1', 'Appetizers', 'serving', 139, 'kitchen'),
    ('Sizzling Sisig',         'FA2', 'Appetizers', 'serving', 220, 'kitchen'),
    ('Kilawin na Liempo',      'FA3', 'Appetizers', 'serving', 219, 'kitchen'),
    ('Lumpiang Shanghai',      'FA4', 'Appetizers', 'serving', 179, 'kitchen'),
    ('Beef Loaded Nachos',     'FA5', 'Appetizers', 'serving', 199, 'kitchen'),
    ('Ensaladang Mangga',      'FA6', 'Appetizers', 'serving', 139, 'kitchen'),
    ('Fried Calamari',         'FA7', 'Appetizers', 'serving', 159, 'kitchen'),
    ('Cheesy Bacon Fries',     'FA8', 'Appetizers', 'serving', 189, 'kitchen'),
    ('Dynamite',               'FA9', 'Appetizers', 'serving', 149, 'kitchen'),
    -- Main Course (FM)
    ('Pinyadobo',              'FM1', 'Main Course', 'serving', 389, 'kitchen'),
    ('Crispy Binagoongan',     'FM2', 'Main Course', 'serving', 449, 'kitchen'),
    ('Beef Kaldereta',         'FM3', 'Main Course', 'serving', 449, 'kitchen'),
    ('Crispy Kare-Kare',       'FM4', 'Main Course', 'serving', 499, 'kitchen'),
    ('Chopsuey',               'FM5', 'Main Course', 'serving', 339, 'kitchen'),
    ('Crispy Bicol Express',   'FM6', 'Main Course', 'serving', 449, 'kitchen'),
    ('Bangus Ala Pobre',       'FM7', 'Main Course', 'serving', 339, 'kitchen'),
    ('Crispy Pata',            'FM8', 'Main Course', 'serving', 799, 'kitchen'),
    -- Soup (FS)
    ('Sinigang na Baboy',      'FS1', 'Soup', 'serving', 449, 'kitchen'),
    ('Beef Bulalo',            'FS2', 'Soup', 'serving', 649, 'kitchen'),
    ('Chicken Binakol',        'FS3', 'Soup', 'serving', 449, 'kitchen'),
    -- Rice (FR)
    ('Bagoong Rice',           'FR1', 'Rice', 'serving', 245, 'kitchen'),
    ('Adobo Rice',             'FR2', 'Rice', 'serving', 225, 'kitchen'),
    ('Aligue Rice',            'FR3', 'Rice', 'serving', 245, 'kitchen'),
    ('Garlic Rice',            'FR4', 'Rice', 'serving', 225, 'kitchen'),
    ('Plain Rice',             'FR5', 'Rice', 'serving', 200, 'kitchen'),
    ('Cup of Rice',            'FR6', 'Rice', 'serving',  40, 'kitchen'),
    -- Sharing Bundles (FL)
    ('Inihaw Platter',         'FL1', 'Sharing Bundles', 'serving', 1299, 'kitchen'),
    ('Filipino Favorites',     'FL2', 'Sharing Bundles', 'serving', 1899, 'kitchen'),
    ('Putok Batok',            'FL3', 'Sharing Bundles', 'serving', 2399, 'kitchen'),
    ('Family Bundle',          'FL4', 'Sharing Bundles', 'serving', 2699, 'kitchen'),

    -- ══ BEVERAGES  (prep_station = drinks) ══
    -- Frappes (BF)
    ('Dark Mocha',             'BF1',  'Frappes', 'cup', 190, 'drinks'),
    ('Strawberry',             'BF2',  'Frappes', 'cup', 190, 'drinks'),
    ('Chocolate Chip',         'BF3',  'Frappes', 'cup', 175, 'drinks'),
    ('Java Chip',              'BF4',  'Frappes', 'cup', 190, 'drinks'),
    ('Cookies & Cream',        'BF5',  'Frappes', 'cup', 190, 'drinks'),
    ('Mango Graham',           'BF6',  'Frappes', 'cup', 190, 'drinks'),
    ('Caramel',                'BF7',  'Frappes', 'cup', 175, 'drinks'),
    ('Caramel Toffee',         'BF8',  'Frappes', 'cup', 190, 'drinks'),
    ('Cheesecake',             'BF9',  'Frappes', 'cup', 190, 'drinks'),
    ('Coffee Jelly',           'BF10', 'Frappes', 'cup', 180, 'drinks'),
    ('White Rabbit',           'BF11', 'Frappes', 'cup', 190, 'drinks'),
    ('Blueberry',              'BF12', 'Frappes', 'cup', 175, 'drinks'),
    ('Taro',                   'BF13', 'Frappes', 'cup', 175, 'drinks'),
    -- Premium Lattes (BL)
    ('Roasted Almond',         'BL1', 'Premium Lattes', 'cup', 180, 'drinks'),
    ('Hazelnut Espresso',      'BL2', 'Premium Lattes', 'cup', 175, 'drinks'),
    ('French Vanilla Espresso','BL3', 'Premium Lattes', 'cup', 175, 'drinks'),
    ('Caramel Latte',          'BL4', 'Premium Lattes', 'cup', 175, 'drinks'),
    ('White Chocolate',        'BL5', 'Premium Lattes', 'cup', 175, 'drinks'),
    ('Macadamia Nut',          'BL6', 'Premium Lattes', 'cup', 175, 'drinks'),
    ('English Toffee',         'BL7', 'Premium Lattes', 'cup', 175, 'drinks'),
    -- Iced Coffee & Refreshers (BI)
    ('Ginger Lemonade',        'BI1', 'Iced Coffee & Refreshers', 'cup', 160, 'drinks'),
    ('Honey Lemon Cucumber',   'BI2', 'Iced Coffee & Refreshers', 'cup', 160, 'drinks'),
    ('Dalgona Coffee',         'BI3', 'Iced Coffee & Refreshers', 'cup', 170, 'drinks'),
    ('Caramel Macchiato',      'BI4', 'Iced Coffee & Refreshers', 'cup', 180, 'drinks'),
    ('Iced Americano',         'BI5', 'Iced Coffee & Refreshers', 'cup', 140, 'drinks'),
    ('Sea Salt Caramel',       'BI6', 'Iced Coffee & Refreshers', 'cup', 220, 'drinks'),
    -- Milk Tea (BM)
    ('Dark Chocolate',         'BM1', 'Milk Tea', 'cup', 160, 'drinks'),
    ('Black Forest',           'BM2', 'Milk Tea', 'cup', 155, 'drinks'),
    ('Wintermelon',            'BM3', 'Milk Tea', 'cup', 155, 'drinks'),
    ('Taro Milk Tea',          'BM4', 'Milk Tea', 'cup', 155, 'drinks'),
    ('Okinawa',                'BM5', 'Milk Tea', 'cup', 155, 'drinks'),
    -- Hot Drinks (BH)
    ('Hot Caramel Macchiato',  'BH1', 'Hot Drinks', 'cup', 145, 'drinks'),
    ('Hot French Vanilla',     'BH2', 'Hot Drinks', 'cup', 165, 'drinks'),
    ('Hot Spanish Latte',      'BH3', 'Hot Drinks', 'cup', 125, 'drinks'),
    ('Hot Matcha',             'BH4', 'Hot Drinks', 'cup', 165, 'drinks'),
    ('Hot Chocolate',          'BH5', 'Hot Drinks', 'cup', 155, 'drinks'),
    -- Brewed Coffee (BC)
    ('Almuerzo Blend',         'BC1', 'Brewed Coffee', 'cup', 130, 'drinks'),
    ('Barako Blend',           'BC2', 'Brewed Coffee', 'cup', 120, 'drinks'),
    ('Arabica Blend',          'BC3', 'Brewed Coffee', 'cup', 120, 'drinks'),
    ('Benguet Blend',          'BC4', 'Brewed Coffee', 'cup', 120, 'drinks'),
    ('Kalinga Blend',          'BC5', 'Brewed Coffee', 'cup', 120, 'drinks'),
    ('Espresso Blend',         'BC6', 'Brewed Coffee', 'cup', 130, 'drinks'),
    ('Hazelnut Blend',         'BC7', 'Brewed Coffee', 'cup', 130, 'drinks'),
    ('Turkish Cinnamon',       'BC8', 'Brewed Coffee', 'cup', 135, 'drinks'),
    -- Tea (BT)
    ('Forget Me Nots',         'BT1', 'Tea', 'cup', 109, 'drinks'),
    ('Roselle',                'BT2', 'Tea', 'cup',  99, 'drinks'),
    ('Lavender',               'BT3', 'Tea', 'cup', 109, 'drinks'),
    ('Green Tea',              'BT4', 'Tea', 'cup',  79, 'drinks'),
    ('English Breakfast',      'BT5', 'Tea', 'cup',  79, 'drinks'),
    ('Jasmine Buds',           'BT6', 'Tea', 'cup',  99, 'drinks'),
    ('Genmaicha',              'BT7', 'Tea', 'cup',  89, 'drinks'),
    ('Rose Buds',              'BT8', 'Tea', 'cup', 109, 'drinks'),
    ('Mint Tea',               'BT9', 'Tea', 'cup',  89, 'drinks'),
    -- Matcha (BG)
    ('Dirty Matcha',           'BG1', 'Matcha', 'cup', 190, 'drinks'),
    ('Strawberry Matcha Frappe','BG2','Matcha', 'cup', 190, 'drinks'),
    ('Matcha Milk Tea',        'BG3', 'Matcha', 'cup', 160, 'drinks'),
    ('Iced Matcha',            'BG4', 'Matcha', 'cup', 160, 'drinks'),
    ('Matcha Latte',           'BG5', 'Matcha', 'cup', 190, 'drinks'),
    ('Oreo Matcha Latte',      'BG6', 'Matcha', 'cup', 170, 'drinks'),
    -- Lemon Soda (BS)
    ('Lemon',                  'BS1', 'Lemon Soda', 'cup', 150, 'drinks'),
    ('Lychee',                 'BS2', 'Lemon Soda', 'cup', 150, 'drinks'),
    ('Blueberry Soda',         'BS3', 'Lemon Soda', 'cup', 150, 'drinks'),
    ('Green Apple',            'BS4', 'Lemon Soda', 'cup', 150, 'drinks'),
    ('Passion Fruit',          'BS5', 'Lemon Soda', 'cup', 150, 'drinks'),
    -- Bottled Beer (BB)  -- no prep ticket
    ('Pale Pilsen',            'BB1', 'Bottled Beer', 'bottle', 90,  'none'),
    ('Red Horse 500',          'BB2', 'Bottled Beer', 'bottle', 110, 'none'),
    ('Smirnoff',               'BB3', 'Bottled Beer', 'bottle', 90,  'none'),
    ('San Mig Apple',          'BB4', 'Bottled Beer', 'bottle', 90,  'none'),
    ('San Mig Light',          'BB5', 'Bottled Beer', 'bottle', 90,  'none'),
    -- Beverage Add-ons (BA)  -- drink modifiers, no standalone ticket
    ('Oat Milk',               'BA1', 'Beverage Add-ons', 'add-on', 45, 'none'),
    ('Non-Dairy Milk',         'BA2', 'Beverage Add-ons', 'add-on', 30, 'none'),
    ('Soy Milk',               'BA3', 'Beverage Add-ons', 'add-on', 30, 'none'),
    ('Extra Honey',            'BA4', 'Beverage Add-ons', 'add-on', 20, 'none'),
    ('Lemon Slice',            'BA5', 'Beverage Add-ons', 'add-on', 20, 'none'),
    ('Extra Tea Strength',     'BA6', 'Beverage Add-ons', 'add-on', 50, 'none')
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

  -- ════════════════════════════════════════════════════════════
  --  3  DEACTIVATE the previous catalog (kept for sales history)
  --     Old MTM-<descriptive> seed + original demo-cafe seed prefixes.
  --     Reversible: flip active/for_sale back TRUE to restore.
  -- ════════════════════════════════════════════════════════════
  UPDATE products
     SET active = FALSE, for_sale = FALSE
   WHERE workspace_id = ws
     AND (
       sku LIKE 'MTM-%' OR
       sku LIKE 'COF-%' OR sku LIKE 'BRK-%' OR sku LIKE 'MEA-%' OR
       sku LIKE 'SNK-%' OR sku LIKE 'DRK-%' OR sku LIKE 'DES-%'
     );

  -- OPTIONAL stronger sweep -- uncomment to hide EVERY item that is not part
  -- of this coded menu (e.g. one-off products added manually). Still reversible.
  --   UPDATE products SET active = FALSE, for_sale = FALSE
  --    WHERE workspace_id = ws
  --      AND (sku IS NULL OR sku !~ '^(F[BPZNWGAMSRL]|B[FLIMHCTGSBA])[0-9]+$');

  RAISE NOTICE 'Coded menu seeded: 22 categories, 132 products. Old catalog deactivated.';
END $$;
