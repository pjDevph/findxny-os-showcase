// POST /tasks-complete-item — mark a checklist item as completed.
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
  item_id:      z.string().uuid(),
  shift_id:     z.string().uuid().optional(),
  notes:        z.string().max(500).optional(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // 1. Verify checklist_item belongs to checklist and workspace
    const { data: item, error: itemErr } = await admin
      .from("checklist_items")
      .select("*")
      .eq("id", body.item_id)
      .eq("checklist_id", body.checklist_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (itemErr) throw BadRequest(itemErr.message);
    if (!item) throw NotFound("Checklist item not found");

    // Resolve the target date (default: today UTC)
    const targetDate = body.date ?? new Date().toISOString().slice(0, 10);

    // 2. Check if already completed today (or for this shift)
    let existingQuery = admin
      .from("checklist_completions")
      .select("*")
      .eq("workspace_id", body.workspace_id)
      .eq("checklist_id", body.checklist_id)
      .eq("item_id", body.item_id);

    if (body.shift_id) {
      existingQuery = existingQuery.eq("shift_id", body.shift_id);
    } else {
      existingQuery = existingQuery
        .gte("completed_at", `${targetDate}T00:00:00.000Z`)
        .lt("completed_at",  `${targetDate}T23:59:59.999Z`);
    }

    const { data: existing, error: existErr } = await existingQuery.maybeSingle();
    if (existErr) throw BadRequest(existErr.message);

    if (existing) {
      return json({ already_done: true, completion: existing });
    }

    // 3. Insert completion row
    const insertPayload: Record<string, any> = {
      checklist_id:  body.checklist_id,
      item_id:       body.item_id,
      workspace_id:  body.workspace_id,
      completed_by:  ctx.userId,
      completed_at:  new Date().toISOString(),
    };
    if (body.shift_id) insertPayload.shift_id = body.shift_id;
    if (body.notes)    insertPayload.notes    = body.notes;

    const { data: completion, error: insErr } = await admin
      .from("checklist_completions")
      .insert(insertPayload)
      .select()
      .single();
    if (insErr) throw BadRequest(insErr.message);

    // 4. Audit
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "checklist.item_completed",
      entityType:  "checklist_item",
      entityId:    body.item_id,
      after:       completion,
    }));

    return json({ completion });
  } catch (err) { return handleError(err); }
});
