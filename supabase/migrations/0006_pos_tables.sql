-- =====================================================================
-- Migration 0006: POS System tables
-- Adds: shifts, cash_drawer_events, pos_devices, kitchen ticket status enum
-- =====================================================================

-- ── POS Devices ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  device_type   TEXT NOT NULL DEFAULT 'tablet',  -- tablet | mobile | desktop
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pos_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members can manage devices"
  ON pos_devices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = pos_devices.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner','admin','manager','cashier')
    )
  );

-- ── Shifts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  device_id       UUID REFERENCES pos_devices(id) ON DELETE SET NULL,
  cashier_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cashier_name    TEXT NOT NULL,
  opening_float   NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_float   NUMERIC(12,2),
  expected_float  NUMERIC(12,2),
  variance        NUMERIC(12,2),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'open'  -- open | closed
    CHECK (status IN ('open','closed')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_workspace   ON shifts(workspace_id);
CREATE INDEX idx_shifts_status      ON shifts(status);
CREATE INDEX idx_shifts_opened_at   ON shifts(opened_at);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members can manage shifts"
  ON shifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = shifts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ── Cash Drawer Events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_drawer_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shift_id      UUID REFERENCES shifts(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  type          TEXT NOT NULL
    CHECK (type IN ('opening_float','sale','refund','cash_in','cash_out','closing_count')),
  amount        NUMERIC(12,2) NOT NULL,
  reason        TEXT,
  reference_id  UUID,  -- order_id or payment_id
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_events_workspace ON cash_drawer_events(workspace_id);
CREATE INDEX idx_cash_events_shift     ON cash_drawer_events(shift_id);
CREATE INDEX idx_cash_events_type      ON cash_drawer_events(type);

ALTER TABLE cash_drawer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members can manage cash events"
  ON cash_drawer_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = cash_drawer_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ── Extend kitchen_tickets ───────────────────────────────────────────
-- Add timing columns if they don't exist yet
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kitchen_tickets' AND column_name='accepted_at') THEN
    ALTER TABLE kitchen_tickets ADD COLUMN accepted_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kitchen_tickets' AND column_name='started_at') THEN
    ALTER TABLE kitchen_tickets ADD COLUMN started_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kitchen_tickets' AND column_name='ready_at') THEN
    ALTER TABLE kitchen_tickets ADD COLUMN ready_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kitchen_tickets' AND column_name='served_at') THEN
    ALTER TABLE kitchen_tickets ADD COLUMN served_at TIMESTAMPTZ;
  END IF;
  -- kitchen_status mirrors status but only for kitchen workflow
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kitchen_tickets' AND column_name='kitchen_status') THEN
    ALTER TABLE kitchen_tickets ADD COLUMN kitchen_status TEXT
      DEFAULT 'new'
      CHECK (kitchen_status IN ('new','accepted','preparing','ready','served','completed'));
  END IF;
END
$$;

-- ── QR table tracking ────────────────────────────────────────────────
-- Add qr_code column to orders if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='qr_table') THEN
    ALTER TABLE orders ADD COLUMN qr_table TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='order_type') THEN
    ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'dine_in'
      CHECK (order_type IN ('dine_in','takeout','room_service','walk_in','qr_order','delivery'));
  END IF;
END
$$;

-- ── Indexes for common POS queries ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_kitchen_status ON kitchen_tickets(kitchen_status);
