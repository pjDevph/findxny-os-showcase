-- Server-side rate limiting, idempotency keys, and auth attempt tracking.
-- Used by edge functions (service-role only) to gate public endpoints,
-- dedupe payment/order mutations, and lock out brute-force auth attempts.

-- ── rate_limit_buckets: fixed-window counter ────────────────────────────────
create table if not exists public.rate_limit_buckets (
  key          text        primary key,
  count        int         not null default 0,
  window_start timestamptz not null default now()
);

create or replace function public.rate_limit_hit(
  p_key text, p_max int, p_window_sec int
) returns table(allowed boolean, hit_count int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now           timestamptz := now();
  v_count         int;
  v_window_start  timestamptz;
  v_window_expiry interval := (p_window_sec || ' seconds')::interval;
begin
  insert into rate_limit_buckets(key, count, window_start)
    values (p_key, 1, v_now)
  on conflict (key) do update set
    count = case
      when rate_limit_buckets.window_start + v_window_expiry < v_now then 1
      else rate_limit_buckets.count + 1
    end,
    window_start = case
      when rate_limit_buckets.window_start + v_window_expiry < v_now then v_now
      else rate_limit_buckets.window_start
    end
  returning rate_limit_buckets.count, rate_limit_buckets.window_start
    into v_count, v_window_start;

  return query
    select v_count <= p_max, v_count, v_window_start + v_window_expiry;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- Periodic cleanup helper (call from a cron job; safe to ignore otherwise).
create or replace function public.rate_limit_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
$$;
grant execute on function public.rate_limit_cleanup() to service_role;

-- ── idempotency_keys: dedupe replays of unsafe mutations ────────────────────
create table if not exists public.idempotency_keys (
  key          text        primary key,   -- "<endpoint>:<client-supplied-key>"
  endpoint     text        not null,
  request_hash text        not null,      -- sha256 of canonical body
  status       int,                       -- null while in-flight
  response     jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idempotency_keys_created_at_idx
  on public.idempotency_keys(created_at);

create or replace function public.idempotency_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.idempotency_keys where created_at < now() - interval '7 days';
$$;
grant execute on function public.idempotency_cleanup() to service_role;

-- ── auth_attempts: brute-force lockout (per email + ip) ─────────────────────
create table if not exists public.auth_attempts (
  id         bigserial   primary key,
  email      text        not null,
  ip         text,
  success    boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists auth_attempts_email_time_idx
  on public.auth_attempts(lower(email), created_at desc);
create index if not exists auth_attempts_ip_time_idx
  on public.auth_attempts(ip, created_at desc);

-- All four tables are write-only from the service role. Block direct PostgREST
-- access from anon/authenticated.
alter table public.rate_limit_buckets enable row level security;
alter table public.idempotency_keys   enable row level security;
alter table public.auth_attempts      enable row level security;
-- No policies = no anon/authenticated access; service_role bypasses RLS.
