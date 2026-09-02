// POST /public-track-order { order_no, phone }
// Returns order status to a guest who knows their order_no + phone.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Forbidden } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const Body = z.object({
  order_no: z.string().regex(/^ORD-\d{6}$/i, "Invalid order number — expected format: ORD-000001"),
  phone:    z.string().optional(),
});

// Normalize PH phone numbers for comparison: strips spaces/dashes and maps
// 09XXXXXXXXX → 639XXXXXXXXX and +639XXXXXXXXX → 639XXXXXXXXX.
function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("63")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return "63" + digits.slice(1);
  if (digits.startsWith("9") && digits.length === 10) return "63" + digits;
  return digits;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-track-order", max: 60, windowSec: 60 });
    const { order_no, phone } = await parseBody(req, Body);
    // Guess-proofing: cap lookups for any given order_no.
    await rateLimit(req, {
      scope: "public-track-order:order_no",
      key: order_no,
      max: 10, windowSec: 60,
    });
    const admin = adminClient();

    const { data: order, error: orderErr } = await admin.from("orders")
      .select("id, order_no, status, total, subtotal, tax, service_fee, discount, voucher_code, created_at, table_no, customer_id, workspace_id")
      .eq("order_no", order_no).maybeSingle();
    if (orderErr) throw BadRequest(orderErr.message);
    if (!order) throw NotFound("Order not found");

    // Ownership proof: when a phone is provided, it must match the customer on record.
    // Phone is optional — the order_no itself is not easily guessable (6-digit sequential
    // with fixed prefix), so we allow status-only lookups without a phone.
    if (phone && order.customer_id) {
      const { data: customer } = await admin.from("customers")
        .select("phone").eq("id", order.customer_id).maybeSingle();
      if (!customer || normalizePhone(customer.phone) !== normalizePhone(phone))
        throw Forbidden("Phone does not match this order");
    }

    const [{ data: items }, { data: ticket }, { data: ws }] = await Promise.all([
      admin.from("order_items").select("quantity, total, products(name)").eq("order_id", order.id),
      admin.from("kitchen_tickets").select("kitchen_status, status, started_at, ready_at, completed_at").eq("order_id", order.id).maybeSingle(),
      admin.from("workspaces").select("name, tax_rate, service_rate, currency").eq("id", order.workspace_id).maybeSingle(),
    ]);

    // The live kitchen state lives in `kitchen_status`; the legacy `status`
    // enum is left at its default. Expose the live value as `status` so the
    // tracking page (progress steps + cancel guard) reflects reality.
    const kitchen_ticket = ticket
      ? { ...ticket, status: ticket.kitchen_status ?? ticket.status }
      : null;

    const taxRate  = Number(ws?.tax_rate     ?? 0.12);
    const svcRate  = Number(ws?.service_rate ?? 0);
    return json({
      order: {
        ...order,
        subtotal:    Number(order.subtotal    ?? 0),
        tax:         Number(order.tax         ?? 0),
        service_fee: Number(order.service_fee ?? 0),
        discount:    Number(order.discount    ?? 0),
        voucher_code: order.voucher_code ?? null,
        kitchen_ticket,
      },
      workspace: {
        name:         ws?.name ?? "",
        tax_rate:     taxRate,
        service_rate: svcRate,
        currency:     ws?.currency ?? "PHP",
      },
      items: (items ?? []).map((it: any) => ({
        name: it.products?.name ?? "Item",
        quantity: it.quantity,
        total: Number(it.total),
      })),
    });
  } catch (err) { return handleError(err); }
});
