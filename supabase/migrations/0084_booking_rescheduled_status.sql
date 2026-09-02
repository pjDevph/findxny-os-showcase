-- 0084_booking_rescheduled_status.sql
-- Adds 'rescheduled' booking status so the original booking becomes a
-- historical read-only record while the replacement booking stays 'confirmed'.
-- Also adds a forward-link from the original to its replacement.

ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'rescheduled';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rescheduled_to_booking_id uuid REFERENCES bookings(id);

CREATE INDEX IF NOT EXISTS bookings_rescheduled_to_idx
  ON bookings(rescheduled_to_booking_id)
  WHERE rescheduled_to_booking_id IS NOT NULL;
