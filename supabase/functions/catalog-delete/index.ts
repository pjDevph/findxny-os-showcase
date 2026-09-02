// POST /catalog-delete — archive (soft) or hard-delete an inventory catalog entry.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  catalog_id:   z.string().uuid(),
  hard:         z.boolean().optional().default(false),
});

type Admin = ReturnType<typeof adminClient>;

async function hardDeleteCatalogItem(admin: Admin, catalogId: string, workspaceId: string, item: any, actorId: string) {
  const { count } = await admin
    .from("recipe_items").select("id", { count: "exact", head: true })
    .eq("catalog_id", catalogId);
  if ((count ?? 0) > 0) {
    throw Conflict("Referenced by recipes — archive instead");
  }
  const { error } = await admin.from("inventory_catalog").delete().eq("id", catalogId);
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId, actorId,
    action: "catalog_item.delete", entityType: "inventory_catalog", entityId: catalogId,
    before: item,
  }));
  return json({ deleted: true });
}

/**
 * Mirror the hard-delete guard: don't let a catalog entry be archived while
 * an active product's recipe still depends on it — otherwise it keeps
 * getting silently deducted forever with no way to notice.
 */
async function assertNotUsedByActiveRecipe(admin: Admin, catalogId: string) {
  const { data: recipeRows } = await admin
    .from("recipe_items").select("product_id")
    .eq("catalog_id", catalogId);
  if (!recipeRows || recipeRows.length === 0) return;

  const productIds = [...new Set(recipeRows.map((r) => r.product_id))];
  const { data: activeProducts } = await admin
    .from("products").select("id")
    .in("id", productIds).eq("archived", false);
  if (activeProducts && activeProducts.length > 0) {
    throw Conflict("Used by an active product's recipe — remove it from the recipe or archive the product first");
  }
}

async function archiveCatalogItem(admin: Admin, catalogId: string, workspaceId: string, actorId: string) {
  await assertNotUsedByActiveRecipe(admin, catalogId);

  const { data: updated, error } = await admin.from("inventory_catalog")
    .update({ archived: true }).eq("id", catalogId).select().single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId, actorId,
    action: "catalog_item.archive", entityType: "inventory_catalog", entityId: catalogId,
    before: { archived: false }, after: { archived: true },
  }));
  return json({ archived: true, catalog_item: updated });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const { data: item, error: rErr } = await admin
      .from("inventory_catalog").select("*").eq("id", body.catalog_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!item || item.workspace_id !== body.workspace_id) throw NotFound("Inventory catalog item not found");

    return body.hard
      ? await hardDeleteCatalogItem(admin, body.catalog_id, body.workspace_id, item, ctx.userId)
      : await archiveCatalogItem(admin, body.catalog_id, body.workspace_id, ctx.userId);
  } catch (err) { return handleError(err); }
});
