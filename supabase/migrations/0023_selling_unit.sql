-- Split unit semantics:
--   purchase_unit (existing) = how stock is bought / received / costed
--   selling_unit  (new)      = how the item is sold to customers
-- Both are free-text so the form can offer curated lists or "Custom…".
-- purchase_unit still drives recipe math via units.ts (canonical keys like
-- 'kg', 'g', 'ml', 'l', 'pcs'); free-text values are valid but won't convert.

alter table products
  add column if not exists selling_unit text not null default 'pcs';
