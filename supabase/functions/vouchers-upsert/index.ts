// POST /vouchers-upsert — create or update a voucher (owner/admin only).
// Pass id to update an existing voucher; omit id to create.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:     z.string().uuid(),
  id:               z.string().uuid().optional(),
  code:             z.string().min(1).max(50).optional(),
  name:             z.string().min(1).max(200).optional(),
  description:      z.string().max(500).nullable().optional(),
  discount_type:    z.enum(["percentage", "fixed"]).optional(),
  discount_value:   z.number().min(0).optional(),
  max_cap:          z.number().min(0).nullable().optional(),
  min_spend:        z.number().min(0).optional(),
  usage_limit:      z.number().int().min(1).nullable().optional(),
  one_per_customer: z.boolean().optional(),
  applies_to:       z.enum(["order", "food", "drinks", "rooms", "amenities"]).optional(),
  valid_from:       z.string().nullable().optional(),
  valid_until:      z.string().nullable().optional(),
  status:           z.enum(["active", "scheduled", "disabled"]).optional(),
});

type Admin = ReturnType<typeof adminClient>;
type BodyType = z.infer<typeof Body>;

async function updateVoucher(admin: Admin, body: BodyType, actorId: string): Promise<Response> {
  const { data: existing, error: fetchErr } = await admin
    .from("vouchers").select("*")
    .eq("workspace_id", body.workspace_id).eq("id", body.id).maybeSingle();
  if (fetchErr) throw BadRequest(fetchErr.message);
  if (!existing) throw NotFound("Voucher not found");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of [
    "code", "name", "description", "discount_type", "discount_value",
    "max_cap", "min_spend", "usage_limit", "one_per_customer",
    "applies_to", "valid_from", "valid_until", "status",
  ] as const) {
    if ((body as any)[k] !== undefined) patch[k] = (body as any)[k];
  }

  const { data: updated, error } = await admin
    .from("vouchers").update(patch)
    .eq("workspace_id", body.workspace_id).eq("id", body.id)
    .select().single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId: body.workspace_id, actorId,
    action: "voucher.update", entityType: "voucher", entityId: body.id!,
    before: existing, after: updated,
  }));
  return json({ voucher: updated });
}

async function createVoucher(admin: Admin, body: BodyType, actorId: string): Promise<Response> {
  for (const required of ["code", "name", "discount_type", "discount_value"] as const) {
    if ((body as any)[required] === undefined) throw BadRequest(`${required} is required`);
  }

  const payload = {
    workspace_id:     body.workspace_id,
    code:             (body.code as string).toUpperCase(),
    name:             body.name,
    description:      body.description ?? null,
    discount_type:    body.discount_type,
    discount_value:   body.discount_value,
    max_cap:          body.max_cap ?? null,
    min_spend:        body.min_spend ?? 0,
    usage_limit:      body.usage_limit ?? null,
    usage_count:      0,
    one_per_customer: body.one_per_customer ?? false,
    applies_to:       body.applies_to ?? "order",
    valid_from:       body.valid_from ?? null,
    valid_until:      body.valid_until ?? null,
    status:           body.status ?? "active",
  };

  const { data: created, error } = await admin
    .from("vouchers").insert(payload).select().single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId: body.workspace_id, actorId,
    action: "voucher.create", entityType: "voucher", entityId: created.id,
    before: null, after: created,
  }));
  return json({ voucher: created }, 201);
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();
    return body.id
      ? await updateVoucher(admin, body, ctx.userId)
      : await createVoucher(admin, body, ctx.userId);
  } catch (err) { return handleError(err); }
});
