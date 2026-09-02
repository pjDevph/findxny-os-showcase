// POST /products-delete — archive (soft) or hard-delete a product.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  product_id:   z.string().uuid(),
  hard:         z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const { data: product, error: rErr } = await admin
      .from("products").select("*").eq("id", body.product_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!product || product.workspace_id !== body.workspace_id) throw NotFound("Product not found");

    if (body.hard) {
      const { count } = await admin
        .from("order_items").select("id", { count: "exact", head: true })
        .eq("product_id", body.product_id);
      if ((count ?? 0) > 0) {
        throw Conflict("Product has order history — use soft delete (hard: false) instead");
      }

      // If this product tracks its own stock, another product's recipe may
      // consume it (e.g. a combo consuming a canned soda that's also sold
      // standalone) — block the same way catalog-delete does, rather than
      // surfacing a raw FK error from inventory_catalog's cascade.
      const { data: catalogEntry } = await admin
        .from("inventory_catalog").select("id").eq("product_id", body.product_id).maybeSingle();
      if (catalogEntry) {
        const { count: usedByOthers } = await admin
          .from("recipe_items").select("id", { count: "exact", head: true })
          .eq("catalog_id", catalogEntry.id).neq("product_id", body.product_id);
        if ((usedByOthers ?? 0) > 0) {
          throw Conflict("Product's stock is used by another product's recipe — remove it there first");
        }
      }

      const { error } = await admin.from("products").delete().eq("id", body.product_id);
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id, actorId: ctx.userId,
        action: "product.delete", entityType: "product", entityId: body.product_id,
        before: product,
      }));
      return json({ deleted: true });

    } else {
      const { data: updated, error } = await admin
        .from("products").update({ archived: true, active: false, for_sale: false })
        .eq("id", body.product_id).select().single();
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id, actorId: ctx.userId,
        action: "product.archive", entityType: "product", entityId: body.product_id,
        before: { archived: false, active: product.active, for_sale: product.for_sale },
        after:  { archived: true,  active: false, for_sale: false },
      }));
      return json({ archived: true, product: updated });
    }
  } catch (err) { return handleError(err); }
});
