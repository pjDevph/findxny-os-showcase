-- Migration 0054: add manager_approval_id to refunds
-- Links a refund to the manager_approvals record that authorized it.
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS manager_approval_id UUID REFERENCES manager_approvals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_manager_approval
  ON refunds(manager_approval_id);
