-- 0070_vouchers_rls.sql
-- Enable RLS on vouchers + voucher_redemptions.
-- Uses existing is_workspace_member() from 0001_init.sql.
-- Edge functions use adminClient (service role) so they are unaffected.

begin;

-- ── revoke anon access ────────────────────────────────────────────────────────
revoke all on table public.vouchers             from anon;
revoke all on table public.voucher_redemptions  from anon;

-- ── enable RLS ───────────────────────────────────────────────────────────────
alter table public.vouchers            enable row level security;
alter table public.voucher_redemptions enable row level security;

-- ── drop if re-running ───────────────────────────────────────────────────────
drop policy if exists "vouchers_select"  on public.vouchers;
drop policy if exists "vouchers_insert"  on public.vouchers;
drop policy if exists "vouchers_update"  on public.vouchers;
drop policy if exists "vouchers_delete"  on public.vouchers;

drop policy if exists "voucher_redemptions_select" on public.voucher_redemptions;

-- ── VOUCHERS ─────────────────────────────────────────────────────────────────

-- Any workspace member (cashier, kitchen, manager, admin, owner) can read.
create policy "vouchers_select"
  on public.vouchers for select to authenticated
  using ( is_workspace_member(workspace_id) );

-- Only owner / admin / manager can create vouchers.
create policy "vouchers_insert"
  on public.vouchers for insert to authenticated
  with check ( is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]) );

-- Only owner / admin / manager can edit vouchers.
create policy "vouchers_update"
  on public.vouchers for update to authenticated
  using  ( is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]) )
  with check ( is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]) );

-- Only owner / admin / manager can delete vouchers.
create policy "vouchers_delete"
  on public.vouchers for delete to authenticated
  using ( is_workspace_member(workspace_id, array['owner','admin','manager']::workspace_role[]) );

-- ── VOUCHER_REDEMPTIONS ───────────────────────────────────────────────────────

-- Any workspace member can read redemption history.
create policy "voucher_redemptions_select"
  on public.voucher_redemptions for select to authenticated
  using ( is_workspace_member(workspace_id) );

-- No INSERT / UPDATE / DELETE policies on voucher_redemptions.
-- Direct client writes are intentionally blocked.
-- Redemptions are created only through claim_voucher_usage() or adminClient in edge functions.

commit;
