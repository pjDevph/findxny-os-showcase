// POST /workspace-approval-code — set or check status of the shared
// "manager override code" used by manager-approval-verify. Admin/owner only.
// Write-only: "set" never echoes the code back, "status" only reports
// whether one is configured, never the value itself — the same posture as a
// password reset, since this code is meant to be verbally shared with
// on-duty staff and rotated periodically, not looked back up in the UI.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const CODE_RE = /^[A-Za-z0-9]{4,12}$/;

const Status = z.object({
  action:       z.literal("status"),
  workspace_id: z.string().uuid(),
});

const Set = z.object({
  action:       z.literal("set"),
  workspace_id: z.string().uuid(),
  // Empty/undefined clears the code (disables the code-based approval path).
  code:         z.string().regex(CODE_RE, "Code must be 4-12 letters/numbers").optional(),
});

const Body = z.discriminatedUnion("action", [Status, Set]);

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    if (body.action === "status") {
      const { data, error } = await admin.from("workspaces")
        .select("manager_override_code").eq("id", body.workspace_id).maybeSingle();
      if (error) throw BadRequest(error.message);
      return json({ has_code: !!data?.manager_override_code });
    }

    const { error } = await admin.from("workspaces")
      .update({ manager_override_code: body.code || null })
      .eq("id", body.workspace_id);
    if (error) throw BadRequest(error.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "workspace.approval_code_" + (body.code ? "set" : "cleared"),
      entityType: "workspace", entityId: body.workspace_id,
      after: { has_code: !!body.code }, // never log the code's actual value
    }));

    return json({ has_code: !!body.code });
  } catch (err) { return handleError(err); }
});
