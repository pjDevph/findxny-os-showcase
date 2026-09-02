-- 0037_stock_auto_deactivate.sql
-- Auto-deactivate products whose recipe ingredients fall below what's needed for 1 unit.
-- Admin can manually re-activate; the system only auto-restores what it auto-deactivated.

-- 1. Track which products the SYSTEM deactivated (vs admin manual hide)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_auto_deactivated BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Check whether a product can be made (all recipe ingredients have stock_qty >= qty_used)
--    Products with no recipe always return TRUE (nothing to check).
CREATE OR REPLACE FUNCTION fn_can_make_product(p_product_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_shortfall INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_shortfall
  FROM   recipe_items ri
  JOIN   ingredients  ing ON ing.id = ri.ingredient_id
  WHERE  ri.product_id = p_product_id
    AND  ing.stock_qty < ri.qty_used;

  RETURN v_shortfall = 0;
END;
$$;

-- 3. Trigger function: called after any ingredient stock change.
--    Walks every product that uses the changed ingredient and syncs its active flag.
CREATE OR REPLACE FUNCTION fn_sync_product_availability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  r            RECORD;
  v_can_make   BOOLEAN;
  v_active     BOOLEAN;
  v_auto_deact BOOLEAN;
BEGIN
  -- Short-circuit if stock_qty didn't actually change
  IF TG_OP = 'UPDATE'
     AND NEW.stock_qty IS NOT DISTINCT FROM OLD.stock_qty
  THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT DISTINCT ri.product_id
    FROM   recipe_items ri
    WHERE  ri.ingredient_id = NEW.id
  LOOP
    SELECT active, stock_auto_deactivated
    INTO   v_active, v_auto_deact
    FROM   products
    WHERE  id = r.product_id;

    v_can_make := fn_can_make_product(r.product_id);

    IF NOT v_can_make AND v_active = TRUE THEN
      -- Stock just ran out → auto-deactivate and mark the flag
      UPDATE products
      SET    active = FALSE, stock_auto_deactivated = TRUE, updated_at = NOW()
      WHERE  id = r.product_id;

    ELSIF v_can_make AND v_auto_deact = TRUE THEN
      -- Stock replenished → auto-reactivate ONLY what the system deactivated
      UPDATE products
      SET    active = TRUE, stock_auto_deactivated = FALSE, updated_at = NOW()
      WHERE  id = r.product_id;
    END IF;
    -- If admin manually hid it (active=false, auto_deactivated=false): leave it alone.
    -- If admin manually re-activated an out-of-stock product: also leave it alone until next stock change.
  END LOOP;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger to ingredients — fires whenever stock_qty changes
DROP TRIGGER IF EXISTS trg_ingredient_stock_sync ON ingredients;
CREATE TRIGGER trg_ingredient_stock_sync
  AFTER UPDATE OF stock_qty ON ingredients
  FOR EACH ROW EXECUTE FUNCTION fn_sync_product_availability();

-- 5. Initial sync: deactivate products that are already out of stock right now
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id
    FROM   products p
    WHERE  p.active = TRUE
      AND  EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.product_id = p.id)
  LOOP
    IF NOT fn_can_make_product(r.id) THEN
      UPDATE products
      SET    active = FALSE, stock_auto_deactivated = TRUE, updated_at = NOW()
      WHERE  id = r.id;
    END IF;
  END LOOP;
END;
$$;
