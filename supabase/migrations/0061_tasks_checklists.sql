-- Migration 0061: Tasks & Checklists module
-- task_checklists:      named checklists with schedule (daily, shift_open, etc.)
-- checklist_items:      individual to-do items within a checklist
-- checklist_completions: who ticked off which item and when

CREATE TABLE IF NOT EXISTS task_checklists (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id     UUID        REFERENCES branches(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  schedule      TEXT        NOT NULL
    CHECK (schedule IN ('daily', 'weekly', 'monthly', 'once', 'shift_open', 'shift_close')),
  assigned_role TEXT
    CHECK (assigned_role IN ('cashier', 'manager', 'kitchen', 'any')),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID        NOT NULL REFERENCES task_checklists(id) ON DELETE CASCADE,
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_completions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID        NOT NULL REFERENCES task_checklists(id) ON DELETE CASCADE,
  item_id      UUID        NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  completed_by UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shift_id     UUID        REFERENCES shifts(id) ON DELETE SET NULL,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_list   ON checklist_items(checklist_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_completions_list        ON checklist_completions(checklist_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_completions_workspace   ON checklist_completions(workspace_id, completed_at DESC);

ALTER TABLE task_checklists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_completions ENABLE ROW LEVEL SECURITY;
