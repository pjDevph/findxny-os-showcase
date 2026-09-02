// POST /recipe-items-delete — remove an ingredient line from a product recipe.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:   z.string().uuid(),
  recipe_item_id: z.string().uuid(),
});

async function recalcCost(admin: ReturnType<typeof adminClient>, productId: string): Promise<number> {
  const { data: rows } = await admin
    .from("recipe_items")
    .select("qty_used, inventory_catalog(cost_per_unit)")
    .eq("product_id", productId);
  const cost = (rows ?? []).reduce(
    (sum: number, ri: any) => sum + Number(ri.qty_used) * Number(ri.inventory_catalog?.cost_per_unit ?? 0),
    0,
  );
  return +cost.toFixed(4);
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    const { data: ri, error: rErr } = await admin
      .from("recipe_items")
      .select("id, product_id, products(workspace_id)")
      .eq("id", body.recipe_item_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!ri || (ri.products as any)?.workspace_id !== body.workspace_id) throw NotFound("Recipe item not found");

    const productId = ri.product_id;

    const { error } = await admin.from("recipe_items").delete().eq("id", body.recipe_item_id);
    if (error) throw BadRequest(error.message);

    const cost = await recalcCost(admin, productId);
    await admin.from("products").update({ cost }).eq("id", productId);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "recipe_item.delete", entityType: "recipe_item", entityId: body.recipe_item_id,
      before: ri,
    }));
    return json({ deleted: true, cost });
  } catch (err) { return handleError(err); }
});
