// POST /payments-cash-confirm — record a cash payment, settle order/booking, issue receipt.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";
import { attributeOrderToOpenShift } from "../_shared/shiftAttribution.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid(),
  order_id:     z.string().uuid().optional(),
  booking_id:   z.string().uuid().optional(),
  cash_received: z.number().min(0),
  // For bookings only: collect less than the full total (deposit / reservation fee).
  // Omit or pass the full total for a complete payment.
  custom_amount: z.number().positive().optional(),
  // For orders only: amount the customer is paying now (partial payment).
  // Omit or pass the full total to settle completely.
  amount_tendered: z.number().positive().optional(),
  // Split-payment legs (order.tsx) pass the actual method here; plain cash
  // confirmations omit it and default to "cash" below.
  payment_method: z.enum(["cash", "gcash", "maya", "card", "qrph", "bank_transfer"]).optional(),
  // Used when settling an order outside the original checkout flow (e.g.
  // collecting a remaining balance later) — appended to the order's notes,
  // since the usual "Ref: X" note is otherwise only written at checkout time.
  ref_number: z.string().trim().min(1).optional(),
}).refine((b) => b.order_id || b.booking_id, "Provide order_id or booking_id");

type BodyType = Awaited<ReturnType<typeof parseBody<typeof Body>>>;
type AdminClient = ReturnType<typeof adminClient>;

async function resolveRefFromBody(admin: AdminClient, body: BodyType) {
  if (body.order_id) {
    const { data: o } = await admin.from("orders").select("total, workspace_id, status, payment_status, balance_due, notes").eq("id", body.order_id).maybeSingle();
    if (!o || o.workspace_id !== body.workspace_id) throw NotFound("Order not found");
    if (o.payment_status === "paid") throw Conflict("Order is already fully paid");
    if (o.status === "cancelled") throw Conflict("Cannot pay a cancelled order");
    const fullAmount = Number(o.total);
    // For a partially-paid order, the remaining balance is what needs to be settled,
    // not the original total. Use balance_due as the effective amount still owed.
    const effectiveTotal = (o.payment_status === "partially_paid" && Number(o.balance_due) > 0)
      ? Number(o.balance_due)
      : fullAmount;
    // amount_tendered allows partial payment on orders; fall back to effective remaining total.
    const chargeAmount = (body.amount_tendered && body.amount_tendered < effectiveTotal)
      ? body.amount_tendered
      : effectiveTotal;
    return { fullAmount: effectiveTotal, chargeAmount, amountPaid: 0, refTable: "orders", refId: body.order_id, notes: o.notes as string | null };
  }
  const { data: b } = await admin.from("bookings").select("total, workspace_id, status, amount_paid, payment_status").eq("id", body.booking_id ?? "").maybeSingle();
  if (!b || b.workspace_id !== body.workspace_id) throw NotFound("Booking not found");
  if (b.payment_status === "paid") throw Conflict("Booking is already fully paid");
  if (b.status === "cancelled") throw Conflict("Cannot pay a cancelled booking");
  const fullAmount = Number(b.total);
  return { fullAmount, chargeAmount: fullAmount, amountPaid: Number(b.amount_paid ?? 0), refTable: "bookings", refId: body.booking_id ?? "", notes: null as string | null };
}

async function recordCashPayment(
  admin: AdminClient, body: BodyType, actorId: string,
  charge: { amount: number; fullAmount: number; amountPaid: number }, currency: string, refTable: string, refId: string,
  existingNotes: string | null,
) {
  const { amount, fullAmount, amountPaid } = charge;
  const change = +(body.cash_received - amount).toFixed(2);
  const method = body.payment_method ?? "cash";

  // Real double-submission protection is the caller-supplied Idempotency-Key
  // (see Deno.serve below) — it dedupes retries of the exact same request
  // without blocking legitimate follow-up charges against the same order/
  // booking (a second split-payment leg, or collecting a remaining balance
  // after a partial payment). A previous version of this guard treated *any*
  // prior succeeded payment_intent for the order/booking as proof it was
  // already fully settled, which silently dropped the second leg of every
  // split payment and made partial-balance collection permanently impossible.

  const { data: intent, error: iErr } = await admin.from("payment_intents").insert({
    workspace_id: body.workspace_id,
    order_id: body.order_id ?? null, booking_id: body.booking_id ?? null,
    provider: method, amount, currency, status: "succeeded",
    metadata: { created_by: actorId, cash_received: body.cash_received, change },
  }).select().single();
  if (iErr) throw BadRequest(iErr.message);

  const { data: payment, error: pErr } = await admin.from("payments").insert({
    intent_id: intent.id, amount, method, status: "succeeded",
  }).select().single();
  if (pErr) throw BadRequest(pErr.message);

  if (body.order_id) {
    const isPaid = amount >= fullAmount;
    const balanceDue = isPaid ? 0 : +(fullAmount - amount).toFixed(2);
    const updatedNotes = body.ref_number
      ? [existingNotes, `Ref: ${body.ref_number}`].filter(Boolean).join(" · ")
      : existingNotes;

    // G5 used to advance every fully-paid order straight to 'completed',
    // regardless of whether its kitchen ticket had actually been served —
    // an order could show "completed" on Dashboard/Reports while its food
    // was still sitting untouched on Prep Display. Now: only auto-complete
    // if this order never needed kitchen prep in the first place (no
    // kitchen_tickets rows at all, e.g. a pure retail sale) — otherwise
    // leave status alone and let the kitchen flow (recomputeOrderStatus in
    // kitchen-update-status/pos-kitchen) advance it to 'completed' once
    // every ticket is actually served.
    let statusPatch: { status?: string } = {};
    if (isPaid) {
      const { count: ticketCount } = await admin.from("kitchen_tickets")
        .select("id", { count: "exact", head: true })
        .eq("order_id", body.order_id);
      if (!ticketCount) statusPatch = { status: "completed" };
    }

    await admin.from("orders").update({
      ...statusPatch,
      payment_status: isPaid ? "paid" : "partially_paid",
      balance_due:    balanceDue,
      ...(body.ref_number ? { notes: updatedNotes } : {}),
    }).eq("id", body.order_id);
  }
  if (body.booking_id) {
    const newAmountPaid = +(amountPaid + amount).toFixed(2);
    const payStatus = newAmountPaid >= fullAmount ? "paid" : "partial";
    await admin.from("bookings").update({
      status: "confirmed", hold_expires_at: null, payment_status: payStatus, amount_paid: newAmountPaid,
    }).eq("id", body.booking_id);

    // Append an immutable ledger row for this payment event.
    await admin.from("booking_payment_transactions").insert({
      booking_id:   body.booking_id,
      workspace_id: body.workspace_id,
      amount,
      method,
      type:         "charge",
      reference:    intent.id,
      actor_id:     actorId,
    });
  }

  const { data: tx, error: tErr } = await admin.from("transactions").insert({
    workspace_id: body.workspace_id, branch_id: body.branch_id,
    type: "sale", reference_table: refTable, reference_id: refId,
    amount, status: "completed", created_by: actorId, payment_method: method,
  }).select().single();
  if (tErr) throw BadRequest(tErr.message);

  const newTotal = +(amountPaid + amount).toFixed(2);
  const balanceDue = body.order_id
    ? +(fullAmount - amount).toFixed(2)
    : +(fullAmount - newTotal).toFixed(2);
  const { data: receipt } = await admin.from("receipts").insert({
    workspace_id: body.workspace_id,
    transaction_id: tx.id,
    payload: {
      type: refTable, ref_id: refId, amount, currency,
      method, cash_received: body.cash_received, change,
      cashier_id: actorId, issued_at: new Date().toISOString(),
      ...(balanceDue > 0 ? { amount_paid: newTotal, balance_due: balanceDue } : {}),
    },
  }).select().single();

  return { intent, payment, tx, receipt, change };
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let paymentCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    idem = await idempotencyGuard(req, "payments-cash-confirm", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);

    const admin = adminClient();
    const { fullAmount, chargeAmount: resolvedCharge, amountPaid, refTable, refId, notes } = await resolveRefFromBody(admin, body);

    // custom_amount lets POS collect a partial deposit on bookings; fall back to resolved charge.
    // For orders, amount_tendered is already folded into resolvedCharge by resolveRefFromBody.
    const chargeAmount = (body.booking_id && body.custom_amount && body.custom_amount < fullAmount)
      ? body.custom_amount
      : resolvedCharge;

    if (chargeAmount > 0 && body.cash_received < chargeAmount) throw BadRequest("Cash received less than amount due");

    let currency = "PHP";
    const { data: ws } = await admin.from("workspaces").select("currency").eq("id", body.workspace_id).single();
    if (ws?.currency) currency = ws.currency;

    const { intent, payment, tx, receipt, change } = await recordCashPayment(
      admin, body, ctx.userId, { amount: chargeAmount, fullAmount, amountPaid }, currency, refTable, refId, notes,
    );
    paymentCreated = true;

    // Order may have been created with no shift_id (e.g. a web/kiosk guest
    // order later settled at the counter, or a balance collected here after
    // the fact) — attribute it to whichever shift this cashier currently has
    // open so it lands in their end-of-shift summary and drawer math.
    if (body.order_id) {
      await attributeOrderToOpenShift(admin, body.workspace_id, ctx.userId, body.order_id);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "payment.cash", entityType: "payment", entityId: payment.id,
      after: { intent, payment, transaction: tx, receipt },
    }));

    const result = { intent, payment, transaction: tx, receipt, change };
    await idem.commit(201, result);
    return json(result, 201);
  } catch (err) {
    if (idem && !paymentCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});
