-- Perf: collapse public-rooms' 3 PostgREST round-trips (workspace + rooms +
-- bookings) into one server-side call. Expired-hold filtering (don't show a
-- lapsed hold as booked) is done in SQL here instead of post-filtering in JS.
-- booked ranges are only computed when p_resource_id is provided.
create or replace function public_rooms_v1(p_slug text, p_type text default 'room', p_resource_id uuid default null)
returns jsonb
language sql
stable
as $$
  with ws as (select id, name, phone from workspaces where slug = p_slug limit 1)
  select case when not exists (select 1 from ws) then null else jsonb_build_object(
    'workspace', (select jsonb_build_object('id', id, 'name', name, 'phone', phone) from ws),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'type', r.type, 'capacity', r.capacity, 'hourly_rate', r.hourly_rate,
        'active', r.active, 'branch_id', r.branch_id, 'workspace_id', r.workspace_id,
        'branches', case when b.id is null then null else jsonb_build_object('name', b.name) end,
        'nightly_rate', r.nightly_rate, 'short_description', r.short_description, 'description', r.description,
        'base_pax', r.base_pax, 'max_pax', r.max_pax, 'extra_pax_fee', r.extra_pax_fee,
        'security_deposit', r.security_deposit, 'cleaning_fee', r.cleaning_fee,
        'check_in_time', r.check_in_time, 'check_out_time', r.check_out_time,
        'inclusions', r.inclusions, 'photos', r.photos, 'cover_photo', r.cover_photo,
        'house_rules', r.house_rules, 'min_nights', r.min_nights) order by r.name)
      from bookable_resources r
      left join branches b on b.id = r.branch_id
      where r.workspace_id = (select id from ws) and r.active = true and r.type = p_type::resource_type), '[]'::jsonb),
    'booked', case when p_resource_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'start', to_char(start_time at time zone 'UTC', 'YYYY-MM-DD'),
        'end',   to_char(end_time   at time zone 'UTC', 'YYYY-MM-DD')))
      from (
        select start_time, end_time
        from bookings
        where resource_id = p_resource_id
          and status in ('hold', 'confirmed')
          and end_time >= now()
          and start_time < now() + interval '4 months'
          and (status = 'confirmed' or hold_expires_at is null or hold_expires_at > now())
        limit 200
      ) bk), '[]'::jsonb) end
  ) end;
$$;

revoke all on function public_rooms_v1(text, text, uuid) from public;
grant execute on function public_rooms_v1(text, text, uuid) to service_role;
