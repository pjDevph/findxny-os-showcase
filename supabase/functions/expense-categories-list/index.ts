// POST /expense-categories-list — list expense categories for a workspace.
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
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    let query = admin
      .from("expense_categories")
      .select("id, name, is_active, sort_order")
      .eq("workspace_id", body.workspace_id)
      .order("sort_order")
      .order("name");

    if (!body.include_inactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw BadRequest(error.message);

    return json({ categories: data ?? [] });
  } catch (err) {
    return handleError(err);
  }
});
