-- Migration 0057: Pinned / popular products
-- is_pinned = true floats the product to the top of the POS grid.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_pinned
  ON products(workspace_id, is_pinned) WHERE is_pinned = true;
