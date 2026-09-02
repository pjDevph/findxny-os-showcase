-- Migration 0080: Assert payment_status CHECK constraints are correctly in place.
--
-- Migrations 0065 and 0074 used DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT inside
-- a DO block. If the DROP succeeded but the ADD failed (e.g. due to an existing row
-- with an invalid value), the column would have been left unconstrained. This migration
-- verifies and re-asserts both constraints safely.
--
-- Safe to re-run: uses IF NOT EXISTS guard pattern via pg_constraint lookup.

DO $$
BEGIN
  -- ── orders.payment_status ───────────────────────────────────────────────────
  -- First, verify no existing rows violate the constraint we are about to add.
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE payment_status NOT IN ('pending_counter','paid','cancelled','partially_paid','refunded')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'Cannot assert orders_payment_status_check: rows with invalid payment_status exist. '
      'Inspect: SELECT DISTINCT payment_status FROM orders WHERE payment_status NOT IN '
      '(''pending_counter'',''paid'',''cancelled'',''partially_paid'',''refunded'');';
  END IF;

  -- Drop and recreate so the constraint is definitely present with the correct definition.
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending_counter','paid','cancelled','partially_paid','refunded'));

  -- ── bookings.payment_status ─────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE payment_status NOT IN ('unpaid','partial','paid','refunded')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'Cannot assert bookings_payment_status_check: rows with invalid payment_status exist. '
      'Inspect: SELECT DISTINCT payment_status FROM bookings WHERE payment_status NOT IN '
      '(''unpaid'',''partial'',''paid'',''refunded'');';
  END IF;

  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
  ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
    CHECK (payment_status IN ('unpaid','partial','paid','refunded'));
END $$;
