// POST /product-categories-upsert — create a category by name if missing.
// Used by CSV product import to auto-create the categories referenced in the
// file without forcing the user to pre-create them.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  name:         z.string().min(1),
  sort_order:   z.number().int().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const name = body.name.trim();

    // Existing category by case-insensitive name match
    const { data: existing } = await admin
      .from("product_categories")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .ilike("name", name)
      .maybeSingle();
    if (existing) return json({ category: existing, created: false });

    const { data: created, error } = await admin
      .from("product_categories")
      .insert({
        workspace_id: body.workspace_id,
        name,
        sort_order: body.sort_order ?? 0,
      })
      .select("id")
      .single();
    if (error) throw BadRequest(error.message);
    return json({ category: created, created: true }, 201);
  } catch (err) { return handleError(err); }
});
