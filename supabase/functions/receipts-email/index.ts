// POST /receipts-email — send an order or booking receipt to a customer's email via Resend.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z
  .object({
    workspace_id:  z.string().uuid(),
    order_id:      z.string().uuid().optional(),
    booking_id:    z.string().uuid().optional(),
    email:         z.string().email(),
    customer_name: z.string().optional(),
  })
  .refine((b) => b.order_id || b.booking_id, {
    message: "Either order_id or booking_id is required",
  });

const MONO = "'Courier New', Courier, monospace";
const peso = (n: number) => `₱${n.toFixed(2)}`;

function buildOrderHtml(brand: string, order: any, items: any[], charges: any[]): string {
  const date = new Date(order.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  const customer = order.customer_name ?? order.customers?.name ?? "Guest";

  const itemRows = items
    .map(
      (it: any) => `
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#1a1a1a">
          <span style="display:inline-block;width:28px;color:#666">×${it.qty ?? it.quantity ?? 1}</span>${it.products?.name ?? it.name ?? "Item"}
        </td>
        <td style="padding:4px 0;text-align:right;font-size:12px;color:#1a1a1a;white-space:nowrap">${peso((it.unit_price ?? 0) * (it.qty ?? it.quantity ?? 1))}</td>
      </tr>`,
    )
    .join("");

  const chargeRows = charges
    .map(
      (c: any) => `
      <tr>
        <td style="padding:3px 0;font-size:12px;color:#666">${c.label ?? c.name ?? "Charge"}</td>
        <td style="padding:3px 0;font-size:12px;text-align:right">${peso(c.amount ?? 0)}</td>
      </tr>`,
    )
    .join("");

  const subtotal = items.reduce((s: number, it: any) => s + (it.unit_price ?? 0) * (it.qty ?? it.quantity ?? 1), 0);
  const chargesTotal = charges.reduce((s: number, c: any) => s + (c.amount ?? 0), 0);
  const total = order.total ?? subtotal + chargesTotal;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${MONO};color:#1a1a1a">
  <div style="max-width:420px;margin:24px auto;padding:0 16px">
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:28px 28px 32px">

      <!-- Brand -->
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-weight:700;font-size:16px;letter-spacing:0.04em">${brand}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;letter-spacing:0.08em">SALES ORDER</div>
      </div>

      <!-- Subheading -->
      <div style="text-align:center;font-size:13px;margin-bottom:14px">Thank you for your purchase!</div>

      <!-- Order meta -->
      <table style="width:100%;border-collapse:collapse;border-top:1px dashed #999;border-bottom:1px dashed #999;margin-bottom:12px">
        <tr><td style="padding:9px 0 3px;font-size:12px;color:#666">Order #</td><td style="padding:9px 0 3px;font-size:12px;font-weight:700;text-align:right">${order.order_no ?? order.id}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Date</td><td style="padding:3px 0;font-size:12px;text-align:right">${date}</td></tr>
        <tr><td style="padding:3px 0 9px;font-size:12px;color:#666">Customer</td><td style="padding:3px 0 9px;font-size:12px;text-align:right">${customer}</td></tr>
      </table>

      <!-- Items -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tbody>${itemRows}</tbody></table>

      ${charges.length > 0 ? `
      <!-- Charges -->
      <table style="width:100%;border-collapse:collapse;border-top:1px dashed #999;padding-top:10px;margin-bottom:10px">
        ${chargeRows}
      </table>` : ""}

      <!-- Total -->
      <table style="width:100%;border-collapse:collapse;border-top:2px solid #1a1a1a;border-bottom:2px solid #1a1a1a;margin-bottom:14px">
        <tr>
          <td style="padding:10px 0;font-size:14px;font-weight:700">TOTAL</td>
          <td style="padding:10px 0;font-size:14px;font-weight:700;text-align:right">${peso(total)}</td>
        </tr>
      </table>

      <!-- Footer -->
      <div style="text-align:center;font-size:10px;color:#666;line-height:1.6">
        <div>This is a system-generated receipt — please do not reply.</div>
        <div style="margin-top:6px;color:#aaa">Powered by FINDXNY</div>
      </div>

    </div>
  </div>
</body>
</html>`;
}

function buildBookingHtml(brand: string, booking: any, resourceName: string, customerName: string): string {
  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
  const datePaid = new Date(booking.created_at ?? booking.updated_at ?? Date.now()).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
  });
  const total = booking.total ?? 0;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${MONO};color:#1a1a1a">
  <div style="max-width:420px;margin:24px auto;padding:0 16px">
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:28px 28px 32px">

      <!-- Brand -->
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-weight:700;font-size:16px;letter-spacing:0.04em">${brand}</div>
        <div style="font-size:11px;color:#666;margin-top:2px;letter-spacing:0.08em">BOOKING CONFIRMATION</div>
      </div>

      <!-- Subheading -->
      <div style="text-align:center;font-size:13px;margin-bottom:14px">Thank you for your purchase!</div>

      <!-- Booking meta -->
      <table style="width:100%;border-collapse:collapse;border-top:1px dashed #999;border-bottom:1px dashed #999;margin-bottom:12px">
        <tr><td style="padding:9px 0 3px;font-size:12px;color:#666">Booking Ref</td><td style="padding:9px 0 3px;font-size:12px;font-weight:700;text-align:right">${booking.booking_ref ?? booking.id}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Date</td><td style="padding:3px 0;font-size:12px;text-align:right">${datePaid}</td></tr>
        <tr><td style="padding:3px 0 9px;font-size:12px;color:#666">Customer</td><td style="padding:3px 0 9px;font-size:12px;text-align:right">${customerName}</td></tr>
      </table>

      <!-- Booking details -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Room / Resource</td><td style="padding:3px 0;font-size:12px;font-weight:700;text-align:right">${resourceName}</td></tr>
        ${booking.check_in ? `<tr><td style="padding:3px 0;font-size:12px;color:#666">Check-in</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(booking.check_in)}</td></tr>` : ""}
        ${booking.check_out ? `<tr><td style="padding:3px 0;font-size:12px;color:#666">Check-out</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(booking.check_out)}</td></tr>` : ""}
        ${booking.start_time && !booking.check_in ? `<tr><td style="padding:3px 0;font-size:12px;color:#666">Check-in</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(booking.start_time)}</td></tr>` : ""}
        ${booking.end_time && !booking.check_out ? `<tr><td style="padding:3px 0;font-size:12px;color:#666">Check-out</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(booking.end_time)}</td></tr>` : ""}
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Status</td><td style="padding:3px 0;font-size:12px;font-weight:700;color:#0a7d2c;text-align:right">${(booking.status ?? "confirmed").toUpperCase()}</td></tr>
        ${booking._selfCancelRef ? `<tr><td style="padding:6px 0 3px;font-size:12px;color:#666;border-top:1px dashed #ccc">Self-Cancel Ref</td><td style="padding:6px 0 3px;font-size:12px;font-weight:700;text-align:right">${booking._selfCancelRef}</td></tr>` : ""}
        ${booking._cancelBy ? `<tr><td style="padding:3px 0 6px;font-size:12px;color:#666">Cancel before</td><td style="padding:3px 0 6px;font-size:12px;text-align:right">${fmtDate(booking._cancelBy)}</td></tr>` : ""}
      </table>
      ${booking._selfCancelRef ? `<div style="font-size:10px;color:#666;margin-bottom:12px;line-height:1.5">To cancel online: use <strong>${booking._selfCancelRef}</strong> + your phone number. Cancellation must be at least 48 hours before check-in.</div>` : ""}

      <!-- Total -->
      <table style="width:100%;border-collapse:collapse;border-top:2px solid #1a1a1a;border-bottom:2px solid #1a1a1a;margin-bottom:14px">
        <tr>
          <td style="padding:10px 0;font-size:14px;font-weight:700">TOTAL</td>
          <td style="padding:10px 0;font-size:14px;font-weight:700;text-align:right">${peso(total)}</td>
        </tr>
      </table>

      <!-- Footer -->
      <div style="text-align:center;font-size:10px;color:#666;line-height:1.6">
        <div>Present this confirmation upon arrival.</div>
        <div>This document is not an official receipt.</div>
        <div style="margin-top:6px;color:#aaa">Powered by FINDXNY</div>
      </div>

    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!RESEND_API_KEY) {
      return json({ error: "Email not configured. Set RESEND_API_KEY." }, 501);
    }

    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "FINDXNY <noreply@findxny.app>";

    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // 1. Fetch workspace for branding
    const { data: workspace, error: wsErr } = await admin
      .from("workspaces")
      .select("name")
      .eq("id", body.workspace_id)
      .maybeSingle();
    if (wsErr) throw BadRequest(wsErr.message);
    if (!workspace) throw NotFound("Workspace not found");

    const brand = workspace.name ?? "FINDXNY";
    let html: string;
    let entityId: string;
    let subject = `Your receipt — ${brand}`;

    if (body.order_id) {
      // 2a. Fetch order + items + charges
      const { data: order, error: oErr } = await admin
        .from("orders")
        .select("*, customers(name)")
        .eq("id", body.order_id)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle();
      if (oErr) throw BadRequest(oErr.message);
      if (!order) throw NotFound("Order not found");

      const { data: items, error: iErr } = await admin
        .from("order_items")
        .select("quantity, unit_price, products(name)")
        .eq("order_id", body.order_id);
      if (iErr) throw BadRequest(iErr.message);

      const { data: charges, error: cErr } = await admin
        .from("order_charges")
        .select("name, amount")
        .eq("order_id", body.order_id);
      if (cErr) throw BadRequest(cErr.message);

      entityId = body.order_id;

      // If no order_items, check for a linked booking (POS room booking)
      if (!items || items.length === 0) {
        const { data: link } = await admin
          .from("order_booking_link")
          .select("booking_id")
          .eq("order_id", body.order_id)
          .maybeSingle();

        if (link?.booking_id) {
          const { data: booking, error: bkErr } = await admin
            .from("bookings")
            .select("*, bookable_resources(name)")
            .eq("id", link.booking_id)
            .maybeSingle();
          if (bkErr) throw BadRequest(bkErr.message);

          if (booking) {
            const resourceName = booking.bookable_resources?.name ?? "Room";
            // Guest info is packed into booking.notes as "name · phone · email"
            const noteParts = (booking.notes ?? "").split(" · ");
            const guestName = noteParts[0] ?? "";
            const customerName = body.customer_name || guestName || order.customers?.name || "Guest";
            // Use order_no as the display ref; expose BK-ref for self-cancel
            booking.booking_ref = order.order_no;
            booking._selfCancelRef = `BK-${booking.id.slice(0, 8).toUpperCase()}`;
            const cancelTs = new Date(booking.start_time ?? "").getTime() - 48 * 3600 * 1000;
            if (!Number.isNaN(cancelTs)) booking._cancelBy = new Date(cancelTs).toISOString();
            html = buildBookingHtml(brand, booking, resourceName, customerName);
            subject = `Booking confirmed — ${resourceName} — ${booking.booking_ref ?? order.order_no}`;
          }
        }
      }

      if (!html) {
        // Normal product order
        if (body.customer_name) order.customer_name = body.customer_name;
        html = buildOrderHtml(brand, order, items ?? [], charges ?? []);
      }
    } else {
      // 2b. Fetch booking + resource (direct booking_id path)
      const { data: booking, error: bErr } = await admin
        .from("bookings")
        .select("*, bookable_resources(name)")
        .eq("id", body.booking_id!)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle();
      if (bErr) throw BadRequest(bErr.message);
      if (!booking) throw NotFound("Booking not found");

      const resourceName = booking.bookable_resources?.name ?? "Room";
      const noteParts = (booking.notes ?? "").split(" · ");
      const guestName = noteParts[0] ?? "";
      const customerName = body.customer_name || guestName || booking.customers?.name || "Guest";
      booking._selfCancelRef = `BK-${booking.id.slice(0, 8).toUpperCase()}`;
      const cancelTs2 = new Date(booking.start_time ?? "").getTime() - 48 * 3600 * 1000;
      if (!Number.isNaN(cancelTs2)) booking._cancelBy = new Date(cancelTs2).toISOString();

      html = buildBookingHtml(brand, booking, resourceName, customerName);
      subject = `Booking confirmed — ${resourceName} — BK-${booking.id.slice(0, 8).toUpperCase()}`;
      entityId = body.booking_id!;
    }

    // 5. Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: body.email, subject, html }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw BadRequest((e as { message?: string }).message ?? "Failed to send email");
    }

    // 8. Audit
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId: ctx.userId,
      action: "receipt.email_sent",
      entityType: body.order_id ? "order" : "booking",
      entityId,
      after: { email: body.email },
    }));

    return json({ sent: true, email: body.email });
  } catch (err) {
    return handleError(err);
  }
});
