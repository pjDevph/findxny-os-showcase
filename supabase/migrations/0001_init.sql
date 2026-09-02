-- =============================================================
-- 0001_init.sql — core schema for all-in-one POS
-- =============================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ---------- enums ----------
create type workspace_role        as enum ('owner','admin','manager','cashier','kitchen');
create type order_type            as enum ('dine_in','takeaway','delivery','booking');
create type order_status          as enum ('draft','pending','preparing','ready','completed','cancelled');
create type booking_status        as enum ('hold','confirmed','cancelled','completed');
create type resource_type         as enum ('room','amenity');
create type kitchen_status        as enum ('new','preparing','ready','completed');
create type payment_provider      as enum ('stripe','cash');
create type payment_intent_status as enum ('pending','succeeded','failed','refunded','cancelled');
create type stock_movement_type   as enum ('in','out','adjustment');
create type transaction_type      as enum ('sale','refund','void');
create type transaction_status    as enum ('completed','voided');

-- ---------- tenancy ----------
create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  currency    text not null default 'USD',
  created_at  timestamptz not null default now()
);

create table branches (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  address      text,
  created_at   timestamptz not null default now()
);
create index on branches(workspace_id);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         workspace_role not null,
  branch_id    uuid references branches(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on workspace_members(user_id);

-- ---------- customers ----------
create table customers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  profile_id   uuid references profiles(id) on delete set null,
  name         text not null,
  phone        text,
  email        text,
  created_at   timestamptz not null default now()
);
create index on customers(workspace_id);
create index on customers(profile_id);

-- ---------- catalog ----------
create table product_categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index on product_categories(workspace_id);

create table products (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  category_id     uuid references product_categories(id) on delete set null,
  name            text not null,
  sku             text,
  price           numeric(12,2) not null check (price >= 0),
  kitchen_required boolean not null default false,
  active          boolean not null default true,
  image_url       text,
  created_at      timestamptz not null default now(),
  unique (workspace_id, sku)
);
create index on products(workspace_id);

create table product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text not null,
  price_delta numeric(12,2) not null default 0
);
create index on product_variants(product_id);

-- ---------- inventory ----------
create table inventory_items (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces(id) on delete cascade,
  branch_id            uuid not null references branches(id) on delete cascade,
  product_id           uuid not null references products(id) on delete cascade,
  quantity             numeric(14,3) not null default 0,
  unit                 text not null default 'pcs',
  low_stock_threshold  numeric(14,3) not null default 0,
  updated_at           timestamptz not null default now(),
  unique (branch_id, product_id)
);
create index on inventory_items(workspace_id);

create table stock_movements (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  branch_id          uuid not null references branches(id) on delete cascade,
  inventory_item_id  uuid not null references inventory_items(id) on delete cascade,
  type               stock_movement_type not null,
  quantity           numeric(14,3) not null,
  reason             text,
  user_id            uuid references auth.users(id),
  created_at         timestamptz not null default now()
);
create index on stock_movements(inventory_item_id);

-- ---------- bookings ----------
create table bookable_resources (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  branch_id    uuid not null references branches(id) on delete cascade,
  type         resource_type not null,
  name         text not null,
  capacity     int not null default 1,
  hourly_rate  numeric(12,2) not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on bookable_resources(workspace_id);

create table bookings (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  branch_id       uuid not null references branches(id) on delete cascade,
  resource_id     uuid not null references bookable_resources(id) on delete restrict,
  customer_id     uuid references customers(id) on delete set null,
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  status          booking_status not null default 'hold',
  hold_expires_at timestamptz,
  total           numeric(12,2) not null default 0,
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  check (end_time > start_time)
);
create index on bookings(workspace_id);
create index on bookings(resource_id, start_time, end_time);

-- prevent overlapping non-cancelled bookings per resource
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status in ('hold','confirmed'));

-- ---------- orders ----------
create sequence order_no_seq;

create table orders (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  branch_id    uuid not null references branches(id) on delete cascade,
  order_no     text not null unique default ('ORD-' || to_char(nextval('order_no_seq'), 'FM000000')),
  customer_id  uuid references customers(id) on delete set null,
  type         order_type not null default 'dine_in',
  status       order_status not null default 'pending',
  subtotal     numeric(12,2) not null default 0,
  tax          numeric(12,2) not null default 0,
  total        numeric(12,2) not null default 0,
  notes        text,
  table_no     text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on orders(workspace_id, status);
create index on orders(branch_id);

create table order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  uuid not null references products(id) on delete restrict,
  variant_id  uuid references product_variants(id) on delete set null,
  quantity    int not null check (quantity > 0),
  unit_price  numeric(12,2) not null,
  total       numeric(12,2) not null,
  notes       text
);
create index on order_items(order_id);

create table order_booking_link (
  order_id   uuid not null references orders(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  primary key (order_id, booking_id)
);

-- ---------- kitchen ----------
create table kitchen_tickets (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  branch_id    uuid not null references branches(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  status       kitchen_status not null default 'new',
  started_at   timestamptz,
  ready_at     timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (order_id)
);
create index on kitchen_tickets(workspace_id, status);

create table kitchen_ticket_items (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references kitchen_tickets(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  status        kitchen_status not null default 'new'
);
create index on kitchen_ticket_items(ticket_id);

-- ---------- payments ----------
create table payment_intents (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references workspaces(id) on delete cascade,
  order_id           uuid references orders(id) on delete set null,
  booking_id         uuid references bookings(id) on delete set null,
  provider           payment_provider not null,
  provider_intent_id text,
  amount             numeric(12,2) not null check (amount >= 0),
  currency           text not null default 'USD',
  status             payment_intent_status not null default 'pending',
  client_secret      text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  check (order_id is not null or booking_id is not null)
);
create index on payment_intents(workspace_id);
create index on payment_intents(provider_intent_id);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  intent_id   uuid not null references payment_intents(id) on delete cascade,
  amount      numeric(12,2) not null,
  method      text not null,
  status      payment_intent_status not null,
  paid_at     timestamptz not null default now()
);
create index on payments(intent_id);

create table refunds (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references payments(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  reason        text,
  status        text not null default 'completed',
  refunded_at   timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);
create index on refunds(payment_id);

-- ---------- transactions / receipts ----------
create sequence transaction_ref_seq;
create sequence receipt_no_seq;

create table transactions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  branch_id       uuid not null references branches(id) on delete cascade,
  type            transaction_type not null,
  reference_table text not null,
  reference_id    uuid not null,
  amount          numeric(12,2) not null,
  status          transaction_status not null default 'completed',
  created_by      uuid references auth.users(id),
  voided_by       uuid references auth.users(id),
  voided_reason   text,
  created_at      timestamptz not null default now()
);
create index on transactions(workspace_id, created_at desc);

create table receipts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  transaction_id  uuid not null references transactions(id) on delete cascade,
  receipt_no      text not null unique default ('RCT-' || to_char(nextval('receipt_no_seq'), 'FM000000')),
  payload         jsonb not null,
  issued_at       timestamptz not null default now()
);
create index on receipts(workspace_id);

-- ---------- audit ----------
create table audit_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id     uuid references auth.users(id),
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index on audit_logs(workspace_id, created_at desc);

-- ---------- helper functions ----------
create or replace function is_workspace_member(p_workspace uuid, p_roles workspace_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = p_workspace
      and user_id = auth.uid()
      and (p_roles is null or role = any(p_roles))
  );
$$;

create or replace function current_user_role(p_workspace uuid)
returns workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select role from workspace_members
   where workspace_id = p_workspace and user_id = auth.uid()
   limit 1;
$$;

-- auto-create profile on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
