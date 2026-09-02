// POST /pos-counter-pay
// Cashier confirms cash payment for a kiosk/counter-pay order.
// Creates payment records, spawns kitchen tickets, and marks the order as preparing.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { attributeOrderToOpenShift } from "../_shared/shiftAttribution.ts";

const Body = z.object({
  workspace_id:  z.string().uuid(),
  branch_id:     z.string().uuid(),
  order_id:      z.string().uuid(),
  cash_received: z.number().positive(),
  // Customer chose "pay at counter" but may settle with any method, not just
  // cash — omit for cash (the original, still-supported default).
  payment_method: z.enum(["cash", "gcash", "maya", "card", "qrph", "bank_transfer"]).optional(),
  // Required by the UI for any non-cash method (e-wallet/bank transaction ref).
  ref_number: z.string().trim().min(1).optional(),
});

type Admin = ReturnType<typeof adminClient>;
type BodyType = z.infer<typeof Body>;

async function fetchAndValidateOrder(admin: Admin, body: BodyType) {
  const { data: order } = await admin
    .from("orders")
    .select("id, order_no, ticket_no, total, payment_status, workspace_id, notes")
    .eq("id", body.order_id)
    .maybeSingle();

  if (!order || order.workspace_id !== body.workspace_id) throw NotFound("Order not found");
  if (order.payment_status !== "pending_counter") {
    throw BadRequest(
      order.payment_status === "paid"
        ? "Order already paid."
        : "Order is not pending counter payment.",
    );
  }
  return order;
}

async function recordPaymentRecords(
  admin: Admin, body: BodyType, total: number, change: number, currency: string, cashierId: string,
) {
  const method = body.payment_method ?? "cash";
  const { data: intent, error: iErr } = await admin.from("payment_intents").insert({
    workspace_id: body.workspace_id,
    order_id:     body.order_id,
    provider:     method,
    amount:       total,
    currency,
    status:       "succeeded",
    metadata:     { cash_received: body.cash_received, change, cashier_id: cashierId },
  }).select().single();
  if (iErr) throw BadRequest(iErr.message);

  const { data: payment, error: pErr } = await admin.from("payments").insert({
    intent_id: intent.id, amount: total, method, status: "succeeded",
  }).select().single();
  if (pErr) throw BadRequest(pErr.message);

  return { intent, payment };
}

async function recordLedgerAndReceipt(
  admin: Admin, body: BodyType, order: any,
  total: number, change: number, currency: string, cashierId: string,
) {
  const method = body.payment_method ?? "cash";
  const { data: tx, error: tErr } = await admin.from("transactions").insert({
    workspace_id:    body.workspace_id,
    branch_id:       body.branch_id,
    type:            "sale",
    reference_table: "orders",
    reference_id:    body.order_id,
    amount:          total,
    status:          "completed",
    created_by:      cashierId,
    payment_method:  method,
  }).select().single();
  if (tErr) throw BadRequest(tErr.message);

  const { data: receipt } = await admin.from("receipts").insert({
    workspace_id:   body.workspace_id,
    transaction_id: tx.id,
    payload: {
      type:          "orders",
      ref_id:        body.order_id,
      ticket_no:     order.ticket_no,
      amount:        total,
      currency,
      method,
      cash_received: body.cash_received,
      change,
      cashier_id:    cashierId,
      issued_at:     new Date().toISOString(),
      ...(body.ref_number ? { ref_number: body.ref_number } : {}),
    },
  }).select().single();

  return { tx, receipt };
}

async function spawnKitchenTicketForOrder(admin: Admin, body: BodyType) {
  const { data: orderItems } = await admin
    .from("order_items")
    .select("id, product_id, products(kitchen_required)")
    .eq("order_id", body.order_id);

  const kitchenItems = (orderItems ?? []).filter((it: any) => it.products?.kitchen_required);
  if (!kitchenItems.length) return null;

  const { data: kt } = await admin.from("kitchen_tickets").insert({
    order_id:     body.order_id,
    branch_id:    body.branch_id,
    workspace_id: body.workspace_id,
  }).select().single();
  if (!kt) return null;

  await admin.from("kitchen_ticket_items").insert(
    kitchenItems.map((it: any) => ({ ticket_id: kt.id, order_item_id: it.id })),
  );
  return kt;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let paymentCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    // Dedup: a cashier can't double-confirm payment for the same order in 10s.
    await rateLimit(req, {
      scope: "pos-counter-pay",
      key: `${ctx.userId}:${body.order_id}`,
      max: 3, windowSec: 10,
    });
    idem = await idempotencyGuard(req, "pos-counter-pay", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);

    const admin = adminClient();

    const order = await fetchAndValidateOrder(admin, body);
    const total = Number(order.total);
    if (body.cash_received < total) throw BadRequest("Cash received is less than the order total.");
    const change = +(body.cash_received - total).toFixed(2);

    const { data: ws } = await admin.from("workspaces")
      .select("currency").eq("id", body.workspace_id).single();
    const currency = ws?.currency ?? "PHP";

    const { payment } = await recordPaymentRecords(admin, body, total, change, currency, ctx.userId);
    paymentCreated = true;

    const updatedNotes = body.ref_number
      ? [order.notes, `Ref: ${body.ref_number}`].filter(Boolean).join(" · ")
      : order.notes;
    await admin.from("orders")
      .update({ status: "preparing", payment_status: "paid", notes: updatedNotes })
      .eq("id", body.order_id);

    // This is a counter-pay (typically online/kiosk, source='web') order —
    // it was created with no shift_id. The cashier now physically holding
    // the cash for it needs it attributed to their open shift, or it's
    // invisible to their end-of-shift summary and drawer variance.
    await attributeOrderToOpenShift(admin, body.workspace_id, ctx.userId, body.order_id);

    const { tx, receipt } = await recordLedgerAndReceipt(
      admin, body, order, total, change, currency, ctx.userId,
    );

    const kitchenTicket = await spawnKitchenTicketForOrder(admin, body);
    // No kitchen ticket was needed (e.g. a pure retail item with nothing to
    // prep) — there's nothing left to wait on, so this order should complete
    // immediately rather than sit at "preparing" forever. An order that DID
    // get a ticket stays "preparing"; the kitchen flow (recomputeOrderStatus
    // in kitchen-update-status/pos-kitchen) advances it to 'completed' once
    // that ticket is actually served.
    if (!kitchenTicket) {
      await admin.from("orders").update({ status: "completed" }).eq("id", body.order_id);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "payment.counter_pay",
      entityType:  "payment",
      entityId:    payment.id,
      after:       { order_id: body.order_id, ticket_no: order.ticket_no, total, change },
    }));

    const result = { payment, transaction: tx, receipt, kitchen_ticket: kitchenTicket, change };
    await idem.commit(201, result);
    return json(result, 201);
  } catch (err) {
    if (idem && !paymentCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});
