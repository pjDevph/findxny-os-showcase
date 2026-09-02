// POST /expense-categories-upsert — create or update an expense category.
// Pass category_id to update an existing record; omit it to create.
// Deactivating (is_active: false) is blocked if expenses still reference the category.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  category_id:  z.string().uuid().optional(),
  name:         z.string().min(1).max(100).optional(),
  is_active:    z.boolean().optional(),
  sort_order:   z.number().int().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    if (body.category_id) {
      // ── Update ────────────────────────────────────────────────────────────
      const { data: existing, error: fetchErr } = await admin
        .from("expense_categories")
        .select("*")
        .eq("id", body.category_id)
        .maybeSingle();
      if (fetchErr) throw BadRequest(fetchErr.message);
      if (!existing || existing.workspace_id !== body.workspace_id) {
        throw NotFound("Category not found");
      }

      if (body.is_active === false && existing.is_active) {
        const { count } = await admin
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("category_id", body.category_id);
        if ((count ?? 0) > 0) {
          throw Conflict(`Cannot remove "${existing.name}" — it is used by ${count} expense(s). Rename it instead.`);
        }
      }

      const patch = {
        name:       body.name?.trim() ?? existing.name,
        is_active:  body.is_active ?? existing.is_active,
        sort_order: body.sort_order ?? existing.sort_order,
      };

      const { data: updated, error } = await admin
        .from("expense_categories")
        .update(patch)
        .eq("id", body.category_id)
        .select()
        .single();
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "expense_category.update",
        entityType:  "expense_category",
        entityId:    body.category_id,
        before:      existing,
        after:       updated,
      }));

      return json({ category: updated });
    } else {
      // ── Create ────────────────────────────────────────────────────────────
      if (!body.name?.trim()) throw BadRequest("name is required");

      const payload = {
        workspace_id: body.workspace_id,
        name:         body.name.trim(),
        sort_order:   body.sort_order ?? 0,
        is_active:    body.is_active ?? true,
      };

      const { data: created, error } = await admin
        .from("expense_categories")
        .insert(payload)
        .select()
        .single();
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "expense_category.create",
        entityType:  "expense_category",
        entityId:    created.id,
        before:      null,
        after:       created,
      }));

      return json({ category: created }, 201);
    }
  } catch (err) {
    return handleError(err);
  }
});
