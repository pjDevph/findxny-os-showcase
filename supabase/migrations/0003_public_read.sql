-- =============================================================
-- 0003_public_read.sql — public-read policies for the customer site.
-- Idempotent: drop-then-create so re-running is safe.
-- =============================================================

drop policy if exists "workspaces public read by slug" on workspaces;
create policy "workspaces public read by slug" on workspaces
  for select using (true);

drop policy if exists "branches public read" on branches;
create policy "branches public read" on branches
  for select using (true);

drop policy if exists "products public read active" on products;
create policy "products public read active" on products
  for select using (active = true);

drop policy if exists "categories public read" on product_categories;
create policy "categories public read" on product_categories
  for select using (true);

drop policy if exists "variants public read" on product_variants;
create policy "variants public read" on product_variants
  for select using (true);

drop policy if exists "resources public read active" on bookable_resources;
create policy "resources public read active" on bookable_resources
  for select using (active = true);
