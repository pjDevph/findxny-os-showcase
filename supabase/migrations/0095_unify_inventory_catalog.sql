-- 0095_unify_inventory_catalog.sql
--
-- EXPAND step of unifying `ingredients` + `inventory_items` into one inventory
-- catalog, and replacing products.stock_behavior ('none'/'recipe'/'inventory')
-- with a single products.track_inventory toggle + a unified "what does this
-- consume" list. A self-stocked product (today's stock_behavior='inventory',
-- e.g. bottled water) becomes the 1-row case of "consumes 1x itself" in
-- recipe_items — the same mechanism a multi-ingredient recipe already uses.
-- This is what lets a recipe consume another product's own sellable stock
-- (e.g. a combo consuming a canned soda that's also sold standalone), which
-- was impossible before (recipe_items could only ever reference the
-- workspace-wide `ingredients` table, never a product's own branch-scoped
-- inventory_items row).
--
-- Two-level model (unchanged shape, generalized): inventory_catalog stays
-- workspace-scoped ("what it is" — name/unit/cost), inventory_items stays
-- branch-scoped ("how much is here"). recipe_items stays branch-independent,
-- pointing at the catalog (not a specific branch's stock row), exactly like
-- it already pointed at workspace-wide `ingredients` before this migration.
--
-- See 0096_drop_legacy_stock_columns.sql for the CONTRACT step that drops
-- products.stock_behavior/is_ingredient, inventory_items.product_id/unit, and
-- the `ingredients` name entirely, once edge functions no longer read them.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. ingredients -> inventory_catalog (workspace-level "what it is")
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE ingredients RENAME TO inventory_catalog;

-- Defensive: 0007_features.sql's `CREATE TABLE IF NOT EXISTS ingredients`
-- (which defines `category`) silently no-ops on any database where a table
-- named `ingredients` already existed before that migration ran — it only
-- checks the table name, not that its shape matches. Some environments'
-- `ingredients` table predates 0007 and never got `category` as a result.
-- Add it here explicitly so this migration doesn't assume 0007 actually
-- created the column.
ALTER TABLE inventory_catalog
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'food';

ALTER TABLE inventory_catalog
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_catalog_ws_product
  ON inventory_catalog (workspace_id, product_id) WHERE product_id IS NOT NULL;

COMMENT ON TABLE inventory_catalog IS
  'Unified inventory catalog (formerly `ingredients`): one row per stocked thing, '
  'workspace-scoped. product_id is set when this entry represents a products own '
  'resale stock; NULL for pure raw materials. Per-branch stock levels live in '
  'inventory_items, keyed by catalog_id.';

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Backfill: give every product that currently has inventory_items rows
--    (old stock_behavior='inventory') a catalog entry for its own stock.
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO inventory_catalog (workspace_id, product_id, name, category, unit, cost_per_unit, low_stock_threshold)
SELECT DISTINCT ON (ii.product_id)
  p.workspace_id, ii.product_id, p.name, 'food', ii.unit, COALESCE(p.cost, 0), ii.low_stock_threshold
FROM inventory_items ii
JOIN products p ON p.id = ii.product_id
ORDER BY ii.product_id, ii.id
ON CONFLICT (workspace_id, product_id) WHERE product_id IS NOT NULL DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. inventory_items: repurpose from "per-branch stock of THIS product" to
--    "per-branch stock of a catalog entry" (product-linked or raw material).
--    product_id/unit stay in place for now (read by not-yet-updated edge
--    functions) — dropped in the CONTRACT migration.
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS catalog_id uuid REFERENCES inventory_catalog(id) ON DELETE CASCADE;

UPDATE inventory_items ii
SET catalog_id = ic.id
FROM inventory_catalog ic
WHERE ic.product_id = ii.product_id
  AND ii.catalog_id IS NULL;

ALTER TABLE inventory_items ALTER COLUMN catalog_id SET NOT NULL;
-- Needed so we can also insert branch-stock rows for raw materials (no product).
ALTER TABLE inventory_items ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_branch_id_catalog_id_key UNIQUE (branch_id, catalog_id);
-- Old unique(branch_id, product_id) constraint stays in place too (harmless —
-- NULLs never conflict), dropped in the CONTRACT migration alongside product_id.

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Backfill per-branch stock rows for former `ingredients` (product_id IS
--    NULL catalog entries) — they had one workspace-wide stock_qty; assign it
--    to whichever branch already has stock-tracked activity in that
--    workspace, else the workspace's oldest branch. Other branches start at 0
--    (matches how a brand-new tracked product already behaves — no stock
--    until someone stocks it at that branch).
-- ══════════════════════════════════════════════════════════════════════════
WITH target_branch AS (
  SELECT DISTINCT ON (b.workspace_id) b.workspace_id, b.id AS branch_id
  FROM branches b
  ORDER BY b.workspace_id,
    (EXISTS (SELECT 1 FROM inventory_items ii2 WHERE ii2.branch_id = b.id)) DESC,
    b.created_at ASC
)
INSERT INTO inventory_items (workspace_id, branch_id, catalog_id, quantity, low_stock_threshold, updated_at)
SELECT
  ic.workspace_id,
  b.id,
  ic.id,
  CASE WHEN b.id = tb.branch_id THEN ic.stock_qty ELSE 0 END,
  ic.low_stock_threshold,
  now()
FROM inventory_catalog ic
JOIN branches b ON b.workspace_id = ic.workspace_id
LEFT JOIN target_branch tb ON tb.workspace_id = ic.workspace_id
WHERE ic.product_id IS NULL
ON CONFLICT (branch_id, catalog_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. recipe_items: repoint from ingredients-only to the unified catalog. The
--    FK itself keeps working untouched (it already targets the renamed
--    table by OID) — only the column name changes for clarity.
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE recipe_items RENAME COLUMN ingredient_id TO catalog_id;
ALTER INDEX IF EXISTS idx_recipe_items_ingredient RENAME TO idx_recipe_items_catalog;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. products.stock_behavior -> products.track_inventory
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS track_inventory boolean NOT NULL DEFAULT false;

UPDATE products SET track_inventory = true WHERE stock_behavior IN ('inventory', 'recipe');

-- Give every self-stocked product (old stock_behavior='inventory') an
-- explicit "consumes 1x itself" recipe_items row — this used to be implicit
-- (inventory_items keyed straight off product_id); now it's expressed the
-- same way any recipe is.
INSERT INTO recipe_items (workspace_id, product_id, catalog_id, qty_used, section)
SELECT p.workspace_id, p.id, ic.id, 1, 'ingredient'
FROM products p
JOIN inventory_catalog ic ON ic.product_id = p.id
WHERE p.stock_behavior = 'inventory'
ON CONFLICT (product_id, catalog_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. Merged deduction trigger — replaces deduct_inventory_on_order_item() +
--    deduct_ingredients_on_order() with one function driven entirely by
--    recipe_items.
-- ══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_deduct_inventory_on_order_item ON order_items;
DROP TRIGGER IF EXISTS trg_deduct_ingredients ON order_items;
DROP FUNCTION IF EXISTS deduct_inventory_on_order_item();
DROP FUNCTION IF EXISTS deduct_ingredients_on_order();

CREATE OR REPLACE FUNCTION deduct_stock_on_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _track_inventory boolean;
  _branch_id       uuid;
  _workspace_id    uuid;
  _rec             record;
  _available       numeric;
  _needed          numeric;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.track_inventory, o.branch_id, o.workspace_id
  INTO   _track_inventory, _branch_id, _workspace_id
  FROM   products p
  JOIN   orders   o ON o.id = NEW.order_id
  WHERE  p.id = NEW.product_id;

  IF NOT _track_inventory THEN RETURN NEW; END IF;

  -- Not LEFT JOIN: a recipe line with no inventory_items row at this branch
  -- means "not tracked here" and is silently skipped (same as before).
  -- Ordered by the actual inventory_items row id (not catalog_id) to match
  -- create_pos_order's lock-acquisition order below — stays deadlock-safe
  -- even if this ever fires from a path that doesn't pre-lock.
  FOR _rec IN
    SELECT ii.id AS inventory_item_id, ri.qty_used
    FROM   recipe_items    ri
    JOIN   inventory_items ii ON ii.catalog_id = ri.catalog_id AND ii.branch_id = _branch_id
    WHERE  ri.product_id = NEW.product_id
    ORDER BY ii.id
  LOOP
    _needed := _rec.qty_used * NEW.quantity;

    SELECT quantity INTO _available FROM inventory_items WHERE id = _rec.inventory_item_id FOR UPDATE;

    IF _available < _needed THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: inventory item % has % in stock, order needs %',
        _rec.inventory_item_id, _available, _needed
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE inventory_items
    SET    quantity = quantity - _needed, updated_at = now()
    WHERE  id = _rec.inventory_item_id;

    INSERT INTO stock_movements (workspace_id, branch_id, inventory_item_id, type, quantity, reason, order_id)
    VALUES (_workspace_id, _branch_id, _rec.inventory_item_id, 'sale', _needed,
            'order_item:' || NEW.id::text, NEW.order_id);
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_stock_on_order_item
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_order_item();

-- ══════════════════════════════════════════════════════════════════════════
-- 8. create_pos_order: one lock batch instead of two (inventory_items +
--    ingredients used to be disjoint uuid spaces requiring two ordered
--    batches; now everything resolves to inventory_items rows).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_pos_order(p_order jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _order         orders%ROWTYPE;
  _branch_id     uuid := (p_order->>'branch_id')::uuid;
  _item          jsonb;
  _inserted_item order_items%ROWTYPE;
  _items_out     jsonb := '[]'::jsonb;
  _addon         jsonb;
  _inv_ids       uuid[];
BEGIN
  SELECT array_agg(DISTINCT ii.id ORDER BY ii.id) INTO _inv_ids
  FROM   jsonb_array_elements(p_items) it
  JOIN   products        p  ON p.id = (it->>'product_id')::uuid AND p.track_inventory = true
  JOIN   recipe_items    ri ON ri.product_id = p.id
  JOIN   inventory_items ii ON ii.catalog_id = ri.catalog_id AND ii.branch_id = _branch_id;

  IF _inv_ids IS NOT NULL THEN
    PERFORM 1 FROM inventory_items WHERE id = ANY(_inv_ids) ORDER BY id FOR UPDATE;
  END IF;

  INSERT INTO orders (
    workspace_id, branch_id, customer_id, cashier_id, type, status,
    subtotal, tax, service_fee, discount, total, notes, table_no, is_senior_pwd,
    discount_source, voucher_id, voucher_code, created_by, source
  )
  VALUES (
    (p_order->>'workspace_id')::uuid,
    _branch_id,
    NULLIF(p_order->>'customer_id', '')::uuid,
    (p_order->>'cashier_id')::uuid,
    (p_order->>'type')::order_type,
    (p_order->>'status')::order_status,
    (p_order->>'subtotal')::numeric,
    (p_order->>'tax')::numeric,
    COALESCE((p_order->>'service_fee')::numeric, 0),
    (p_order->>'discount')::numeric,
    (p_order->>'total')::numeric,
    p_order->>'notes',
    p_order->>'table_no',
    (p_order->>'is_senior_pwd')::boolean,
    p_order->>'discount_source',
    NULLIF(p_order->>'voucher_id', '')::uuid,
    p_order->>'voucher_code',
    (p_order->>'created_by')::uuid,
    p_order->>'source'
  )
  RETURNING * INTO _order;

  FOR _item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total, notes)
    VALUES (
      _order.id,
      (_item->>'product_id')::uuid,
      NULLIF(_item->>'variant_id', '')::uuid,
      (_item->>'quantity')::int,
      (_item->>'unit_price')::numeric,
      (_item->>'total')::numeric,
      _item->>'notes'
    )
    RETURNING * INTO _inserted_item;

    IF jsonb_array_length(COALESCE(_item->'addons', '[]'::jsonb)) > 0 THEN
      FOR _addon IN SELECT * FROM jsonb_array_elements(_item->'addons')
      LOOP
        INSERT INTO order_item_addons (order_item_id, addon_id, name, price, qty)
        VALUES (
          _inserted_item.id,
          (_addon->>'addon_id')::uuid,
          _addon->>'name',
          (_addon->>'price')::numeric,
          COALESCE((_addon->>'qty')::int, 1)
        );
      END LOOP;
    END IF;

    _items_out := _items_out || to_jsonb(_inserted_item);
  END LOOP;

  RETURN jsonb_build_object('order', to_jsonb(_order), 'items', _items_out);
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. update_pending_order_items: same one-batch lock merge, plus the two
--    reversal loops (ingredient_movements-based + stock_movements-based)
--    merge into one reading stock_movements only. Also tightens the
--    already-reversed check from an exact-string match to LIKE, matching the
--    idempotency-marker convention the TS reversal helpers already use
--    (`order_item_void:<id>:<suffix>`) — the old exact check here predates
--    that suffix convention and would miss reversals done via those helpers.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_pending_order_items(p_order_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _workspace_id  uuid;
  _branch_id     uuid;
  _existing_item record;
  _already       boolean;
  _mv            record;
  _item          jsonb;
  _inserted_item order_items%ROWTYPE;
  _items_out     jsonb := '[]'::jsonb;
  _inv_ids       uuid[];
BEGIN
  SELECT workspace_id, branch_id INTO _workspace_id, _branch_id FROM orders WHERE id = p_order_id;
  IF _workspace_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: %', p_order_id;
  END IF;

  SELECT array_agg(DISTINCT ii.id ORDER BY ii.id) INTO _inv_ids
  FROM   jsonb_array_elements(p_items) it
  JOIN   products        p  ON p.id = (it->>'product_id')::uuid AND p.track_inventory = true
  JOIN   recipe_items    ri ON ri.product_id = p.id
  JOIN   inventory_items ii ON ii.catalog_id = ri.catalog_id AND ii.branch_id = _branch_id;

  IF _inv_ids IS NOT NULL THEN
    PERFORM 1 FROM inventory_items WHERE id = ANY(_inv_ids) ORDER BY id FOR UPDATE;
  END IF;

  FOR _existing_item IN SELECT id FROM order_items WHERE order_id = p_order_id LOOP
    SELECT EXISTS(
      SELECT 1 FROM stock_movements
      WHERE reason LIKE 'order_item_void:' || _existing_item.id || '%'
    ) INTO _already;
    IF _already THEN CONTINUE; END IF;

    FOR _mv IN
      SELECT inventory_item_id, SUM(quantity) AS qty
      FROM   stock_movements
      WHERE  reason = 'order_item:' || _existing_item.id AND type = 'sale'
      GROUP BY inventory_item_id
    LOOP
      UPDATE inventory_items
      SET    quantity = quantity + _mv.qty, updated_at = now()
      WHERE  id = _mv.inventory_item_id;

      INSERT INTO stock_movements (workspace_id, branch_id, inventory_item_id, type, quantity, reason, order_id)
      VALUES (_workspace_id, _branch_id, _mv.inventory_item_id, 'in', _mv.qty,
              'order_item_void:' || _existing_item.id, p_order_id);
    END LOOP;
  END LOOP;

  DELETE FROM order_items WHERE order_id = p_order_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total, notes)
    VALUES (
      p_order_id,
      (_item->>'product_id')::uuid,
      NULLIF(_item->>'variant_id', '')::uuid,
      (_item->>'quantity')::int,
      (_item->>'unit_price')::numeric,
      (_item->>'total')::numeric,
      _item->>'notes'
    )
    RETURNING * INTO _inserted_item;

    _items_out := _items_out || to_jsonb(_inserted_item);
  END LOOP;

  RETURN jsonb_build_object('items', _items_out);
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. Auto-deactivate: correctness fix over a naive merge. A product's
--     "makeable" status must be evaluated PER BRANCH, not summed across
--     branches — summing each ingredient independently across branches would
--     produce false positives (branch A has flour but no sugar, branch B has
--     sugar but no flour: each ingredient sums to "enough" workspace-wide,
--     but no single branch can actually make it). A product is active if
--     makeable at >=1 branch. This also fixes a real existing gap for free:
--     self-stocked products now auto-deactivate at zero stock too (today
--     only recipe products get this).
-- ══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_ingredient_stock_sync ON inventory_catalog;
DROP FUNCTION IF EXISTS fn_can_make_product(uuid);

CREATE OR REPLACE FUNCTION fn_can_make_product(p_product_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_shortfall integer;
BEGIN
  -- A recipe line with no inventory_items row at this branch isn't a
  -- shortfall (not tracked here = unlimited, matching the deduction
  -- trigger's silent-skip semantics) — the INNER JOIN below simply never
  -- surfaces such a line.
  SELECT COUNT(*) INTO v_shortfall
  FROM   recipe_items    ri
  JOIN   inventory_items ii ON ii.catalog_id = ri.catalog_id AND ii.branch_id = p_branch_id
  WHERE  ri.product_id = p_product_id
    AND  ii.quantity < ri.qty_used;

  RETURN v_shortfall = 0;
END;
$$;

CREATE OR REPLACE FUNCTION fn_sync_product_availability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  r              RECORD;
  v_can_make_any BOOLEAN;
  v_active       BOOLEAN;
  v_auto_deact   BOOLEAN;
  v_workspace_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN
    RETURN NEW;
  END IF;

  SELECT workspace_id INTO v_workspace_id FROM inventory_catalog WHERE id = NEW.catalog_id;

  FOR r IN
    SELECT DISTINCT ri.product_id
    FROM   recipe_items ri
    WHERE  ri.catalog_id = NEW.catalog_id
  LOOP
    SELECT active, stock_auto_deactivated
    INTO   v_active, v_auto_deact
    FROM   products
    WHERE  id = r.product_id;

    SELECT EXISTS (
      SELECT 1 FROM branches b
      WHERE  b.workspace_id = v_workspace_id
        AND  fn_can_make_product(r.product_id, b.id)
    ) INTO v_can_make_any;

    IF NOT v_can_make_any AND v_active = TRUE THEN
      UPDATE products
      SET    active = FALSE, stock_auto_deactivated = TRUE, updated_at = NOW()
      WHERE  id = r.product_id;
    ELSIF v_can_make_any AND v_auto_deact = TRUE THEN
      UPDATE products
      SET    active = TRUE, stock_auto_deactivated = FALSE, updated_at = NOW()
      WHERE  id = r.product_id;
    END IF;
    -- Admin-driven manual hide/show (auto_deactivated stays false either way)
    -- is left alone, same as before.
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_sync
  AFTER INSERT OR UPDATE OF quantity ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION fn_sync_product_availability();

-- Initial sync: catch anything already out of stock under the new per-branch
-- policy right now.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id, p.workspace_id
    FROM   products p
    WHERE  p.active = TRUE
      AND  EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.product_id = p.id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM branches b
      WHERE b.workspace_id = r.workspace_id AND fn_can_make_product(r.id, b.id)
    ) THEN
      UPDATE products
      SET    active = FALSE, stock_auto_deactivated = TRUE, updated_at = NOW()
      WHERE  id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. Cost recalculation trigger: repoint at inventory_catalog + catalog_id.
--     Trigger attachment itself survives the ingredients->inventory_catalog
--     rename automatically; only the function body needs the new names.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION recalculate_product_costs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE products p
  SET cost = (
    SELECT COALESCE(SUM(ri.qty_used * ic.cost_per_unit), 0)
    FROM   recipe_items      ri
    JOIN   inventory_catalog ic ON ic.id = ri.catalog_id
    WHERE  ri.product_id = p.id
  )
  WHERE p.id IN (
    SELECT DISTINCT product_id
    FROM   recipe_items
    WHERE  catalog_id = NEW.id
  );
  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 12. Movements: `stock_movements` becomes the one movements log going
--     forward. `ingredient_movements` can't be losslessly re-expressed as
--     stock_movements rows (no per-row inventory_item_id existed for
--     workspace-level ingredient stock) — rename to _legacy and keep it
--     read-only rather than dropping history.
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE ingredient_movements RENAME TO ingredient_movements_legacy;

-- ══════════════════════════════════════════════════════════════════════════
-- 13. Drop product_recipes — confirmed dead, superseded by recipe_items since
--     migration 0029, zero live references in any edge function.
-- ══════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS product_recipes;
