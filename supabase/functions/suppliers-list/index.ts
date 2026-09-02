// POST /suppliers-list — list suppliers for a workspace with ingredient counts.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:     z.string().uuid(),
  include_inactive: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // Fetch suppliers, optionally filtering to active only.
    // Also pull nested catalog entries so we can count them in JS
    // (PostgREST does not support aggregation in a single select call).
    let query = admin
      .from("suppliers")
      .select("*, inventory_catalog(id)")
      .eq("workspace_id", body.workspace_id);

    if (!body.include_inactive) {
      query = query.eq("is_active", true);
    }

    const { data: rows, error } = await query.order("name");
    if (error) throw BadRequest(error.message);

    const suppliers = (rows ?? []).map((s: any) => {
      const { inventory_catalog, ...rest } = s;
      return {
        ...rest,
        ingredient_count: Array.isArray(inventory_catalog) ? inventory_catalog.length : 0,
      };
    });

    return json({ suppliers });
  } catch (err) {
    return handleError(err);
  }
});
