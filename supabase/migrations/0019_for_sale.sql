-- Add for_sale flag to products.
-- When false, the item is an internal supply (tracked in inventory, consumed
-- by services) but is NOT shown on the customer-facing menu or POS order screen.
-- Default true preserves existing behaviour for all current products.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS for_sale boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN products.for_sale IS
  'false = internal supply only; item is excluded from POS / public menu.';
