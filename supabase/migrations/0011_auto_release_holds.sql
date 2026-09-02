-- =====================================================================
-- Migration 0011: Auto-release expired booking holds
-- Creates a DB function + pg_cron job (every 5 min) to cancel holds
-- whose hold_expires_at has passed. Falls back gracefully if pg_cron
-- is not enabled on the project.
-- =====================================================================

-- Helper function — also callable via RPC from edge functions
CREATE OR REPLACE FUNCTION cancel_expired_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE bookings
  SET    status = 'cancelled', hold_expires_at = NULL
  WHERE  status = 'hold'
    AND  hold_expires_at IS NOT NULL
    AND  hold_expires_at < NOW();
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

-- Schedule via pg_cron if the extension is available (Pro plan+).
-- Enable it in the Supabase dashboard under Database → Extensions → pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old schedule if it exists, then recreate
    PERFORM cron.unschedule('cancel-expired-holds');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cancel-expired-holds',
      '*/5 * * * *',
      'SELECT cancel_expired_holds()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
