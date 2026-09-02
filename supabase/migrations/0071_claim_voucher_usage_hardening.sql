-- 0071_claim_voucher_usage_hardening.sql
-- Adds status and expiry checks inside the atomic claim function so a voucher
-- that is disabled or expires in the narrow window between orders-create
-- validation and the actual claim call is correctly rejected.

CREATE OR REPLACE FUNCTION claim_voucher_usage(
  p_voucher_id   UUID,
  p_workspace_id UUID
) RETURNS TABLE(
  success   BOOLEAN,
  reason    TEXT,
  new_count INT
) LANGUAGE plpgsql AS $$
DECLARE
  v vouchers%ROWTYPE;
BEGIN
  SELECT * INTO v
    FROM vouchers
   WHERE id = p_voucher_id AND workspace_id = p_workspace_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Voucher not found'::TEXT, 0; RETURN;
  END IF;

  IF v.status = 'disabled' THEN
    RETURN QUERY SELECT false, 'Voucher is disabled'::TEXT, v.usage_count; RETURN;
  END IF;

  IF v.valid_until IS NOT NULL AND now() > v.valid_until THEN
    RETURN QUERY SELECT false, 'Voucher has expired'::TEXT, v.usage_count; RETURN;
  END IF;

  IF v.usage_limit IS NOT NULL AND v.usage_count >= v.usage_limit THEN
    RETURN QUERY SELECT false, 'Usage limit reached'::TEXT, v.usage_count; RETURN;
  END IF;

  UPDATE vouchers
     SET usage_count = usage_count + 1, updated_at = now()
   WHERE id = p_voucher_id;

  RETURN QUERY SELECT true, NULL::TEXT, v.usage_count + 1;
END;
$$;
