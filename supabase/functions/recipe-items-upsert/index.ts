// POST /recipe-items-upsert — add or update an ingredient line in a product recipe.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { convertQty } from "../_shared/units.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  id:           z.string().uuid().optional(),
  product_id:   z.string().uuid(),
  catalog_id:   z.string().uuid(),
  qty:          z.number().positive(),
  unit:         z.string().optional(),
  section:      z.enum(["ingredient", "topping"]).optional(),
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

type Admin = ReturnType<typeof adminClient>;
type BodyType = z.infer<typeof Body>;

async function validateProductAndCatalogItem(admin: Admin, body: BodyType) {
  const { data: product, error: pErr } = await admin
    .from("products").select("id, workspace_id").eq("id", body.product_id).maybeSingle();
  if (pErr) throw BadRequest(pErr.message);
  if (!product || product.workspace_id !== body.workspace_id) throw NotFound("Product not found");

  const { data: catalogItem, error: iErr } = await admin
    .from("inventory_catalog").select("id, workspace_id, unit, cost_per_unit").eq("id", body.catalog_id).maybeSingle();
  if (iErr) throw BadRequest(iErr.message);
  if (!catalogItem || catalogItem.workspace_id !== body.workspace_id) throw NotFound("Inventory catalog item not found");

  return { product, catalogItem };
}

async function upsertRecipeItem(admin: Admin, body: BodyType) {
  if (body.id) {
    const { data, error } = await admin
      .from("recipe_items")
      .update({
        catalog_id: body.catalog_id, qty_used: body.qty,
        ...(body.section ? { section: body.section } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id).select().single();
    if (error) throw BadRequest(error.message);
    return data;
  }

  const { data, error } = await admin
    .from("recipe_items")
    .upsert(
      {
        workspace_id: body.workspace_id, product_id: body.product_id,
        catalog_id: body.catalog_id, qty_used: body.qty,
        section: body.section ?? "ingredient",
      },
      { onConflict: "product_id,catalog_id" },
    )
    .select().single();
  if (error) throw BadRequest(error.message);
  return data;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    const { catalogItem } = await validateProductAndCatalogItem(admin, body);

    // Convert the entered quantity into the catalog item's own tracked unit
    // before persisting — recipe_items.qty_used is read raw (no per-row unit
    // stored) by the order-time deduction trigger, so a mismatched unit here
    // would otherwise silently deduct the wrong magnitude at sale time.
    let qty = body.qty;
    if (body.unit && body.unit !== catalogItem.unit) {
      const converted = convertQty(body.qty, body.unit, catalogItem.unit);
      if (converted === null) {
        throw BadRequest(`Cannot convert '${body.unit}' to unit '${catalogItem.unit}' — incompatible units`);
      }
      qty = converted;
    }

    const recipe_item = await upsertRecipeItem(admin, { ...body, qty });

    const cost = await recalcCost(admin, body.product_id);
    await admin.from("products").update({ cost }).eq("id", body.product_id);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "recipe_item.upsert", entityType: "recipe_item", entityId: recipe_item.id,
      after: recipe_item,
    }));
    return json({ recipe_item, cost }, 201);
  } catch (err) { return handleError(err); }
});
