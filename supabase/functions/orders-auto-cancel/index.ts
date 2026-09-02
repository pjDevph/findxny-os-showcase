// POST /orders-auto-cancel
// Cancels orders stuck in pending/preparing/ready for > 6 hours.
// For web paid orders: auto-refunds via Xendit API.
// For POS paid orders: cancels only (manual cash refund).
// Deployed with --no-verify-jwt — called by pg_cron via pg_net.
// Gated by requireCronSecret since it triggers real Xendit refunds across
// every workspace; only pg_cron (which sends x-cron-secret) may call it.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError } from "../_shared/errors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { createRefund, expireInvoice, getInvoice } from "../_shared/xenditClient.ts";
import { getUnservedOrderItemIds, reverseOrderStock } from "../_shared/stockReversal.ts";

function sixHoursAgo(): string {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    requireCronSecret(req);
    const admin = adminClient();

    const { data: staleOrders, error: findErr } = await admin
      .from("orders")
      .select("id,order_no,status,source,payment_status,total,workspace_id,branch_id")
      .in("status", ["pending", "preparing", "ready"])
      .lt("created_at", sixHoursAgo());

    if (findErr) throw new Error(findErr.message);
    if (!staleOrders?.length) return json({ cancelled: 0, refunded: 0, errors: [] });

    let cancelled = 0;
    let refunded = 0;
    const errors: string[] = [];

    for (const order of staleOrders) {
      try {
        // Complete any open kitchen tickets
        await admin.from("kitchen_tickets")
          .update({ kitchen_status: "completed" })
          .eq("order_id", order.id)
          .not("kitchen_status", "in", "(served,completed)");

        // Fetch linked payment intent
        const { data: intent } = await admin.from("payment_intents")
          .select("id,status,provider,provider_intent_id,amount,currency")
          .eq("order_id", order.id)
          .maybeSingle();

        // A local "pending" intent doesn't mean the payment didn't happen —
        // it can just mean the confirmation webhook was lost. Reconcile
        // against Xendit's actual invoice status before expiring/cancelling,
        // so a lost webhook can't cause us to cancel (with no refund) an
        // order the customer already paid for.
        let effectivePaymentStatus = order.payment_status;
        if (
          intent?.status === "pending" &&
          intent.provider === "xendit" &&
          intent.provider_intent_id
        ) {
          let actualStatus: string | null = null;
          try {
            actualStatus = (await getInvoice(String(intent.provider_intent_id))).status;
          } catch (e: any) {
            errors.push(`get_invoice ${order.order_no}: ${e?.message}`);
          }

          if (actualStatus === "PAID" || actualStatus === "SETTLED") {
            // Self-heal: the payment succeeded but our webhook never arrived.
            // Mark it paid locally so the auto-refund branch below (stale
            // paid order → refund) handles it correctly instead of us
            // silently cancelling a captured payment.
            await admin.from("payment_intents").update({ status: "succeeded" }).eq("id", intent.id);
            await admin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
            effectivePaymentStatus = "paid";
          } else {
            try {
              await expireInvoice(String(intent.provider_intent_id));
            } catch (e: any) {
              errors.push(`expire_invoice ${order.order_no}: ${e?.message}`);
            }
            await admin.from("payment_intents")
              .update({ status: "cancelled" })
              .eq("id", intent.id);
          }
        }

        // Auto-refund web paid orders via Xendit
        if (
          effectivePaymentStatus === "paid" &&
          order.source === "web" &&
          intent?.provider === "xendit" &&
          intent.provider_intent_id
        ) {
          try {
            const refundResult = await createRefund({
              invoiceId: String(intent.provider_intent_id),
              amount: Number(order.total),
              currency: String(intent.currency ?? "PHP"),
              reason: "REQUESTED_BY_CUSTOMER",
              idempotencyKey: `auto_cancel_refund_${order.id}`,
            });

            await admin.from("refunds").insert({
              workspace_id: order.workspace_id,
              order_id: order.id,
              amount: Number(order.total),
              reason: "auto_cancel_6h",
              status: "succeeded",
              provider_refund_id: String((refundResult as any).id ?? ""),
            });

            await admin.from("transactions").insert({
              workspace_id: order.workspace_id,
              branch_id: order.branch_id,
              type: "refund",
              reference_table: "orders",
              reference_id: order.id,
              amount: -Number(order.total),
              status: "completed",
            });

            await admin.from("payment_intents")
              .update({ status: "refunded" })
              .eq("id", intent.id);

            refunded++;
          } catch (e: any) {
            errors.push(`refund ${order.order_no}: ${e?.message}`);
          }
        }

        // Cancel the order
        await admin.from("orders")
          .update({ status: "cancelled" })
          .eq("id", order.id);

        cancelled++;

        // Restore ingredient + inventory deductions for items that were never
        // served — a stale order can still have partially-served items (e.g.
        // one dish served, the rest stuck), and those shouldn't be restocked.
        // Non-blocking so one failed reversal doesn't block the rest of the batch.
        getUnservedOrderItemIds(admin, order.id)
          .then((unservedIds) => unservedIds.length
            ? reverseOrderStock(admin, order.id, "auto_cancel", unservedIds).then(() => {})
            : undefined)
          .catch((err: unknown) => {
            errors.push(`stock_restore ${order.order_no}: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
          });
      } catch (e: any) {
        errors.push(`cancel ${order.order_no}: ${e?.message}`);
      }
    }

    return json({ cancelled, refunded, errors });
  } catch (err) { return handleError(err); }
});
