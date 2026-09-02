-- Migration 0058: Supplier records
-- suppliers: vendor directory per workspace
-- ingredients extended with supplier link, SKU, and reorder levels

CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS supplier_id    UUID        REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_sku   TEXT,
  ADD COLUMN IF NOT EXISTS reorder_point  NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS reorder_qty    NUMERIC(12,3);

CREATE INDEX IF NOT EXISTS idx_suppliers_workspace  ON suppliers(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ingredients_supplier ON ingredients(supplier_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
