// POST /orders-add-charge { workspace_id, branch_id, order_id, name, amount, taxable, preset_id?, reason? }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid(),
  order_id:     z.string().uuid(),
  name:         z.string().min(1).max(100),
  amount:       z.number().positive(),
  taxable:      z.boolean(),
  preset_id:    z.string().uuid().optional(),
  reason:       z.string().optional(),
});

async function fetchOrderAndGuard(admin: ReturnType<typeof adminClient>, orderId: string, workspaceId: string) {
  const { data: order, error } = await admin
    .from("orders").select("*").eq("id", orderId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!order) throw NotFound("Order not found");
  if (order.status === "completed") throw Conflict("Cannot add a charge to a completed order");
  if (order.status === "cancelled") throw Conflict("Cannot add a charge to a cancelled order");
  if (order.payment_status === "paid") throw Conflict("Cannot add a charge to an already-paid order");
  return order;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    await fetchOrderAndGuard(admin, body.order_id, body.workspace_id);

    const { data: charge, error: insertErr } = await admin
      .from("order_charges")
      .insert({
        workspace_id: body.workspace_id,
        branch_id:    body.branch_id,
        order_id:     body.order_id,
        name:         body.name,
        amount:       body.amount,
        taxable:      body.taxable,
        preset_id:    body.preset_id ?? null,
        created_by:   ctx.userId,
      })
      .select()
      .single();
    if (insertErr) throw BadRequest(insertErr.message);

    // Reflect the charge on the parent order — without this, orders.total
    // stays items-only forever while the customer is actually charged (and
    // the receipt shows) subtotal+charges, so payments-cash-confirm marks the
    // order "fully paid" while under-recording true revenue by the charge
    // amount in every downstream reconciliation path (reports, shift/Z-report,
    // refund cap). Atomic increment (not a read-modify-write in this handler)
    // because order.tsx fires one of these per cart charge concurrently.
    const { error: incErr } = await admin.rpc("increment_order_charge_total", {
      p_order_id: body.order_id, p_amount: body.amount,
    });
    if (incErr) throw BadRequest(incErr.message);

    const { data: allCharges, error: listErr } = await admin
      .from("order_charges")
      .select("*")
      .eq("order_id", body.order_id)
      .order("created_at", { ascending: true });
    if (listErr) throw BadRequest(listErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "order_charge.add", entityType: "order_charge", entityId: charge.id,
      before: null, after: charge,
      ...(body.reason ? { metadata: { reason: body.reason } } : {}),
    }));

    return json({ charge, all_charges: allCharges ?? [] });
  } catch (err) { return handleError(err); }
});
