// GET or POST /custom-charge-presets-list { workspace_id, branch_id? }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "GET" && req.method !== "POST") throw BadRequest("GET or POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    let query = admin
      .from("custom_charge_presets")
      .select("*")
      .eq("workspace_id", body.workspace_id)
      .eq("is_active", true);

    // If branch_id provided: return presets that are global (branch_id IS NULL) or match this branch
    if (body.branch_id) {
      query = query.or(`branch_id.is.null,branch_id.eq.${body.branch_id}`);
    } else {
      // No branch_id: return only global presets (branch_id IS NULL)
      query = query.is("branch_id", null);
    }

    const { data: presets, error } = await query
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw BadRequest(error.message);

    return json({ presets: presets ?? [] });
  } catch (err) { return handleError(err); }
});
