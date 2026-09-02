-- Add discount support to orders
alter table orders
  add column discount numeric(12,2) not null default 0;
