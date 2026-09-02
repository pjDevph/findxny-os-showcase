-- Add payment_status to bookings so the POS can track whether cash has been collected.
-- Web bookings paid via Xendit will have this set to 'paid' by the webhook.
-- POS cash payments set it via payments-cash-confirm.
-- Default 'unpaid' covers all pre-existing rows.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
