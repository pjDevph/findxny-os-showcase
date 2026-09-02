// POST /manager-approval-create
// Any cashier+ can call this to request manager sign-off on a restricted action.
// Creates a 'pending' record in manager_approvals. The POS tracks the returned
// approval.id and passes it to manager-approval-verify for the manager to sign off.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const ALLOWED_ACTION_TYPES = [
  "refund",
  "void_order",
  "large_discount",
  "manual_price_override",
  "cancel_paid_booking",
  "large_custom_charge",
  "edit_completed_order",
] as const;

const Body = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().optional(),
  action_type:  z.enum(ALLOWED_ACTION_TYPES),
  target_type:  z.string().min(1).max(50),
  target_id:    z.string().uuid().nullable().optional(),
  reason:       z.string().max(500).optional(),
  metadata:     z.record(z.unknown()).optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    // Any cashier, manager, admin, or owner can request approval.
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    const { data: approval, error } = await admin
      .from("manager_approvals")
      .insert({
        workspace_id: body.workspace_id,
        branch_id:    body.branch_id ?? null,
        action_type:  body.action_type,
        target_type:  body.target_type,
        target_id:    body.target_id ?? null,
        requested_by: ctx.userId,
        status:       "pending",
        reason:       body.reason ?? null,
        metadata:     body.metadata ?? {},
      })
      .select()
      .single();

    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "manager_approval.requested",
      entityType:  "manager_approval",
      entityId:    approval.id,
      before:      null,
      after: {
        action_type: body.action_type,
        target_type: body.target_type,
        target_id:   body.target_id,
        reason:      body.reason ?? null,
        status:      "pending",
      },
    }));

    return json({ approval }, 201);
  } catch (err) { return handleError(err); }
});
