// PATCH /workspaces-update — owner-only edits to workspace settings.
// Replaces the direct supabase.from("workspaces").update() in apps/web/app/(admin)/settings/page.tsx.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:    z.string().uuid(),
  name:            z.string().min(2).max(120).optional(),
  phone:           z.string().min(7).max(20).regex(/^[+0-9()\s-]+$/, "Invalid phone format").optional(),
  tax_rate:        z.number().min(0).max(1).optional(),
  service_rate:    z.number().min(0).max(1).optional(),
  hold_minutes:    z.number().int().min(1).max(120).optional(),
  slot_minutes:    z.number().int().min(15).max(720).optional(),
  receipt_address:    z.string().max(500).optional(),
  receipt_tin:        z.string().max(60).optional(),
  receipt_footer:     z.string().max(500).optional(),
  receipt_wifi_ssid:    z.string().max(100).optional(),
  receipt_wifi_cred:    z.string().max(100).optional(),
  receipt_promo_line:   z.string().max(200).optional(),
  receipt_logo:         z.string().max(2_000_000).optional(),
  receipt_order_prefix: z.string().max(20).optional(),
  // Free-form string map of payment account details / QR image data.
  payment_config:  z.record(z.string(), z.string().max(2_000_000)).optional(),
  maintenance_mode:    z.boolean().optional(),
  maintenance_message: z.string().max(500).optional(),
  // Editable homepage content: { hero:{title,lead}, promos:[...] }. Stored as-is.
  home_content:        z.record(z.string(), z.unknown()).optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.OWNER_ONLY);

    const patch: Record<string, unknown> = {};
    for (const k of [
      "name", "phone", "tax_rate", "service_rate", "hold_minutes", "slot_minutes",
      "receipt_address", "receipt_tin", "receipt_footer",
      "receipt_wifi_ssid", "receipt_wifi_cred", "receipt_promo_line",
      "receipt_logo", "receipt_order_prefix",
      "payment_config", "maintenance_mode", "maintenance_message", "home_content",
    ] as const) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) throw BadRequest("No fields to update");

    const admin = adminClient();
    const { data: before } = await admin.from("workspaces")
      .select("*").eq("id", body.workspace_id).maybeSingle();
    if (!before) throw NotFound("Workspace not found");

    const { data: updated, error } = await admin.from("workspaces")
      .update(patch).eq("id", body.workspace_id).select().single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "workspace.update", entityType: "workspace", entityId: body.workspace_id,
      before, after: updated,
    }));

    return json({ workspace: updated });
  } catch (err) { return handleError(err); }
});
