// POST /employees-update — change a staff member's role or branch assignment.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Forbidden } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  user_id:      z.string().uuid(),
  role:         z.enum(["owner", "admin", "manager", "cashier", "kitchen"]).optional(),
  branch_id:    z.string().uuid().nullable().optional(),
  is_suspended: z.boolean().optional(),
  is_archived:  z.boolean().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    if (body.user_id === ctx.userId) throw BadRequest("Cannot modify your own membership");
    if (body.role === "owner")       throw Forbidden("Cannot assign owner role");

    const admin = adminClient();
    const { data: existing, error: rErr } = await admin
      .from("workspace_members").select("*")
      .eq("workspace_id", body.workspace_id).eq("user_id", body.user_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!existing) throw NotFound("Staff member not found in workspace");
    if (existing.role === "owner") throw Forbidden("Cannot change the workspace owner's role");

    const patch: Record<string, unknown> = {};
    if (body.role         !== undefined) patch.role         = body.role;
    if (body.branch_id    !== undefined) patch.branch_id    = body.branch_id;
    if (body.is_suspended !== undefined) patch.is_suspended = body.is_suspended;
    if (body.is_archived  !== undefined) patch.is_archived  = body.is_archived;
    if (Object.keys(patch).length === 0) throw BadRequest("No fields to update");

    const { data: member, error } = await admin
      .from("workspace_members").update(patch)
      .eq("workspace_id", body.workspace_id).eq("user_id", body.user_id)
      .select().single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "staff.update", entityType: "workspace_member", entityId: body.user_id,
      before: existing, after: member,
    }));
    return json({ member });
  } catch (err) { return handleError(err); }
});
