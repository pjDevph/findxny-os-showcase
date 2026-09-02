alter table profiles
  add column if not exists staff_pin text;

alter table workspace_members
  add column if not exists is_archived boolean not null default false;

create index if not exists workspace_members_active_idx
  on workspace_members(workspace_id, is_archived);
