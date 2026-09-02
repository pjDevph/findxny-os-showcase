-- Migration 0082: Fix hold expiry to use 'expired' status (not 'cancelled').
--
-- Migration 0011 created cancel_expired_holds() which set status='cancelled'
-- on expired holds. When 0067 added the 'expired' enum value as a distinct
-- terminal state, the pg_cron function was not updated, causing a conflict:
--   - pg_cron (Pro plan): holds → 'cancelled'
--   - bookings-expire-holds edge fn: holds → 'expired'
--
-- This migration replaces the function to use 'expired' so both paths agree,
-- and renames the cron job accordingly.

CREATE OR REPLACE FUNCTION expire_expired_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE bookings
  SET    status = 'expired', hold_expires_at = NULL
  WHERE  status = 'hold'
    AND  hold_expires_at IS NOT NULL
    AND  hold_expires_at < NOW();
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

-- Keep old function as a no-op alias so any existing RPC callers don't break.
CREATE OR REPLACE FUNCTION cancel_expired_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  RETURN expire_expired_holds();
END;
$$;

-- Reschedule pg_cron to call the new function (unschedule old, schedule new).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('cancel-expired-holds'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('expire-expired-holds'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule(
      'expire-expired-holds',
      '*/5 * * * *',
      'SELECT expire_expired_holds()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
