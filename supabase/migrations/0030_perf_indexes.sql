-- Performance indexes for the most common query filters.
-- Created in-transaction (Supabase migrations run in a txn, so CONCURRENTLY is not used).
-- "IF NOT EXISTS" makes re-runs safe.

-- orders: workspace scoped list + status filter + recency sort
CREATE INDEX IF NOT EXISTS idx_orders_ws_created
  ON orders (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_ws_status
  ON orders (workspace_id, status);

-- kitchen_tickets: active-queue fetch (not served/completed)
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_ws_status
  ON kitchen_tickets (workspace_id, kitchen_status);

-- inventory_items: per-branch stock list
CREATE INDEX IF NOT EXISTS idx_inventory_items_ws_branch
  ON inventory_items (workspace_id, branch_id);

-- products: active catalog (POS + admin list)
CREATE INDEX IF NOT EXISTS idx_products_ws_active_forsale
  ON products (workspace_id, active, for_sale);

-- bookings: calendar availability window
CREATE INDEX IF NOT EXISTS idx_bookings_resource_times
  ON bookings (resource_id, status, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_bookings_ws_status_start
  ON bookings (workspace_id, status, start_time);

-- audit_logs: workspace audit trail (descending by time)
CREATE INDEX IF NOT EXISTS idx_audit_logs_ws_created
  ON audit_logs (workspace_id, created_at DESC);

-- workspace_members: middleware role lookup
CREATE INDEX IF NOT EXISTS idx_workspace_members_user
  ON workspace_members (user_id);

-- transactions: workspace finance list
CREATE INDEX IF NOT EXISTS idx_transactions_ws_created
  ON transactions (workspace_id, created_at DESC);

-- ingredients: workspace ingredient list (alphabetical)
CREATE INDEX IF NOT EXISTS idx_ingredients_ws_archived
  ON ingredients (workspace_id, archived, name);
