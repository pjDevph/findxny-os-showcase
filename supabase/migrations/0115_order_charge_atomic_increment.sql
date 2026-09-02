-- orders-add-charge inserts a row into order_charges but never reflects that
-- amount on the parent order — orders.subtotal/total stay items-only forever.
-- The POS client's displayed total (and thus the cash actually collected from
-- the customer, per apps/pos-app/app/pos/order.tsx's chargesTotal) already
-- includes charges, but payments-cash-confirm settles against orders.total
-- read fresh from the DB — so a paid order with a custom charge is marked
-- "fully paid" while under-recording the true total by the charge amount.
-- That gap is invisible in receipts, shift/Z-reports, and refund caps alike.
--
-- A single UPDATE ... SET col = col + n is atomic per-row in Postgres (the
-- row lock serializes concurrent writers), which matters here because
-- order.tsx fires one orders-add-charge call per cart charge concurrently
-- via Promise.all when a cart has more than one custom charge.
CREATE OR REPLACE FUNCTION increment_order_charge_total(p_order_id uuid, p_amount numeric)
RETURNS orders LANGUAGE sql AS $$
  UPDATE orders
  SET subtotal = subtotal + p_amount,
      total    = total + p_amount
  WHERE id = p_order_id
  RETURNING *;
$$;
