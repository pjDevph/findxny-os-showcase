-- =============================================================
--  MUGTHEMUG TEARDOWN  ·  paste into Supabase SQL Editor -> Run
--  Wipes sales + catalog for the Mugthemug workspace only, for a fresh
--  dev restart. Run BEFORE re-running mugthemug-coded-seed.sql.
--
--  DESTRUCTIVE & IRREVERSIBLE. Scoped to workspace ...0001 (demo-cafe).
--  Leaves intact: shifts/registers, bookings, customers/loyalty,
--  voucher definitions, and every other workspace.
--
--  Delete order follows the live FK graph (verified 2026-07-19):
--   transactions        -> receipts (CASCADE)
--   payment_intents     -> payments, refunds (CASCADE)
--   orders              -> order_items (-> kitchen_ticket_items,
--                          order_item_addons), kitchen_tickets,
--                          order_charges, order_booking_link,
--                          voucher_redemptions (all CASCADE);
--                          customer_points / stock_movements (SET NULL)
--   products            -> product_variants, product_addon_groups,
--                          recipe_items, inventory_catalog (CASCADE)
--   product_categories  <- products.category_id (SET NULL)
-- =============================================================

DO $$
DECLARE
  ws UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  RAISE NOTICE 'Tearing down workspace %', ws;

  -- ── Sales ledger & payments (order-scoped) ──
  DELETE FROM transactions    WHERE workspace_id = ws;                               -- cascades receipts
  DELETE FROM payment_intents WHERE order_id IN (SELECT id FROM orders WHERE workspace_id = ws); -- cascades payments, refunds
  DELETE FROM refunds         WHERE order_id IN (SELECT id FROM orders WHERE workspace_id = ws);
  DELETE FROM stock_movements WHERE order_id IN (SELECT id FROM orders WHERE workspace_id = ws);

  -- ── Orders (cascades items, tickets, charges, booking links, voucher redemptions) ──
  DELETE FROM orders          WHERE workspace_id = ws;

  -- ── Catalog (cascades variants, addon groups, recipe items, product-linked inventory_catalog) ──
  DELETE FROM products            WHERE workspace_id = ws;
  DELETE FROM product_categories  WHERE workspace_id = ws;

  RAISE NOTICE 'Teardown complete for %', ws;
END $$;
