// POST /product-addons-delete { workspace_id, group_id }
// Hard-delete an addon group (and cascade its addons).
// Returns 409 if the group's addons have been used in orders (FK violation).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  group_id:     z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    // Fetch group for audit before-state and ownership check
    const { data: group, error: fetchErr } = await admin
      .from("product_addon_groups")
      .select("*")
      .eq("id", body.group_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!group) throw NotFound("Addon group not found");

    // Hard-delete. Cascade deletes product_addons.
    // If order_item_addons references those addons, Postgres throws FK violation.
    const { error: deleteErr } = await admin
      .from("product_addon_groups")
      .delete()
      .eq("id", body.group_id)
      .eq("workspace_id", body.workspace_id);

    if (deleteErr) {
      // FK violation codes: 23503 (foreign_key_violation)
      if (
        deleteErr.code === "23503" ||
        deleteErr.message?.toLowerCase().includes("foreign key") ||
        deleteErr.message?.toLowerCase().includes("violates")
      ) {
        throw Conflict(
          "Addon group has been used in orders and cannot be deleted. Deactivate its options instead.",
        );
      }
      throw BadRequest(deleteErr.message);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "product_addon.delete",
      entityType:  "product_addon_group",
      entityId:    body.group_id,
      before:      group,
      after:       null,
    }));

    return json({ deleted: true, group_id: body.group_id });
  } catch (err) { return handleError(err); }
});
