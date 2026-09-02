-- Security fix: remove over-permissive anon "public read" policies that leaked
-- cross-tenant data (any anon key could enumerate all workspaces and read every
-- tenant's products/categories incl. price & cost).
--
-- These were redundant: the customer site reads catalog/room data through the
-- public-* edge functions (service role, scoped by workspace slug), and admins
-- read through member-gated policies. Dropping them does not affect either path.
drop policy if exists "workspaces public read by slug" on workspaces;
drop policy if exists "products public read active"     on products;
drop policy if exists "categories public read"          on product_categories;
