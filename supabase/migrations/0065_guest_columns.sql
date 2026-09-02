-- 0065_guest_columns.sql
-- Promote guest contact info out of the packed notes field into proper columns.

alter table bookings
  add column if not exists guest_name  text,
  add column if not exists guest_phone text,
  add column if not exists guest_email text;

-- Backfill from notes "name · phone · email · freetext" format
update bookings
set
  guest_name  = coalesce(split_part(notes, ' · ', 1), null),
  guest_phone = case
    when split_part(notes, ' · ', 2) ~ '^[0-9+]' then split_part(notes, ' · ', 2)
    else null end,
  guest_email = case
    when split_part(notes, ' · ', 3) ~ '@' then split_part(notes, ' · ', 3)
    when split_part(notes, ' · ', 2) ~ '@' then split_part(notes, ' · ', 2)
    else null end
where notes is not null and notes like '% · %';
