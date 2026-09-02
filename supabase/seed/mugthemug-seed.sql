-- =============================================================
--  MUGTHEMUG SEED  ·  paste into Supabase SQL Editor → Run
--  Safe to re-run: uses ON CONFLICT DO NOTHING throughout
--
--  Run mugthemug-delete.sql FIRST if re-seeding over the older menu
--  (this replaces the prior 12-category/92-product menu with an
--  updated 21-category/127-product menu from FINDXNY-Mugthemug-Products.xlsx).
--
--  Import order enforced by this single script:
--    1. product_categories
--    2. products
--
--  No inventory/stock step: under the inventory-catalog unification
--  (migrations 0095/0096) a product only gets a branch inventory_items row
--  via an inventory_catalog entry + recipe_items link, and products.
--  track_inventory defaults to FALSE — so these products are sellable with
--  no stock tracking until ingredients/recipes are set up.
--
--  BEFORE GO-LIVE: this spreadsheet had no recipe/ingredient data
--  (unlike the previous seed's 141 ingredients + 541 recipe_items).
--  Ingredients (inventory_catalog), recipe_items, and real product costs
--  (all seeded as 0 here) need to be added separately via the admin UI.
-- =============================================================

DO $$
DECLARE
  ws UUID;
BEGIN

  -- ── Resolve workspace ──────────────────────────────────────
  ws := '00000000-0000-0000-0000-000000000001';

  RAISE NOTICE 'Seeding workspace %', ws;

  -- ════════════════════════════════════════════════════════════
  --  1  CATEGORIES  (21)
  -- ════════════════════════════════════════════════════════════
  INSERT INTO product_categories (workspace_id, name, sort_order) VALUES
    (ws, 'Frappe',                  1),
    (ws, 'Iced Latte',              2),
    (ws, 'Iced Drinks',             3),
    (ws, 'Milktea',                 4),
    (ws, 'Matcha',                  5),
    (ws, 'Fruity Soda',             6),
    (ws, 'Hot Drinks',              7),
    (ws, 'Hot Coffee',              8),
    (ws, 'Flower & Leaf Tea',       9),
    (ws, 'Add-ons',                 10),
    (ws, 'Breakfast',               11),
    (ws, 'Fried Rice',              12),
    (ws, 'Pancit',                  13),
    (ws, 'Pasta',                   14),
    (ws, 'Pizza',                   15),
    (ws, 'Chicken Wings',           16),
    (ws, 'Smoke & Grill',           17),
    (ws, 'Appetizers',              18),
    (ws, 'Main Course',             19),
    (ws, 'Soups',                   20),
    (ws, 'Sharing Bundles',         21)
  ON CONFLICT DO NOTHING;

  -- ════════════════════════════════════════════════════════════
  --  2  PRODUCTS  (127)
  --     Drinks/Add-ons → kitchen_required = FALSE
  --     Food          → kitchen_required = TRUE
  --
  --     prep_station is the field checkout drink-label printing and the
  --     Products screen's Kitchen/Drinks Prep filters actually read —
  --     kitchen_required alone only drives the admin list's own client-side
  --     display fallback, not printing. Set explicitly here so a fresh
  --     reseed doesn't silently reproduce the "no drink items" checkout bug.
  -- ════════════════════════════════════════════════════════════
  INSERT INTO products
    (workspace_id, category_id, name, sku, price, cost,
     purchase_unit, selling_unit, for_sale, kitchen_required, prep_station, active, featured, is_pinned)
  SELECT
    ws,
    (SELECT id FROM product_categories WHERE workspace_id = ws AND name = v.cat),
    v.pname, v.sku, v.price, 0, v.unit, v.unit, TRUE, v.kitch,
    CASE
      WHEN v.cat IN ('Frappe','Iced Latte','Iced Drinks','Milktea','Matcha','Fruity Soda',
                      'Hot Drinks','Hot Coffee','Flower & Leaf Tea') THEN 'drinks'
      WHEN v.cat IN ('Breakfast','Fried Rice','Pancit','Pasta','Pizza','Chicken Wings',
                      'Smoke & Grill','Appetizers','Main Course','Soups','Sharing Bundles') THEN 'kitchen'
      ELSE 'none'  -- Add-ons: drink modifiers, not a standalone prep ticket
    END,
    TRUE, FALSE, FALSE
  FROM (VALUES
    -- ── Frappe ──
    ('Dark Mocha Frappe', 'MTM-DARK-MOCHA-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Strawberry Frappe', 'MTM-STRAWBERRY-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Chocolate Chip Frappe', 'MTM-CHOCOLATE-CHIP-FRAPPE', 'Frappe', 'cup', FALSE, 175),
    ('Java Chip Frappe', 'MTM-JAVA-CHIP-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Cookies and Cream Frappe', 'MTM-COOKIES-AND-CREAM-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Mango Graham Frappe', 'MTM-MANGO-GRAHAM-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Caramel Frappe', 'MTM-CARAMEL-FRAPPE', 'Frappe', 'cup', FALSE, 175),
    ('Caramel Toffee Frappe', 'MTM-CARAMEL-TOFFEE-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Cheesecake Frappe', 'MTM-CHEESECAKE-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Coffee Jelly Frappe', 'MTM-COFFEE-JELLY-FRAPPE', 'Frappe', 'cup', FALSE, 180),
    ('White Rabbit Frappe', 'MTM-WHITE-RABBIT-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    ('Blueberry Frappe', 'MTM-BLUEBERRY-FRAPPE', 'Frappe', 'cup', FALSE, 175),
    ('Taro Frappe', 'MTM-TARO-FRAPPE', 'Frappe', 'cup', FALSE, 175),
    ('Strawberry Matcha Frappe', 'MTM-STRAWBERRY-MATCHA-FRAPPE', 'Frappe', 'cup', FALSE, 190),
    -- ── Iced Latte ──
    ('Roasted Almond Latte', 'MTM-ROASTED-ALMOND-LATTE', 'Iced Latte', 'cup', FALSE, 180),
    ('Hazelnut Espresso Latte', 'MTM-HAZELNUT-ESPRESSO-LATTE', 'Iced Latte', 'cup', FALSE, 175),
    ('French Vanilla Espresso Latte', 'MTM-FRENCH-VANILLA-ESPRESSO-LATTE', 'Iced Latte', 'cup', FALSE, 175),
    ('Caramel Latte', 'MTM-CARAMEL-LATTE', 'Iced Latte', 'cup', FALSE, 175),
    ('White Chocolate Latte', 'MTM-WHITE-CHOCOLATE-LATTE', 'Iced Latte', 'cup', FALSE, 175),
    ('Macadamia Nut Latte', 'MTM-MACADAMIA-NUT-LATTE', 'Iced Latte', 'cup', FALSE, 175),
    ('English Toffee Latte', 'MTM-ENGLISH-TOFFEE-LATTE', 'Iced Latte', 'cup', FALSE, 175),
    ('Sea Salt Caramel Latte', 'MTM-SEA-SALT-CARAMEL-LATTE', 'Iced Latte', 'cup', FALSE, 220),
    -- ── Iced Drinks ──
    ('Ginger Ale', 'MTM-GINGER-ALE', 'Iced Drinks', 'cup', FALSE, 160),
    ('Honey Lemon Cucumber', 'MTM-HONEY-LEMON-CUCUMBER', 'Iced Drinks', 'cup', FALSE, 160),
    ('Dalgona Coffee', 'MTM-DALGONA-COFFEE', 'Iced Drinks', 'cup', FALSE, 170),
    ('Caramel Macchiato', 'MTM-CARAMEL-MACCHIATO', 'Iced Drinks', 'cup', FALSE, 180),
    ('Iced Amerikano', 'MTM-ICED-AMERIKANO', 'Iced Drinks', 'cup', FALSE, 140),
    -- ── Milktea ──
    ('Dark Chocolate Milktea', 'MTM-DARK-CHOCOLATE-MILKTEA', 'Milktea', 'cup', FALSE, 160),
    ('Black Forest Milktea', 'MTM-BLACK-FOREST-MILKTEA', 'Milktea', 'cup', FALSE, 155),
    ('Wintermelon Milktea', 'MTM-WINTERMELON-MILKTEA', 'Milktea', 'cup', FALSE, 155),
    ('Taro Milktea', 'MTM-TARO-MILKTEA', 'Milktea', 'cup', FALSE, 155),
    ('Okinawa Milktea', 'MTM-OKINAWA-MILKTEA', 'Milktea', 'cup', FALSE, 155),
    ('Matcha Milktea', 'MTM-MATCHA-MILKTEA', 'Milktea', 'cup', FALSE, 160),
    -- ── Matcha ──
    ('Dirty Matcha', 'MTM-DIRTY-MATCHA', 'Matcha', 'cup', FALSE, 190),
    ('Iced Matcha (Water Base)', 'MTM-ICED-MATCHA-WATER-BASE', 'Matcha', 'cup', FALSE, 160),
    ('Matcha Latte (Milk Base)', 'MTM-MATCHA-LATTE-MILK-BASE', 'Matcha', 'cup', FALSE, 190),
    ('Oreo Matcha Latte', 'MTM-OREO-MATCHA-LATTE', 'Matcha', 'cup', FALSE, 170),
    -- ── Fruity Soda ──
    ('Blueberry Soda', 'MTM-BLUEBERRY-SODA', 'Fruity Soda', 'cup', FALSE, 150),
    ('Green Apple Soda', 'MTM-GREEN-APPLE-SODA', 'Fruity Soda', 'cup', FALSE, 150),
    ('Passion Fruit Soda', 'MTM-PASSION-FRUIT-SODA', 'Fruity Soda', 'cup', FALSE, 150),
    ('Lychee Soda', 'MTM-LYCHEE-SODA', 'Fruity Soda', 'cup', FALSE, 150),
    ('Lemon Soda', 'MTM-LEMON-SODA', 'Fruity Soda', 'cup', FALSE, 150),
    -- ── Hot Drinks ──
    ('Hot Caramel Macchiato', 'MTM-HOT-CARAMEL-MACCHIATO', 'Hot Drinks', 'cup', FALSE, 145),
    ('Hot French Vanilla', 'MTM-HOT-FRENCH-VANILLA', 'Hot Drinks', 'cup', FALSE, 165),
    ('Hot Spanish Latte', 'MTM-HOT-SPANISH-LATTE', 'Hot Drinks', 'cup', FALSE, 125),
    ('Hot Matcha', 'MTM-HOT-MATCHA', 'Hot Drinks', 'cup', FALSE, 165),
    ('Hot Chocolate', 'MTM-HOT-CHOCOLATE', 'Hot Drinks', 'cup', FALSE, 155),
    -- ── Hot Coffee ──
    ('Almuerzo Blend', 'MTM-ALMUERZO-BLEND', 'Hot Coffee', 'cup', FALSE, 130),
    ('Barako Blend', 'MTM-BARAKO-BLEND', 'Hot Coffee', 'cup', FALSE, 120),
    ('Arabica Blend', 'MTM-ARABICA-BLEND', 'Hot Coffee', 'cup', FALSE, 120),
    ('Benguet Blend', 'MTM-BENGUET-BLEND', 'Hot Coffee', 'cup', FALSE, 120),
    ('Kalinga Blend', 'MTM-KALINGA-BLEND', 'Hot Coffee', 'cup', FALSE, 120),
    ('Espresso Blend', 'MTM-ESPRESSO-BLEND', 'Hot Coffee', 'cup', FALSE, 130),
    ('Hazelnut Flavor Coffee', 'MTM-HAZELNUT-FLAVOR-COFFEE', 'Hot Coffee', 'cup', FALSE, 130),
    ('Turkish Cinnamon Coffee', 'MTM-TURKISH-CINNAMON-COFFEE', 'Hot Coffee', 'cup', FALSE, 135),
    -- ── Flower & Leaf Tea ──
    ('Forget Me Nots Tea', 'MTM-FORGET-ME-NOTS-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 109),
    ('Roselle Flower Tea', 'MTM-ROSELLE-FLOWER-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 99),
    ('Lavender Flower Tea', 'MTM-LAVENDER-FLOWER-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 109),
    ('Green Tea', 'MTM-GREEN-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 79),
    ('English Breakfast Tea', 'MTM-ENGLISH-BREAKFAST-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 79),
    ('Jasmine Buds Tea', 'MTM-JASMINE-BUDS-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 99),
    ('Genmaicha Green Tea', 'MTM-GENMAICHA-GREEN-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 89),
    ('Rose Buds Tea', 'MTM-ROSE-BUDS-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 109),
    ('Mint Tea', 'MTM-MINT-TEA', 'Flower & Leaf Tea', 'cup', FALSE, 89),
    -- ── Add-ons ──
    ('Oat Milk', 'MTM-OAT-MILK', 'Add-ons', 'add-on', FALSE, 45),
    ('Non Dairy Milk', 'MTM-NON-DAIRY-MILK', 'Add-ons', 'add-on', FALSE, 30),
    ('Soy Milk', 'MTM-SOY-MILK', 'Add-ons', 'add-on', FALSE, 30),
    ('Extra Honey', 'MTM-EXTRA-HONEY', 'Add-ons', 'add-on', FALSE, 20),
    ('Lemon Slice', 'MTM-LEMON-SLICE', 'Add-ons', 'add-on', FALSE, 20),
    ('Extra Tea Strength', 'MTM-EXTRA-TEA-STRENGTH', 'Add-ons', 'add-on', FALSE, 50),
    -- ── Breakfast ──
    ('Boneless Chicksilog', 'MTM-BONELESS-CHICKSILOG', 'Breakfast', 'plate', TRUE, 180),
    ('Tapsilog', 'MTM-TAPSILOG', 'Breakfast', 'plate', TRUE, 190),
    ('Lechon Silog', 'MTM-LECHON-SILOG', 'Breakfast', 'plate', TRUE, 190),
    ('Bangsilog', 'MTM-BANGSILOG', 'Breakfast', 'plate', TRUE, 250),
    ('Hungarian Silog', 'MTM-HUNGARIAN-SILOG', 'Breakfast', 'plate', TRUE, 180),
    -- ── Fried Rice ──
    ('Bagoong Rice', 'MTM-BAGOONG-RICE', 'Fried Rice', 'serving', TRUE, 245),
    ('Adobo Rice', 'MTM-ADOBO-RICE', 'Fried Rice', 'serving', TRUE, 225),
    ('Aligue Rice', 'MTM-ALIGUE-RICE', 'Fried Rice', 'serving', TRUE, 245),
    ('Garlic Rice', 'MTM-GARLIC-RICE', 'Fried Rice', 'serving', TRUE, 225),
    ('Plain Rice', 'MTM-PLAIN-RICE', 'Fried Rice', 'serving', TRUE, 200),
    ('A Cup of Rice', 'MTM-A-CUP-OF-RICE', 'Fried Rice', 'serving', TRUE, 40),
    -- ── Pancit ──
    ('Pancit Canton', 'MTM-PANCIT-CANTON', 'Pancit', 'serving', TRUE, 250),
    ('Pancit Bihon', 'MTM-PANCIT-BIHON', 'Pancit', 'serving', TRUE, 250),
    ('Mixed Pancit', 'MTM-MIXED-PANCIT', 'Pancit', 'serving', TRUE, 300),
    -- ── Pasta ──
    ('Arrabiatta', 'MTM-ARRABIATTA', 'Pasta', 'serving', TRUE, 335),
    ('Carbonara', 'MTM-CARBONARA', 'Pasta', 'serving', TRUE, 335),
    ('Creamy Pesto', 'MTM-CREAMY-PESTO', 'Pasta', 'serving', TRUE, 355),
    ('Aglio Olio', 'MTM-AGLIO-OLIO', 'Pasta', 'serving', TRUE, 320),
    -- ── Pizza ──
    ('Margherita Pizza', 'MTM-MARGHERITA-PIZZA', 'Pizza', 'serving', TRUE, 350),
    ('Pizza Supreme', 'MTM-PIZZA-SUPREME', 'Pizza', 'serving', TRUE, 650),
    ('Quattro Formaggi Pizza', 'MTM-QUATTRO-FORMAGGI-PIZZA', 'Pizza', 'serving', TRUE, 395),
    ('Pepperoni Pizza', 'MTM-PEPPERONI-PIZZA', 'Pizza', 'serving', TRUE, 450),
    ('Hawaiian Pizza', 'MTM-HAWAIIAN-PIZZA', 'Pizza', 'serving', TRUE, 395),
    -- ── Chicken Wings ──
    ('Classic Buffalo Wings (6 pcs)', 'MTM-CLASSIC-BUFFALO-WINGS-6-PCS', 'Chicken Wings', 'serving', TRUE, 230),
    ('Salted Egg Wings (6 pcs)', 'MTM-SALTED-EGG-WINGS-6-PCS', 'Chicken Wings', 'serving', TRUE, 230),
    ('Garlic Parmesan Wings (6 pcs)', 'MTM-GARLIC-PARMESAN-WINGS-6-PCS', 'Chicken Wings', 'serving', TRUE, 230),
    ('Buttered Garlic Wings (6 pcs)', 'MTM-BUTTERED-GARLIC-WINGS-6-PCS', 'Chicken Wings', 'serving', TRUE, 230),
    -- ── Smoke & Grill ──
    ('Pork Barbecue', 'MTM-PORK-BARBECUE', 'Smoke & Grill', 'serving', TRUE, 100),
    ('Chicken Barbecue', 'MTM-CHICKEN-BARBECUE', 'Smoke & Grill', 'serving', TRUE, 100),
    ('Grilled Squid', 'MTM-GRILLED-SQUID', 'Smoke & Grill', 'serving', TRUE, 180),
    ('Bacolod Chicken Inasal', 'MTM-BACOLOD-CHICKEN-INASAL', 'Smoke & Grill', 'serving', TRUE, 180),
    ('Grilled Tuna Panga', 'MTM-GRILLED-TUNA-PANGA', 'Smoke & Grill', 'serving', TRUE, 600),
    ('Grilled Liempo', 'MTM-GRILLED-LIEMPO', 'Smoke & Grill', 'serving', TRUE, 180),
    -- ── Appetizers ──
    ('Cajun Corn', 'MTM-CAJUN-CORN', 'Appetizers', 'serving', TRUE, 139),
    ('Sizzling Sisig', 'MTM-SIZZLING-SISIG', 'Appetizers', 'serving', TRUE, 220),
    ('Kilawin na Liempo', 'MTM-KILAWIN-NA-LIEMPO', 'Appetizers', 'serving', TRUE, 219),
    ('Lumpiang Shanghai', 'MTM-LUMPIANG-SHANGHAI', 'Appetizers', 'serving', TRUE, 179),
    ('Beef Loaded Nachos', 'MTM-BEEF-LOADED-NACHOS', 'Appetizers', 'serving', TRUE, 199),
    ('Ensaladang Mangga', 'MTM-ENSALADANG-MANGGA', 'Appetizers', 'serving', TRUE, 139),
    ('Fried Calamari', 'MTM-FRIED-CALAMARI', 'Appetizers', 'serving', TRUE, 159),
    ('Cheesy Bacon Fries', 'MTM-CHEESY-BACON-FRIES', 'Appetizers', 'serving', TRUE, 189),
    ('Dynamite', 'MTM-DYNAMITE', 'Appetizers', 'serving', TRUE, 149),
    -- ── Main Course ──
    ('Pinyadobo', 'MTM-PINYADOBO', 'Main Course', 'serving', TRUE, 389),
    ('Crispy Binagoongan', 'MTM-CRISPY-BINAGOONGAN', 'Main Course', 'serving', TRUE, 449),
    ('Beef Kaldereta', 'MTM-BEEF-KALDERETA', 'Main Course', 'serving', TRUE, 449),
    ('Crispy Kare Kare', 'MTM-CRISPY-KARE-KARE', 'Main Course', 'serving', TRUE, 499),
    ('Chopsuey', 'MTM-CHOPSUEY', 'Main Course', 'serving', TRUE, 339),
    ('Crispy Bicol Express', 'MTM-CRISPY-BICOL-EXPRESS', 'Main Course', 'serving', TRUE, 449),
    ('Bangus Ala Pobre', 'MTM-BANGUS-ALA-POBRE', 'Main Course', 'serving', TRUE, 339),
    ('Crispy Pata', 'MTM-CRISPY-PATA', 'Main Course', 'serving', TRUE, 799),
    -- ── Soups ──
    ('Sinigang na Baboy', 'MTM-SINIGANG-NA-BABOY', 'Soups', 'serving', TRUE, 449),
    ('Beef Bulalo', 'MTM-BEEF-BULALO', 'Soups', 'serving', TRUE, 649),
    ('Chicken Binakol', 'MTM-CHICKEN-BINAKOL', 'Soups', 'serving', TRUE, 449),
    -- ── Sharing Bundles ──
    ('Inihaw Platter (4-5 pax)', 'MTM-INIHAW-PLATTER-4-5-PAX', 'Sharing Bundles', 'platter', TRUE, 1299),
    ('Filipino Favorites (5-7 pax)', 'MTM-FILIPINO-FAVORITES-5-7-PAX', 'Sharing Bundles', 'platter', TRUE, 1899),
    ('Putok Batok (6-8 pax)', 'MTM-PUTOK-BATOK-6-8-PAX', 'Sharing Bundles', 'platter', TRUE, 2399),
    ('Family Bundle (8-10 pax)', 'MTM-FAMILY-BUNDLE-8-10-PAX', 'Sharing Bundles', 'platter', TRUE, 2699)
  ) AS v(pname, sku, cat, unit, kitch, price)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seed complete. Products are sellable but not stock-tracked (track_inventory=FALSE) until ingredients/recipes are set up.';

END $$;
