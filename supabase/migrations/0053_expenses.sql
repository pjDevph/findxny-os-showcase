-- =====================================================================
-- Migration 0053: Expense tracking tables
-- Adds: expense_categories, expenses
-- =====================================================================

-- ── Expense Categories ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- All workspace members can view categories
CREATE POLICY "workspace members can select expense_categories"
  ON expense_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expense_categories.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Manager+ can create/edit/delete categories
CREATE POLICY "managers can insert expense_categories"
  ON expense_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expense_categories.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "managers can update expense_categories"
  ON expense_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expense_categories.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "managers can delete expense_categories"
  ON expense_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expense_categories.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

-- ── Expenses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
  category_id    UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'gcash', 'maya', 'other')),
  vendor_name    TEXT,
  notes          TEXT,
  expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url    TEXT,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- All workspace members can view and create expenses
CREATE POLICY "workspace members can select expenses"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expenses.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace members can insert expenses"
  ON expenses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expenses.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Manager+ can update and delete expenses
CREATE POLICY "managers can update expenses"
  ON expenses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expenses.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "managers can delete expenses"
  ON expenses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = expenses.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'manager')
    )
  );

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expenses_workspace   ON expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON expenses(branch_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category    ON expenses(category_id);
