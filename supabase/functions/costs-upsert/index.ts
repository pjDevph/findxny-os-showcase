// POST /costs-upsert — create or update a business cost item.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  id:           z.string().uuid().optional(),
  category:     z.enum(["startup", "fixed", "variable", "marketing", "buffer", "growth"]),
  name:         z.string().min(1),
  amount:       z.number().min(0),
  frequency:    z.enum(["one_time", "monthly", "per_sale"]),
  notes:        z.string().optional(),
});

type BodyType = z.infer<typeof Body>;
type AdminClient = ReturnType<typeof adminClient>;

async function updateCostItem(admin: AdminClient, body: BodyType): Promise<any> {
  const { data: existing, error: fErr } = await admin
    .from("cost_items").select("id, workspace_id").eq("id", body.id!).maybeSingle();
  if (fErr) throw BadRequest(fErr.message);
  if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Cost item not found");

  const { data, error } = await admin.from("cost_items").update({
    category:   body.category,
    name:       body.name,
    amount:     body.amount,
    frequency:  body.frequency,
    notes:      body.notes ?? "",
    updated_at: new Date().toISOString(),
  }).eq("id", body.id!).select().single();
  if (error) throw BadRequest(error.message);
  return data;
}

async function insertCostItem(admin: AdminClient, body: BodyType): Promise<any> {
  const { data, error } = await admin.from("cost_items").insert({
    workspace_id: body.workspace_id,
    category:     body.category,
    name:         body.name,
    amount:       body.amount,
    frequency:    body.frequency,
    notes:        body.notes ?? "",
  }).select().single();
  if (error) throw BadRequest(error.message);
  return data;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const item = body.id
      ? await updateCostItem(admin, body)
      : await insertCostItem(admin, body);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: body.id ? "cost_item.update" : "cost_item.create",
      entityType: "cost_item", entityId: item.id,
      after: item,
    }));
    return json({ item }, body.id ? 200 : 201);
  } catch (err) { return handleError(err); }
});
