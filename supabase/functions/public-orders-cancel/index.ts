// POST /public-orders-cancel — guest self-service order cancellation.
// Verifies ownership via order_no + phone. Blocks if paid or kitchen processing.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Forbidden, Conflict } from "../_shared/errors.ts";
import { expireInvoice } from "../_shared/xenditClient.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { normalizePhone } from "../_shared/phone.ts";

const Body = z.object({
  order_no: z.string().min(1),
  phone:    z.string().min(7, "Please enter a valid mobile number").optional(),
  reason:   z.string().optional(),
});

// Once the kitchen has taken the ticket (accepted) or started, the guest can
// no longer self-cancel — they must contact the cafe.
const KITCHEN_PROCESSING = new Set(["accepted", "preparing", "ready"]);

async function verifyOrderOwnership(admin: ReturnType<typeof adminClient>, order: any, phone: string | undefined) {
  if (!phone) return;
  const { data: customer } = await admin.from("customers")
    .select("phone").eq("id", order.customer_id).maybeSingle();
  if (!customer || normalizePhone(customer.phone) !== normalizePhone(phone)) {
    throw Forbidden("Phone does not match this order");
  }
}

async function guardOrderCancellable(admin: ReturnType<typeof adminClient>, order: any) {
  const { data: intents } = await admin.from("payment_intents")
    .select("id, provider, provider_intent_id, status")
    .eq("order_id", order.id);
  const paid = (intents ?? []).find((i: any) => i.status === "succeeded");
  if (paid) throw Conflict("This order has already been paid. Please contact the cafe to arrange a refund.");

  // Block if kitchen is already processing. The live state lives in
  // `kitchen_status` (kitchen-update-status only advances that column); the
  // legacy `status` enum stays at its creation default, so guarding on it
  // alone let guests cancel orders that were already preparing/ready.
  const { data: ticket } = await admin.from("kitchen_tickets")
    .select("kitchen_status, status").eq("order_id", order.id).maybeSingle();
  const kitchenState = ticket?.kitchen_status ?? ticket?.status;
  if (ticket && KITCHEN_PROCESSING.has(kitchenState)) {
    throw Conflict("Your order is already being prepared in the kitchen. Please contact the cafe directly to cancel.");
  }
  return { intents, ticket };
}

async function expireAndCancelIntents(admin: ReturnType<typeof adminClient>, intents: any[]) {
  for (const intent of intents) {
    if (intent.provider === "xendit" && intent.provider_intent_id && intent.status === "pending") {
      try { await expireInvoice(intent.provider_intent_id); } catch { /* proceed anyway */ }
    }
    await admin.from("payment_intents").update({ status: "cancelled" }).eq("id", intent.id);
  }
}

async function applyPublicOrderCancellation(admin: ReturnType<typeof adminClient>, order: any, ticket: any, intents: any[], reason: string | undefined) {
  await expireAndCancelIntents(admin, intents ?? []);
  if (ticket) {
    await admin.from("kitchen_tickets").update({ status: "completed" }).eq("order_id", order.id);
  }
  const { data: updated, error } = await admin.from("orders").update({
    status: "cancelled",
    payment_status: "cancelled",
    notes: reason ?? null,
  }).eq("id", order.id).select().single();
  if (error) throw BadRequest(error.message);
  return updated;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-orders-cancel", max: 20, windowSec: 60 });
    const { order_no, phone, reason } = await parseBody(req, Body);
    // Guess-proofing: cap phone-match attempts against any given order_no,
    // mirroring public-track-order's per-order_no throttle.
    await rateLimit(req, { scope: "public-orders-cancel:order_no", key: order_no, max: 10, windowSec: 60 });
    const admin = adminClient();

    const { data: order } = await admin.from("orders")
      .select("id, order_no, status, total, customer_id, workspace_id, payment_status")
      .eq("order_no", order_no).maybeSingle();
    if (!order) throw NotFound("Order not found");

    await verifyOrderOwnership(admin, order, phone);

    if (order.status === "cancelled") return json({ order, message: "Order is already cancelled" });
    if (order.status === "completed") throw Conflict("This order has already been completed and cannot be cancelled.");

    const { intents, ticket } = await guardOrderCancellable(admin, order);
    const updated = await applyPublicOrderCancellation(admin, order, ticket, intents, reason);

    return json({ order: updated, message: "Order cancelled successfully" });
  } catch (err) { return handleError(err); }
});
