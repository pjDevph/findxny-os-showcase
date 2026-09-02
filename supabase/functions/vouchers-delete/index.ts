// POST /vouchers-delete — permanently remove a voucher (owner/admin only).
// Redemption history (voucher_redemptions) is preserved by FK ON DELETE SET NULL.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  id:           z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    const { data: existing, error: fetchErr } = await admin
      .from("vouchers").select("*")
      .eq("workspace_id", body.workspace_id).eq("id", body.id).maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!existing) throw NotFound("Voucher not found");

    const { error } = await admin
      .from("vouchers").delete()
      .eq("workspace_id", body.workspace_id).eq("id", body.id);
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "voucher.delete", entityType: "voucher", entityId: body.id,
      before: existing, after: null,
    }));
    return json({ ok: true });
  } catch (err) { return handleError(err); }
});
