// POST /tasks-list — fetch active task checklists with items and optional completion status.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const scheduleEnum = z.enum(["daily", "weekly", "monthly", "once", "shift_open", "shift_close"]);

const Body = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().optional(),
  schedule:     scheduleEnum.optional(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  shift_id:     z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // 1. Fetch active checklists
    let checklistQuery = admin
      .from("task_checklists")
      .select("*")
      .eq("workspace_id", body.workspace_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (body.branch_id) checklistQuery = checklistQuery.eq("branch_id", body.branch_id);
    if (body.schedule)  checklistQuery = checklistQuery.eq("schedule", body.schedule);

    const { data: checklists, error: clErr } = await checklistQuery;
    if (clErr) throw BadRequest(clErr.message);
    if (!checklists || checklists.length === 0) return json({ checklists: [] });

    const checklistIds = checklists.map((c: any) => c.id);

    // 2. Fetch all items for those checklists
    const { data: items, error: itemErr } = await admin
      .from("checklist_items")
      .select("*")
      .in("checklist_id", checklistIds)
      .eq("workspace_id", body.workspace_id)
      .order("sort_order", { ascending: true });
    if (itemErr) throw BadRequest(itemErr.message);

    // 3. Fetch completions if date or shift_id provided
    let completionMap: Map<string, any> = new Map();

    if (body.date || body.shift_id) {
      let compQuery = admin
        .from("checklist_completions")
        .select("*")
        .eq("workspace_id", body.workspace_id)
        .in("checklist_id", checklistIds);

      if (body.shift_id) {
        compQuery = compQuery.eq("shift_id", body.shift_id);
      } else if (body.date) {
        // Filter completions for the given date using gte/lt range
        compQuery = compQuery
          .gte("completed_at", `${body.date}T00:00:00.000Z`)
          .lt("completed_at",  `${body.date}T23:59:59.999Z`);
      }

      const { data: completions, error: compErr } = await compQuery;
      if (compErr) throw BadRequest(compErr.message);

      // Map by item_id (last completion wins if multiple)
      for (const c of (completions ?? [])) {
        completionMap.set(c.item_id, c);
      }
    }

    // 4. Build response — group items under their checklist
    const itemsByChecklist = new Map<string, any[]>();
    for (const item of (items ?? [])) {
      if (!itemsByChecklist.has(item.checklist_id)) {
        itemsByChecklist.set(item.checklist_id, []);
      }
      const completion = completionMap.get(item.id);
      itemsByChecklist.get(item.checklist_id)!.push({
        ...item,
        completed:    !!completion,
        completed_by: completion?.completed_by ?? null,
        completed_at: completion?.completed_at ?? null,
        notes:        completion?.notes ?? null,
        shift_id:     completion?.shift_id ?? null,
      });
    }

    const result = checklists.map((cl: any) => ({
      ...cl,
      items: itemsByChecklist.get(cl.id) ?? [],
    }));

    return json({ checklists: result });
  } catch (err) { return handleError(err); }
});
