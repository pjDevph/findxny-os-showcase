// POST /costs-delete — remove a business cost item.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  cost_item_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    const { data: existing, error: fErr } = await admin
      .from("cost_items").select("id, workspace_id").eq("id", body.cost_item_id).maybeSingle();
    if (fErr) throw BadRequest(fErr.message);
    if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Cost item not found");

    const { error } = await admin.from("cost_items").delete().eq("id", body.cost_item_id);
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "cost_item.delete", entityType: "cost_item", entityId: body.cost_item_id,
      before: existing,
    }));
    return json({ deleted: true });
  } catch (err) { return handleError(err); }
});
