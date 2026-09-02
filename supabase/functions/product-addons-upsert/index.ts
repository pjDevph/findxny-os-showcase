// POST /product-addons-upsert
// Create or update an addon group and its options.
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
  group_id:     z.string().uuid().optional(),
  name:         z.string().min(1).max(100),
  is_required:  z.boolean(),
  min_select:   z.number().int().min(0),
  max_select:   z.number().int().min(1),
  sort_order:   z.number().int().optional(),
  addons: z.array(z.object({
    id:         z.string().uuid().optional(),
    name:       z.string().min(1).max(100),
    price:      z.number().min(0),
    is_active:  z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })).default([]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const isNew = !body.group_id;

    // Verify product belongs to workspace
    const { data: product, error: prodErr } = await admin
      .from("products")
      .select("id, workspace_id")
      .eq("id", body.product_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (prodErr) throw BadRequest(prodErr.message);
    if (!product) throw NotFound("Product not found in this workspace");

    // Fetch existing group for audit before-state (if updating)
    let beforeGroup: any = null;
    if (!isNew && body.group_id) {
      const { data } = await admin
        .from("product_addon_groups")
        .select("*")
        .eq("id", body.group_id)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle();
      beforeGroup = data;
      if (!beforeGroup) throw NotFound("Addon group not found");
    }

    // Upsert the group
    let group: any;
    if (isNew) {
      const { data, error } = await admin
        .from("product_addon_groups")
        .insert({
          workspace_id: body.workspace_id,
          product_id:   body.product_id,
          name:         body.name,
          is_required:  body.is_required,
          min_select:   body.min_select,
          max_select:   body.max_select,
          sort_order:   body.sort_order ?? 0,
        })
        .select()
        .single();
      if (error) throw BadRequest(error.message);
      group = data;
    } else {
      const { data, error } = await admin
        .from("product_addon_groups")
        .update({
          name:        body.name,
          is_required: body.is_required,
          min_select:  body.min_select,
          max_select:  body.max_select,
          ...(body.sort_order !== undefined ? { sort_order: body.sort_order } : {}),
        })
        .eq("id", body.group_id!)
        .eq("workspace_id", body.workspace_id)
        .select()
        .single();
      if (error) throw BadRequest(error.message);
      group = data;
    }

    // Upsert each addon
    const resultAddons: any[] = [];
    for (const addonInput of body.addons) {
      if (addonInput.id) {
        // Update existing addon
        const { data, error } = await admin
          .from("product_addons")
          .update({
            name:       addonInput.name,
            price:      addonInput.price,
            ...(addonInput.is_active !== undefined ? { is_active: addonInput.is_active } : {}),
            ...(addonInput.sort_order !== undefined ? { sort_order: addonInput.sort_order } : {}),
          })
          .eq("id", addonInput.id)
          .eq("group_id", group.id)
          .eq("workspace_id", body.workspace_id)
          .select()
          .single();
        if (error) throw BadRequest(error.message);
        resultAddons.push(data);
      } else {
        // Insert new addon
        const { data, error } = await admin
          .from("product_addons")
          .insert({
            workspace_id: body.workspace_id,
            group_id:     group.id,
            name:         addonInput.name,
            price:        addonInput.price,
            is_active:    addonInput.is_active ?? true,
            sort_order:   addonInput.sort_order ?? 0,
          })
          .select()
          .single();
        if (error) throw BadRequest(error.message);
        resultAddons.push(data);
      }
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "product_addon.upsert",
      entityType:  "product_addon_group",
      entityId:    group.id,
      before:      beforeGroup,
      after:       { ...group, addons: resultAddons },
    }));

    const status = isNew ? 201 : 200;
    return json({ group: { ...group, addons: resultAddons } }, status);
  } catch (err) { return handleError(err); }
});
