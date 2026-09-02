// POST /bookings-complete
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
      .select("id, status, workspace_id, branch_id")
      .eq("id", body.booking_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (error) throw BadRequest(error.message);
    if (!booking) throw NotFound("Booking not found");

    if (booking.status === "completed") throw Conflict("Booking is already completed");
    if (booking.status === "cancelled") throw Conflict("Booking is already cancelled");
    if (booking.status !== "checked_out") {
      throw Conflict(`Booking must be checked out before completing. Current status: ${booking.status}`);
    }

    const { data: updated, error: uErr } = await admin.from("bookings")
      .update({ status: "completed" })
      .eq("id", booking.id)
      .select()
      .single();
    if (uErr) throw BadRequest(uErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "booking.complete", entityType: "booking", entityId: booking.id,
      before: booking, after: updated,
    }));

    return json({ booking: updated });
  } catch (err) { return handleError(err); }
});
