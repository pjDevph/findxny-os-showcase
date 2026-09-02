-- Per-item discount: cashier can discount a single cart line (e.g. a comped
-- drink) from the item customize modal, instead of only an order-wide
-- discount. Stored as its own column rather than baked into order_items.total
-- so that `total` keeps meaning "unit_price * quantity" everywhere else in the
-- codebase (reports, receipts, order-items-cancel recompute all assume that
-- invariant) — the discounted amount is folded into orders.discount instead
-- (same "manual" bucket the order-level discount already uses), so existing
-- discount reporting/receipt totals pick it up with no further changes.
alter table order_items
  add column if not exists discount_amount numeric(12,2) not null default 0
  check (discount_amount >= 0);
