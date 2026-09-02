-- Inventory enhancements: barcode on products, expanded movement types,
-- supplier + cost on stock-ins, traceability links from movements back to
-- the order/refund that caused them.

alter type stock_movement_type add value if not exists 'sale';
alter type stock_movement_type add value if not exists 'refund_return';
alter type stock_movement_type add value if not exists 'damage';

alter table products
  add column if not exists barcode text;
create index if not exists products_barcode_idx on products (workspace_id, barcode) where barcode is not null;

alter table stock_movements
  add column if not exists unit_cost  numeric(12,2),
  add column if not exists supplier   text,
  add column if not exists order_id   uuid references orders(id)  on delete set null,
  add column if not exists refund_id  uuid references refunds(id) on delete set null;

create index if not exists stock_movements_order_idx
  on stock_movements (order_id) where order_id is not null;
create index if not exists stock_movements_refund_idx
  on stock_movements (refund_id) where refund_id is not null;
