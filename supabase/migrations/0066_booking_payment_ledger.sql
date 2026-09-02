-- =====================================================================
-- Migration 0051: Booking payment ledger
-- 1. Add payment_status + amount_paid columns to bookings (IF NOT EXISTS
--    — safe to run even if 0048 already added payment_status).
-- 2. Create append-only booking_payment_transactions ledger table so
--    every payment event is recorded individually, enabling accurate
--    running totals and full audit trails regardless of booking status.
-- =====================================================================

-- ── 1. Extend bookings ────────────────────────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ── 2. Append-only payment ledger per booking ─────────────────────────
CREATE TABLE IF NOT EXISTS booking_payment_transactions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID          NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  workspace_id  UUID          NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  method        TEXT          NOT NULL,  -- cash, gcash, card, xendit, maya, etc.
  type          TEXT          NOT NULL
    CHECK (type IN ('charge', 'refund')),
  reference     TEXT,                   -- provider ref, invoice ID, or cashier note
  actor_id      UUID,                   -- staff user who collected / processed
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_payment_transactions_booking_id_idx
  ON booking_payment_transactions(booking_id);

CREATE INDEX IF NOT EXISTS booking_payment_transactions_workspace_id_idx
  ON booking_payment_transactions(workspace_id, created_at DESC);

-- Partial unique index: only enforces uniqueness when a reference value is
-- present (Xendit invoice IDs, etc.). NULL references (cash with no ref) are
-- excluded and remain unrestricted.
-- (Moved here from 0064_booking_audit_columns.sql — this table didn't exist yet
-- at that point in migration history.)
create unique index if not exists bpt_booking_reference_unique
  on booking_payment_transactions (booking_id, reference)
  where reference is not null;

-- ── 3. Row Level Security ─────────────────────────────────────────────
ALTER TABLE booking_payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bpt_select" ON booking_payment_transactions;
CREATE POLICY "bpt_select"
  ON booking_payment_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = booking_payment_transactions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bpt_insert" ON booking_payment_transactions;
CREATE POLICY "bpt_insert"
  ON booking_payment_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = booking_payment_transactions.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager', 'cashier')
    )
  );

-- Ledger rows are immutable — no UPDATE or DELETE (append-only).
