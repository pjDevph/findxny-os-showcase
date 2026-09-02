-- 0072_decrement_voucher_usage.sql
-- Atomic voucher usage rollback called by orders-cancel when an order that
-- used a voucher is cancelled. Decrements usage_count with a floor of 0.

CREATE OR REPLACE FUNCTION decrement_voucher_usage(
  p_voucher_id   UUID,
  p_workspace_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE vouchers
     SET usage_count = GREATEST(usage_count - 1, 0),
         updated_at  = now()
   WHERE id = p_voucher_id
     AND workspace_id = p_workspace_id;
END;
$$;
