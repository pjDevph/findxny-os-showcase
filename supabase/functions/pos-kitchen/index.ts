// Legacy kitchen status updater. Newer flows use `kitchen-update-status`
// (which adds auth + role checks). Kept here for backwards compatibility with
// older POS clients; same status-transition rules apply.
//
// This handler previously had NO auth check at all despite writing through
// the service-role client — now brought in line with kitchen-update-status:
// requireAuth/requireRole (workspace resolved from the ticket) + rate limit.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { recomputeOrderStatus } from "../_shared/kitchenTickets.ts";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  new:       ["accepted"],
  accepted:  ["preparing", "ready"],
  preparing: ["ready"],
  ready:     ["served"],
  served:    ["completed"],
  completed: [],
};

const TIMESTAMP_FIELDS: Record<string, string> = {
  accepted:  "accepted_at",
  preparing: "started_at",
  ready:     "ready_at",
  served:    "served_at",
  completed: "completed_at",
};

const Body = z.object({
  ticket_id: z.string().uuid(),
  status:    z.enum(["accepted", "preparing", "ready", "served", "completed"]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const { ticket_id, status } = await parseBody(req, Body);
    const sb = adminClient();

    const { data: ticket, error: fetchErr } = await sb
      .from("kitchen_tickets")
      .select("id, kitchen_status, status, order_id, workspace_id")
      .eq("id", ticket_id)
      .single();
    if (fetchErr || !ticket) throw NotFound("Ticket not found");

    const ctx = await requireAuth(req, ticket.workspace_id);
    requireRole(ctx, Roles.KITCHEN_WRITE);
    await rateLimit(req, {
      scope: "pos-kitchen",
      key: `${ctx.userId}:${ticket_id}`,
      max: 5, windowSec: 10,
    });

    const currentStatus = ticket.kitchen_status ?? ticket.status ?? "new";
    const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(status)) {
      throw BadRequest(`Cannot transition from '${currentStatus}' to '${status}'`);
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { kitchen_status: status, updated_at: now };
    const tsField = TIMESTAMP_FIELDS[status];
    if (tsField) update[tsField] = now;
    // kitchen_tickets.status is the legacy `kitchen_status` ENUM type, which
    // only allows new|preparing|ready|completed (0001_init.sql:14) — writing
    // "served" into it violated the enum constraint and failed the WHOLE
    // update (kitchen_status included, since both fields are in one query),
    // so this endpoint could never actually mark a ticket "served" at all.
    if (status === "completed") update.status = status;

    const { error: updateErr } = await sb.from("kitchen_tickets").update(update).eq("id", ticket_id);
    if (updateErr) throw BadRequest(updateErr.message);

    // Previously only synced orders.status on "served"/"completed", and wrote
    // "served" directly — which isn't a valid order_status value
    // (draft|pending|preparing|ready|completed|cancelled), so that update
    // silently no-op'd (error never checked). Now rolls up from ALL of the
    // order's tickets on every transition, same as kitchen-update-status,
    // instead of driving the order from just this one ticket.
    if (ticket.order_id) {
      await recomputeOrderStatus(sb, ticket.order_id);
    }

    await sb.from("audit_logs").insert({
      entity_type: "kitchen_tickets",
      entity_id: ticket_id,
      action: `kitchen_${status}`,
      before: { kitchen_status: currentStatus },
      after: { kitchen_status: status },
    });

    return json({ ok: true, ticket_id, status });
  } catch (err) { return handleError(err); }
});
