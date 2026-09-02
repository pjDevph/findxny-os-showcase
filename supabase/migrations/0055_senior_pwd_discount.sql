-- Migration 0055: Senior/PWD discount flag on orders
-- When true, the 20% senior/PWD discount is applied on the VAT-exclusive subtotal
-- (Philippine law: SC/PWD Discount Act — 20% on net price, VAT-exempt).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_senior_pwd BOOLEAN NOT NULL DEFAULT false;
