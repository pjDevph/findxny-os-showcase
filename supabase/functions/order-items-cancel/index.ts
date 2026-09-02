// POST /order-items-cancel — cancel a single item on an order.
// Handles the mixed-order edge case: drink served, food cancelled.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { reverseOrderStock } from "../_shared/stockReversal.ts";
import { computePosOrderTotals, resolveRates } from "../_shared/orderPricing.ts";

const Body = z.object({
  workspace_id:        z.string().uuid(),
  order_id:            z.string().uuid(),
  order_item_id:       z.string().uuid(),
  reason:              z.string().min(3),
  manager_approval_id: z.string().uuid().optional(),
});

type Admin = ReturnType<typeof adminClient>;
type BodyType = z.infer<typeof Body>;

function reverseItemStock(admin: Admin, orderId: string, orderItemId: string, logPrefix: string) {
  return reverseOrderStock(admin, orderId, "cancel", [orderItemId]).then(
    () => {},
    (err: unknown) => console.error(logPrefix, err instanceof Error ? err.message : err),
  );
}

async function guardKitchenTicketStatus(admin: Admin, body: BodyType) {
  const { data: ticketItems } = await admin
    .from("kitchen_ticket_items")
    .select("id, ticket_id, kitchen_tickets(id, kitchen_status)")
    .eq("order_item_id", body.order_item_id);

  const ticketStatuses: string[] = (ticketItems ?? [])
    .map((kti: any) => kti.kitchen_tickets?.kitchen_status ?? "new");

  const alreadyServed = ticketStatuses.some((s) => ["served", "completed"].includes(s));
  if (alreadyServed) {
    throw Conflict(
      "ITEM_ALREADY_SERVED: This item was already served and delivered to the customer. Use the refund flow to process a return.",
    );
  }

  const needsApproval = ticketStatuses.some((s) => ["preparing", "ready"].includes(s));
  if (needsApproval) {
    if (!body.manager_approval_id) {
      throw Conflict("ITEM_IN_PREPARATION: This item is currently being prepared. Manager approval is required to cancel.");
    }
    const { data: approval } = await admin
      .from("manager_approvals")
      .select("id, status, action_type, target_id, workspace_id")
      .eq("id", body.manager_approval_id)
      .maybeSingle();
    if (!approval) throw BadRequest("Manager approval not found.");
    if (approval.action_type !== "void_order") throw BadRequest("Manager approval action type mismatch.");
    if (approval.target_id !== body.order_id) throw Conflict("Manager approval does not match this order.");
    if (approval.status !== "approved") throw Conflict("Manager approval has not been granted yet.");
  }

  return [...new Set((ticketItems ?? []).map((kti: any) => kti.ticket_id as string))];
}

async function closeEmptiedKitchenTickets(admin: Admin, affectedTicketIds: string[]) {
  await Promise.all(affectedTicketIds.map(async (ticketId) => {
    const { data: remainingActive } = await admin
      .from("kitchen_ticket_items")
      .select("id")
      .eq("ticket_id", ticketId)
      .neq("status", "cancelled");
    if (!remainingActive || remainingActive.length === 0) {
      await admin.from("kitchen_tickets")
        .update({ kitchen_status: "completed", status: "completed" })
        .eq("id", ticketId);
    }
  }));
}

/**
 * order_items.total is stored pre-tax/pre-discount, so naively deriving tax
 * as (sum of item.total) - (sum of qty*price) always collapses to ~0 —
 * recompute properly via the shared pricing helper, reusing the order's
 * existing discount/senior-PWD/voucher state against the new (smaller) subtotal.
 *
 * Per-item discounts (order_items.discount_amount) get folded into the
 * order's manual/mixed discount bucket at checkout (see orders-create), so
 * they have to be un-folded here: subtract however much of that bucket came
 * from every item ever on the order, then add back only what's still on the
 * items that remain — otherwise cancelling the one discounted item would
 * leave its discount still applied against everything left in the order.
 */
async function recalcOrderTotalsAfterItemCancel(admin: Admin, order: any, workspaceId: string, orderId: string) {
  const { data: allItems } = await admin
    .from("order_items")
    .select("unit_price, quantity, discount_amount, status")
    .eq("order_id", orderId);

  const remaining = (allItems ?? []).filter((i: any) => i.status !== "cancelled");
  const newSubtotal = remaining.reduce((s: number, i: any) =>
    s + Number(i.unit_price ?? 0) * Number(i.quantity ?? 1), 0);

  const totalItemDiscountAllTime = (allItems ?? []).reduce((s: number, i: any) => s + Number(i.discount_amount ?? 0), 0);
  const remainingItemDiscount = remaining.reduce((s: number, i: any) => s + Number(i.discount_amount ?? 0), 0);

  let voucherPortion = 0;
  if (order.voucher_id) {
    const { data: redemption } = await admin
      .from("voucher_redemptions")
      .select("discount_amount")
      .eq("order_id", orderId)
      .maybeSingle();
    voucherPortion = Number(redemption?.discount_amount ?? 0);
  }
  const discountSrc = order.discount_source as string | null;
  let manualDiscountAmount = 0;
  if (discountSrc === "manual") manualDiscountAmount = Number(order.discount ?? 0) - totalItemDiscountAllTime + remainingItemDiscount;
  else if (discountSrc === "mixed") manualDiscountAmount = Number(order.discount ?? 0) - voucherPortion - totalItemDiscountAllTime + remainingItemDiscount;
  manualDiscountAmount = Math.max(0, manualDiscountAmount);

  const { taxRate, svcRate } = await resolveRates(admin, workspaceId);
  const totals = computePosOrderTotals({
    subtotal: newSubtotal,
    taxRate,
    svcRate,
    isSeniorPwd: Boolean(order.is_senior_pwd),
    manualDiscountAmount,
    voucherDiscount: voucherPortion,
  });

  return { newSubtotal, totals };
}

async function autoCreateRefundIfPaid(admin: Admin, order: any, orderItem: any, body: BodyType, actorId: string) {
  // Net of this item's own discount — what the customer actually paid for it.
  const cancelledItemAmount = Number(orderItem.total ?? 0) - Number(orderItem.discount_amount ?? 0);
  if (order.payment_status !== "paid" || cancelledItemAmount <= 0) return null;

  const { data: intent } = await admin
    .from("payment_intents")
    .select("id, payments(id, amount)")
    .eq("order_id", body.order_id)
    .maybeSingle();
  const payment = Array.isArray((intent as any)?.payments) ? (intent as any).payments[0] : (intent as any)?.payments;
  if (!payment?.id) return null;

  const { data: existingRefunds } = await admin.from("refunds").select("amount").eq("payment_id", payment.id);
  const alreadyRefunded = (existingRefunds ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const refundable = Number(payment.amount) - alreadyRefunded;
  const refundAmt = Math.min(cancelledItemAmount, refundable);
  if (refundAmt <= 0) return null;

  const { data: rf } = await admin.from("refunds").insert({
    payment_id:  payment.id,
    order_id:    body.order_id,
    amount:      refundAmt,
    reason:      `Item voided: ${(orderItem.products as any)?.name ?? "item"} — ${body.reason}`,
    created_by:  actorId,
    status:      "completed",
    ...(body.manager_approval_id ? { manager_approval_id: body.manager_approval_id } : {}),
  }).select().single();

  await admin.from("transactions").insert({
    workspace_id:    body.workspace_id,
    branch_id:       (order as any).branch_id ?? null,
    type:            "refund",
    reference_table: "refunds",
    reference_id:    rf?.id,
    amount:          -Math.abs(refundAmt),
    status:          "completed",
    created_by:      actorId,
  }).select().maybeSingle();

  if (alreadyRefunded + refundAmt >= Number(payment.amount)) {
    await admin.from("payment_intents").update({ status: "refunded" }).eq("id", (intent as any).id);
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", body.order_id);
  }

  return rf;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // 1. Fetch the order item
    const { data: orderItem, error: oiErr } = await admin
      .from("order_items")
      .select("id, status, product_id, quantity, unit_price, total, discount_amount, order_id, products(name)")
      .eq("id", body.order_item_id)
      .eq("order_id", body.order_id)
      .maybeSingle();
    if (oiErr) throw BadRequest(oiErr.message);
    if (!orderItem) throw NotFound("Order item not found");
    if (orderItem.status === "cancelled") {
      // Retry-safe: if a prior call flipped the status but died before the
      // reversal completed, this (idempotent) call gives it another chance
      // instead of leaving the item cancelled with stock never restored.
      await reverseItemStock(admin, body.order_id, body.order_item_id, "[order-items-cancel] retry reversal failed:");
      return json({ order_item: orderItem, already_cancelled: true });
    }

    // 2. Verify order belongs to workspace
    const { data: order, error: ordErr } = await admin
      .from("orders")
      .select("id, status, payment_status, total, subtotal, tax, service_fee, workspace_id, branch_id, discount, discount_source, is_senior_pwd, voucher_id")
      .eq("id", body.order_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (ordErr) throw BadRequest(ordErr.message);
    if (!order) throw NotFound("Order not found");
    if (order.status === "cancelled") throw Conflict("Cannot modify items on a fully cancelled order.");

    // 3. Kitchen-ticket gate: block if served, require approval if in prep
    const affectedTicketIds = await guardKitchenTicketStatus(admin, body);

    // 4. Cancel the order item — guarded on the status we just read above, so
    // a concurrent cancel of this same item (double-click) can't both pass
    // and both proceed to create a duplicate auto-refund below (step 9).
    const { data: itemCancelled, error: iuErr } = await admin
      .from("order_items")
      .update({ status: "cancelled" })
      .eq("id", body.order_item_id)
      .eq("status", orderItem.status)
      .select()
      .maybeSingle();
    if (iuErr) throw BadRequest(iuErr.message);
    if (!itemCancelled) {
      // Lost the race to a concurrent cancel of this same item — don't
      // double-apply kitchen-ticket closure, totals, or the refund below.
      await reverseItemStock(admin, body.order_id, body.order_item_id, "[order-items-cancel] retry reversal failed:");
      return json({ order_item: { ...orderItem, status: "cancelled" }, already_cancelled: true });
    }

    // 5. Cancel the kitchen_ticket_items rows for this order item
    await admin.from("kitchen_ticket_items").update({ status: "cancelled" }).eq("order_item_id", body.order_item_id);

    // 6. For each affected ticket — if ALL its items are now cancelled, cancel the ticket
    await closeEmptiedKitchenTickets(admin, affectedTicketIds);

    // Reverse this item's own ingredient/inventory deductions — non-blocking,
    // idempotent, scoped to just this item so other items already
    // cancelled/reversed (or cancelled later) aren't double-touched.
    EdgeRuntime.waitUntil(
      reverseItemStock(admin, body.order_id, body.order_item_id, "[order-items-cancel] stock reversal failed:"),
    );

    // 7. Recalculate order totals from remaining non-cancelled items
    const { newSubtotal, totals } = await recalcOrderTotalsAfterItemCancel(admin, order, body.workspace_id, body.order_id);

    // 8. Determine new order status
    const { data: allItems } = await admin.from("order_items").select("status").eq("order_id", body.order_id);
    const allCancelled = (allItems ?? []).every((i: any) => i.status === "cancelled");

    const orderPatch: Record<string, unknown> = {
      subtotal:        newSubtotal,
      tax:             totals.tax,
      service_fee:     totals.service_fee,
      discount:        totals.discount,
      discount_source: totals.discount_source,
      total:           totals.total,
    };
    if (allCancelled) {
      orderPatch.status         = "cancelled";
      orderPatch.payment_status = "cancelled";
      orderPatch.cancelled_at   = new Date().toISOString();
      orderPatch.cancelled_by   = ctx.userId;
      orderPatch.cancel_reason  = body.reason;
    }

    const { data: updatedOrder } = await admin
      .from("orders").update(orderPatch).eq("id", body.order_id).select().single();

    // 9. If order was already paid, auto-create a refund record for the cancelled item amount.
    //    The cashier still physically returns cash — this just records the obligation.
    const refundRecord = await autoCreateRefundIfPaid(admin, order, orderItem, body, ctx.userId);
    const cancelledItemAmount = Number(orderItem.total ?? 0) - Number(orderItem.discount_amount ?? 0);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "order_item.cancel", entityType: "order_item", entityId: body.order_item_id,
      before: { status: orderItem.status },
      after:  { status: "cancelled", reason: body.reason, product: (orderItem.products as any)?.name, refund_amount: refundRecord?.amount },
    }));

    return json({
      order: updatedOrder,
      order_item: { ...orderItem, status: "cancelled" },
      all_cancelled: allCancelled,
      refund: refundRecord ?? null,
      refund_due: order.payment_status === "paid" ? cancelledItemAmount : 0,
    });
  } catch (err) { return handleError(err); }
});
