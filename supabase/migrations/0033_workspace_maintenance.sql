-- Maintenance mode: when on, the public customer site shows a maintenance
-- notice while staff (workspace members) can still browse. Toggled from the
-- admin Settings page.

alter table workspaces
  add column if not exists maintenance_mode    boolean not null default false,
  add column if not exists maintenance_message text;
