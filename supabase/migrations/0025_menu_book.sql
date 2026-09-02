-- Menu book: page images + hotspot rectangles, shared across all devices.
-- Previously stored client-side (localStorage + IndexedDB), which meant each
-- device saw its own (or no) book. Now persisted server-side so the admin
-- can configure once on a desktop and customers see it everywhere.

-- ── Storage bucket: menu-book ───────────────────────────────────────────────
-- Public read so the customer menu page can render by URL. Writes restricted
-- to workspace owner/admin/manager.
insert into storage.buckets (id, name, public)
values ('menu-book', 'menu-book', true)
on conflict (id) do nothing;

drop policy if exists "menu_book_read"   on storage.objects;
drop policy if exists "menu_book_write"  on storage.objects;
drop policy if exists "menu_book_update" on storage.objects;
drop policy if exists "menu_book_delete" on storage.objects;

create policy "menu_book_read" on storage.objects
  for select using (bucket_id = 'menu-book');

create policy "menu_book_write" on storage.objects
  for insert with check (
    bucket_id = 'menu-book'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner','admin','manager')
    )
  );

create policy "menu_book_update" on storage.objects
  for update using (
    bucket_id = 'menu-book'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner','admin','manager')
    )
  );

create policy "menu_book_delete" on storage.objects
  for delete using (
    bucket_id = 'menu-book'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner','admin','manager')
    )
  );

-- ── menu_book_pages ────────────────────────────────────────────────────────
create table if not exists public.menu_book_pages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  page_no       int  not null,
  label         text not null,
  file_name     text,
  image_path    text,                              -- key in 'menu-book' bucket
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now(),
  unique (workspace_id, page_no)
);

create index if not exists menu_book_pages_ws_idx
  on public.menu_book_pages (workspace_id, sort_order);

-- ── menu_book_hotspots ─────────────────────────────────────────────────────
create table if not exists public.menu_book_hotspots (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  page_no       int  not null,
  shape         text not null default 'rect',
  x             numeric not null,
  y             numeric not null,
  w             numeric not null,
  h             numeric not null,
  points        jsonb,
  blend_color   text,
  name          text not null,
  price         numeric not null default 0,
  cat           text,
  product_id    uuid references public.products(id) on delete set null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists menu_book_hotspots_ws_page_idx
  on public.menu_book_hotspots (workspace_id, page_no, sort_order);

-- RLS — all access happens through service-role edge functions
-- (public-menu, admin-data, menu-book-upsert). No direct client reads.
alter table public.menu_book_pages    enable row level security;
alter table public.menu_book_hotspots enable row level security;
