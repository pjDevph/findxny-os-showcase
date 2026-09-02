// POST /kitchen-update-status — advance a kitchen ticket.
// workspace_id is optional; when omitted it is resolved from the ticket itself.
// Unified handler for both the web admin KDS and the POS kitchen screen.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { recomputeOrderStatus } from "../_shared/kitchenTickets.ts";

const Body = z.object({
  workspace_id: z.string().uuid().optional(),
  ticket_id:    z.string().uuid(),
  status:       z.enum(["accepted", "preparing", "ready", "served", "completed"]),
});

// kitchen_status TEXT column allows: new | accepted | preparing | ready | served | completed
const TRANSITIONS: Record<string, string[]> = {
  new:       ["accepted", "preparing"],
  accepted:  ["preparing", "ready"],
  preparing: ["ready"],
  ready:     ["served", "completed"],
  served:    ["completed"],
  completed: [],
};

const TIMESTAMPS: Record<string, string> = {
  accepted:  "accepted_at",
  preparing: "started_at",
  ready:     "ready_at",
  served:    "served_at",
  completed: "completed_at",
};

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);

    const admin = adminClient();

    const { data: ticket, error: tErr } = await (body.workspace_id
      ? admin.from("kitchen_tickets").select("*").eq("id", body.ticket_id).eq("workspace_id", body.workspace_id).maybeSingle()
      : admin.from("kitchen_tickets").select("*").eq("id", body.ticket_id).maybeSingle());
    if (tErr) throw BadRequest(tErr.message);
    if (!ticket) throw NotFound("Ticket not found");

    const workspaceId = body.workspace_id ?? ticket.workspace_id;
    const ctx = await requireAuth(req, workspaceId);
    requireRole(ctx, Roles.KITCHEN_WRITE);

    // Mash-protection: any single user can't update the same ticket more than
    // 5 times in 10s (legitimate flow needs at most ~3 status changes).
    await rateLimit(req, {
      scope: "kitchen-update-status",
      key: `${ctx.userId}:${body.ticket_id}`,
      max: 5, windowSec: 10,
    });

    const currentStatus = ticket.kitchen_status ?? ticket.status ?? "new";
    if (!TRANSITIONS[currentStatus]?.includes(body.status)) {
      throw Conflict(`Cannot move from '${currentStatus}' to '${body.status}'`);
    }

    const now = new Date().toISOString();
    // Only write kitchen_status (TEXT column that allows accepted/served).
    // The legacy `status` enum column only allows: new|preparing|ready|completed
    // and must NOT be written with accepted or served.
    const patch: Record<string, unknown> = { kitchen_status: body.status };
    const tsField = TIMESTAMPS[body.status];
    if (tsField) patch[tsField] = now;

    const { data: updated, error: uErr } = await admin
      .from("kitchen_tickets").update(patch)
      .eq("id", ticket.id)
      .eq("kitchen_status", currentStatus)  // optimistic lock — fails if another user already advanced
      .select().maybeSingle();
    if (uErr) throw BadRequest(uErr.message);
    if (!updated) throw Conflict("Ticket was already updated by another user — please refresh.");

    // Rolls up from ALL of this order's tickets, not just this one — an
    // order with multiple prep stations (e.g. Kitchen + Drinks) should only
    // reach 'completed'/'ready' once every ticket gets there, not the moment
    // a single ticket does.
    await recomputeOrderStatus(admin, ticket.order_id);

    EdgeRuntime.waitUntil(audit({
      workspaceId, actorId: ctx.userId,
      action: `kitchen.${body.status}`, entityType: "kitchen_ticket", entityId: ticket.id,
      before: { status: currentStatus }, after: { status: body.status },
    }));

    return json({ ticket: updated });
  } catch (err) { return handleError(err); }
});
