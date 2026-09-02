// POST /customers-create { workspace_id, branch_id?, name, phone?, email?, notes? }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().optional(),
  name:         z.string().min(1),
  phone:        z.string().optional(),
  email:        z.string().email().optional(),
  notes:        z.string().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    const { data: customer, error } = await admin
      .from("customers")
      .insert({
        workspace_id: body.workspace_id,
        branch_id:    body.branch_id ?? null,
        name:         body.name,
        phone:        body.phone ?? null,
        email:        body.email ?? null,
        notes:        body.notes ?? null,
      })
      .select()
      .single();
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "customer.create", entityType: "customer", entityId: customer.id,
      before: null, after: customer,
    }));

    return json({ customer });
  } catch (err) { return handleError(err); }
});
