-- Migration 0073: refunds table schema catch-up
--
-- The refunds-create Edge Function and admin-data handler both reference columns
-- that were never added to the base schema in 0001_init.sql.  This migration adds
-- the four missing columns with safe IF NOT EXISTS guards and backfills existing rows.
--
-- Missing columns:
--   order_id          — denormalized from payment_intents.order_id (for fast lookup)
--   payment_intent_id — direct FK to payment_intents (admin-data filters by this)
--   currency          — denormalized from payment_intents.currency (display only)
--   created_at        — convention column; base table uses refunded_at instead

-- 1. order_id: denormalized FK to orders (nullable — booking-only refunds have no order)
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);

-- Backfill from payment_intents via the payments join
UPDATE refunds r
SET    order_id = pi.order_id
FROM   payments p
JOIN   payment_intents pi ON pi.id = p.intent_id
WHERE  p.id = r.payment_id
AND    r.order_id IS NULL
AND    pi.order_id IS NOT NULL;

-- 2. payment_intent_id: direct FK to payment_intents
--    admin-data scopes refunds to a workspace by filtering .in("payment_intent_id", piIds).
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_refunds_payment_intent_id ON refunds(payment_intent_id);

-- Backfill from payments
UPDATE refunds r
SET    payment_intent_id = p.intent_id
FROM   payments p
WHERE  p.id = r.payment_id
AND    r.payment_intent_id IS NULL;

-- 3. currency: denormalized from payment_intents.currency (default 'USD' matches workspace default)
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- Backfill from the actual intent currency
UPDATE refunds r
SET    currency = pi.currency
FROM   payments p
JOIN   payment_intents pi ON pi.id = p.intent_id
WHERE  p.id = r.payment_id
AND    r.currency = 'USD'
AND    pi.currency IS NOT NULL;

-- 4. created_at: add alongside the existing refunded_at column.
--    Backfill from refunded_at so date-range queries in admin-data work on historical rows.
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE refunds
SET    created_at = refunded_at
WHERE  created_at IS NULL;

ALTER TABLE refunds
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at DESC);
