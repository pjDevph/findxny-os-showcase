-- =============================================================
--  ROOMS DELETE  ·  paste into Supabase SQL Editor → Run
--  Removes placeholder/test room resources (and any bookings tied
--  to them) so the real Teepee rooms can be seeded cleanly.
--  Run this BEFORE rooms-seed.sql.
--
--  Only touches type = 'room' — amenities are left untouched.
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- 1. Booking-only payment_intents (no order_id) pointing at the
  --    placeholder rooms' bookings. payment_intents.booking_id is
  --    ON DELETE SET NULL, and payment_intents has
  --    check (order_id IS NOT NULL OR booking_id IS NOT NULL) — so a
  --    booking-only intent left in place would get nulled to
  --    (NULL, NULL) by step 2 and trip that check. Deleting these first
  --    (rather than letting the FK null them out) also cascades to any
  --    dependent payments/refunds rows.
  DELETE FROM payment_intents
  WHERE order_id IS NULL
    AND booking_id IN (
      SELECT b.id FROM bookings b
      JOIN bookable_resources r ON r.id = b.resource_id
      WHERE r.workspace_id = ws AND r.type = 'room'
    );

  -- 2. Bookings referencing the placeholder rooms — bookable_resources.id
  --    is ON DELETE RESTRICT from bookings, so these must go first.
  DELETE FROM bookings
  WHERE resource_id IN (
    SELECT id FROM bookable_resources WHERE workspace_id = ws AND type = 'room'
  );

  -- 3. resource_blocks cascades automatically when the resource row is
  --    deleted (ON DELETE CASCADE) — no separate step needed.

  -- 4. The placeholder room resources themselves.
  DELETE FROM bookable_resources WHERE workspace_id = ws AND type = 'room';

  RAISE NOTICE 'Placeholder rooms deleted. Ready to run rooms-seed.sql.';
END $$;
