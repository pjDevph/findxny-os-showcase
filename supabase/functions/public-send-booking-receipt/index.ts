// POST /public-send-booking-receipt — sends a room booking receipt via Resend.
// Unauthenticated by design (guests have no session), so it's bound to a
// real, paid booking looked up server-side — the client can no longer supply
// arbitrary/fabricated booking content, and cannot trigger a send for a
// booking that doesn't exist or was never paid.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Forbidden } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { normalizePhone } from "../_shared/phone.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")    ?? "";
const FROM_EMAIL     = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

const Body = z.object({
  to:          z.string().email(),
  booking_ref: z.string().min(6).max(25).regex(/^[A-Za-z0-9-]+$/, "Invalid booking reference format"),
  phone:       z.string().optional(),
  method:      z.string().max(30).optional(),
});

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", counter: "Pay at counter",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    if (!RESEND_API_KEY) throw BadRequest("Email service not configured");
    await rateLimit(req, { scope: "public-send-booking-receipt", max: 5, windowSec: 60 });

    const body = await parseBody(req, Body);
    await rateLimit(req, { scope: "public-send-booking-receipt:ref", key: body.booking_ref, max: 5, windowSec: 60 });

    const admin = adminClient();
    // booking_ref is the first 8 hex chars of the booking uuid (same lookup as
    // public-track-booking / public-bookings-cancel).
    const ref = body.booking_ref.trim().toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8);
    if (ref.length !== 8) throw NotFound("Booking not found");
    const { data: booking, error: bookingErr } = await admin.from("bookings")
      .select("id, total, customer_id, resource_id, workspace_id, payment_status, start_time, end_time, created_at")
      .gte("id", `${ref}-0000-0000-0000-000000000000`)
      .lte("id", `${ref}-ffff-ffff-ffff-ffffffffffff`)
      .limit(1)
      .maybeSingle();
    if (bookingErr) throw BadRequest(bookingErr.message);
    if (!booking) throw NotFound("Booking not found");
    if (booking.payment_status !== "paid") throw BadRequest("This booking has not been paid yet — no receipt to send.");

    let customerName = "";
    if (booking.customer_id) {
      const { data: customer } = await admin.from("customers")
        .select("name, phone").eq("id", booking.customer_id).maybeSingle();
      if (body.phone && (!customer || normalizePhone(customer.phone) !== normalizePhone(body.phone))) {
        throw Forbidden("Phone does not match this booking");
      }
      customerName = customer?.name ?? "";
    }

    const [{ data: resource }, { data: ws }] = await Promise.all([
      booking.resource_id
        ? admin.from("bookable_resources").select("name").eq("id", booking.resource_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("workspaces").select("name").eq("id", booking.workspace_id).maybeSingle(),
    ]);

    const nights = Math.max(1, Math.round(
      (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / (24 * 60 * 60 * 1000),
    ));

    const peso = (n: number) => `₱${n.toFixed(2)}`;
    const fmtDate = (s: string) =>
      new Date(s).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
    const date = new Date(booking.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const brand    = ws?.name ?? "Mugthemug";
    const roomName = resource?.name ?? "Room booking";
    const method   = METHOD_LABELS[body.method ?? ""] ?? (body.method ? escapeHtml(body.method) : "—");
    const MONO     = "'Courier New', Courier, monospace";
    const bookingRefDisplay = ref.toUpperCase();

    // Light, print-safe receipt — kept visually unified with the downloadable
    // PNG receipts (booking-callback + order-tracking) and the order email.
    const html = `<!DOCTYPE html>
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

      <!-- Ref / date / customer -->
      <table style="width:100%;border-collapse:collapse;border-top:1px dashed #999;border-bottom:1px dashed #999;margin-bottom:12px">
        <tr><td style="padding:9px 0 3px;font-size:12px;color:#666">Booking Ref</td><td style="padding:9px 0 3px;font-size:12px;font-weight:700;text-align:right">${bookingRefDisplay}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Date Paid</td><td style="padding:3px 0;font-size:12px;text-align:right">${date}</td></tr>
        <tr><td style="padding:3px 0 9px;font-size:12px;color:#666">Customer</td><td style="padding:3px 0 9px;font-size:12px;text-align:right">${escapeHtml(customerName)}</td></tr>
      </table>

      <!-- Booking details -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Room</td><td style="padding:3px 0;font-size:12px;font-weight:700;text-align:right">${escapeHtml(roomName)}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Check-in</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(booking.start_time)}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Check-out</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(booking.end_time)}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Nights</td><td style="padding:3px 0;font-size:12px;text-align:right">${nights} night${nights === 1 ? "" : "s"}</td></tr>
      </table>

      <!-- Total -->
      <table style="width:100%;border-collapse:collapse;border-top:2px solid #1a1a1a;border-bottom:2px solid #1a1a1a;margin-bottom:14px">
        <tr>
          <td style="padding:10px 0;font-size:14px;font-weight:700">TOTAL PAID</td>
          <td style="padding:10px 0;font-size:14px;font-weight:700;text-align:right">${peso(Number(booking.total))}</td>
        </tr>
      </table>

      <!-- Payment / status -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Payment</td><td style="padding:3px 0;font-size:12px;text-align:right">${method}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Status</td><td style="padding:3px 0;font-size:12px;font-weight:700;color:#0a7d2c;text-align:right">PAID</td></tr>
      </table>

      <!-- Footer -->
      <div style="text-align:center;font-size:10px;color:#666;line-height:1.6">
        <div>Present this confirmation upon arrival.</div>
        <div>Cancellation requires 48 hours notice.</div>
        <div style="margin-top:6px">Thank you for booking with ${brand}.</div>
        <div>This document is not an official receipt.</div>
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
        subject: `Booking confirmed — ${roomName} — ${bookingRefDisplay}`,
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
