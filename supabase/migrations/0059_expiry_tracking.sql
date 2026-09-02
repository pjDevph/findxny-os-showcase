-- Migration 0059: Ingredient expiry + batch tracking
-- Adds expiry_date and batch_number to ingredients for shelf-life management.
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS expiry_date  DATE,
  ADD COLUMN IF NOT EXISTS batch_number TEXT;

CREATE INDEX IF NOT EXISTS idx_ingredients_expiry
  ON ingredients(workspace_id, expiry_date)
  WHERE expiry_date IS NOT NULL;
