-- Migration 0083: Fix voucher_redemptions one-per-customer enforcement.
--
-- Bug: voucher_redemptions_per_customer_idx is UNIQUE(voucher_id, customer_id)
-- WHERE customer_id IS NOT NULL. This unconditionally prevents any customer
-- from ever redeeming the same voucher more than once — even when the voucher
-- has one_per_customer = false. The insert into voucher_redemptions fails
-- silently (caught by a try/catch), while usage_count still increments. Result:
-- usage_count and voucher_redemptions rows diverge.
--
-- Root cause: the unique index enforces one-per-customer globally, but the
-- correct enforcement is only when voucher.one_per_customer = true.
-- Postgres cannot reference another table in a partial index WHERE clause, so
-- this must be enforced at the application layer.
--
-- The application code in orders-create already does this correctly (lines
-- 201-205: checks voucher_redemptions before claim if one_per_customer=true).
--
-- Fix: drop the incorrect unique index, replace with a non-unique lookup index
-- that still supports the efficient application-level check.

DROP INDEX IF EXISTS voucher_redemptions_per_customer_idx;

-- Non-unique index for efficient one_per_customer application queries.
CREATE INDEX IF NOT EXISTS voucher_redemptions_customer_lookup_idx
  ON voucher_redemptions (voucher_id, customer_id)
  WHERE customer_id IS NOT NULL;
