// POST /employees-remove — remove a staff member from a workspace.
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
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    if (body.user_id === ctx.userId) throw BadRequest("Cannot remove yourself from the workspace");

    const admin = adminClient();
    const { data: existing, error: rErr } = await admin
      .from("workspace_members").select("role")
      .eq("workspace_id", body.workspace_id).eq("user_id", body.user_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!existing) throw NotFound("Staff member not found in workspace");
    if (existing.role === "owner") throw Forbidden("Cannot remove the workspace owner");

    // Soft-delete: archive the membership so audit history is preserved
    const { error } = await admin
      .from("workspace_members")
      .update({ is_archived: true })
      .eq("workspace_id", body.workspace_id).eq("user_id", body.user_id);
    if (error) throw BadRequest(error.message);

    // For POS-only staff, randomise the password so they can no longer log in
    const { data: profile } = await admin
      .from("profiles").select("is_pos_staff").eq("id", body.user_id).maybeSingle();
    if (profile?.is_pos_staff) {
      await admin.auth.admin.updateUserById(body.user_id, {
        password: crypto.randomUUID() + crypto.randomUUID(),
      });
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "staff.archive", entityType: "workspace_member", entityId: body.user_id,
      before: existing,
    }));
    return json({ archived: true });
  } catch (err) { return handleError(err); }
});
