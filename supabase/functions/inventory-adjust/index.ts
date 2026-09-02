// POST /inventory-adjust — record stock movement (in/out/adjustment) and update inventory.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:      z.string().uuid(),
  branch_id:         z.string().uuid(),
  inventory_item_id: z.string().uuid(),
  type:              z.enum(["in","out","adjustment"]),
  quantity:          z.number().finite().min(-1_000_000).max(1_000_000),
  reason:            z.string().max(500).optional(),
});

type MovementType = "in" | "out" | "adjustment";

function computeNewQuantity(before: number, type: MovementType, quantity: number): number {
  if (type === "in")         return before + Math.abs(quantity);
  if (type === "out")        return before - Math.abs(quantity);
  return quantity; // adjustment = absolute set
}

function computeMovementQuantity(type: MovementType, quantity: number, after: number, before: number): number {
  if (type === "adjustment") return after - before;
  if (type === "out")        return Math.abs(quantity) * -1;
  return Math.abs(quantity);
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const { data: item, error } = await admin.from("inventory_items")
      .select("id, workspace_id, branch_id, quantity").eq("id", body.inventory_item_id).maybeSingle();
    if (error) throw BadRequest(error.message);
    if (!item || item.workspace_id !== body.workspace_id) throw NotFound("Inventory item not found");
    if (item.branch_id !== body.branch_id) throw BadRequest("Branch mismatch");

    const before = Number(item.quantity);
    const after  = computeNewQuantity(before, body.type, body.quantity);
    if (after < 0) throw Conflict("Insufficient stock");

    const { data: updated, error: uErr } = await admin.from("inventory_items")
      .update({ quantity: after, updated_at: new Date().toISOString() })
      .eq("id", item.id).select().single();
    if (uErr) throw BadRequest(uErr.message);

    const { data: movement, error: mErr } = await admin.from("stock_movements").insert({
      workspace_id: body.workspace_id, branch_id: body.branch_id,
      inventory_item_id: item.id, type: body.type,
      quantity: computeMovementQuantity(body.type, body.quantity, after, before),
      reason: body.reason ?? null, user_id: ctx.userId,
    }).select().single();
    if (mErr) throw BadRequest(mErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: `inventory.${body.type}`, entityType: "inventory_item", entityId: item.id,
      before: { quantity: before }, after: { quantity: after, movement },
    }));
    return json({ item: updated, movement }, 201);
  } catch (err) { return handleError(err); }
});
