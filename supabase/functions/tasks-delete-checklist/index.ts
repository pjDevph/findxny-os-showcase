// POST /tasks-delete-checklist — delete a task checklist (cascade removes items and completions).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  checklist_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    // 1. Fetch checklist (verify workspace ownership)
    const { data: checklist, error: fetchErr } = await admin
      .from("task_checklists")
      .select("*")
      .eq("id", body.checklist_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!checklist) throw NotFound("Checklist not found");

    // 2. Delete (DB cascade removes checklist_items and checklist_completions)
    const { error: delErr } = await admin
      .from("task_checklists")
      .delete()
      .eq("id", body.checklist_id);
    if (delErr) throw BadRequest(delErr.message);

    // 3. Audit
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "checklist.delete",
      entityType:  "task_checklist",
      entityId:    body.checklist_id,
      before:      checklist,
    }));

    return json({ deleted: true });
  } catch (err) { return handleError(err); }
});
