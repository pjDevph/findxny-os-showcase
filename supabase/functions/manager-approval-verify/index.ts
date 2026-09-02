// POST /manager-approval-verify
// Approves or rejects a pending manager_approval record.
//
// Two approval modes:
//   1. Session-based: caller is logged in as admin/owner — role is taken
//      from their JWT context, self-approval allowed (they already have
//      full authority — see the self-approval check below).
//   2. Code-based: caller enters the workspace's shared "manager override
//      code" (set via workspace-approval-code, admin/owner only) instead of
//      a specific person's credentials. The code itself is the authority,
//      so there's no separate approver identity/role and no self-approval
//      block — a lone manager (or cashier) entering the right code on their
//      own device is exactly the intended flow. Replaces the old
//      named-manager-username+PIN mode entirely.
//
// Rejection does NOT throw — it returns status "rejected" so the POS can
// show a reason.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const Body = z.object({
  workspace_id:   z.string().uuid(),
  approval_id:    z.string().uuid(),
  action:         z.enum(["approve", "reject"]),
  // Code-based: the shared workspace approval code. If omitted, the
  // caller's own session is used instead (admin/owner self-approval).
  override_code:  z.string().min(1).max(32).optional(),
  notes:          z.string().max(500).optional(),
});

// Session-based self-approval roles. Mirrors the VOID_REFUND set.
const MANAGER_ROLES = Roles.VOID_REFUND; // ["owner", "admin", "manager"]

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const admin = adminClient();

    // ── 1. Fetch the approval record — needed by both modes ─────────────────
    const { data: approval, error: fetchErr } = await admin
      .from("manager_approvals")
      .select("*")
      .eq("id", body.approval_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!approval) throw NotFound("Approval request not found");
    if (approval.status !== "pending") {
      throw Conflict(`Approval is already '${approval.status}' and cannot be acted on again`);
    }

    // ── 2. Resolve approver identity ─────────────────────────────────────────
    let approverId: string;
    let approverRole: string | null = null;
    let viaCode = false;

    if (body.override_code !== undefined) {
      // Guards a shared secret with no session behind it — slow down guessing.
      await rateLimit(req, {
        scope: "manager-approval-verify-code",
        key: body.workspace_id,
        max: 5, windowSec: 60,
      });

      const { data: ws, error: wsErr } = await admin
        .from("workspaces").select("manager_override_code")
        .eq("id", body.workspace_id).maybeSingle();
      if (wsErr) throw BadRequest(wsErr.message);

      const configured = ws?.manager_override_code;
      if (!configured) {
        return json({
          approval: null, status: "rejected",
          message: "No approval code has been set. Ask an owner or admin to set one in Settings.",
        }, 200);
      }
      if (body.override_code !== configured) {
        return json({ approval: null, status: "rejected", message: "Invalid approval code." }, 200);
      }

      approverId = approval.requested_by;
      viaCode = true;
    } else {
      // Session-based approval: verify the caller's JWT and workspace membership.
      const ctx = await requireAuth(req, body.workspace_id);
      requireRole(ctx, MANAGER_ROLES);
      approverId   = ctx.userId;
      approverRole = ctx.role;

      // admin/owner may self-approve — they already have full authority.
      // Anyone else reaching this branch (shouldn't happen via the normal
      // client flow, which routes them to the code path instead) fails closed.
      const selfApprovalAllowed = ["admin", "owner"].includes(approverRole);
      if (approval.requested_by === approverId && !selfApprovalAllowed) {
        return json({
          approval, status: "rejected",
          message: "A manager cannot approve their own request",
        }, 200);
      }
    }

    // ── 3. Apply the decision ────────────────────────────────────────────────
    const newStatus = body.action === "approve" ? "approved" : "rejected";

    const { data: updated, error: updateErr } = await admin
      .from("manager_approvals")
      .update({
        status:      newStatus,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        ...(body.notes ? { reason: body.notes } : {}),
      })
      .eq("id", body.approval_id)
      .select()
      .single();

    if (updateErr) throw BadRequest(updateErr.message);

    // ── 4. Write audit log ───────────────────────────────────────────────────
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     approverId,
      action:      `manager_approval.${newStatus}${viaCode ? "_via_code" : ""}`,
      entityType:  "manager_approval",
      entityId:    body.approval_id,
      before: {
        status:      "pending",
        requested_by: approval.requested_by,
      },
      after: {
        status:        newStatus,
        approved_by:   approverId,
        approver_role: approverRole,
        via_code:      viaCode,
        notes:         body.notes ?? null,
      },
    }));

    return json({ approval: updated, status: newStatus });
  } catch (err) { return handleError(err); }
});
