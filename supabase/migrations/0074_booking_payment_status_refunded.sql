-- Migration 0074: add 'refunded' to bookings.payment_status CHECK constraint
-- Mirrors 0065_order_payment_status_refunded.sql which did the same for orders.
-- Required before bookings-refund edge function can set payment_status = 'refunded'.
DO $$
BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded'));
END $$;

-- Backfill: any booking where amount_paid = 0 AND a refund transaction exists
-- should be marked 'refunded' rather than 'unpaid'.
UPDATE bookings
SET    payment_status = 'refunded'
WHERE  payment_status = 'unpaid'
AND    EXISTS (
  SELECT 1 FROM booking_payment_transactions
  WHERE  booking_id = bookings.id
  AND    type = 'refund'
);
