// POST /orders-advance — advance an order through preparing → ready → completed.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ["preparing"],
  preparing: ["ready"],
  ready:     ["completed"],
};

const KITCHEN_STATUS: Record<string, string> = {
  preparing: "preparing",
  ready:     "ready",
  completed: "served",
};

const KITCHEN_TS: Record<string, string> = {
  preparing: "started_at",
  ready:     "ready_at",
  completed: "served_at",
};

const Body = z.object({
  workspace_id: z.string().uuid(),
  order_id:     z.string().uuid(),
  status:       z.enum(["preparing", "ready", "completed"]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.KITCHEN_WRITE);

    const admin = adminClient();
    const { data: order, error: oErr } = await admin
      .from("orders").select("id, status, workspace_id")
      .eq("id", body.order_id).maybeSingle();
    if (oErr) throw BadRequest(oErr.message);
    if (!order || order.workspace_id !== body.workspace_id) throw NotFound("Order not found");

    const allowed = VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw BadRequest(`Cannot advance from '${order.status}' to '${body.status}'`);
    }

    const { data: updated, error: uErr } = await admin
      .from("orders").update({ status: body.status })
      .eq("id", body.order_id).select().single();
    if (uErr) throw BadRequest(uErr.message);

    // Mirror status into kitchen ticket (best-effort)
    const now = new Date().toISOString();
    await admin.from("kitchen_tickets").update({
      kitchen_status: KITCHEN_STATUS[body.status],
      [KITCHEN_TS[body.status]]: now,
    }).eq("order_id", body.order_id).eq("workspace_id", body.workspace_id);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "order.advance", entityType: "order", entityId: body.order_id,
      before: { status: order.status }, after: { status: body.status },
    }));

    return json({ order: updated });
  } catch (err) { return handleError(err); }
});
