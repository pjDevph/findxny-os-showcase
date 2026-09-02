-- =============================================================
--  AMENITIES DELETE  ·  paste into Supabase SQL Editor → Run
--  Removes all amenity resources (and any bookings/payment intents
--  tied to them) for now — no real amenity listing to seed yet.
--
--  Only touches type = 'amenity' — rooms are left untouched.
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- 1. Booking-only payment_intents (no order_id) pointing at amenity
  --    bookings. payment_intents.booking_id is ON DELETE SET NULL, and
  --    payment_intents has
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
      WHERE r.workspace_id = ws AND r.type = 'amenity'
    );

  -- 2. Bookings referencing the amenities — bookable_resources.id is
  --    ON DELETE RESTRICT from bookings, so these must go first.
  DELETE FROM bookings
  WHERE resource_id IN (
    SELECT id FROM bookable_resources WHERE workspace_id = ws AND type = 'amenity'
  );

  -- 3. resource_blocks cascades automatically when the resource row is
  --    deleted (ON DELETE CASCADE) — no separate step needed.

  -- 4. The amenity resources themselves.
  DELETE FROM bookable_resources WHERE workspace_id = ws AND type = 'amenity';

  RAISE NOTICE 'All amenities deleted.';
END $$;
