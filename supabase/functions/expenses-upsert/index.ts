// POST /expenses-upsert — create or update an expense.
// Pass expense_id to update an existing record; omit it to create.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:   z.string().uuid(),
  expense_id:     z.string().uuid().optional(),
  expense_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id:    z.string().uuid().optional().nullable(),
  amount:         z.number().positive(),
  payment_method: z.enum(["cash", "bank_transfer", "card", "gcash", "maya", "other"]),
  vendor_name:    z.string().max(200).optional().nullable(),
  notes:          z.string().max(1000).optional().nullable(),
  branch_id:      z.string().uuid().optional().nullable(),
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

    if (body.expense_id) {
      // ── Update ────────────────────────────────────────────────────────────
      const { data: existing, error: fetchErr } = await admin
        .from("expenses")
        .select("*")
        .eq("id", body.expense_id)
        .maybeSingle();
      if (fetchErr) throw BadRequest(fetchErr.message);
      if (!existing || existing.workspace_id !== body.workspace_id) {
        throw NotFound("Expense not found");
      }

      const patch = {
        expense_date:   body.expense_date,
        category_id:    body.category_id ?? null,
        amount:         body.amount,
        payment_method: body.payment_method,
        vendor_name:    body.vendor_name ?? null,
        notes:          body.notes ?? null,
        branch_id:      body.branch_id ?? null,
        updated_at:     new Date().toISOString(),
      };

      const { data: updated, error } = await admin
        .from("expenses")
        .update(patch)
        .eq("id", body.expense_id)
        .select()
        .single();
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "expense.update",
        entityType:  "expense",
        entityId:    body.expense_id,
        before:      existing,
        after:       updated,
      }));

      return json({ expense: updated });
    } else {
      // ── Create ────────────────────────────────────────────────────────────
      const payload = {
        workspace_id:   body.workspace_id,
        expense_date:   body.expense_date,
        category_id:    body.category_id ?? null,
        amount:         body.amount,
        payment_method: body.payment_method,
        vendor_name:    body.vendor_name ?? null,
        notes:          body.notes ?? null,
        branch_id:      body.branch_id ?? null,
        created_by:     ctx.userId,
      };

      const { data: created, error } = await admin
        .from("expenses")
        .insert(payload)
        .select()
        .single();
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "expense.create",
        entityType:  "expense",
        entityId:    created.id,
        before:      null,
        after:       created,
      }));

      return json({ expense: created }, 201);
    }
  } catch (err) {
    return handleError(err);
  }
});
