-- Catch-up migration: these 4 columns exist on prod's `products` table but were
-- never captured in any migration file (added by hand at some point outside the
-- tracked history) — discovered when replaying migrations on a fresh database
-- for the dev workspace seed, which failed on all four. Defs match prod exactly
-- (information_schema.columns), so this is a no-op there via IF NOT EXISTS.

alter table products
  add column if not exists category text,
  add column if not exists is_ingredient boolean not null default false,
  add column if not exists purchase_unit text not null default 'pcs',
  add column if not exists prep_station text default 'none';
