// POST /vouchers-create — admin-only creation of discount vouchers.
// Inserts directly into `vouchers`, which the admin voucher page reads from,
// so newly created vouchers appear there immediately (no separate sync step).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:     z.string().uuid(),
  code:             z.string().min(3).max(40).regex(/^[A-Z0-9_-]+$/, "Use uppercase letters, numbers, - or _"),
  name:             z.string().min(2).max(120),
  description:      z.string().max(500).optional(),
  discount_type:    z.enum(["percentage", "fixed"]),
  discount_value:   z.number().positive(),
  max_cap:          z.number().positive().optional(),       // cap for percent-type discounts
  min_spend:        z.number().min(0).default(0),
  usage_limit:      z.number().int().positive().optional(), // null = unlimited
  one_per_customer: z.boolean().default(false),
  applies_to:       z.enum(["order", "food", "drinks", "rooms", "amenities"]).default("order"),
  valid_from:       z.string().datetime().optional(),
  valid_until:      z.string().datetime().optional(),
  status:           z.enum(["active", "disabled", "scheduled"]).default("active"),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.OWNER_ONLY); // adjust if managers should also create vouchers

    if (body.discount_type === "percentage" && body.discount_value > 100) {
      throw BadRequest("Percent discount cannot exceed 100");
    }
    if (body.valid_from && body.valid_until && body.valid_from >= body.valid_until) {
      throw BadRequest("valid_until must be after valid_from");
    }

    const admin = adminClient();
    const code = body.code;

    const { data: inserted, error } = await admin.from("vouchers")
      .insert({
        workspace_id:     body.workspace_id,
        code,
        name:             body.name,
        description:      body.description ?? null,
        discount_type:    body.discount_type,
        discount_value:   body.discount_value,
        max_cap:          body.max_cap ?? null,
        min_spend:        body.min_spend,
        usage_limit:      body.usage_limit ?? null,
        usage_count:      0,
        one_per_customer: body.one_per_customer,
        applies_to:       body.applies_to,
        valid_from:       body.valid_from ?? null,
        valid_until:      body.valid_until ?? null,
        status:           body.status,
      })
      .select()
      .single();

    if (error) {
      // Unique constraint: concurrent request won the race on the same code.
      if (error.code === "23505") throw BadRequest(`Voucher code "${code}" already exists`);
      throw BadRequest(error.message);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "voucher.create", entityType: "voucher", entityId: inserted.id,
      before: null, after: inserted,
    }));

    return json({ voucher: inserted });
  } catch (err) { return handleError(err); }
});
