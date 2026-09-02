-- Featured-on-landing flag for products. Powers the "House Favourites"
-- grid on the public homepage; replaces the hardcoded ₱320/165/180/etc.

alter table products
  add column if not exists featured boolean not null default false,
  add column if not exists featured_tag text,
  add column if not exists featured_blurb text,
  add column if not exists featured_sort integer;

create index if not exists products_featured_idx
  on products (workspace_id, featured, featured_sort)
  where featured = true;
