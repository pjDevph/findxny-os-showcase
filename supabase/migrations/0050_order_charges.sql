-- =====================================================================
-- Migration 0050: order_charges + custom_charge_presets tables
-- Adds named custom charges on orders (corkage, delivery, damage, etc.)
-- and workspace-level presets for common charges.
-- =====================================================================

-- ── custom_charge_presets ─────────────────────────────────────────────
-- Workspace-level library of reusable charge templates.
-- Managers/admins/owners can create and manage presets.
-- Any workspace member can read active presets.
CREATE TABLE IF NOT EXISTS custom_charge_presets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id        UUID REFERENCES branches(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  default_amount   NUMERIC(12,2),          -- nullable; cashier can override at apply time
  taxable          BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE custom_charge_presets ENABLE ROW LEVEL SECURITY;

-- Any workspace member can read active (and inactive) presets
CREATE POLICY "workspace members can read charge presets"
  ON custom_charge_presets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = custom_charge_presets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Only manager / admin / owner can create, update, or delete presets
CREATE POLICY "managers can manage charge presets"
  ON custom_charge_presets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = custom_charge_presets.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "managers can update charge presets"
  ON custom_charge_presets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = custom_charge_presets.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "managers can delete charge presets"
  ON custom_charge_presets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = custom_charge_presets.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

-- ── order_charges ─────────────────────────────────────────────────────
-- One row per custom charge applied to an order.
-- preset_id is nullable: charges can be ad-hoc or created from a preset.
CREATE TABLE IF NOT EXISTS order_charges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  taxable        BOOLEAN NOT NULL DEFAULT false,
  preset_id      UUID,                     -- nullable FK to custom_charge_presets(id)
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_charges ENABLE ROW LEVEL SECURITY;

-- Any workspace member can read, insert, or delete charges on their workspace's orders
CREATE POLICY "workspace members can read order charges"
  ON order_charges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = order_charges.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace members can insert order charges"
  ON order_charges FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = order_charges.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace members can delete order charges"
  ON order_charges FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = order_charges.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_order_charges_order      ON order_charges(order_id);
CREATE INDEX IF NOT EXISTS idx_order_charges_workspace  ON order_charges(workspace_id);
CREATE INDEX IF NOT EXISTS idx_charge_presets_workspace ON custom_charge_presets(workspace_id, is_active);
