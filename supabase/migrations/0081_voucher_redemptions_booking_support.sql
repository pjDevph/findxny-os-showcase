-- Migration 0081: Extend voucher_redemptions to support bookings.
--
-- Originally, voucher_redemptions required order_id (NOT NULL FK to orders).
-- The booking flow needs to record redemptions against bookings instead.
-- This migration makes order_id nullable and adds booking_id so a row can
-- reference either an order OR a booking (but not both and not neither).

ALTER TABLE voucher_redemptions
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE voucher_redemptions
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE;

-- Exactly one of order_id or booking_id must be non-null.
ALTER TABLE voucher_redemptions
  ADD CONSTRAINT voucher_redemptions_one_reference
    CHECK (
      (order_id IS NOT NULL AND booking_id IS NULL) OR
      (order_id IS NULL  AND booking_id IS NOT NULL)
    );

-- One voucher per booking (mirrors voucher_redemptions_order_idx for orders).
CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_booking_unique_idx
  ON voucher_redemptions (workspace_id, booking_id)
  WHERE booking_id IS NOT NULL;
