-- 0062_inventory_sale_deduction.sql
-- 1. Auto-deduct inventory_items when a product with stock_behavior='inventory' is sold.
-- 2. Update product cost recalc trigger to use recipe_items + cost_per_unit (fixes legacy drift from 0008).

-- Ensure stock_behavior column exists (may have been added via SQL editor without a prior migration).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_behavior text NOT NULL DEFAULT 'none';

-- ── Inventory deduction trigger ───────────────────────────────────────────────
-- Fires AFTER INSERT on order_items for products tracked via direct inventory.
-- Mirrors the recipe deduction trigger (trg_deduct_ingredients) but targets
-- inventory_items instead of ingredients.

CREATE OR REPLACE FUNCTION deduct_inventory_on_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _stock_behavior text;
  _branch_id      uuid;
  _workspace_id   uuid;
  _inv_item_id    uuid;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve stock_behavior + branch context from the parent order
  SELECT p.stock_behavior, o.branch_id, o.workspace_id
  INTO   _stock_behavior, _branch_id, _workspace_id
  FROM   products p
  JOIN   orders   o ON o.id = NEW.order_id
  WHERE  p.id = NEW.product_id;

  -- Only act on direct-inventory products
  IF _stock_behavior IS DISTINCT FROM 'inventory' THEN RETURN NEW; END IF;

  -- Find the tracked inventory slot for this product + branch
  SELECT id INTO _inv_item_id
  FROM   inventory_items
  WHERE  product_id = NEW.product_id
    AND  branch_id  = _branch_id;

  -- Not tracked at this branch — skip silently
  IF _inv_item_id IS NULL THEN RETURN NEW; END IF;

  -- Deduct (floor at 0; negative stock is caught by UI badges and fn_can_make_product)
  UPDATE inventory_items
  SET    quantity   = GREATEST(0, quantity - NEW.quantity),
         updated_at = now()
  WHERE  id = _inv_item_id;

  -- Write movement log using the existing 'sale' stock_movement_type (added in 0020)
  INSERT INTO stock_movements (workspace_id, branch_id, inventory_item_id, type, quantity, reason, order_id)
  VALUES (_workspace_id, _branch_id, _inv_item_id,
          'sale', NEW.quantity,
          'order_item:' || NEW.id::text,
          NEW.order_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_inventory_on_order_item ON order_items;
CREATE TRIGGER trg_deduct_inventory_on_order_item
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION deduct_inventory_on_order_item();

-- ── Fix product cost recalculation trigger ────────────────────────────────────
-- Migration 0008 was written before recipe_items and cost_per_unit existed.
-- It still reads product_recipes + price_per_unit, so cost never recalculates
-- when staff save ingredient costs via the current UI.
-- Replace the function + trigger to use recipe_items + cost_per_unit.

CREATE OR REPLACE FUNCTION recalculate_product_costs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE products p
  SET cost = (
    SELECT COALESCE(SUM(ri.qty_used * i.cost_per_unit), 0)
    FROM   recipe_items ri
    JOIN   ingredients  i ON i.id = ri.ingredient_id
    WHERE  ri.product_id = p.id
  )
  WHERE p.id IN (
    SELECT DISTINCT product_id
    FROM   recipe_items
    WHERE  ingredient_id = NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_product_costs ON ingredients;
CREATE TRIGGER trg_recalc_product_costs
  AFTER UPDATE OF cost_per_unit ON ingredients
  FOR EACH ROW EXECUTE FUNCTION recalculate_product_costs();
