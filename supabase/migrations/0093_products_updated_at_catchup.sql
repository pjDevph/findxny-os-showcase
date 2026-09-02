-- Catch-up migration: `products.updated_at` is referenced by fn_sync_product_availability()
-- and the initial-sync block in 0037_stock_auto_deactivate.sql, but no migration in this
-- repo's history ever adds the column — 0001_init.sql only gave `products` a `created_at`.
-- Discovered when replaying migrations 0028+ against production and hitting
-- "column updated_at of relation products does not exist" on 0037's statement 5.

alter table products
  add column if not exists updated_at timestamptz not null default now();
