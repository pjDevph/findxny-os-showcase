-- Add FK from workspace_members.user_id -> profiles.id so PostgREST can
-- resolve the relationship and allow embedded selects like profiles(full_name, username).
alter table workspace_members
  add constraint workspace_members_profile_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

-- Reload PostgREST schema cache immediately.
notify pgrst, 'reload schema';
