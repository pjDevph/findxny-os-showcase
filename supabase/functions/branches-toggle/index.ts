// POST /branches-toggle — flip accepting_orders / accepting_bookings flags on a branch.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:       z.string().uuid(),
  branch_id:          z.string().uuid(),
  accepting_orders:   z.boolean().optional(),
  accepting_bookings: z.boolean().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();
    const { data: branch, error: rErr } = await admin
      .from("branches").select("*").eq("id", body.branch_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!branch || branch.workspace_id !== body.workspace_id) throw NotFound("Branch not found");

    const patch: Record<string, unknown> = {};
    if (body.accepting_orders   !== undefined) patch.accepting_orders   = body.accepting_orders;
    if (body.accepting_bookings !== undefined) patch.accepting_bookings = body.accepting_bookings;
    if (Object.keys(patch).length === 0) throw BadRequest("Provide at least one flag to update");

    const { data: updated, error } = await admin
      .from("branches").update(patch).eq("id", body.branch_id).select().single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "branch.toggle", entityType: "branch", entityId: body.branch_id,
      before: { accepting_orders: branch.accepting_orders, accepting_bookings: branch.accepting_bookings },
      after:  patch,
    }));

    return json({
      branch: {
        id:                 updated.id,
        accepting_orders:   updated.accepting_orders,
        accepting_bookings: updated.accepting_bookings,
      },
    });
  } catch (err) { return handleError(err); }
});
