-- =============================================================
-- 0002_rls.sql — row level security
-- All workspace-scoped tables: read = any member, write = roles below.
-- =============================================================

alter table workspaces           enable row level security;
alter table branches             enable row level security;
alter table profiles             enable row level security;
alter table workspace_members    enable row level security;
alter table customers            enable row level security;
alter table product_categories   enable row level security;
alter table products             enable row level security;
alter table product_variants     enable row level security;
alter table inventory_items      enable row level security;
alter table stock_movements      enable row level security;
alter table bookable_resources   enable row level security;
alter table bookings             enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table order_booking_link   enable row level security;
alter table kitchen_tickets      enable row level security;
alter table kitchen_ticket_items enable row level security;
alter table payment_intents      enable row level security;
alter table payments             enable row level security;
alter table refunds              enable row level security;
alter table transactions         enable row level security;
alter table receipts             enable row level security;
alter table audit_logs           enable row level security;

-- ---------- profiles ----------
create policy "profiles self read"   on profiles for select using (id = auth.uid());
create policy "profiles self update" on profiles for update using (id = auth.uid());

-- ---------- workspaces ----------
create policy "workspaces member read" on workspaces
  for select using (is_workspace_member(id));
create policy "workspaces owner update" on workspaces
  for update using (is_workspace_member(id, array['owner']::workspace_role[]));

-- ---------- workspace_members ----------
create policy "members read own workspaces" on workspace_members
  for select using (user_id = auth.uid() or is_workspace_member(workspace_id));
create policy "members owner/admin manage" on workspace_members
  for all using (is_workspace_member(workspace_id, array['owner','admin']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin']::workspace_role[]));

-- ---------- branches ----------
create policy "branches member read" on branches
  for select using (is_workspace_member(workspace_id));
create policy "branches owner/admin write" on branches
  for all using (is_workspace_member(workspace_id, array['owner','admin']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin']::workspace_role[]));

-- ---------- customers ----------
create policy "customers staff read" on customers
  for select using (is_workspace_member(workspace_id));
create policy "customers staff write" on customers
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]));

-- ---------- catalog ----------
create policy "categories read" on product_categories
  for select using (is_workspace_member(workspace_id));
create policy "categories write" on product_categories
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]));

create policy "products read" on products
  for select using (is_workspace_member(workspace_id));
create policy "products write" on products
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]));

create policy "variants read" on product_variants
  for select using (exists (select 1 from products p
                            where p.id = product_id and is_workspace_member(p.workspace_id)));
create policy "variants write" on product_variants
  for all using (exists (select 1 from products p
                         where p.id = product_id
                           and is_workspace_member(p.workspace_id, array['owner','admin','manager']::workspace_role[])))
         with check (exists (select 1 from products p
                             where p.id = product_id
                               and is_workspace_member(p.workspace_id, array['owner','admin','manager']::workspace_role[])));

-- ---------- inventory ----------
create policy "inventory read" on inventory_items
  for select using (is_workspace_member(workspace_id));
create policy "inventory write" on inventory_items
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]));

create policy "stock read" on stock_movements
  for select using (is_workspace_member(workspace_id));
create policy "stock write via fn" on stock_movements
  for insert with check (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]));

-- ---------- bookings ----------
create policy "resources read" on bookable_resources
  for select using (is_workspace_member(workspace_id) or active = true);
create policy "resources write" on bookable_resources
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]));

create policy "bookings staff read" on bookings
  for select using (is_workspace_member(workspace_id));
create policy "bookings staff write" on bookings
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]));

-- ---------- orders ----------
create policy "orders staff read" on orders
  for select using (is_workspace_member(workspace_id));
create policy "orders staff write" on orders
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]));

create policy "order_items read" on order_items
  for select using (exists (select 1 from orders o
                            where o.id = order_id and is_workspace_member(o.workspace_id)));
create policy "order_items write" on order_items
  for all using (exists (select 1 from orders o
                         where o.id = order_id
                           and is_workspace_member(o.workspace_id, array['owner','admin','manager','cashier']::workspace_role[])))
         with check (exists (select 1 from orders o
                             where o.id = order_id
                               and is_workspace_member(o.workspace_id, array['owner','admin','manager','cashier']::workspace_role[])));

create policy "order_booking_link rw" on order_booking_link
  for all using (exists (select 1 from orders o
                         where o.id = order_id
                           and is_workspace_member(o.workspace_id, array['owner','admin','manager','cashier']::workspace_role[])))
         with check (exists (select 1 from orders o
                             where o.id = order_id
                               and is_workspace_member(o.workspace_id, array['owner','admin','manager','cashier']::workspace_role[])));

-- ---------- kitchen ----------
create policy "kitchen tickets read" on kitchen_tickets
  for select using (is_workspace_member(workspace_id));
create policy "kitchen tickets write" on kitchen_tickets
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager','kitchen']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager','kitchen']::workspace_role[]));

create policy "kitchen items rw" on kitchen_ticket_items
  for all using (exists (select 1 from kitchen_tickets t
                         where t.id = ticket_id
                           and is_workspace_member(t.workspace_id, array['owner','admin','manager','kitchen']::workspace_role[])))
         with check (exists (select 1 from kitchen_tickets t
                             where t.id = ticket_id
                               and is_workspace_member(t.workspace_id, array['owner','admin','manager','kitchen']::workspace_role[])));

-- ---------- payments ----------
create policy "intents read" on payment_intents
  for select using (is_workspace_member(workspace_id));
create policy "intents write" on payment_intents
  for all using (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]))
         with check (is_workspace_member(workspace_id, array['owner','admin','manager','cashier']::workspace_role[]));

create policy "payments read" on payments
  for select using (exists (select 1 from payment_intents pi
                            where pi.id = intent_id and is_workspace_member(pi.workspace_id)));

create policy "refunds read" on refunds
  for select using (exists (select 1 from payments p
                            join payment_intents pi on pi.id = p.intent_id
                            where p.id = payment_id and is_workspace_member(pi.workspace_id)));

-- ---------- transactions / receipts ----------
create policy "transactions read" on transactions
  for select using (is_workspace_member(workspace_id));
create policy "receipts read"     on receipts
  for select using (is_workspace_member(workspace_id));

-- ---------- audit ----------
create policy "audit read owner/admin" on audit_logs
  for select using (is_workspace_member(workspace_id, array['owner','admin']::workspace_role[]));
