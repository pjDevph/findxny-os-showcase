// POST /products-bulk-toggle — flip `active` for many products in one call.
// Same effect as calling products-toggle per id, but as a single UPDATE
// statement so marking a batch unavailable (e.g. "we're out of these 12
// items today") is instant instead of N sequential round-trips.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  product_ids:  z.array(z.string().uuid()).min(1).max(500),
  active:       z.boolean(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    // Scope strictly to this workspace so a product_id from another
    // workspace can't be smuggled into the batch.
    const { data: updated, error } = await admin
      .from("products")
      .update({ active: body.active, stock_auto_deactivated: false })
      .eq("workspace_id", body.workspace_id)
      .in("id", body.product_ids)
      .select("id");
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "product.bulk_toggle", entityType: "product", entityId: null,
      before: { count: body.product_ids.length },
      after: { active: body.active, product_ids: (updated ?? []).map((p: any) => p.id) },
    }));

    return json({ updated: (updated ?? []).length });
  } catch (err) { return handleError(err); }
});
