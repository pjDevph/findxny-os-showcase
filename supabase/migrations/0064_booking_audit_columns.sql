-- Add audit timestamp columns and cancellation_reason to bookings.
-- (The booking_payment_transactions idempotency index that used to live here
-- moved to 0066_booking_payment_ledger.sql, which is where that table is
-- actually created — this migration ran before it existed.)

alter table bookings
  add column if not exists checked_out_at      timestamptz,
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancellation_reason text;
