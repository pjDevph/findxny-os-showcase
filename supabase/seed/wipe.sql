-- =====================================================================
-- wipe.sql — Reset demo workspace data for a clean reseed.
-- Preserves: workspaces, branches, workspace_members (logins stay intact).
-- Clears: all transactional data + catalog (products, resources, ingredients).
-- =====================================================================

-- ── 1. Transactional tables (FKs to products/resources — must go first) ──
TRUNCATE TABLE
  audit_logs,
  receipts,
  transactions,
  refunds,
  payments,
  payment_intents,
  kitchen_ticket_items,
  kitchen_tickets,
  order_booking_link,
  order_items,
  orders,
  bookings,
  cash_drawer_events,
  shifts,
  pos_devices,
  customers,
  stock_movements,
  inventory_items
CASCADE;

-- ── 2. Catalog data (scoped to demo workspace, re-seeded next) ──────────
DELETE FROM recipe_items
  WHERE workspace_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM ingredients
  WHERE workspace_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM product_variants
  WHERE product_id IN (
    SELECT id FROM products WHERE workspace_id = '00000000-0000-0000-0000-000000000001'
  );

DELETE FROM products
  WHERE workspace_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM product_categories
  WHERE workspace_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM bookable_resources
  WHERE workspace_id = '00000000-0000-0000-0000-000000000001';

-- workspace, branches, workspace_members intentionally left intact
-- so existing users can still log in after a reset.
