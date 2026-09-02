// POST /bookings-confirm — promote a hold to confirmed (typically after payment).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  booking_id:   z.string().uuid(),
  order_id:     z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    const { data: booking, error } = await admin.from("bookings")
      .select("*, customers(name, email)").eq("id", body.booking_id).eq("workspace_id", body.workspace_id).maybeSingle();
    if (error) throw BadRequest(error.message);
    if (!booking) throw NotFound("Booking not found");
    if (booking.status === "cancelled") throw Conflict("Booking is cancelled");
    if (booking.status === "confirmed") {
      // Already confirmed — still link to order if provided (e.g., collecting payment via Orders tab)
      if (body.order_id) {
        const { error: linkErr } = await admin.from("order_booking_link").upsert(
          { order_id: body.order_id, booking_id: body.booking_id },
          { onConflict: "order_id,booking_id", ignoreDuplicates: true },
        );
        if (linkErr) throw BadRequest(linkErr.message);
      }
      return json({ booking });
    }
    if (booking.hold_expires_at && new Date(booking.hold_expires_at) < new Date()) {
      throw Conflict("Hold expired — please re-hold");
    }

    const { data: updated, error: uErr } = await admin.from("bookings")
      .update({ status: "confirmed", hold_expires_at: null })
      .eq("id", booking.id)
      .eq("status", booking.status)
      .select().single();
    if (uErr) {
      // Lost a race (e.g. a concurrent confirm, or the hold-expiry sweep) —
      // re-fetch and treat as already-confirmed rather than erroring.
      const { data: latest } = await admin.from("bookings").select("*, customers(name, email)").eq("id", booking.id).maybeSingle();
      if (latest?.status === "confirmed") return json({ booking: latest });
      throw uErr.code === "PGRST116" ? Conflict("Booking was modified by another request — please retry") : BadRequest(uErr.message);
    }

    if (body.order_id) {
      const { error: linkErr } = await admin.from("order_booking_link").upsert(
        { order_id: body.order_id, booking_id: body.booking_id },
        { onConflict: "order_id,booking_id", ignoreDuplicates: true },
      );
      if (linkErr) throw BadRequest(linkErr.message);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "booking.confirm", entityType: "booking", entityId: booking.id,
      before: booking, after: updated,
    }));

    // Send confirmation email — non-blocking, never fails the confirmation itself
    sendBookingConfirmationEmail(admin, updated, body.workspace_id).catch((err: unknown) => {
      console.error("[bookings-confirm] email failed:", err instanceof Error ? err.message : err);
    });

    return json({ booking: updated });
  } catch (err) { return handleError(err); }
});

async function sendBookingConfirmationEmail(
  admin: ReturnType<typeof adminClient>,
  booking: Record<string, unknown>,
  workspaceId: string,
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;

  // Resolve guest email: dedicated column → customers FK → notes fallback
  const guestEmail: string | null =
    (booking.guest_email as string | null) ||
    (booking.customers as any)?.email ||
    ((booking.notes as string) ?? "").split(" · ").find((p: string) => p.includes("@")) ||
    null;
  if (!guestEmail) return;

  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@findxny.app";

  // Fetch workspace name + resource name in parallel
  const [wsRes, resRes] = await Promise.all([
    admin.from("workspaces").select("name").eq("id", workspaceId).single(),
    admin.from("bookable_resources").select("name").eq("id", booking.resource_id as string).maybeSingle(),
  ]);

  const storeName   = (wsRes.data?.name as string) ?? "The Venue";
  const roomName    = (resRes.data?.name as string) ?? "Room";
  // Resolve guest name: dedicated column → customers FK → notes fallback
  const guestName   = (booking.guest_name as string | null) ||
    (booking.customers as any)?.name ||
    ((booking.notes as string) ?? "").split(" · ")[0] ||
    "Guest";
  const startTime   = booking.start_time as string;
  const endTime     = booking.end_time   as string;
  const totalAmount = booking.total      as number;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "long",
      timeStyle: "short",
    });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:32px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
    <h1 style="color:#111827;font-size:22px;margin:0 0 4px">${storeName}</h1>
    <p style="color:#6b7280;font-size:13px;margin:0 0 24px">Booking Confirmation</p>

    <p style="color:#111827;font-size:15px">Hi ${guestName},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6">
      Your booking has been <strong style="color:#10b981">confirmed</strong>. We look forward to hosting you!
    </p>

    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0">
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#6b7280;width:40%">Room / Space</td><td style="padding:4px 0;font-weight:600">${roomName}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Check-in</td><td style="padding:4px 0;font-weight:600">${fmt(startTime)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Check-out</td><td style="padding:4px 0;font-weight:600">${fmt(endTime)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Total</td><td style="padding:4px 0;font-weight:600;color:#111827">₱${Number(totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td></tr>
      </table>
    </div>

    <p style="color:#6b7280;font-size:13px;margin-top:24px">
      If you have questions, please contact us directly. We're happy to help!
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center">Powered by FINDXNY · ${storeName}</p>
  </div>
</body>
</html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:    `${storeName} <${fromEmail}>`,
      to:      [guestEmail],
      subject: `Booking Confirmed — ${roomName} at ${storeName}`,
      html,
    }),
  });
}
