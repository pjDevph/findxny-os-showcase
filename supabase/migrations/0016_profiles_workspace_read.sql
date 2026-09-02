-- Allow workspace members to read profiles of other members in the same workspace.
-- Required so the Staff screen can display names/usernames for all staff.
create policy "profiles workspace member read" on profiles
  for select using (
    exists (
      select 1
      from workspace_members wm_subject
      join workspace_members wm_viewer
        on wm_viewer.workspace_id = wm_subject.workspace_id
      where wm_subject.user_id = profiles.id
        and wm_viewer.user_id  = auth.uid()
    )
  );
