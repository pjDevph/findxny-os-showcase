// POST /printers-update-meta — update runtime fields on workspace_printers (owner/admin only).
// Handles: toggle is_enabled, set as default (clears others of same type), record last_test.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:   z.string().uuid(),
  printer_id:     z.string().uuid(),
  is_enabled:     z.boolean().optional(),
  set_as_default: z.boolean().optional(),
  mark_tested:    z.boolean().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    const { data: printer, error: fetchErr } = await admin
      .from("workspace_printers").select("*")
      .eq("workspace_id", body.workspace_id).eq("id", body.printer_id).maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!printer) throw NotFound("Printer not found");

    if (body.set_as_default) {
      // Clear is_default for all printers of this type in the workspace first
      const { error: clearErr } = await admin
        .from("workspace_printers")
        .update({ is_default: false })
        .eq("workspace_id", body.workspace_id)
        .eq("type", printer.type);
      if (clearErr) throw BadRequest(clearErr.message);
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.is_enabled     !== undefined) patch.is_enabled = body.is_enabled;
    if (body.set_as_default === true)      patch.is_default = true;
    if (body.mark_tested    === true)      patch.last_test  = new Date().toISOString();

    if (Object.keys(patch).length === 1) throw BadRequest("No fields to update");

    const { data: updated, error } = await admin
      .from("workspace_printers").update(patch)
      .eq("workspace_id", body.workspace_id).eq("id", body.printer_id)
      .select().single();
    if (error) throw BadRequest(error.message);

    return json({ ok: true, printer: updated });
  } catch (err) { return handleError(err); }
});
