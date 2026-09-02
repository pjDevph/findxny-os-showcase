// POST /loyalty-rules-upsert — create or update the loyalty programme rules for a workspace.
// Body: { workspace_id, points_per_peso, peso_per_point, min_redeem_points, max_redeem_pct, is_active }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:      z.string().uuid(),
  points_per_peso:   z.number().min(0.01),
  peso_per_point:    z.number().min(0.001),
  min_redeem_points: z.number().int().min(1),
  max_redeem_pct:    z.number().min(1).max(100),
  is_active:         z.boolean(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    // Fetch existing rules for workspace
    const { data: existing, error: fetchErr } = await admin
      .from("loyalty_rules")
      .select("*")
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);

    const payload = {
      workspace_id:      body.workspace_id,
      points_per_peso:   body.points_per_peso,
      peso_per_point:    body.peso_per_point,
      min_redeem_points: body.min_redeem_points,
      max_redeem_pct:    body.max_redeem_pct,
      is_active:         body.is_active,
    };

    if (existing) {
      // Update
      const { data: updated, error: updateErr } = await admin
        .from("loyalty_rules")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("workspace_id", body.workspace_id)
        .select()
        .single();
      if (updateErr) throw BadRequest(updateErr.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "loyalty_rules.update",
        entityType:  "loyalty_rules",
        entityId:    existing.id,
        before:      existing,
        after:       updated,
      }));

      return json({ rules: updated });
    } else {
      // Insert
      const { data: created, error: insertErr } = await admin
        .from("loyalty_rules")
        .insert(payload)
        .select()
        .single();
      if (insertErr) throw BadRequest(insertErr.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "loyalty_rules.create",
        entityType:  "loyalty_rules",
        entityId:    created.id,
        before:      null,
        after:       created,
      }));

      return json({ rules: created }, 201);
    }
  } catch (err) { return handleError(err); }
});
