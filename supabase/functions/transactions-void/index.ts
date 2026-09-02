// POST /transactions-void — manager+ void of a completed transaction (no money movement, audit only).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { getUnservedOrderItemIds, reverseOrderStock } from "../_shared/stockReversal.ts";

const Body = z.object({
  workspace_id:   z.string().uuid(),
  transaction_id: z.string().uuid(),
  reason:         z.string().min(3),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.VOID_REFUND);

    const admin = adminClient();
    const { data: tx, error } = await admin.from("transactions")
      .select("*").eq("id", body.transaction_id).eq("workspace_id", body.workspace_id).maybeSingle();
    if (error) throw BadRequest(error.message);
    if (!tx) throw NotFound("Transaction not found");
    if (tx.status === "voided") throw Conflict("Already voided");

    const { data: updated, error: uErr } = await admin.from("transactions")
      .update({ status: "voided", voided_by: ctx.userId, voided_reason: body.reason })
      .eq("id", tx.id).select().single();
    if (uErr) throw BadRequest(uErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "transaction.void", entityType: "transaction", entityId: tx.id,
      before: tx, after: updated,
    }));

    // If this transaction is linked to an order, reverse ingredient + inventory
    // deductions — but only for items that were never served. Served/completed
    // items represent consumed food; voiding the transaction doesn't un-cook it.
    // Non-blocking — a void must not fail due to a reversal error — but failures are
    // written to the audit log so admins can investigate and correct inventory manually.
    if (tx.reference_table === "orders" && tx.reference_id) {
      const orderId = tx.reference_id as string;
      getUnservedOrderItemIds(admin, orderId)
        .then((unservedIds) => unservedIds.length
          ? reverseOrderStock(admin, orderId, "void", unservedIds).then(() => {})
          : undefined)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[transactions-void] stock reversal failed:", msg);
          // Write a warning audit entry so admins can find and correct inventory manually.
          admin.from("audit_logs").insert({
            workspace_id: body.workspace_id,
            actor_id:     ctx.userId,
            action:       "transaction.void.reversal_failed",
            entity_type:  "transaction",
            entity_id:    tx.id,
            after:        { order_id: orderId, error: msg },
          }).then(() => {}).catch(() => {});
        });
    }

    return json({ transaction: updated });
  } catch (err) { return handleError(err); }
});
