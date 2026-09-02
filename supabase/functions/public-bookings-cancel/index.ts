// POST /public-bookings-cancel — guest self-service booking cancellation.
// Verifies ownership via booking_ref + phone. Enforces 48-hour cancellation policy.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Forbidden, Conflict } from "../_shared/errors.ts";
import { expireInvoice } from "../_shared/xenditClient.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const HOURS_48 = 48 * 60 * 60 * 1000;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")    ?? "";
const FROM_EMAIL     = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

const Body = z.object({
  booking_ref: z.string().min(1),
  phone:       z.string().min(7, "Please enter a valid mobile number"),
  reason:      z.string().optional(),
});

// Best-effort cancellation confirmation email. Light/print-safe styling kept
// consistent with the booking + order receipts. Never throws to the caller.
async function sendCancellationEmail(args: {
  to: string; ref: string; brand: string;
  roomName: string; checkIn: string; checkOut: string;
}) {
  if (!RESEND_API_KEY || !args.to) return;
  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
  const MONO = "'Courier New', Courier, monospace";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:${MONO};color:#1a1a1a">
  <div style="max-width:420px;margin:24px auto;padding:0 16px">
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:28px 28px 32px">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-weight:700;font-size:16px;letter-spacing:0.04em">${args.brand}</div>
        <div style="font-size:11px;color:#b42318;margin-top:2px;letter-spacing:0.08em">BOOKING CANCELLED</div>
      </div>
      <table style="width:100%;border-collapse:collapse;border-top:1px dashed #999;border-bottom:1px dashed #999;margin-bottom:12px">
        <tr><td style="padding:9px 0 3px;font-size:12px;color:#666">Booking Ref</td><td style="padding:9px 0 3px;font-size:12px;font-weight:700;text-align:right">${args.ref}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Room</td><td style="padding:3px 0;font-size:12px;text-align:right">${args.roomName}</td></tr>
        <tr><td style="padding:3px 0;font-size:12px;color:#666">Check-in</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(args.checkIn)}</td></tr>
        <tr><td style="padding:3px 0 9px;font-size:12px;color:#666">Check-out</td><td style="padding:3px 0 9px;font-size:12px;text-align:right">${fmtDate(args.checkOut)}</td></tr>
      </table>
      <div style="font-size:12px;line-height:1.6;margin-bottom:14px">
        This booking has been cancelled. No payment was charged for this reservation.
      </div>
      <div style="text-align:center;font-size:10px;color:#666;line-height:1.6">
        <div>Changed your mind? You can rebook this room anytime.</div>
        <div style="margin-top:6px">This is a system-generated notice.</div>
      </div>
    </div>
  </div>
</body></html>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL, to: args.to,
        subject: `Your ${args.brand} booking ${args.ref} was cancelled`,
        html,
      }),
    });
  } catch { /* best-effort — cancellation already succeeded */ }
}

async function resolveBookingByRef(admin: ReturnType<typeof adminClient>, booking_ref: string) {
  // booking_ref is the first 8 hex chars of the booking uuid. ILIKE can't be
  // used on a uuid column, so match via a prefix range on the uuid value.
  const ref = booking_ref.trim().toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8);
  if (ref.length !== 8) throw NotFound("Booking not found");
  const { data: booking } = await admin.from("bookings")
    .select("id, status, start_time, end_time, total, customer_id, resource_id, workspace_id, hold_expires_at")
    .gte("id", `${ref}-0000-0000-0000-000000000000`)
    .lte("id", `${ref}-ffff-ffff-ffff-ffffffffffff`)
    .limit(1)
    .maybeSingle();
  if (!booking) throw NotFound("Booking not found");
  return booking;
}

async function verifyBookingOwnership(admin: ReturnType<typeof adminClient>, booking: any, phone: string) {
  const { data: customer } = await admin.from("customers")
    .select("name, phone, email").eq("id", booking.customer_id).maybeSingle();
  if (!customer || normalizePhone(customer.phone) !== normalizePhone(phone)) throw Forbidden("Phone does not match this booking");
  return customer;
}

async function guardBookingCancellablePublic(admin: ReturnType<typeof adminClient>, booking: any) {
  const { data: intents } = await admin.from("payment_intents")
    .select("id, provider, provider_intent_id, status")
    .eq("booking_id", booking.id);
  const paid = (intents ?? []).find((i: any) => i.status === "succeeded");
  if (paid) {
    throw Conflict("This booking has already been paid. Please contact the cafe to arrange a refund.");
  }
  enforce48HourPolicy(booking);
  return intents;
}

function enforce48HourPolicy(booking: any) {
  const checkIn   = new Date(booking.start_time).getTime();
  const now       = Date.now();
  const hoursLeft = (checkIn - now) / (60 * 60 * 1000);
  if (checkIn - now < HOURS_48) {
    throw Conflict(
      `Cancellation is not allowed within 48 hours of check-in. ` +
      `Your check-in is in ${Math.max(0, Math.floor(hoursLeft))} hour(s). ` +
      `Please contact the cafe directly for assistance.`
    );
  }
}

async function expireAndCancelBookingIntents(admin: ReturnType<typeof adminClient>, booking: any, intents: any[]) {
  for (const intent of intents ?? []) {
    if (intent.provider === "xendit" && intent.provider_intent_id && intent.status === "pending") {
      try { await expireInvoice(intent.provider_intent_id); } catch { /* proceed anyway */ }
    }
    await admin.from("payment_intents").update({ status: "cancelled" }).eq("id", intent.id);
  }
  const { data: updated, error } = await admin.from("bookings").update({
    status: "cancelled",
    hold_expires_at: null,
    notes: booking.reason ?? null,
  }).eq("id", booking.id).select().single();
  if (error) throw BadRequest(error.message);
  return updated;
}

async function maybeSendCancellationEmail(admin: ReturnType<typeof adminClient>, booking: any, customer: any) {
  if (!customer.email) return;
  const [{ data: resource }, { data: ws }] = await Promise.all([
    booking.resource_id
      ? admin.from("bookable_resources").select("name").eq("id", booking.resource_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("workspaces").select("name").eq("id", booking.workspace_id).maybeSingle(),
  ]);
  await sendCancellationEmail({
    to:       customer.email,
    ref:      booking.id.slice(0, 8).toUpperCase(),
    brand:    ws?.name ?? "Mugthemug",
    roomName: resource?.name ?? "Room booking",
    checkIn:  booking.start_time,
    checkOut: booking.end_time,
  });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-bookings-cancel", max: 20, windowSec: 60 });
    const { booking_ref, phone, reason } = await parseBody(req, Body);
    // Guess-proofing: cap phone-match attempts against any given booking_ref.
    await rateLimit(req, { scope: "public-bookings-cancel:ref", key: booking_ref, max: 10, windowSec: 60 });
    const admin = adminClient();

    const booking = await resolveBookingByRef(admin, booking_ref);
    const customer = await verifyBookingOwnership(admin, booking, phone);

    if (booking.status === "cancelled") return json({ booking, message: "Booking is already cancelled" });
    if (booking.status === "completed") throw Conflict("This booking has already been completed and cannot be cancelled.");

    const intents = await guardBookingCancellablePublic(admin, booking);
    const bookingWithReason = { ...booking, reason };
    const updated = await expireAndCancelBookingIntents(admin, bookingWithReason, intents);

    // Roll back voucher usage non-blocking — mirrors admin bookings-cancel behaviour.
    const { data: bk } = await admin.from("bookings")
      .select("voucher_id").eq("id", booking.id).maybeSingle();
    if (bk?.voucher_id) {
      (async () => {
        try {
          await admin.from("voucher_redemptions").delete().eq("booking_id", booking.id);
          await admin.rpc("decrement_voucher_usage", {
            p_voucher_id: bk.voucher_id, p_workspace_id: booking.workspace_id,
          });
        } catch (err: unknown) {
          console.error("[public-bookings-cancel] voucher rollback failed:", err instanceof Error ? err.message : err);
        }
      })();
    }

    await maybeSendCancellationEmail(admin, booking, customer);

    return json({ booking: updated, message: "Booking cancelled successfully" });
  } catch (err) { return handleError(err); }
});
