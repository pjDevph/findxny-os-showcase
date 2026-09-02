-- diff.sql — apply all schema changes without dropping existing data.
-- Safe to run on a live database. Each block is idempotent.
-- Run this ONCE in the Supabase SQL editor.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ingredients table
--    Old columns (from 0007):  cost_per_unit, stock_qty
--    New columns (app expects): price_per_unit, quantity, category
-- ══════════════════════════════════════════════════════════════════════════════

-- Add new columns if missing
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS category       text NOT NULL DEFAULT 'food'
    CHECK (category IN ('food','drink','consumable','operational')),
  ADD COLUMN IF NOT EXISTS price_per_unit numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity       numeric(14,4) NOT NULL DEFAULT 0;

-- Copy existing data from old columns into new columns (if old columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'cost_per_unit'
  ) THEN
    UPDATE ingredients
    SET price_per_unit = cost_per_unit
    WHERE price_per_unit = 0 AND cost_per_unit != 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'stock_qty'
  ) THEN
    UPDATE ingredients
    SET quantity = stock_qty
    WHERE quantity = 0 AND stock_qty != 0;
  END IF;
END $$;

-- Drop old columns (data already migrated above)
ALTER TABLE ingredients
  DROP COLUMN IF EXISTS cost_per_unit,
  DROP COLUMN IF EXISTS stock_qty,
  DROP COLUMN IF EXISTS archived;

-- Ensure unique constraint exists
DO $$ BEGIN
  ALTER TABLE ingredients ADD CONSTRAINT ingredients_workspace_id_name_key UNIQUE (workspace_id, name);
EXCEPTION WHEN duplicate_table THEN NULL;
           WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. product_recipes table  (replaces recipe_items)
--    Migrate any existing recipe_items rows then drop recipe_items.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_recipes (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid          NOT NULL REFERENCES products(id)     ON DELETE CASCADE,
  ingredient_id uuid          NOT NULL REFERENCES ingredients(id)  ON DELETE CASCADE,
  quantity      numeric(14,4) NOT NULL CHECK (quantity > 0),
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_product_recipes_product    ON product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient ON product_recipes(ingredient_id);

ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "recipe_all_admin" ON product_recipes FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM products p
        WHERE  p.id = product_recipes.product_id
          AND  is_workspace_member(p.workspace_id, ARRAY['owner','admin','manager']::workspace_role[])
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "recipe_read_staff" ON product_recipes FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM products p
        WHERE  p.id = product_recipes.product_id
          AND  is_workspace_member(p.workspace_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migrate existing recipe_items rows (ingredient_id only, no sub-recipes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'recipe_items') THEN
    INSERT INTO product_recipes (product_id, ingredient_id, quantity)
    SELECT product_id, ingredient_id, qty_used
    FROM   recipe_items
    WHERE  ingredient_id IS NOT NULL
    ON CONFLICT (product_id, ingredient_id) DO NOTHING;
  END IF;
END $$;

-- Drop old recipe_items table and its triggers
DROP TRIGGER IF EXISTS trg_recalc_product_costs ON ingredients;
DROP TABLE  IF EXISTS recipe_items CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ingredient_movements table (new)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingredient_movements (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid          NOT NULL REFERENCES workspaces(id)   ON DELETE CASCADE,
  ingredient_id uuid          NOT NULL REFERENCES ingredients(id)  ON DELETE CASCADE,
  type          text          NOT NULL CHECK (type IN ('in','out','adjustment','order_deduct')),
  quantity      numeric(14,4) NOT NULL,
  reason        text,
  user_id       uuid REFERENCES auth.users(id),
  created_at    timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingredient_movements_ing  ON ingredient_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_movements_ws   ON ingredient_movements(workspace_id, created_at DESC);

ALTER TABLE ingredient_movements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ingredient_movements member read" ON ingredient_movements
    FOR SELECT USING (is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "ingredient_movements manager write" ON ingredient_movements
    FOR ALL USING (
      is_workspace_member(workspace_id, ARRAY['owner','admin','manager']::workspace_role[])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. cost_items table (Costing screen — from 0013)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cost_items (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category     text         NOT NULL CHECK (category IN ('startup','fixed','variable','marketing','buffer','growth')),
  name         text         NOT NULL,
  amount       numeric(12,2) NOT NULL DEFAULT 0,
  frequency    text         NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('one_time','monthly','per_sale')),
  notes        text,
  sort_order   int          NOT NULL DEFAULT 0,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cost_items_workspace_idx ON cost_items(workspace_id, category);
ALTER TABLE cost_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cost_items workspace member read" ON cost_items
    FOR SELECT USING (is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cost_items owner/admin write" ON cost_items
    FOR ALL USING (
      is_workspace_member(workspace_id, ARRAY['owner','admin','manager']::workspace_role[])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Auto-deduct trigger (per order_item row)
-- ══════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_deduct_ingredients ON orders;
DROP TRIGGER IF EXISTS trg_deduct_ingredients ON order_items;

CREATE OR REPLACE FUNCTION deduct_ingredients_on_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _workspace_id uuid;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT o.workspace_id INTO _workspace_id
  FROM orders o WHERE o.id = NEW.order_id;

  UPDATE ingredients i
  SET
    quantity   = GREATEST(0, i.quantity - (pr.quantity * NEW.quantity)),
    updated_at = now()
  FROM product_recipes pr
  WHERE pr.product_id    = NEW.product_id
    AND pr.ingredient_id = i.id;

  INSERT INTO ingredient_movements (workspace_id, ingredient_id, type, quantity, reason)
  SELECT
    _workspace_id,
    pr.ingredient_id,
    'order_deduct',
    pr.quantity * NEW.quantity,
    'order_item:' || NEW.id
  FROM product_recipes pr
  WHERE pr.product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_ingredients
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION deduct_ingredients_on_order();

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Auto-recalculate product.cost when ingredient price changes
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalculate_product_costs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE products p
  SET cost = (
    SELECT COALESCE(SUM(pr.quantity * i.price_per_unit), 0)
    FROM product_recipes pr
    JOIN ingredients i ON i.id = pr.ingredient_id
    WHERE pr.product_id = p.id
  )
  WHERE p.id IN (
    SELECT DISTINCT product_id FROM product_recipes
    WHERE ingredient_id = NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_product_costs ON ingredients;
CREATE TRIGGER trg_recalc_product_costs
  AFTER UPDATE OF price_per_unit ON ingredients
  FOR EACH ROW EXECUTE FUNCTION recalculate_product_costs();
