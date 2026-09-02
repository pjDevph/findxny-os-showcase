// POST /resources-toggle — set a bookable resource active or inactive.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  resource_id:  z.string().uuid(),
  active:       z.boolean(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const { data: existing } = await admin
      .from("bookable_resources").select("*").eq("id", body.resource_id).maybeSingle();
    if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Resource not found");

    const { data: updated, error } = await admin
      .from("bookable_resources")
      .update({ active: body.active })
      .eq("id", body.resource_id).select().single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "resource.toggle", entityType: "bookable_resource", entityId: body.resource_id,
      before: { active: existing.active }, after: { active: body.active },
    }));
    return json({ resource: updated });
  } catch (err) { return handleError(err); }
});
