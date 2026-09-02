// POST /role-permissions-upsert — persists one (role, feature) → granted
// override for the web admin Staff Permissions tab. Display-only: this table
// has no effect on any edge function's actual authorization, which continues
// to enforce the hardcoded Roles allow-lists in _shared/permissions.ts.
import { adminClient } from "../_shared/supabaseClient.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { audit } from "../_shared/auditLog.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  role:         z.enum(["owner", "admin", "manager", "cashier", "kitchen"]),
  feature:      z.string().min(1),
  granted:      z.boolean(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();
    const { data: override, error } = await admin.from("role_permissions")
      .upsert({
        workspace_id: body.workspace_id, role: body.role, feature: body.feature,
        granted: body.granted, updated_by: ctx.userId, updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,role,feature" })
      .select().single();
    if (error) throw BadRequest(error.message);

    await audit({
      workspaceId: body.workspace_id, actorId: ctx.userId, action: "role_permissions.update",
      entityType: "role_permissions", entityId: override.id, after: override,
    });

    return json({ override });
  } catch (err) { return handleError(err); }
});
