-- =====================================================================
-- Migration 0038: Allow 'cancelled' on orders.payment_status
-- The 0009 CHECK only permitted ('pending_counter','paid'), but guest
-- order cancellation (public-orders-cancel) and the Xendit invoice-expiry
-- path in payments-webhook both set payment_status = 'cancelled', which
-- the constraint rejected (orders_payment_status_check violation). Widen
-- it to include 'cancelled'. NULL stays valid for digital orders.
-- =====================================================================

DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending_counter', 'paid', 'cancelled'));
END
$$;
