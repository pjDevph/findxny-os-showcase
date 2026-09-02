-- Migration 0063: Voucher catalog + redemption tracking
-- Paste into Supabase SQL editor if tables do not already exist in live DB.

-- ── Vouchers table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vouchers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  discount_type    TEXT NOT NULL DEFAULT 'fixed'
    CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value   NUMERIC(12,2) NOT NULL,
  max_cap          NUMERIC(12,2),
  min_spend        NUMERIC(12,2) NOT NULL DEFAULT 0,
  usage_limit      INT,
  usage_count      INT NOT NULL DEFAULT 0,
  one_per_customer BOOLEAN NOT NULL DEFAULT false,
  applies_to       TEXT NOT NULL DEFAULT 'order'
    CHECK (applies_to IN ('order', 'food', 'drinks', 'rooms', 'amenities')),
  valid_from       TIMESTAMPTZ,
  valid_until      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'scheduled', 'disabled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One code per workspace (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_workspace_code_idx
  ON vouchers(workspace_id, UPPER(code));

CREATE INDEX IF NOT EXISTS vouchers_workspace_created_idx
  ON vouchers(workspace_id, created_at DESC);

-- ── Redemption history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  voucher_id       UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id      UUID REFERENCES customers(id) ON DELETE SET NULL,
  code_snapshot    TEXT NOT NULL,
  discount_amount  NUMERIC(12,2) NOT NULL,
  order_total      NUMERIC(12,2) NOT NULL,
  redeemed_by      UUID REFERENCES auth.users(id),
  redeemed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One voucher per order
CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_order_idx
  ON voucher_redemptions(order_id);

-- One-per-customer enforcement (partial index — only when customer_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_per_customer_idx
  ON voucher_redemptions(voucher_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS voucher_redemptions_voucher_idx
  ON voucher_redemptions(voucher_id);

CREATE INDEX IF NOT EXISTS voucher_redemptions_workspace_idx
  ON voucher_redemptions(workspace_id, redeemed_at DESC);

-- ── Orders: voucher tracking columns ─────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS voucher_id     UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voucher_code   TEXT,
  ADD COLUMN IF NOT EXISTS discount_source TEXT
    CHECK (discount_source IN ('manual', 'senior_pwd', 'loyalty', 'voucher', 'mixed'));

-- ── Atomic usage claim ───────────────────────────────────────────────────────
-- Row-locks the voucher, checks the limit, then increments usage_count.
-- Called from orders-create after order row is inserted.
CREATE OR REPLACE FUNCTION claim_voucher_usage(
  p_voucher_id   UUID,
  p_workspace_id UUID
) RETURNS TABLE(
  success   BOOLEAN,
  reason    TEXT,
  new_count INT
) LANGUAGE plpgsql AS $$
DECLARE
  v vouchers%ROWTYPE;
BEGIN
  SELECT * INTO v
    FROM vouchers
   WHERE id = p_voucher_id AND workspace_id = p_workspace_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Voucher not found'::TEXT, 0; RETURN;
  END IF;

  IF v.usage_limit IS NOT NULL AND v.usage_count >= v.usage_limit THEN
    RETURN QUERY SELECT false, 'Usage limit reached'::TEXT, v.usage_count; RETURN;
  END IF;

  UPDATE vouchers
     SET usage_count = usage_count + 1, updated_at = now()
   WHERE id = p_voucher_id;

  RETURN QUERY SELECT true, NULL::TEXT, v.usage_count + 1;
END;
$$;
