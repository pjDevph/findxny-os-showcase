-- Widen orders.payment_status CHECK to include 'refunded'.
-- Needed so refunds-create can set payment_status = 'refunded' on full refunds.
DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending_counter', 'paid', 'cancelled', 'partially_paid', 'refunded'));
END $$;
