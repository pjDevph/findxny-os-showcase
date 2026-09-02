// POST /bookings-check-in — mark a guest's arrival (check_in) or departure
// (check_out). Check-in stamps checked_in_at and sets status to checked_in;
// check-out sets status to checked_out.
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
  action:       z.enum(["check_in", "check_out"]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    const { data: booking } = await admin.from("bookings")
      .select("*").eq("id", body.booking_id).eq("workspace_id", body.workspace_id).maybeSingle();
    if (!booking) throw NotFound("Booking not found");

    let patch: Record<string, unknown>;
    if (body.action === "check_in") {
      if (booking.status !== "confirmed") throw Conflict("Booking must be confirmed before check-in");
      patch = { checked_in_at: new Date().toISOString(), status: "checked_in" };
    } else {
      if (booking.status !== "checked_in") throw Conflict("Booking must be checked in before checkout");
      patch = { status: "checked_out", checked_out_at: new Date().toISOString() };
    }

    const { data: updated, error: uErr } = await admin.from("bookings")
      .update(patch).eq("id", booking.id).select().single();
    if (uErr) throw BadRequest(uErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: body.action === "check_in" ? "booking.check_in" : "booking.check_out",
      entityType: "booking", entityId: booking.id,
      before: booking, after: updated,
    }));
    return json({ booking: updated });
  } catch (err) { return handleError(err); }
});
