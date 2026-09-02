-- Per-workspace tax and service-charge rates.
-- Stored as decimal fractions (0.12 = 12%). Drives checkout/menu math
-- so values aren't hardcoded in the FE or in edge functions.

alter table workspaces
  add column if not exists tax_rate     numeric(5,4) not null default 0.12,
  add column if not exists service_rate numeric(5,4) not null default 0.10,
  add column if not exists phone        text,
  add column if not exists hold_minutes integer not null default 10,
  add column if not exists slot_minutes integer not null default 120;
