// POST /bookings-unblock-resource { workspace_id, block_id }
// Soft-deletes a resource block (sets is_active = false) so bookings can resume.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  block_id:     z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    const { data: existing, error: fetchErr } = await admin
      .from("resource_blocks")
      .select("id, workspace_id, is_active")
      .eq("id", body.block_id)
      .maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Block not found");

    const { data: block, error } = await admin
      .from("resource_blocks")
      .update({ is_active: false })
      .eq("id", body.block_id)
      .select()
      .single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "resource.unblock", entityType: "resource_block", entityId: body.block_id,
      before: existing, after: block,
    }));

    return json({ success: true, block_id: body.block_id });
  } catch (err) { return handleError(err); }
});
