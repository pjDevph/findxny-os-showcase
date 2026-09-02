-- =============================================================
-- 0088_workspace_receipt_columns_catchup.sql
-- workspaces-update and pos-data (settings-workspace) have referenced these
-- receipt customization columns since they were added to the app, but no
-- migration ever created them — causing "Could not find the 'receipt_logo'
-- column of 'workspaces' in the schema cache" on every Store Profile save.
-- =============================================================

alter table workspaces
  add column if not exists receipt_wifi_ssid    text,
  add column if not exists receipt_wifi_cred    text,
  add column if not exists receipt_promo_line   text,
  add column if not exists receipt_logo         text,
  add column if not exists receipt_order_prefix text;
