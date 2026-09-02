// POST /catalog-upsert — create or update an inventory catalog entry (a raw
// material, e.g. flour). Product-linked catalog entries (a product that
// tracks its own resale stock) are created via stock-in's first call instead
// — see that function's comment for why.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:        z.string().uuid(),
  id:                  z.string().uuid().optional(),
  name:                z.string().min(1),
  unit:                z.string().min(1),
  category:            z.enum(["food", "drink", "consumable", "operational"]).optional(),
  cost_per_unit:       z.number().nonnegative(),
  low_stock_threshold: z.number().nonnegative().optional(),
  expiry_date:         z.string().nullable().optional(),
  batch_number:        z.string().nullable().optional(),
  // Only meaningful on create — starts this catalog entry off with opening
  // stock at one branch (mirrors today's "type stock right in the create
  // form" UX). Add stock at other branches afterward via inventory-adjust.
  branch_id:           z.string().uuid().optional(),
  initial_stock:       z.number().nonnegative().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    let before: any = null;
    let result: any;
    if (body.id) {
      const { data: existing } = await admin.from("inventory_catalog")
        .select("*").eq("id", body.id).maybeSingle();
      if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Inventory catalog item not found");
      before = existing;
      // On update: never allow a silent stock change — use inventory-adjust instead.
      const updatePayload: Record<string, unknown> = {
        name:                body.name.trim(),
        unit:                body.unit.trim(),
        cost_per_unit:       body.cost_per_unit,
        low_stock_threshold: body.low_stock_threshold ?? existing.low_stock_threshold,
        updated_at:          new Date().toISOString(),
      };
      if (body.category)     updatePayload.category     = body.category;
      if (body.expiry_date  !== undefined) updatePayload.expiry_date  = body.expiry_date;
      if (body.batch_number !== undefined) updatePayload.batch_number = body.batch_number;
      const { data, error } = await admin.from("inventory_catalog")
        .update(updatePayload).eq("id", body.id).select().single();
      if (error) throw BadRequest(error.message);
      result = data;
    } else {
      const insertPayload = {
        workspace_id:        body.workspace_id,
        name:                body.name.trim(),
        unit:                body.unit.trim(),
        category:            body.category ?? "food",
        cost_per_unit:       body.cost_per_unit,
        low_stock_threshold: body.low_stock_threshold ?? 0,
        expiry_date:         body.expiry_date ?? null,
        batch_number:        body.batch_number ?? null,
        archived:            false,
        updated_at:          new Date().toISOString(),
      };
      const { data, error } = await admin.from("inventory_catalog").insert(insertPayload).select().single();
      if (error) throw BadRequest(error.message);
      result = data;

      if (body.branch_id && body.initial_stock !== undefined && body.initial_stock > 0) {
        const { error: iErr } = await admin.from("inventory_items").insert({
          workspace_id: body.workspace_id, branch_id: body.branch_id, catalog_id: result.id,
          quantity: body.initial_stock, low_stock_threshold: body.low_stock_threshold ?? 0,
        });
        if (iErr) throw BadRequest(iErr.message);
      }
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: body.id ? "catalog_item.update" : "catalog_item.create",
      entityType: "inventory_catalog", entityId: result.id,
      before, after: result,
    }));

    return json({ catalog_item: result });
  } catch (err) { return handleError(err); }
});
