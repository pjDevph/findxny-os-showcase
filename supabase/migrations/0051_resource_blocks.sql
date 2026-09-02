-- =====================================================================
-- Migration 0051: resource_blocks table
-- Admins can mark a room/resource as unavailable for a date range
-- (maintenance, owner block, cleaning, private event).
-- Checked by booking availability queries to prevent overlapping bookings.
-- =====================================================================

CREATE TABLE IF NOT EXISTS resource_blocks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id     UUID        REFERENCES branches(id) ON DELETE SET NULL,
  resource_id   UUID        NOT NULL REFERENCES bookable_resources(id) ON DELETE CASCADE,
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  block_type    TEXT        NOT NULL
    CHECK (block_type IN ('maintenance', 'owner_block', 'cleaning', 'private_event')),
  reason        TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resource_blocks_date_order CHECK (end_date >= start_date)
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resource_blocks_resource
  ON resource_blocks(resource_id, is_active);

CREATE INDEX IF NOT EXISTS idx_resource_blocks_workspace
  ON resource_blocks(workspace_id);

CREATE INDEX IF NOT EXISTS idx_resource_blocks_dates
  ON resource_blocks(resource_id, start_date, end_date);

-- ── Row Level Security ────────────────────────────────────────────────
ALTER TABLE resource_blocks ENABLE ROW LEVEL SECURITY;

-- SELECT: any workspace member (cashier+) — needed for availability checks
DROP POLICY IF EXISTS "resource_blocks_select" ON resource_blocks;
CREATE POLICY "resource_blocks_select"
  ON resource_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = resource_blocks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager', 'cashier')
    )
  );

-- INSERT: manager/admin/owner only
DROP POLICY IF EXISTS "resource_blocks_insert" ON resource_blocks;
CREATE POLICY "resource_blocks_insert"
  ON resource_blocks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = resource_blocks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

-- UPDATE: manager/admin/owner only
DROP POLICY IF EXISTS "resource_blocks_update" ON resource_blocks;
CREATE POLICY "resource_blocks_update"
  ON resource_blocks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = resource_blocks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

-- DELETE: manager/admin/owner only
DROP POLICY IF EXISTS "resource_blocks_delete" ON resource_blocks;
CREATE POLICY "resource_blocks_delete"
  ON resource_blocks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = resource_blocks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );
