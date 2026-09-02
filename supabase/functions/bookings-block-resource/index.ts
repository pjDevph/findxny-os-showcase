// POST /bookings-block-resource — mark a room/resource unavailable for a date range
// Prevents new holds/bookings from being placed in the blocked window.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const Body = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().optional().nullable(),
  resource_id:  z.string().uuid(),
  start_date:   z.string().regex(DATE_RE, "start_date must be YYYY-MM-DD"),
  end_date:     z.string().regex(DATE_RE, "end_date must be YYYY-MM-DD"),
  block_type:   z.enum(["maintenance", "owner_block", "cleaning", "private_event"]),
  reason:       z.string().max(500).optional().nullable(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    if (body.end_date < body.start_date) throw BadRequest("end_date must be on or after start_date");

    const admin = adminClient();

    // Verify resource belongs to this workspace
    const { data: resource, error: rErr } = await admin
      .from("bookable_resources")
      .select("id, workspace_id")
      .eq("id", body.resource_id)
      .maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!resource || resource.workspace_id !== body.workspace_id) throw NotFound("Resource not found");

    // Reject if any active booking overlaps this date range
    const { count: bookingCount, error: bErr } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", body.resource_id)
      .in("status", ["hold", "confirmed", "checked_in"])
      .lte("start_time", `${body.end_date}T23:59:59+00:00`)
      .gte("end_time", `${body.start_date}T00:00:00+00:00`);
    if (bErr) throw BadRequest(bErr.message);
    if ((bookingCount ?? 0) > 0) {
      throw Conflict("Block overlaps existing confirmed booking(s). Cancel or reschedule them first.");
    }

    const { data: block, error } = await admin
      .from("resource_blocks")
      .insert({
        workspace_id: body.workspace_id,
        branch_id:    body.branch_id ?? null,
        resource_id:  body.resource_id,
        start_date:   body.start_date,
        end_date:     body.end_date,
        block_type:   body.block_type,
        reason:       body.reason ?? null,
        is_active:    true,
        created_by:   ctx.userId,
      })
      .select()
      .single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "resource.block", entityType: "resource_block", entityId: block.id,
      after: block,
    }));

    return json({ block }, 201);
  } catch (err) { return handleError(err); }
});
