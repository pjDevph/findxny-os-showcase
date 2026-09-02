-- Rich listing fields for bookable_resources (room photos, descriptions, pax, pricing)
alter table bookable_resources
  add column if not exists nightly_rate      numeric(12,2),
  add column if not exists short_description text,
  add column if not exists description       text,
  add column if not exists base_pax          int,
  add column if not exists max_pax           int,
  add column if not exists extra_pax_fee     numeric(12,2),
  add column if not exists security_deposit  numeric(12,2),
  add column if not exists cleaning_fee      numeric(12,2),
  add column if not exists check_in_time     text default '15:00',
  add column if not exists check_out_time    text default '11:00',
  add column if not exists inclusions        jsonb not null default '[]',
  add column if not exists photos            jsonb not null default '[]',
  add column if not exists cover_photo       text,
  add column if not exists house_rules       text,
  add column if not exists min_nights        int default 1;

-- Public storage bucket for room photos
insert into storage.buckets (id, name, public)
values ('room-photos', 'room-photos', true)
on conflict (id) do nothing;

drop policy if exists "room_photos_read"   on storage.objects;
drop policy if exists "room_photos_write"  on storage.objects;
drop policy if exists "room_photos_delete" on storage.objects;

create policy "room_photos_read" on storage.objects
  for select using (bucket_id = 'room-photos');

create policy "room_photos_write" on storage.objects
  for insert with check (
    bucket_id = 'room-photos'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'manager')
    )
  );

create policy "room_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'room-photos'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'manager')
    )
  );
