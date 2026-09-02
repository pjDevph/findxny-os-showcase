-- Server checklist / receipt need to know which floor/seating area to serve
-- a dine-in order to (1st Flr / 2nd Flr / RF Top / Alfresco). No existing
-- column captures this — order_type is the order channel, table_no is just
-- the table number itself — so this adds a dedicated column, following the
-- same catch-up pattern 0006/0113 used to add order_type.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='serve_location') THEN
    ALTER TABLE orders ADD COLUMN serve_location TEXT;
  END IF;
END $$;

-- CREATE OR REPLACE, same signature, only the orders INSERT column list changes.
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
    discount_source, voucher_id, voucher_code, created_by, source,
    ticket_no, payment_status, shift_id, order_type, serve_location
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
    p_order->>'source',
    p_order->>'ticket_no',
    p_order->>'payment_status',
    NULLIF(p_order->>'shift_id', '')::uuid,
    COALESCE(p_order->>'order_type', 'dine_in'),
    NULLIF(p_order->>'serve_location', '')
  )
  RETURNING * INTO _order;

  FOR _item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, product_id, variant_id, quantity, unit_price, total, notes, discount_amount)
    VALUES (
      _order.id,
      (_item->>'product_id')::uuid,
      NULLIF(_item->>'variant_id', '')::uuid,
      (_item->>'quantity')::int,
      (_item->>'unit_price')::numeric,
      (_item->>'total')::numeric,
      _item->>'notes',
      COALESCE((_item->>'discount_amount')::numeric, 0)
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
