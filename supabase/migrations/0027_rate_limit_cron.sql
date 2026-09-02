-- Daily cleanup for the rate-limit / idempotency tables created in 0026.
-- pg_cron lives in the `extensions` schema on Supabase. We schedule from there
-- and let it call our service-role helpers in `public`.
create extension if not exists pg_cron with schema extensions;

-- Unschedule any prior runs so this migration is idempotent.
do $$
declare
  j record;
begin
  for j in
    select jobid from cron.job
    where jobname in ('rate_limit_cleanup', 'idempotency_cleanup', 'auth_attempts_cleanup')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- Rate-limit buckets: drop rows older than a day (windows are minutes/seconds).
select cron.schedule(
  'rate_limit_cleanup',
  '17 3 * * *',
  $$select public.rate_limit_cleanup();$$
);

-- Idempotency keys: TTL is 7 days inside the function.
select cron.schedule(
  'idempotency_cleanup',
  '23 3 * * *',
  $$select public.idempotency_cleanup();$$
);

-- Auth attempts: keep ~30 days of history for forensics, then drop.
select cron.schedule(
  'auth_attempts_cleanup',
  '29 3 * * *',
  $$delete from public.auth_attempts where created_at < now() - interval '30 days';$$
);
