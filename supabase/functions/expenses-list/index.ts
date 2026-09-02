// POST /expenses-list — list expenses for a workspace, filtered by date range/category/branch.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  date_from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category_id:  z.string().uuid().optional(),
  branch_id:    z.string().uuid().optional(),
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
      .from("expenses")
      .select("id, expense_date, amount, payment_method, vendor_name, notes, category_id, branch_id, expense_categories(id, name), branches(id, name)")
      .eq("workspace_id", body.workspace_id)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (body.date_from)   query = query.gte("expense_date", body.date_from);
    if (body.date_to)     query = query.lte("expense_date", body.date_to);
    if (body.category_id) query = query.eq("category_id", body.category_id);
    if (body.branch_id)   query = query.eq("branch_id", body.branch_id);

    const { data, error } = await query;
    if (error) throw BadRequest(error.message);

    return json({ expenses: data ?? [] });
  } catch (err) {
    return handleError(err);
  }
});
