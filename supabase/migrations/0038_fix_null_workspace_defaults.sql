-- 0038_fix_null_workspace_defaults.sql
-- 1. Back-fill null workspace columns that were added in 0032/0033/0035 but
--    may not have had defaults applied on existing rows.
-- 2. Add RLS policy so workspace owners can update their workspace directly
--    from server actions (without going through the workspaces-update edge fn).

UPDATE workspaces SET
  maintenance_mode    = COALESCE(maintenance_mode,    false),
  maintenance_message = COALESCE(maintenance_message, ''),
  receipt_address     = COALESCE(receipt_address,     ''),
  receipt_tin         = COALESCE(receipt_tin,         ''),
  receipt_footer      = COALESCE(receipt_footer,      '');

-- Allow workspace owners to update their own workspace row.
DROP POLICY IF EXISTS "workspace owner can update" ON workspaces;
CREATE POLICY "workspace owner can update" ON workspaces
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id      = auth.uid()
        AND workspace_members.role         = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
        AND workspace_members.user_id      = auth.uid()
        AND workspace_members.role         = 'owner'
    )
  );
