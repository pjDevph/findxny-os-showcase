// POST /bookings-no-show
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
  reason:       z.string().optional(),
});

async function fetchBookingAndGuard(admin: ReturnType<typeof adminClient>, bookingId: string, workspaceId: string) {
  const { data: booking, error } = await admin.from("bookings")
    .select("*, bookable_resources(name), customers(email)")
    .eq("id", bookingId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!booking) throw NotFound("Booking not found");

  if (booking.status === "no_show")     throw Conflict("Booking is already marked as no-show");
  if (booking.status === "cancelled")   throw Conflict("Cannot mark a cancelled booking as no-show");
  if (booking.status === "expired")     throw Conflict("Cannot mark an expired booking as no-show");
  if (booking.status === "completed")   throw Conflict("Cannot mark a completed booking as no-show");
  if (booking.status === "checked_in")  throw Conflict("Guest has already checked in");
  if (booking.status === "checked_out") throw Conflict("Guest has already checked out");
  if (booking.status === "hold")        throw Conflict("Booking must be confirmed before marking no-show");

  return booking;
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

    const { data: updated, error: uErr } = await admin.from("bookings")
      .update({ status: "no_show", notes: body.reason ?? booking.notes })
      .eq("id", booking.id).select().single();
    if (uErr) throw BadRequest(uErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "booking.no_show", entityType: "booking", entityId: booking.id,
      before: booking, after: updated,
    }));

    return json({ booking: updated });
  } catch (err) { return handleError(err); }
});
