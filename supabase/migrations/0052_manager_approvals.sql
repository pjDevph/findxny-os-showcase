-- =====================================================================
-- Migration 0049: manager_approvals table
-- Reusable audit trail for any POS action requiring manager sign-off
-- (refund, void order, large discount, cancel paid booking, etc.)
-- =====================================================================

CREATE TABLE IF NOT EXISTS manager_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  action_type     TEXT NOT NULL
    CHECK (action_type IN (
      'refund',
      'void_order',
      'large_discount',
      'manual_price_override',
      'cancel_paid_booking',
      'large_custom_charge',
      'edit_completed_order'
    )),
  target_type     TEXT NOT NULL,   -- 'order' | 'booking' | 'payment' | etc.
  target_id       UUID NOT NULL,
  requested_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reason          TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_manager_approvals_workspace
  ON manager_approvals(workspace_id);

CREATE INDEX IF NOT EXISTS idx_manager_approvals_target
  ON manager_approvals(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_manager_approvals_status
  ON manager_approvals(workspace_id, status);

-- ── Row Level Security ───────────────────────────────────────────────
ALTER TABLE manager_approvals ENABLE ROW LEVEL SECURITY;

-- SELECT: any workspace member can read approvals for their workspace
CREATE POLICY "workspace members can read manager approvals"
  ON manager_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = manager_approvals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager', 'cashier')
    )
  );

-- INSERT: any workspace member (cashier creates the approval request)
CREATE POLICY "workspace members can insert manager approvals"
  ON manager_approvals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = manager_approvals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager', 'cashier')
    )
  );

-- UPDATE: manager / admin / owner only (they approve or reject)
CREATE POLICY "managers can update manager approvals"
  ON manager_approvals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = manager_approvals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = manager_approvals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

-- DELETE: no one is allowed to delete approval records
-- (no policy = implicit deny for DELETE)
