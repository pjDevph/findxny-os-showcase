// POST /vouchers-claim — idempotently claims the next unclaimed WiFi voucher for an order.
// If the order already has a voucher, returns it. Returns { code: null } when pool is empty.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  order_id:     z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    await requireAuth(req, body.workspace_id);

    const admin = adminClient();

    const { data, error } = await admin.rpc("claim_wifi_voucher", {
      p_workspace_id: body.workspace_id,
      p_order_id:     body.order_id,
    }).maybeSingle();

    if (error) throw BadRequest(error.message);

    return json({
      code:         data?.code         ?? null,
      duration_min: data?.duration_min ?? null,
    });
  } catch (err) { return handleError(err); }
});
