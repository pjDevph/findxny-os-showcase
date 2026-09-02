// POST /printers-delete — remove a printer row from workspace_printers
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  printer_id:   z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    const { error, count } = await admin
      .from("workspace_printers")
      .delete({ count: "exact" })
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.printer_id);

    if (error) throw BadRequest(error.message);
    if (count === 0) throw NotFound("Printer not found");

    return json({ ok: true });
  } catch (err) { return handleError(err); }
});
