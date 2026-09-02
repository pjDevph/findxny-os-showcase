-- Update the GiST overlap-exclusion constraint to include 'checked_in'
-- (moved from 0067_booking_status_enum_expand.sql — that value can't be
-- used in the same transaction that added it to the enum).
-- checked_out does NOT block (guest has left; room is operationally free).
-- Dropped and recreated because ALTER EXCLUDE is not supported in PostgreSQL.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status IN ('hold', 'confirmed', 'checked_in'));

ALTER TABLE bookable_resources
  ADD COLUMN IF NOT EXISTS turnaround_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (turnaround_minutes >= 0 AND turnaround_minutes <= 480);

COMMENT ON COLUMN bookable_resources.turnaround_minutes IS
  'Buffer time (minutes) required between bookings for cleaning/reset. 0 = no buffer.';
