// POST /orders-cancel { workspace_id, order_id, reason? }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { expireInvoice } from "../_shared/xenditClient.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { getUnservedOrderItemIds, reverseOrderStock } from "../_shared/stockReversal.ts";

const Body = z.object({
  workspace_id:        z.string().uuid(),
  order_id:            z.string().uuid(),
  reason:              z.string().optional(),
  manager_approval_id: z.string().uuid().optional(),
});

async function fetchOrderAndGuard(admin: ReturnType<typeof adminClient>, orderId: string, workspaceId: string) {
  const { data: order, error } = await admin
    .from("orders").select("*").eq("id", orderId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!order) throw NotFound("Order not found");
  if (order.status === "completed") throw Conflict("Cannot cancel a completed order");
  return order;
}

async function guardKitchenStatus(
  admin: ReturnType<typeof adminClient>,
  orderId: string,
  managerApprovalId: string | undefined,
) {
  // Includes 'served' alongside 'preparing'/'ready' — a ticket already served
  // to the customer (but the order not yet marked 'completed') previously
  // passed this gate with no approval and silently restocked consumed
  // inventory on cancel. order-items-cancel already blocks this outright for
  // single-item cancellation; widen this whole-order gate to match.
  const { data: tickets } = await admin
    .from("kitchen_tickets")
    .select("id, kitchen_status")
    .eq("order_id", orderId)
    .in("kitchen_status", ["preparing", "ready", "served"]);

  if (!tickets || tickets.length === 0) return; // nothing in prep or served — allow

  // Kitchen is active or has already served items — require a valid manager
  // approval to proceed.
  if (!managerApprovalId) {
    throw Conflict(
      "ORDER_IN_PREPARATION: This order is currently being prepared or has already been served by the kitchen. Manager approval is required to cancel.",
    );
  }

  // Validate the supplied approval.
  const { data: approval, error: apErr } = await admin
    .from("manager_approvals")
    .select("id, status, action_type, target_id, workspace_id")
    .eq("id", managerApprovalId)
    .maybeSingle();

  if (apErr || !approval) throw BadRequest("Manager approval not found.");
  if (approval.target_id   !== orderId)    throw BadRequest("Manager approval is for a different order.");
  if (approval.action_type !== "void_order") throw BadRequest("Manager approval action type mismatch.");
  if (approval.status      !== "approved")  throw Conflict("Manager approval has not been granted yet.");
}

async function voidPendingOrderIntents(admin: ReturnType<typeof adminClient>, orderId: string, workspaceId: string) {
  const { data: intents } = await admin.from("payment_intents")
    .select("id, provider, provider_intent_id, status")
    .eq("order_id", orderId)
    .eq("workspace_id", workspaceId);
  const succeededIntent = (intents ?? []).find((i: any) => i.status === "succeeded");
  if (succeededIntent) {
    throw Conflict("Order has a completed payment. Use the refund flow to reverse the payment before cancelling.");
  }
  for (const intent of intents ?? []) {
    if (intent.provider === "xendit" && intent.provider_intent_id && intent.status === "pending") {
      try { await expireInvoice(intent.provider_intent_id); } catch (_err) { /* local cancel still proceeds; webhook is idempotent */ }
    }
    await admin.from("payment_intents").update({ status: "cancelled" }).eq("id", intent.id);
  }
}

async function updateOrderCancelled(admin: ReturnType<typeof adminClient>, order: any, reason: string | undefined, actorId: string) {
  await admin.from("kitchen_tickets").update({ kitchen_status: "completed", status: "completed" }).eq("order_id", order.id);
  const { data: updated, error: uErr } = await admin
    .from("orders").update({
      status: "cancelled",
      payment_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: actorId,
      cancel_reason: reason ?? null,
    })
    .eq("id", order.id)
    // Optimistic concurrency: only apply from the exact status we read above.
    // A concurrent request that already changed it (another cancel, a status
    // advance, etc.) makes this match zero rows instead of silently
    // clobbering whatever that other request just did.
    .eq("status", order.status)
    .select().single();
  if (uErr) {
    if (uErr.code === "PGRST116") throw Conflict("Order was modified by another request — please retry");
    throw BadRequest(uErr.message);
  }
  return updated;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    const order = await fetchOrderAndGuard(admin, body.order_id, body.workspace_id);
    if (order.status === "cancelled") return json({ order });

    await Promise.all([
      guardKitchenStatus(admin, order.id, body.manager_approval_id),
      voidPendingOrderIntents(admin, order.id, body.workspace_id),
    ]);
    const updated = await updateOrderCancelled(admin, order, body.reason, ctx.userId);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "order.cancel", entityType: "order", entityId: order.id,
      before: order, after: updated,
    }));

    // Roll back voucher usage — non-blocking; failure must not abort the cancel.
    // waitUntil() keeps the isolate alive until this finishes, instead of racing the response.
    if (order.voucher_id) {
      EdgeRuntime.waitUntil((async () => {
        try {
          await admin.from("voucher_redemptions").delete().eq("order_id", order.id);
          await admin.rpc("decrement_voucher_usage", { p_voucher_id: order.voucher_id, p_workspace_id: body.workspace_id });
        } catch (err: unknown) {
          console.error("[orders-cancel] voucher rollback failed:", err instanceof Error ? err.message : err);
        }
      })());
    }

    // Reverse ingredient + inventory deductions for items that were never
    // served — approval above only gates *permission* to cancel a served
    // order, it doesn't mean served food should be un-consumed from stock.
    // Non-blocking; failure must not abort the cancel. waitUntil() keeps the
    // isolate alive until this finishes, instead of racing the response.
    EdgeRuntime.waitUntil(
      getUnservedOrderItemIds(admin, order.id)
        .then((unservedIds) => unservedIds.length
          ? reverseOrderStock(admin, order.id, "cancel", unservedIds).then(() => {})
          : undefined)
        .catch((err: unknown) => {
          console.error("[orders-cancel] stock reversal failed:", err instanceof Error ? err.message : err);
        }),
    );

    return json({ order: updated });
  } catch (err) { return handleError(err); }
});
