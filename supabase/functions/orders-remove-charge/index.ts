// POST /orders-remove-charge { workspace_id, charge_id, order_id }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  charge_id:    z.string().uuid(),
  order_id:     z.string().uuid(),
});

async function fetchChargeAndGuard(
  admin: ReturnType<typeof adminClient>,
  chargeId: string,
  orderId: string,
  workspaceId: string,
) {
  // Fetch the charge, verifying it belongs to the right order and workspace
  const { data: charge, error } = await admin
    .from("order_charges")
    .select("*")
    .eq("id", chargeId)
    .eq("order_id", orderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!charge) throw NotFound("Charge not found");

  // Fetch the order to check its status
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, status, payment_status")
    .eq("id", orderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (orderErr) throw BadRequest(orderErr.message);
  if (!order) throw NotFound("Order not found");

  if (order.payment_status === "paid") throw Conflict("Cannot remove a charge from a paid order");
  if (order.status === "completed") throw Conflict("Cannot remove a charge from a completed order");

  return charge;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    const charge = await fetchChargeAndGuard(admin, body.charge_id, body.order_id, body.workspace_id);

    const { error: deleteErr } = await admin
      .from("order_charges")
      .delete()
      .eq("id", body.charge_id)
      .eq("order_id", body.order_id);
    if (deleteErr) throw BadRequest(deleteErr.message);

    const { data: allCharges, error: listErr } = await admin
      .from("order_charges")
      .select("*")
      .eq("order_id", body.order_id)
      .order("created_at", { ascending: true });
    if (listErr) throw BadRequest(listErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "order_charge.remove", entityType: "order_charge", entityId: charge.id,
      before: charge, after: null,
    }));

    return json({ removed: true, all_charges: allCharges ?? [] });
  } catch (err) { return handleError(err); }
});
