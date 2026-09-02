-- =====================================================================
-- Migration 0049: customers table + extend orders + extend bookings
-- Adds: customers table, order cancellation/partial-payment fields,
--       booking reschedule tracking, customer linkage on orders/bookings
-- =====================================================================

-- ── customers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  notes         TEXT,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members can manage customers"
  ON customers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = customers.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ── Extend orders ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_id') THEN
    ALTER TABLE orders ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cashier_id') THEN
    ALTER TABLE orders ADD COLUMN cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='balance_due') THEN
    ALTER TABLE orders ADD COLUMN balance_due NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cancelled_at') THEN
    ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cancelled_by') THEN
    ALTER TABLE orders ADD COLUMN cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='cancel_reason') THEN
    ALTER TABLE orders ADD COLUMN cancel_reason TEXT;
  END IF;
END
$$;

-- Widen payment_status CHECK to include 'partially_paid'
DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending_counter', 'paid', 'cancelled', 'partially_paid'));
END
$$;

-- ── Extend bookings ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='customer_id') THEN
    ALTER TABLE bookings ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='rescheduled_from_booking_id') THEN
    ALTER TABLE bookings ADD COLUMN rescheduled_from_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='reschedule_count') THEN
    ALTER TABLE bookings ADD COLUMN reschedule_count INT NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_workspace ON customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone     ON customers(workspace_id, phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer   ON bookings(customer_id);
