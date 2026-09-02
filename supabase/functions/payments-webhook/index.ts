// POST /payments-webhook — Xendit invoice webhook handler.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError } from "../_shared/errors.ts";
import { audit } from "../_shared/auditLog.ts";
import { verifyWebhookToken, parseInvoiceWebhook } from "../_shared/xenditClient.ts";

type Admin = ReturnType<typeof adminClient>;

async function spawnKitchenTicket(admin: Admin, orderId: string, branchId: string, wsId: string) {
  const { data: items } = await admin
    .from("order_items")
    .select("id, product_id, products(kitchen_required)")
    .eq("order_id", orderId);
  if (!items?.length) return;
  const kitchenItems = (items as any[]).filter((it) => it.products?.kitchen_required);
  if (!kitchenItems.length) return;
  const { data: ticket } = await admin.from("kitchen_tickets")
    .insert({ order_id: orderId, branch_id: branchId, workspace_id: wsId }).select().single();
  if (ticket) {
    await admin.from("kitchen_ticket_items")
      .insert(kitchenItems.map((it) => ({ ticket_id: ticket.id, order_item_id: it.id })));
  }
}

async function handleCancelledIntent(admin: Admin, intent: any): Promise<Response> {
  if (intent.status === "pending") {
    await admin.from("payment_intents").update({ status: "cancelled" }).eq("id", intent.id);
    if (intent.order_id) {
      await admin.from("orders").update({ payment_status: "cancelled" }).eq("id", intent.order_id);
    } else if (intent.booking_id) {
      await admin.from("bookings").update({ hold_expires_at: null }).eq("id", intent.booking_id).eq("status", "hold");
    }
  }
  return json({ ok: true, cancelled: true });
}

async function advanceOrderAndGetBranch(admin: Admin, intent: any): Promise<string> {
  const { data: o } = await admin.from("orders")
    .select("branch_id").eq("id", intent.order_id).single();
  const branchId = o?.branch_id ?? "";
  await admin.from("orders").update({
    status: "preparing", payment_status: "paid",
  }).eq("id", intent.order_id);
  await spawnKitchenTicket(admin, intent.order_id, branchId, intent.workspace_id);
  return branchId;
}

async function confirmBookingAndGetBranch(
  admin: Admin, intent: any, method: string, invoiceId: string,
): Promise<string> {
  const { data: b } = await admin.from("bookings")
    .select("branch_id, status, total, amount_paid, notes, guest_email")
    .eq("id", intent.booking_id).single();

  // Only act on bookings still awaiting or collecting payment.
  // Ignore delayed Xendit webhooks for already-cancelled/completed bookings.
  if (b?.status !== "hold" && b?.status !== "confirmed") return b?.branch_id ?? "";

  const branchId     = b.branch_id ?? "";
  const prevPaid     = Number(b.amount_paid ?? 0);
  const xenditAmount = Number(intent.amount);
  const newAmountPaid = +(prevPaid + xenditAmount).toFixed(2);
  const fullAmount   = Number(b.total ?? 0);
  const payStatus    = newAmountPaid >= fullAmount ? "paid" : "partial";

  await admin.from("bookings").update({
    status: "confirmed", hold_expires_at: null,
    payment_status: payStatus, amount_paid: newAmountPaid,
  }).eq("id", intent.booking_id);

  // Append an immutable ledger row for this Xendit payment event.
  await admin.from("booking_payment_transactions").insert({
    booking_id:   intent.booking_id,
    workspace_id: intent.workspace_id,
    amount:       xenditAmount,
    method,
    type:         "charge",
    reference:    invoiceId,
    actor_id:     intent.metadata?.created_by ?? null,
  });

  // Auto-email receipt: dedicated column first, then notes fallback for legacy bookings.
  const guestEmail = (b.guest_email as string | null) ||
    (b.notes ?? "").split(" · ").find((p: string) => p.includes("@")) ||
    "";
  if (guestEmail) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (supabaseUrl && serviceKey) {
      fetch(`${supabaseUrl}/functions/v1/receipts-email`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          workspace_id: intent.workspace_id,
          booking_id:   intent.booking_id,
          email:        guestEmail,
        }),
      }).catch(() => {}); // fire-and-forget — don't block the webhook response
    }
  }

  return branchId;
}

async function recordTransactionAndReceipt(
  admin: Admin, intent: any, branchId: string, method: string,
  refTable: string, refId: string,
) {
  const { data: tx } = await admin.from("transactions").insert({
    workspace_id: intent.workspace_id, branch_id: branchId,
    type: "sale", reference_table: refTable, reference_id: refId,
    amount: intent.amount, status: "completed", payment_method: method,
  }).select().single();

  await admin.from("receipts").insert({
    workspace_id: intent.workspace_id, transaction_id: tx!.id,
    payload: {
      type: refTable, ref_id: refId, amount: intent.amount,
      currency: intent.currency, method, issued_at: new Date().toISOString(),
    },
  });
  return tx;
}

async function handlePaidIntent(
  admin: Admin, intent: any, event: { invoiceId: string; method: string },
): Promise<Response> {
  await admin.from("payment_intents").update({ status: "succeeded" }).eq("id", intent.id);

  const rawMethod = event.method.toUpperCase();
  const method = rawMethod === "PAYMAYA" ? "maya" : rawMethod.toLowerCase();
  const { data: payment } = await admin.from("payments").insert({
    intent_id: intent.id, amount: intent.amount, method, status: "succeeded",
  }).select().single();

  const branchId = intent.order_id
    ? await advanceOrderAndGetBranch(admin, intent)
    : await confirmBookingAndGetBranch(admin, intent, method, event.invoiceId);

  const refTable = intent.order_id ? "orders" : "bookings";
  const refId    = intent.order_id ?? intent.booking_id;
  const tx = await recordTransactionAndReceipt(admin, intent, branchId, method, refTable, refId);

  EdgeRuntime.waitUntil(audit({
    workspaceId: intent.workspace_id, actorId: intent.metadata?.created_by ?? null,
    action: "payment.webhook.succeeded", entityType: "payment", entityId: payment?.id ?? null,
    after: { intent_id: intent.id, transaction_id: tx!.id, xendit_invoice_id: event.invoiceId },
  }));

  return json({ ok: true });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") return new Response("POST only", { status: 405 });
    if (!verifyWebhookToken(req)) return new Response("Unauthorized", { status: 401 });

    const raw = await req.json();
    const event = parseInvoiceWebhook(raw);
    if (!event) return json({ ok: true, ignored: true });

    const admin = adminClient();

    // Claim this (invoice, status) transition atomically before touching any
    // payment/order/booking state. Two concurrent deliveries of the same
    // event (Xendit retry, duplicate delivery) both reach this point with
    // payment_intents still unmutated — the unique constraint lets exactly
    // one of them win the insert; the loser returns immediately instead of
    // racing the winner to apply the same side effects twice.
    const { error: dedupErr } = await admin.from("webhook_events").insert({
      provider: "xendit",
      event_key: `${event.invoiceId}:${event.status}`,
      payload: raw,
    });
    if (dedupErr) {
      // 23505 = unique_violation: another delivery of this same event already
      // claimed it — safe to no-op. Any other error (transient DB hiccup) must
      // propagate so we return non-200 and Xendit retries the delivery later,
      // instead of silently dropping a webhook we never actually processed.
      if (dedupErr.code === "23505") return json({ ok: true, duplicate: true });
      throw new Error(dedupErr.message);
    }

    const { data: intent } = await admin.from("payment_intents")
      .select("*").eq("provider_intent_id", event.invoiceId).maybeSingle();
    if (!intent) return json({ ok: true, ignored: "unknown intent" });

    if (["EXPIRED", "VOIDED", "CANCELLED"].includes(event.status)) {
      return await handleCancelledIntent(admin, intent);
    }

    if (event.status !== "PAID") return json({ ok: true, ignored: true });
    if (intent.status === "succeeded") return json({ ok: true, idempotent: true });
    if (intent.status === "cancelled") return json({ ok: true, ignored: "intent cancelled locally" });

    return await handlePaidIntent(admin, intent, event);
  } catch (err) { return handleError(err); }
});
