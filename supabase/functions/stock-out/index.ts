// POST /stock-out — record stock removal (damaged, expired, lost, or other write-off).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:      z.string().uuid(),
  inventory_item_id: z.string().uuid(),
  quantity:          z.number().positive(),
  reason_type:       z.enum(["damaged", "expired", "lost", "other"]),
  note:              z.string().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();
    const { data: item, error: iErr } = await admin
      .from("inventory_items").select("*").eq("id", body.inventory_item_id).maybeSingle();
    if (iErr) throw BadRequest(iErr.message);
    if (!item || item.workspace_id !== body.workspace_id) throw NotFound("Inventory item not found");

    const beforeQty = Number(item.quantity);
    if (beforeQty < body.quantity) throw Conflict(`Insufficient stock: have ${beforeQty}, requested ${body.quantity}`);

    const afterQty = beforeQty - body.quantity;

    const { data: updated, error: uErr } = await admin
      .from("inventory_items")
      .update({ quantity: afterQty, updated_at: new Date().toISOString() })
      .eq("id", item.id).select().single();
    if (uErr) throw BadRequest(uErr.message);

    const reason = [body.reason_type, body.note].filter(Boolean).join(": ");

    const { data: movement, error: mErr } = await admin.from("stock_movements").insert({
      workspace_id:      body.workspace_id,
      branch_id:         item.branch_id,
      inventory_item_id: item.id,
      type:              "out",
      quantity:          -body.quantity,
      reason,
      user_id:           ctx.userId,
    }).select().single();
    if (mErr) throw BadRequest(mErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "stock.out", entityType: "inventory_item", entityId: item.id,
      before: { quantity: beforeQty }, after: { quantity: afterQty, reason, movement },
    }));
    return json({ item: updated, movement }, 201);
  } catch (err) { return handleError(err); }
});
