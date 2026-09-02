// POST /product-addons-list { workspace_id, product_id? }
// Returns addon groups (with their active addons) for a workspace, optionally filtered by product.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  product_id:   z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "GET" && req.method !== "POST") throw BadRequest("GET or POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // Fetch groups
    let groupQuery = admin
      .from("product_addon_groups")
      .select("id, product_id, name, is_required, min_select, max_select, sort_order")
      .eq("workspace_id", body.workspace_id)
      .order("sort_order", { ascending: true });

    if (body.product_id) {
      groupQuery = groupQuery.eq("product_id", body.product_id);
    }

    const { data: groups, error: groupErr } = await groupQuery;
    if (groupErr) throw BadRequest(groupErr.message);

    if (!groups || groups.length === 0) {
      return json({ groups: [] });
    }

    const groupIds = groups.map((g: any) => g.id);

    // Fetch active addons for all groups
    const { data: addons, error: addonErr } = await admin
      .from("product_addons")
      .select("id, group_id, name, price, sort_order")
      .in("group_id", groupIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (addonErr) throw BadRequest(addonErr.message);

    // Map addons onto groups
    const addonsByGroup = new Map<string, any[]>();
    for (const addon of addons ?? []) {
      const list = addonsByGroup.get(addon.group_id) ?? [];
      list.push({ id: addon.id, name: addon.name, price: addon.price, sort_order: addon.sort_order });
      addonsByGroup.set(addon.group_id, list);
    }

    const result = groups.map((g: any) => ({
      id:          g.id,
      product_id:  g.product_id,
      name:        g.name,
      is_required: g.is_required,
      min_select:  g.min_select,
      max_select:  g.max_select,
      sort_order:  g.sort_order,
      addons:      addonsByGroup.get(g.id) ?? [],
    }));

    return json({ groups: result });
  } catch (err) { return handleError(err); }
});
