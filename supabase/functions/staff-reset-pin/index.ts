// POST /staff-reset-pin — change a POS staff member's PIN (owner/admin only).
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
  new_pin:      z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits"),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    const { data: target } = await admin
      .from("workspace_members").select("role")
      .eq("workspace_id", body.workspace_id).eq("user_id", body.user_id).maybeSingle();
    if (!target) throw NotFound("Staff member not found");
    if (target.role === "owner") throw Forbidden("Cannot reset owner PIN");

    const { error: authErr } = await admin.auth.admin.updateUserById(body.user_id, { password: body.new_pin });
    if (authErr) throw BadRequest(authErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "staff.reset_pin", entityType: "workspace_member", entityId: body.user_id,
      before: null, after: { pin_changed: true },
    }));

    return json({ success: true });
  } catch (err) { return handleError(err); }
});
