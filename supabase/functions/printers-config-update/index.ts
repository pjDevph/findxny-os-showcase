// POST /printers-config-update — update printer routing/template config stored in workspaces.printer_config (owner/admin only).
// Merges the given config_type key into the existing JSONB, preserving other keys.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  config_type:  z.enum(["routing", "labelTemplate"]),
  value:        z.record(z.string(), z.unknown()),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    const { data: ws, error: fetchErr } = await admin
      .from("workspaces").select("printer_config")
      .eq("id", body.workspace_id).maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!ws) throw NotFound("Workspace not found");

    const newConfig = {
      ...(ws.printer_config ?? {}),
      [body.config_type]: body.value,
      lastUpdated: new Date().toISOString(),
    };

    const { error } = await admin
      .from("workspaces").update({ printer_config: newConfig })
      .eq("id", body.workspace_id);
    if (error) throw BadRequest(error.message);

    return json({ ok: true });
  } catch (err) { return handleError(err); }
});
