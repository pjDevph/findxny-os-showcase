// POST /products-upsert — create or update a product in the catalog.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:    z.string().uuid(),
  id:              z.string().uuid().optional(),
  name:            z.string().min(1).optional(),
  sku:             z.string().nullable().optional(),
  price:           z.number().min(0).optional(),
  category_id:     z.string().uuid().nullable().optional(),
  active:          z.boolean().optional(),
  image_url:       z.string().nullable().optional(),
  featured:        z.boolean().optional(),
  featured_tag:    z.string().nullable().optional(),
  featured_blurb:  z.string().nullable().optional(),
  featured_sort:   z.number().int().nullable().optional(),
  purchase_unit:   z.string().optional(),
  selling_unit:    z.string().optional(),
  cost:            z.number().min(0).optional(),
  barcode:         z.string().nullable().optional(),
  for_sale:        z.boolean().optional(),
  is_pinned:       z.boolean().optional(),
  prep_station:    z.enum(["none", "kitchen", "drinks", "counter"]).optional(),
  track_inventory: z.boolean().optional(),
});

const UPDATABLE = [
  "name","sku","price","category_id","active","image_url",
  "featured","featured_tag","featured_blurb","featured_sort",
  "purchase_unit","selling_unit","cost","barcode","for_sale","is_pinned","prep_station","track_inventory",
] as const;

type BodyType = Awaited<ReturnType<typeof parseBody<typeof Body>>>;
type AdminClient = ReturnType<typeof adminClient>;
type AuditCtx = { userId: string };

async function updateProduct(admin: AdminClient, body: BodyType, ctx: AuditCtx) {
  const { data: existing, error: rErr } = await admin
    .from("products").select("*").eq("id", body.id!).maybeSingle();
  if (rErr) throw BadRequest(rErr.message);
  if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Product not found");

  const patch: Record<string, unknown> = {};
  for (const k of UPDATABLE) {
    if ((body as any)[k] !== undefined) patch[k] = (body as any)[k];
  }
  if (body.prep_station !== undefined) patch.kitchen_required = body.prep_station !== "none";
  if (Object.keys(patch).length === 0) throw BadRequest("No fields to update");

  const { data: updated, error } = await admin
    .from("products").update(patch).eq("id", body.id!).select().single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId: body.workspace_id, actorId: ctx.userId,
    action: "product.update", entityType: "product", entityId: body.id!,
    before: existing, after: updated,
  }));
  return json({ product: updated });
}

async function createProduct(admin: AdminClient, body: BodyType, ctx: AuditCtx) { // NOSONAR
  if (!body.name)               throw BadRequest("name is required when creating a product");
  if (body.price === undefined)  throw BadRequest("price is required when creating a product");

  const { data: product, error } = await admin.from("products").insert({
    workspace_id:    body.workspace_id,
    name:            body.name,
    sku:             body.sku             ?? null,
    price:           body.price,
    category_id:     body.category_id     ?? null,
    active:          body.active           ?? true,
    image_url:       body.image_url        ?? null,
    featured:        body.featured         ?? false,
    featured_tag:    body.featured_tag     ?? null,
    featured_blurb:  body.featured_blurb   ?? null,
    featured_sort:   body.featured_sort    ?? null,
    purchase_unit:   body.purchase_unit    ?? "pcs",
    selling_unit:    body.selling_unit     ?? "pcs",
    cost:            body.cost             ?? 0,
    barcode:         body.barcode          ?? null,
    for_sale:        body.for_sale         ?? true,
    is_pinned:       body.is_pinned        ?? false,
    prep_station:    body.prep_station     ?? "none",
    kitchen_required: (body.prep_station ?? "none") !== "none",
    track_inventory: body.track_inventory  ?? false,
  }).select().single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId: body.workspace_id, actorId: ctx.userId,
    action: "product.create", entityType: "product", entityId: product.id,
    after: product,
  }));
  return json({ product }, 201);
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);
    const admin = adminClient();
    if (body.id) return await updateProduct(admin, body, ctx);
    return await createProduct(admin, body, ctx);
  } catch (err) { return handleError(err); }
});
