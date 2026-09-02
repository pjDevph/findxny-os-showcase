-- Migration 0008: Auto-recalculate product cost when an ingredient price changes
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
    SELECT DISTINCT product_id
    FROM product_recipes
    WHERE ingredient_id = NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_product_costs ON ingredients;
CREATE TRIGGER trg_recalc_product_costs
  AFTER UPDATE OF price_per_unit ON ingredients
  FOR EACH ROW EXECUTE FUNCTION recalculate_product_costs();
