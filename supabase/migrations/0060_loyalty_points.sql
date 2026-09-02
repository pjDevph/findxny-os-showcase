-- Migration 0060: Customer loyalty points
-- loyalty_rules:   workspace-level earn/redeem configuration
-- customer_points: immutable ledger of earn/redeem/adjust events
-- customers.points_balance: denormalized running total for fast lookup

CREATE TABLE IF NOT EXISTS loyalty_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  points_per_peso   NUMERIC(8,4) NOT NULL DEFAULT 1.0,   -- points earned per ₱1 spent
  peso_per_point    NUMERIC(8,4) NOT NULL DEFAULT 0.01,  -- ₱ value per 1 point redeemed
  min_redeem_points INT         NOT NULL DEFAULT 100,
  max_redeem_pct    NUMERIC(5,2) NOT NULL DEFAULT 50.0,  -- max % of order total payable with points
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_points (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id  UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id     UUID        REFERENCES orders(id) ON DELETE SET NULL,
  type         TEXT        NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  points       INT         NOT NULL,          -- positive = earn/adjust, negative = redeem/expire
  balance_after INT        NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS points_balance INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customer_points_customer ON customer_points(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_points_workspace ON customer_points(workspace_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rules_workspace  ON loyalty_rules(workspace_id);

ALTER TABLE loyalty_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_points  ENABLE ROW LEVEL SECURITY;
