-- Stay status for bookings: when a guest physically checks in.
-- A booking is "checked in" when checked_in_at is set; check-out moves it to
-- status='completed'. Avoids altering the booking_status enum.
alter table bookings
  add column if not exists checked_in_at timestamptz;
