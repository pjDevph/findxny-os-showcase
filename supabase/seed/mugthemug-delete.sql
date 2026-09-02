-- =============================================================
--  MUGTHEMUG DELETE  ·  paste into Supabase SQL Editor → Run
--  Removes ALL Mugthemug seeded data in safe dependency order.
--  Run this BEFORE re-seeding with updated prices.
--
--  Updated for the inventory-catalog unification (migrations 0095/0096):
--  `ingredients` is now `inventory_catalog`, `inventory_items.product_id`
--  was dropped (it links to a product only indirectly via catalog_id), and
--  self-stocked products get an auto-created inventory_catalog row (see
--  0095's backfill) that also needs cleaning up.
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- 1. Recipe rows linked to MTM products
  DELETE FROM recipe_items
  WHERE product_id IN (
    SELECT id FROM products WHERE workspace_id = ws AND sku LIKE 'MTM-%'
  );

  -- 2. Inventory rows for MTM products' own self-stock catalog entries
  DELETE FROM inventory_items
  WHERE catalog_id IN (
    SELECT id FROM inventory_catalog
    WHERE product_id IN (
      SELECT id FROM products WHERE workspace_id = ws AND sku LIKE 'MTM-%'
    )
  );

  -- 2b. Self-stock catalog entries for MTM products (product_id-linked rows
  --     auto-created by migration 0095's backfill from the old seed's
  --     inventory_items rows)
  DELETE FROM inventory_catalog
  WHERE product_id IN (
    SELECT id FROM products WHERE workspace_id = ws AND sku LIKE 'MTM-%'
  );

  -- 3. MTM products
  DELETE FROM products WHERE workspace_id = ws AND sku LIKE 'MTM-%';

  -- 4. Seeded raw-material catalog entries (all 141 by name — product_id IS
  --    NULL guards against touching another workspace product's self-stock
  --    row that happens to share a name)
  DELETE FROM inventory_catalog WHERE workspace_id = ws AND product_id IS NULL AND name IN (
    'Espresso Blend Beans','Arabica Blend Beans','Barako Blend Beans',
    'Benguet Blend Beans','Kalinga Blend Beans','Robusta Quezon Beans',
    'Liberica Indonesia Beans','Arabica Mt. Matutum Beans','Excelsa Amadeo Beans',
    'Ground Coffee Filter','Fresh Milk','Oat Milk','Soy Milk','Non-Dairy Milk',
    'Creamer','Whipped Cream','Condensed Milk','Sea Salt Cream',
    'Chocolate Sauce','Caramel Sauce','Sugar Syrup','Honey','Lemon Juice',
    'Blueberry Syrup','Green Apple Syrup','Passion Fruit Syrup','Lychee Syrup',
    'Lemon Syrup','Wintermelon Syrup','Okinawa Syrup','Black Forest Syrup',
    'Roasted Almond Syrup','Hazelnut Syrup','French Vanilla Syrup',
    'Caramel Frappe Syrup','Caramel Toffee Syrup',
    'Matcha Powder','Milk Tea Base Powder','Taro Powder','Dark Chocolate Powder',
    'Frappe Base Powder','Blueberry Frappe Powder','Chocolate Chip Frappe Powder',
    'Cheesecake Frappe Powder','Cookies and Cream Powder','Dark Mocha Powder',
    'White Rabbit Powder','Java Chip Powder','Dalgona Coffee Powder','Cinnamon Powder',
    'Black Tea Leaves','Soda Water','Ice','Mango Puree','Strawberry Puree',
    'Coffee Jelly','Tapioca Pearls','Chocolate Chips','Oreo Crumbs',
    'Cheesecake Bits','Graham Crumbs',
    'Hot Cup','Cold Cup','Cup Lid','Straw','Sealing Film','Napkin',
    'Cucumber','Ginger','Mango','Tomato','Onion','Garlic','Green Chili',
    'String Beans','Eggplant','Pechay','Cabbage','Carrot','Potato',
    'Corn Kernels','Pineapple Tidbits',
    'Rice','Egg','Cooking Oil','Butter','Salt','Black Pepper',
    'Brown Sugar','White Sugar','Flour','Bread Crumbs',
    'Soy Sauce','Vinegar','Fish Sauce','Coconut Milk','Coconut Water',
    'Chicken Stock','Beef Stock','Tamarind Mix','Bagoong','Peanut Sauce',
    'Caldereta Sauce','Tomato Sauce','Mayonnaise','Cheese Sauce','Sour Cream',
    'Truffle Oil','Mozzarella Cheese','Cheddar Cheese','Parmesan Cheese','Blue Cheese',
    'Pizza Dough','Pizza Sauce','Pepperoni','Ham',
    'Bacon','Hungarian Sausage','Nacho Chips','French Fries',
    'Lumpia Wrapper','Tortilla Wrapper','Mashed Potato Mix','Marshmallow Stick',
    'Pancit Canton Noodles','Pancit Bihon Noodles',
    'Pork Belly','Pork Leg','Pork Sisig Meat','Pork BBQ Cut',
    'Chicken Fillet','Chicken BBQ Cut','Beef Tapa','Beef Ribs',
    'Beef Caldereta Cut','Beef Shank','Bangus','Salmon Steak',
    'Squid','Calamari Rings','Shrimp'
  );

  -- 5. Seeded categories
  DELETE FROM product_categories WHERE workspace_id = ws AND name IN (
    'Frappe','Iced Coffee & Latte','Hot Coffee & Chocolate','Milk Tea',
    'Brewed Coffee','Soda & Refreshers','Add-ons','Filipino Mains',
    'Appetizers & Sides','Silog Meals','Noodles','Pizza'
  );

  RAISE NOTICE 'MTM data deleted. Ready for re-seed.';
END $$;
