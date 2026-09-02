// POST /stock-in — receive stock for a product into a branch inventory.
//
// First call for a product is also its "activation" moment: this is the only
// place a product's own inventory_catalog entry gets created. It ensures
// products.track_inventory=true and a self-consumption recipe_items row
// (qty_used=1, "this product consumes 1x itself") exist, mirroring how a
// multi-ingredient recipe consumes other catalog entries — same mechanism,
// just the 1-row case. This matches the existing UX contract ("Set the unit
// and initial stock in the Inventory screen after saving").
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:        z.string().uuid(),
  branch_id:           z.string().uuid(),
  product_id:          z.string().uuid(),
  quantity:            z.number().positive(),
  unit_cost:           z.number().min(0).optional(),
  supplier:            z.string().optional(),
  reason:              z.string().optional(),
  unit:                z.string().optional(),
  low_stock_threshold: z.number().min(0).optional(),
});

type BodyType = z.infer<typeof Body>;
type AdminClient = ReturnType<typeof adminClient>;

function buildMovementReason(reason: string | undefined, supplier: string | undefined): string | null {
  const parts = [reason, supplier ? `Supplier: ${supplier}` : null].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

async function ensureCatalogEntryAndRecipeRow(
  admin: AdminClient,
  product: { id: string; name: string; cost: number | null; workspace_id: string },
  unit: string,
  lowStockThreshold: number,
): Promise<{ id: string }> {
  const { data: existing } = await admin
    .from("inventory_catalog").select("id").eq("product_id", product.id).maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await admin.from("inventory_catalog").insert({
    workspace_id: product.workspace_id, product_id: product.id, name: product.name,
    category: "food", unit, cost_per_unit: product.cost ?? 0, low_stock_threshold: lowStockThreshold,
  }).select("id").single();
  if (error) throw BadRequest(error.message);

  await admin.from("products").update({ track_inventory: true }).eq("id", product.id);

  await admin.from("recipe_items").insert({
    workspace_id: product.workspace_id, product_id: product.id,
    catalog_id: created.id, qty_used: 1, section: "ingredient",
  });

  return created;
}

async function updateExistingInventoryItem(
  admin: AdminClient,
  existingId: string,
  patch: Record<string, unknown>,
): Promise<any> {
  const { data, error } = await admin
    .from("inventory_items").update(patch).eq("id", existingId).select().single();
  if (error) throw BadRequest(error.message);
  return data;
}

async function insertNewInventoryItem(
  admin: AdminClient,
  body: BodyType,
  catalogId: string,
  afterQty: number,
  now: string,
): Promise<any> {
  const { data, error } = await admin.from("inventory_items").insert({
    workspace_id:        body.workspace_id,
    branch_id:           body.branch_id,
    catalog_id:          catalogId,
    quantity:            afterQty,
    low_stock_threshold: body.low_stock_threshold ?? 0,
    updated_at:          now,
  }).select().single();
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

    const { data: product, error: pErr } = await admin
      .from("products").select("id, name, cost, workspace_id").eq("id", body.product_id).maybeSingle();
    if (pErr) throw BadRequest(pErr.message);
    if (!product || product.workspace_id !== body.workspace_id) throw NotFound("Product not found");

    const catalogItem = await ensureCatalogEntryAndRecipeRow(
      admin, product, body.unit ?? "pcs", body.low_stock_threshold ?? 0,
    );

    // Find or create the branch stock row for this catalog entry.
    const { data: existing, error: iErr } = await admin
      .from("inventory_items").select("*")
      .eq("branch_id", body.branch_id).eq("catalog_id", catalogItem.id).maybeSingle();
    if (iErr) throw BadRequest(iErr.message);

    const beforeQty = existing ? Number(existing.quantity) : 0;
    const afterQty  = beforeQty + body.quantity;
    const now       = new Date().toISOString();

    const itemPatch: Record<string, unknown> = { quantity: afterQty, updated_at: now };
    if (body.low_stock_threshold !== undefined) itemPatch.low_stock_threshold = body.low_stock_threshold;

    const item = existing
      ? await updateExistingInventoryItem(admin, existing.id, itemPatch)
      : await insertNewInventoryItem(admin, body, catalogItem.id, afterQty, now);

    const { data: movement, error: mErr } = await admin.from("stock_movements").insert({
      workspace_id:      body.workspace_id,
      branch_id:         body.branch_id,
      inventory_item_id: item.id,
      type:              "in",
      quantity:          body.quantity,
      reason:            buildMovementReason(body.reason, body.supplier),
      user_id:           ctx.userId,
    }).select().single();
    if (mErr) throw BadRequest(mErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "stock.in", entityType: "inventory_item", entityId: item.id,
      before: { quantity: beforeQty }, after: { quantity: afterQty, movement },
    }));
    return json({ item, movement }, 201);
  } catch (err) { return handleError(err); }
});
