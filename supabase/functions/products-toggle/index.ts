// POST /products-toggle — flip a product's `active` (POS visibility) and/or
// `for_sale` (public web menu visibility) flags, and/or restore it out of the
// archive. At least one of active/for_sale/restore must be given.
// Replaces the direct supabase.from("products").update() in apps/web/app/(admin)/products/page.tsx.
//
// Archiving itself (setting archived: true) intentionally stays out of this
// endpoint — products-delete does that, with the FK/recipe-conflict checks a
// destructive action like that needs. This endpoint only handles the reverse
// (un-archiving), which is always safe.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  product_id:   z.string().uuid(),
  active:       z.boolean().optional(),
  for_sale:     z.boolean().optional(),
  restore:      z.literal(true).optional(),
}).refine(b => b.active !== undefined || b.for_sale !== undefined || b.restore !== undefined, {
  message: "active, for_sale, or restore is required",
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    // Flipping `active` alone (POS visibility) is a routine floor-staff
    // action — e.g. a cashier marking an item unavailable mid-shift from the
    // order screen's long-press menu — so it only needs STAFF_WRITE
    // (cashier-inclusive). for_sale (public web menu) and restore
    // (un-archiving) are catalog-admin decisions and still require the
    // narrower CATALOG_WRITE.
    const onlyTogglingActive = body.active !== undefined && body.for_sale === undefined && !body.restore;
    requireRole(ctx, onlyTogglingActive ? Roles.STAFF_WRITE : Roles.CATALOG_WRITE);

    const admin = adminClient();
    const { data: existing, error: rErr } = await admin
      .from("products").select("id, active, for_sale, archived, workspace_id")
      .eq("id", body.product_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Product not found");

    const patch: Record<string, boolean> = {};
    const before: Record<string, boolean> = {};
    const after:  Record<string, boolean> = {};
    if (body.active !== undefined) {
      patch.active = body.active;
      before.active = existing.active; after.active = body.active;
      // Clearing stock_auto_deactivated on every explicit admin toggle means the
      // system recognises this as a deliberate decision. The trigger will
      // re-evaluate the next time ingredient stock changes for this product's recipe.
      patch.stock_auto_deactivated = false;
    }
    if (body.for_sale !== undefined) {
      patch.for_sale = body.for_sale;
      before.for_sale = existing.for_sale; after.for_sale = body.for_sale;
    }
    if (body.restore) {
      patch.archived = false;
      before.archived = existing.archived; after.archived = false;
    }

    const { data: updated, error } = await admin
      .from("products").update(patch)
      .eq("id", body.product_id).select().single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: body.restore ? "product.restore" : "product.toggle", entityType: "product", entityId: body.product_id,
      before, after,
    }));

    return json({ product: updated });
  } catch (err) { return handleError(err); }
});
