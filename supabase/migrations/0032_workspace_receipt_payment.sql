-- Per-workspace receipt + payment settings, shared by the web admin and every
-- POS device (previously the POS stored these only in local AsyncStorage, so
-- they never synced across devices or to the web).

alter table workspaces
  add column if not exists receipt_address text,
  add column if not exists receipt_tin     text,
  add column if not exists receipt_footer  text,
  -- { gcashName, gcashNumber, gcashQr, mayaName, mayaNumber, mayaQr, qrphInfo, qrphQr }
  add column if not exists payment_config  jsonb not null default '{}'::jsonb;
