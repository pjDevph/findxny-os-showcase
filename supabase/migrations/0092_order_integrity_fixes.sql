-- 0092_order_integrity_fixes.sql
-- Closes a set of verified order/inventory integrity gaps:
--   1. Deduction triggers now raise on insufficient stock instead of clamping to 0.
--   2. create_pos_order: order + items created in one transaction (atomic, deadlock-safe).
--   3. update_pending_order_items: pending-order item edits reverse-then-replace atomically,
--      instead of the old app-level delete-then-reinsert (which leaked/double-deducted stock).
-- Must be pasted into the Supabase SQL editor.

-- ── 0. kitchen_status enum catch-up ────────────────────────────────────────────
-- pos-kitchen, admin-data, pos-data, and orders-advance all already read/write
-- 'served' as a kitchen_status value, but no committed migration ever added it
-- to the enum (same class of drift as 0087/0088/0090) — add it defensively so
-- the widened cancel guard below (which filters on it) is guaranteed to work
-- regardless of whether a prior manual SQL-editor change already added it.
ALTER TYPE kitchen_status ADD VALUE IF NOT EXISTS 'served';

-- ── 1. Strict floor + row locking on the inventory deduction trigger ──────────
CREATE OR REPLACE FUNCTION deduct_inventory_on_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _stock_behavior text;
  _branch_id      uuid;
  _workspace_id   uuid;
  _inv_item_id    uuid;
  _available      numeric;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.stock_behavior, o.branch_id, o.workspace_id
  INTO   _stock_behavior, _branch_id, _workspace_id
  FROM   products p
  JOIN   orders   o ON o.id = NEW.order_id
  WHERE  p.id = NEW.product_id;

  IF _stock_behavior IS DISTINCT FROM 'inventory' THEN RETURN NEW; END IF;

  SELECT id INTO _inv_item_id
  FROM   inventory_items
  WHERE  product_id = NEW.product_id
    AND  branch_id  = _branch_id;

  -- Not tracked at this branch — skip silently (unchanged from before).
  IF _inv_item_id IS NULL THEN RETURN NEW; END IF;

  -- Lock the row before checking sufficiency — prevents two concurrent
  -- orders from both reading a stale "available" value and both deducting
  -- past zero.
  SELECT quantity INTO _available FROM inventory_items WHERE id = _inv_item_id FOR UPDATE;

  IF _available < NEW.quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: product % has % in stock, order needs %',
      NEW.product_id, _available, NEW.quantity
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE inventory_items
  SET    quantity   = quantity - NEW.quantity,
         updated_at = now()
  WHERE  id = _inv_item_id;

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

-- ── 2. Strict floor + row locking on the ingredient/recipe deduction trigger ──
-- Was a single set-based UPDATE across all of a product's recipe_items;
-- now loops per ingredient so each one can be checked/locked and can reject
-- independently, in a stable (ingredient_id) order to avoid lock inversion
-- within one product's recipe.
CREATE OR REPLACE FUNCTION deduct_ingredients_on_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _workspace_id uuid;
  _rec          record;
  _available    numeric;
  _needed       numeric;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT o.workspace_id INTO _workspace_id
  FROM orders o WHERE o.id = NEW.order_id;

  FOR _rec IN
    SELECT ri.ingredient_id, ri.qty_used
    FROM recipe_items ri
    WHERE ri.product_id = NEW.product_id
    ORDER BY ri.ingredient_id
  LOOP
    _needed := _rec.qty_used * NEW.quantity;

    SELECT stock_qty INTO _available FROM ingredients WHERE id = _rec.ingredient_id FOR UPDATE;

    IF _available < _needed THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: ingredient % has % in stock, order needs %',
        _rec.ingredient_id, _available, _needed
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE ingredients
    SET    stock_qty  = stock_qty - _needed,
           quantity   = quantity - _needed,
           updated_at = now()
    WHERE  id = _rec.ingredient_id;

    INSERT INTO ingredient_movements (workspace_id, ingredient_id, type, quantity, reason)
    VALUES (_workspace_id, _rec.ingredient_id, 'order_deduct', _needed, 'order_item:' || NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

-- (trigger definition unchanged — still AFTER INSERT ON order_items, added in 0029)

-- ── 3. Atomic order creation RPC ───────────────────────────────────────────────
-- Wraps the orders + order_items (+ order_item_addons) insert in one
-- transaction (a single plpgsql call is one transaction), so a strict-floor
-- rejection anywhere in the item loop rolls back the whole order instead of
-- leaving a partially-created one.
--
-- Before inserting any order_items row, acquires every affected
-- inventory_items / ingredients row up front, in a fixed global id order.
-- This matters because the per-row deduction triggers above only ever see
-- one product's rows at a time — two concurrent orders whose carts share
-- ingredients/products in opposite order could otherwise deadlock across
-- different order_items inserts. Locking everything this order needs, in a
-- stable order, before the insert loop closes that.
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
  _ing_ids       uuid[];
BEGIN
  SELECT array_agg(DISTINCT ii.id ORDER BY ii.id) INTO _inv_ids
  FROM   jsonb_array_elements(p_items) it
  JOIN   products p ON p.id = (it->>'product_id')::uuid AND p.stock_behavior = 'inventory'
  JOIN   inventory_items ii ON ii.product_id = p.id AND ii.branch_id = _branch_id;

  IF _inv_ids IS NOT NULL THEN
    PERFORM 1 FROM inventory_items WHERE id = ANY(_inv_ids) ORDER BY id FOR UPDATE;
  END IF;

  SELECT array_agg(DISTINCT ri.ingredient_id ORDER BY ri.ingredient_id) INTO _ing_ids
  FROM   jsonb_array_elements(p_items) it
  JOIN   products p ON p.id = (it->>'product_id')::uuid AND p.stock_behavior = 'recipe'
  JOIN   recipe_items ri ON ri.product_id = p.id;

  IF _ing_ids IS NOT NULL THEN
    PERFORM 1 FROM ingredients WHERE id = ANY(_ing_ids) ORDER BY id FOR UPDATE;
  END IF;

  INSERT INTO orders (
    workspace_id, branch_id, customer_id, cashier_id, type, status,
    subtotal, tax, discount, total, notes, table_no, is_senior_pwd,
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

-- ── 4. Atomic pending-order item replacement RPC ───────────────────────────────
-- Replaces the app-level "delete all order_items, reinsert new set" flow
-- (which never restored stock for the deleted items and could double-deduct
-- on re-insert) with: reverse each existing item's own deduction (skipping
-- any item already reversed elsewhere, e.g. via order-items-cancel), delete,
-- then insert the new set — all inside one transaction, so a strict-floor
-- rejection on the new set rolls back the reversal and delete too, leaving
-- the original order untouched.
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
  _ing_ids       uuid[];
BEGIN
  SELECT workspace_id, branch_id INTO _workspace_id, _branch_id FROM orders WHERE id = p_order_id;
  IF _workspace_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: %', p_order_id;
  END IF;

  -- Lock everything the NEW item set will touch, up front (same
  -- deadlock-avoidance reasoning as create_pos_order).
  SELECT array_agg(DISTINCT ii.id ORDER BY ii.id) INTO _inv_ids
  FROM   jsonb_array_elements(p_items) it
  JOIN   products p ON p.id = (it->>'product_id')::uuid AND p.stock_behavior = 'inventory'
  JOIN   inventory_items ii ON ii.product_id = p.id AND ii.branch_id = _branch_id;

  IF _inv_ids IS NOT NULL THEN
    PERFORM 1 FROM inventory_items WHERE id = ANY(_inv_ids) ORDER BY id FOR UPDATE;
  END IF;

  SELECT array_agg(DISTINCT ri.ingredient_id ORDER BY ri.ingredient_id) INTO _ing_ids
  FROM   jsonb_array_elements(p_items) it
  JOIN   products p ON p.id = (it->>'product_id')::uuid AND p.stock_behavior = 'recipe'
  JOIN   recipe_items ri ON ri.product_id = p.id;

  IF _ing_ids IS NOT NULL THEN
    PERFORM 1 FROM ingredients WHERE id = ANY(_ing_ids) ORDER BY id FOR UPDATE;
  END IF;

  -- Reverse each existing item's deduction, per-item-idempotent so an item
  -- already reversed by order-items-cancel (reason 'order_item_void:<id>')
  -- isn't double-credited here.
  FOR _existing_item IN SELECT id FROM order_items WHERE order_id = p_order_id LOOP
    SELECT EXISTS(
      SELECT 1 FROM ingredient_movements WHERE reason = 'order_item_void:' || _existing_item.id
      UNION ALL
      SELECT 1 FROM stock_movements WHERE reason = 'order_item_void:' || _existing_item.id
    ) INTO _already;
    IF _already THEN CONTINUE; END IF;

    FOR _mv IN
      SELECT ingredient_id, SUM(quantity) AS qty
      FROM   ingredient_movements
      WHERE  reason = 'order_item:' || _existing_item.id AND type = 'order_deduct'
      GROUP BY ingredient_id
    LOOP
      UPDATE ingredients
      SET    stock_qty = stock_qty + _mv.qty, quantity = quantity + _mv.qty, updated_at = now()
      WHERE  id = _mv.ingredient_id;

      INSERT INTO ingredient_movements (workspace_id, ingredient_id, type, quantity, reason)
      VALUES (_workspace_id, _mv.ingredient_id, 'in', _mv.qty, 'order_item_void:' || _existing_item.id);
    END LOOP;

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
