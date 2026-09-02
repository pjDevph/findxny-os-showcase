-- Links an order back to the shift/register that rang it up. Without this,
-- shift-close reports and manager reconciliation have no way to attribute
-- real sales to a specific shift — they were querying nonexistent
-- "pos_orders"/"pos_order_items" tables and always read zero, regardless of
-- how many real orders were completed (see pos-shift/index.ts's
-- handleGetShiftReport, fixed alongside this migration).
alter table orders add column if not exists shift_id uuid references shifts(id) on delete set null;
create index if not exists orders_shift_idx on orders(shift_id);
