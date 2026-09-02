-- 0069_z_reports.sql
-- X/Z end-of-day report records for BIR compliance.
-- X report = read-only snapshot (not saved here, returned only).
-- Z report = closes the day; one per branch per date.

CREATE TABLE IF NOT EXISTS z_reports (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID          NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  branch_id         UUID          NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
  report_no         INTEGER       NOT NULL,          -- sequential per branch (1, 2, 3...)
  report_date       DATE          NOT NULL,
  report_type       TEXT          NOT NULL CHECK (report_type IN ('z')),  -- only Z saved; X is ephemeral

  -- Sales summary
  gross_sales       NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_sales         NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Philippine VAT breakdown
  vatable_sales     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- net_sales / 1.12
  vat_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,   -- vatable * 0.12
  vat_exempt_sales  NUMERIC(12,2) NOT NULL DEFAULT 0,
  zero_rated_sales  NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Voids & refunds
  void_count        INTEGER       NOT NULL DEFAULT 0,
  void_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_count      INTEGER       NOT NULL DEFAULT 0,
  refund_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Payment methods
  payment_breakdown JSONB         NOT NULL DEFAULT '{}',

  -- Order counts
  order_count       INTEGER       NOT NULL DEFAULT 0,
  cancelled_count   INTEGER       NOT NULL DEFAULT 0,

  -- Receipt range
  first_receipt_no  TEXT,
  last_receipt_no   TEXT,

  -- Cash drawer
  opening_float     NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_in           NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_out          NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash     NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Who ran it
  cashier_id        UUID,
  cashier_name      TEXT,
  created_by        UUID          REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Full snapshot for reprint
  payload           JSONB,

  UNIQUE (branch_id, report_date)   -- one Z report per branch per day
);

CREATE INDEX IF NOT EXISTS z_reports_workspace_date_idx ON z_reports (workspace_id, report_date DESC);
CREATE INDEX IF NOT EXISTS z_reports_branch_idx         ON z_reports (branch_id, report_date DESC);

ALTER TABLE z_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "z_reports_select" ON z_reports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = z_reports.workspace_id AND wm.user_id = auth.uid()
  ));

CREATE POLICY "z_reports_insert" ON z_reports FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = z_reports.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner','admin','manager','cashier')
  ));
