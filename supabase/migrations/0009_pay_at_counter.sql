-- =====================================================================
-- Migration 0009: Pay-at-counter / kiosk ticket flow
-- Adds: ticket_no, payment_status on orders; kiosk ticket sequence
-- =====================================================================

-- ── Global kiosk ticket sequence ─────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS kiosk_ticket_seq
  START  1000
  INCREMENT 1;

-- Helper called from edge functions via rpc()
CREATE OR REPLACE FUNCTION next_kiosk_ticket()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER AS $$
  SELECT 'K-' || nextval('kiosk_ticket_seq')::TEXT;
$$;

-- ── Extend orders ─────────────────────────────────────────────────────
DO $$
BEGIN
  -- Short human-readable ticket number for counter-pay orders (K-1042)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'ticket_no'
  ) THEN
    ALTER TABLE orders ADD COLUMN ticket_no TEXT UNIQUE;
  END IF;

  -- payment_status tracks whether a pending-counter order has been settled
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_status TEXT
      CHECK (payment_status IN ('pending_counter', 'paid'));
  END IF;

  -- source distinguishes how the order was placed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'source'
  ) THEN
    ALTER TABLE orders ADD COLUMN source TEXT
      DEFAULT 'pos'
      CHECK (source IN ('pos', 'kiosk', 'qr', 'web'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_orders_ticket_no
  ON orders(ticket_no) WHERE ticket_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON orders(payment_status) WHERE payment_status IS NOT NULL;
