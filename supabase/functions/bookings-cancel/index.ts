// POST /bookings-cancel
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { expireInvoice } from "../_shared/xenditClient.ts";
import { parseBody, z } from "../_shared/validators.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL     = Deno.env.get("RESEND_FROM_EMAIL") ?? "FINDXNY <noreply@findxny.app>";

async function sendCancellationEmail(args: {
  to: string; ref: string; brand: string;
  roomName: string; checkIn: string; checkOut: string; hadPayment: boolean;
}) {
  if (!RESEND_API_KEY || !args.to) return;
  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
  const MONO = "'Courier New', Courier, monospace";
  const paymentNote = args.hadPayment
    ? "A payment was recorded on this booking. Please contact us to arrange a refund."
    : "No payment was charged for this reservation.";
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
        ${args.checkIn ? `<tr><td style="padding:3px 0;font-size:12px;color:#666">Check-in</td><td style="padding:3px 0;font-size:12px;text-align:right">${fmtDate(args.checkIn)}</td></tr>` : ""}
        ${args.checkOut ? `<tr><td style="padding:3px 0 9px;font-size:12px;color:#666">Check-out</td><td style="padding:3px 0 9px;font-size:12px;text-align:right">${fmtDate(args.checkOut)}</td></tr>` : ""}
      </table>
      <div style="font-size:12px;line-height:1.6;margin-bottom:14px">Your booking was cancelled by our team. ${paymentNote}</div>
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
      body: JSON.stringify({ from: FROM_EMAIL, to: args.to, subject: `Your ${args.brand} booking ${args.ref} was cancelled`, html }),
    });
  } catch (err) { console.warn("cancellation email failed:", err); }
}

const Body = z.object({
  workspace_id: z.string().uuid(),
  booking_id:   z.string().uuid(),
  reason:       z.string().optional(),
});

async function fetchBookingAndGuard(admin: ReturnType<typeof adminClient>, bookingId: string, workspaceId: string) {
  const { data: booking, error } = await admin.from("bookings")
    .select("*, bookable_resources(name), customers(email), voucher_id")
    .eq("id", bookingId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!booking) throw NotFound("Booking not found");
  if (booking.status === "completed")   throw Conflict("Booking is already completed and cannot be cancelled");
  if (booking.status === "cancelled")   throw Conflict("Booking is already cancelled");
  if (booking.status === "expired")     throw Conflict("Booking has already expired");
  if (booking.status === "checked_in")  throw Conflict("Cannot cancel a booking that is currently checked in. Check out the guest first.");
  if (booking.status === "checked_out") throw Conflict("Booking is already checked out. Mark it as completed instead.");
  if (booking.status === "no_show")     throw Conflict("Booking is already marked as no-show and cannot be cancelled.");
  return booking;
}

async function voidPendingBookingIntents(admin: ReturnType<typeof adminClient>, bookingId: string, workspaceId: string) {
  const { data: intents } = await admin.from("payment_intents")
    .select("id, provider, provider_intent_id, status")
    .eq("booking_id", bookingId)
    .eq("workspace_id", workspaceId);
  const succeededIntent = (intents ?? []).find((i: any) => i.status === "succeeded");
  if (succeededIntent) {
    throw Conflict("Booking already paid. Refund the transaction instead of cancelling the booking directly.");
  }
  for (const intent of intents ?? []) {
    if (intent.provider === "xendit" && intent.provider_intent_id && intent.status === "pending") {
      try { await expireInvoice(intent.provider_intent_id); } catch (_err) { /* local cancel still proceeds; webhook is idempotent */ }
    }
    await admin.from("payment_intents").update({ status: "cancelled" }).eq("id", intent.id);
  }
}

async function updateBookingCancelled(admin: ReturnType<typeof adminClient>, booking: any, reason: string | undefined) {
  const { data: updated, error: uErr } = await admin.from("bookings")
    .update({
      status:              "cancelled",
      hold_expires_at:     null,
      cancelled_at:        new Date().toISOString(),
      cancellation_reason: reason ?? null,
    })
    .eq("id", booking.id).select().single();
  if (uErr) throw BadRequest(uErr.message);
  return updated;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    const booking = await fetchBookingAndGuard(admin, body.booking_id, body.workspace_id);
    await voidPendingBookingIntents(admin, booking.id, body.workspace_id);
    const updated = await updateBookingCancelled(admin, booking, body.reason);

    // Roll back voucher usage — non-blocking; failure must not abort the cancel.
    if (booking.voucher_id) {
      (async () => {
        try {
          await admin.from("voucher_redemptions").delete().eq("booking_id", booking.id);
          await admin.rpc("decrement_voucher_usage", {
            p_voucher_id:   booking.voucher_id,
            p_workspace_id: body.workspace_id,
          });
        } catch (err: unknown) {
          console.error("[bookings-cancel] voucher rollback failed:", err instanceof Error ? err.message : err);
        }
      })();
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "booking.cancel", entityType: "booking", entityId: booking.id,
      before: booking, after: updated,
    }));

    // Best-effort cancellation email — extract customer email from linked
    // customer record or from the notes field ("name · phone · email")
    const customerEmail: string =
      booking.customers?.email ||
      (booking.notes ?? "").split(" · ").find((p: string) => p.includes("@")) ||
      "";
    if (customerEmail) {
      const { data: ws } = await admin.from("workspaces").select("name").eq("id", body.workspace_id).maybeSingle();
      await sendCancellationEmail({
        to:          customerEmail,
        ref:         `BK-${booking.id.slice(0, 8).toUpperCase()}`,
        brand:       ws?.name ?? "FINDXNY",
        roomName:    booking.bookable_resources?.name ?? "Room",
        checkIn:     booking.start_time ?? "",
        checkOut:    booking.end_time ?? "",
        hadPayment:  ["partial", "paid"].includes(booking.payment_status ?? ""),
      });
    }

    return json({ booking: updated });
  } catch (err) { return handleError(err); }
});
