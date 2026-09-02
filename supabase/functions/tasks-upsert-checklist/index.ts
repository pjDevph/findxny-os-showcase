// POST /tasks-upsert-checklist — create or update a task checklist and its items.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const scheduleEnum = z.enum(["daily", "weekly", "monthly", "once", "shift_open", "shift_close"]);
const assignedRoleEnum = z.enum(["cashier", "manager", "kitchen", "any"]);

const ItemInput = z.object({
  id:          z.string().uuid().optional(),
  name:        z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  sort_order:  z.number().int().optional().default(0),
});

const Body = z.object({
  workspace_id:  z.string().uuid(),
  checklist_id:  z.string().uuid().optional(),
  branch_id:     z.string().uuid().optional().nullable(),
  name:          z.string().min(1).max(100),
  schedule:      scheduleEnum,
  assigned_role: assignedRoleEnum.optional().nullable(),
  is_active:     z.boolean().optional().default(true),
  sort_order:    z.number().int().optional().default(0),
  items:         z.array(ItemInput).optional().default([]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    let before: any = null;
    let checklist: any;

    const checklistPayload: Record<string, any> = {
      workspace_id:  body.workspace_id,
      name:          body.name.trim(),
      schedule:      body.schedule,
      assigned_role: body.assigned_role ?? null,
      is_active:     body.is_active,
      sort_order:    body.sort_order,
      branch_id:     body.branch_id ?? null,
    };

    // 1. Upsert checklist
    if (body.checklist_id) {
      // Update existing
      const { data: existing, error: fetchErr } = await admin
        .from("task_checklists")
        .select("*")
        .eq("id", body.checklist_id)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle();
      if (fetchErr) throw BadRequest(fetchErr.message);
      if (!existing) throw NotFound("Checklist not found");

      before = existing;

      const { data: updated, error: updErr } = await admin
        .from("task_checklists")
        .update(checklistPayload)
        .eq("id", body.checklist_id)
        .select()
        .single();
      if (updErr) throw BadRequest(updErr.message);
      checklist = updated;
    } else {
      // Insert new
      const { data: inserted, error: insErr } = await admin
        .from("task_checklists")
        .insert(checklistPayload)
        .select()
        .single();
      if (insErr) throw BadRequest(insErr.message);
      checklist = inserted;
    }

    // 2. Upsert items
    const resultItems: any[] = [];
    for (const itemInput of body.items) {
      if (itemInput.id) {
        // Update existing item
        const { data: updItem, error: updItemErr } = await admin
          .from("checklist_items")
          .update({
            name:        itemInput.name.trim(),
            description: itemInput.description ?? null,
            sort_order:  itemInput.sort_order,
          })
          .eq("id", itemInput.id)
          .eq("checklist_id", checklist.id)
          .eq("workspace_id", body.workspace_id)
          .select()
          .single();
        if (updItemErr) throw BadRequest(`Item ${itemInput.id}: ${updItemErr.message}`);
        resultItems.push(updItem);
      } else {
        // Insert new item
        const { data: newItem, error: newItemErr } = await admin
          .from("checklist_items")
          .insert({
            checklist_id: checklist.id,
            workspace_id: body.workspace_id,
            name:         itemInput.name.trim(),
            description:  itemInput.description ?? null,
            sort_order:   itemInput.sort_order,
          })
          .select()
          .single();
        if (newItemErr) throw BadRequest(`Item insert: ${newItemErr.message}`);
        resultItems.push(newItem);
      }
    }

    // 3. Audit
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "checklist.upsert",
      entityType:  "task_checklist",
      entityId:    checklist.id,
      before,
      after:       { ...checklist, items: resultItems },
    }));

    return json({ checklist: { ...checklist, items: resultItems } });
  } catch (err) { return handleError(err); }
});
