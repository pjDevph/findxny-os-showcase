-- =============================================================
-- 0090_kitchen_tickets_station_catchup.sql
-- orders-create's maybeCreateKitchenTicket() and every kitchen-display query
-- (handleKitchen, kitchen-update-status, admin-data/pos-data) have referenced
-- kitchen_tickets.station since prep-station routing was added, but no
-- migration ever created the column on this database — causing "Could not
-- find the 'station' column of 'kitchen_tickets' in the schema cache" on
-- every insert. The insert's error is swallowed by the caller, so orders
-- still succeed but silently never get a kitchen ticket, and the Kitchen
-- Display stays empty. Discovered via smoke test against this environment;
-- same class of drift as 0087/0088.
-- =============================================================

alter table kitchen_tickets
  add column if not exists station text not null default 'kitchen';

create index if not exists idx_kitchen_tickets_station on kitchen_tickets(workspace_id, station);
