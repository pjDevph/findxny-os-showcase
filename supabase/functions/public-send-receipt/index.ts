// POST /public-send-receipt — sends a receipt copy via Resend.
// Unauthenticated by design (guests have no session), so it's bound to a
// real, paid order looked up server-side — the client can no longer supply
// arbitrary/fabricated order content, and cannot trigger a send for an
// order that doesn't exist or was never paid.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Forbidden } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { normalizePhone } from "../_shared/phone.ts";

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY")    ?? "";
const FROM_EMAIL      = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

const Body = z.object({
  to:       z.string().email(),
  order_no: z.string().regex(/^ORD-\d{6}$/i, "Invalid order number — expected format: ORD-000001"),
  phone:    z.string().optional(),
  method:   z.string().max(30).optional(),
});

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph",
  pay_at_counter: "Cash · at counter", counter: "Cash · at counter", cash: "Cash",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    if (!RESEND_API_KEY) throw BadRequest("Email service not configured");
    await rateLimit(req, { scope: "public-send-receipt", max: 5, windowSec: 60 });

    const body = await parseBody(req, Body);
    // Guess-proofing: cap sends triggered for any given order_no, mirroring
    // public-track-order's per-order_no throttle.
    await rateLimit(req, { scope: "public-send-receipt:order_no", key: body.order_no, max: 5, windowSec: 60 });

    const admin = adminClient();
    const { data: order, error: orderErr } = await admin.from("orders")
      .select("id, order_no, total, subtotal, tax, service_fee, customer_id, workspace_id, payment_status, created_at")
      .eq("order_no", body.order_no).maybeSingle();
    if (orderErr) throw BadRequest(orderErr.message);
    if (!order) throw NotFound("Order not found");
    if (order.payment_status !== "paid") throw BadRequest("This order has not been paid yet — no receipt to send.");

    let customerName = "";
    if (order.customer_id) {
      const { data: customer } = await admin.from("customers")
        .select("name, phone").eq("id", order.customer_id).maybeSingle();
      if (body.phone && (!customer || normalizePhone(customer.phone) !== normalizePhone(body.phone))) {
        throw Forbidden("Phone does not match this order");
      }
      customerName = customer?.name ?? "";
    }

    const [{ data: items }, { data: ws }] = await Promise.all([
      admin.from("order_items").select("quantity, total, products(name)").eq("order_id", order.id),
      admin.from("workspaces").select("name, tax_rate, service_rate").eq("id", order.workspace_id).maybeSingle(),
    ]);

    const peso = (n: number) => `₱${n.toFixed(2)}`;
    const date = new Date(order.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const brand  = ws?.name ?? "Mugthemug";
    const method = METHOD_LABELS[body.method ?? ""] ?? (body.method ? escapeHtml(body.method) : "—");
    const MONO   = "'Courier New', Courier, monospace";
    const subtotal = Number(order.subtotal ?? 0);
    const vat      = Number(order.tax ?? 0);
    const svc      = Number(order.service_fee ?? 0);
    const taxRate  = Number(ws?.tax_rate ?? 0.12);
    const svcRate  = Number(ws?.service_rate ?? 0);

    const rows = (items ?? []).map((it: any) => {
      const name = escapeHtml(it.products?.name ?? "Item");
      return `<tr>
        <td style="padding:4px 0;font-size:12px;color:#1a1a1a"><span style="display:inline-block;width:28px;color:#666">×${Number(it.quantity)}</span>${name}</td>
        <td style="padding:4px 0;text-align:right;font-size:12px;color:#1a1a1a;white-space:nowrap">${peso(Number(it.total))}</td>
      </tr>`;
    }).join("");

    // Light, print-safe receipt — visually unified with the downloadable PNG
    // receipts (order-tracking + booking-callback) and the booking email.
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${MONO};color:#1a1a1a">
  <div style="max-width:420px;margin:24px auto;padding:0 16px">
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:28px 28px 32px">

      <!-- Brand -->
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-weight:700;font-size:16px;letter-spacing:0.04em">${brand}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;letter-spacing:0.08em">ORDER RECEIPT</div>
      </div>

      <!-- Order # / date / customer -->
      <table style="width:100%;border-collapse:collapse;border-top:1px dashed #999;border-bottom:1px dashed #999;margin-bottom:12px">
        <tr><td style="padding:9px 0 3px;font-size:12px;color:#666">Order #</td><td style="padding:9px 0 3px;font-size:12px;font-weight:700;text-align:right">${escapeHtml(order.order_no)}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Date</td><td style="padding:3px 0;font-size:12px;text-align:right">${date}</td></tr>
        <tr><td style="padding:3px 0 9px;font-size:12px;color:#666">Customer</td><td style="padding:3px 0 9px;font-size:12px;text-align:right">${escapeHtml(customerName)}</td></tr>
      </table>

      <!-- Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tbody>${rows}</tbody></table>

      <!-- Breakdown -->
      <table style="width:100%;border-collapse:collapse;border-top:1px dashed #999;padding-top:10px;margin-bottom:10px">
        <tr><td style="padding:6px 0 3px;font-size:12px;color:#666">Subtotal</td><td style="padding:6px 0 3px;font-size:12px;text-align:right">${peso(subtotal)}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Service charge (${Math.round(svcRate * 100)}%)</td><td style="padding:3px 0;font-size:12px;text-align:right">${peso(svc)}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">VAT (${Math.round(taxRate * 100)}%)</td><td style="padding:3px 0;font-size:12px;text-align:right">${peso(vat)}</td></tr>
      </table>

      <!-- Total -->
      <table style="width:100%;border-collapse:collapse;border-top:2px solid #1a1a1a;border-bottom:2px solid #1a1a1a;margin-bottom:14px">
        <tr>
          <td style="padding:10px 0;font-size:14px;font-weight:700">TOTAL PAID</td>
          <td style="padding:10px 0;font-size:14px;font-weight:700;text-align:right">${peso(Number(order.total))}</td>
        </tr>
      </table>

      <!-- Payment / status -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Payment</td><td style="padding:3px 0;font-size:12px;text-align:right">${method}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Status</td><td style="padding:3px 0;font-size:12px;font-weight:700;color:#0a7d2c;text-align:right">PAID</td></tr>
      </table>

      <!-- Footer -->
      <div style="text-align:center;font-size:10px;color:#666;line-height:1.6">
        <div>Thank you for dining with ${brand}.</div>
        <div>This is a system-generated receipt — please do not reply.</div>
      </div>

    </div>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      body.to,
        subject: `Your ${brand} receipt · ${order.order_no}`,
        html,
      }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw BadRequest((e as { message?: string }).message ?? "Failed to send email");
    }

    return json({ ok: true });
  } catch (err) { return handleError(err); }
});
