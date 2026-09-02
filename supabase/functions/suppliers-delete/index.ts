// POST /suppliers-delete — delete a supplier and nullify linked ingredient references.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  supplier_id:  z.string().uuid(),
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

    // Fetch supplier and verify workspace ownership
    const { data: supplier, error: fetchErr } = await admin
      .from("suppliers")
      .select("*")
      .eq("id", body.supplier_id)
      .maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!supplier || supplier.workspace_id !== body.workspace_id) {
      throw NotFound("Supplier not found");
    }

    // Nullify supplier_id on all linked catalog entries before deleting
    const { error: unlinkErr } = await admin
      .from("inventory_catalog")
      .update({ supplier_id: null })
      .eq("supplier_id", body.supplier_id);
    if (unlinkErr) throw BadRequest(unlinkErr.message);

    // Delete the supplier row
    const { error: deleteErr } = await admin
      .from("suppliers")
      .delete()
      .eq("id", body.supplier_id);
    if (deleteErr) throw BadRequest(deleteErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "supplier.delete",
      entityType:  "supplier",
      entityId:    body.supplier_id,
      before:      supplier,
    }));

    return json({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
});
