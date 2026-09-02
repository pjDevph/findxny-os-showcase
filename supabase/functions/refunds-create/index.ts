// POST /refunds-create — full or partial refund against a payment.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict, Forbidden } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { createRefund } from "../_shared/xenditClient.ts";
import { getUnservedOrderItemIds, reverseOrderStock } from "../_shared/stockReversal.ts";

const Body = z.object({
  workspace_id:         z.string().uuid(),
  branch_id:            z.string().uuid(),
  payment_id:           z.string().uuid(),
  amount:               z.number().positive(),
  reason:               z.string().min(3),
  manager_approval_id:  z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let refundCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);

    // Manager/admin/owner have standing authority to refund on their own
    // session. Everyone else (cashier) needs a manager_approval_id that a
    // manager actually signed off on via manager-approval-verify — same
    // pattern as orders-cancel's guardKitchenStatus. Without this branch,
    // a cashier who gets a valid manager PIN approval still hits a 403
    // here, because the role check ran on the requester's own role instead
    // of trusting the approval.
    const hasDirectAuthority = Roles.VOID_REFUND.includes(ctx.role);
    if (!hasDirectAuthority) {
      requireRole(ctx, Roles.STAFF_WRITE);
      if (!body.manager_approval_id) {
        throw Forbidden(`Role '${ctx.role}' requires manager approval to issue a refund`);
      }
    }

    // Dedup: same actor + payment can't fire more than 3x in 10s.
    await rateLimit(req, {
      scope: "refunds-create",
      key: `${ctx.userId}:${body.payment_id}`,
      max: 3, windowSec: 10,
    });
    idem = await idempotencyGuard(req, "refunds-create", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);

    const admin = adminClient();
    const { data: payment, error } = await admin.from("payments")
      .select("*, payment_intents!inner(*)").eq("id", body.payment_id).maybeSingle();
    if (error) throw BadRequest(error.message);
    if (!payment || payment.payment_intents.workspace_id !== body.workspace_id) throw NotFound("Payment not found");

    if (body.manager_approval_id) {
      const { data: approval, error: aErr } = await admin.from("manager_approvals")
        .select("status, action_type, target_type, target_id")
        .eq("id", body.manager_approval_id)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle();
      if (aErr) throw BadRequest(aErr.message);
      if (!approval || approval.target_type !== "order" || approval.target_id !== payment.payment_intents.order_id) {
        throw Conflict("Manager approval does not match this payment's order");
      }
      if (approval.action_type !== "refund") throw BadRequest("Manager approval action type mismatch.");
      if (approval.status !== "approved") {
        throw Conflict(`Manager approval has not been granted yet (status: ${approval.status})`);
      }
    } else if (!hasDirectAuthority) {
      // Unreachable in practice — the early gate above already requires
      // manager_approval_id for non-authority roles — but fail closed if
      // that invariant ever drifts.
      throw Forbidden("Manager approval required for this role");
    }

    // Excludes status='failed' — a refund whose Xendit dispatch failed (see
    // below) must not permanently consume refund headroom for this payment.
    const { data: existing } = await admin.from("refunds").select("amount").eq("payment_id", body.payment_id).neq("status", "failed");
    const refundedSoFar = (existing ?? []).reduce((s, r) => s + Number(r.amount), 0);
    if (refundedSoFar + body.amount > Number(payment.amount)) {
      throw Conflict(`Refund exceeds remaining balance (paid ${payment.amount}, refunded ${refundedSoFar})`);
    }

    const intent = payment.payment_intents;
    const isFull = refundedSoFar + body.amount >= Number(payment.amount);

    const { data: refund, error: rErr } = await admin.from("refunds").insert({
      payment_id:        body.payment_id,
      payment_intent_id: intent.id,
      order_id:          intent.order_id ?? null,
      currency:          intent.currency ?? "PHP",
      amount:            body.amount,
      reason:            body.reason,
      created_by:        ctx.userId,
      status:            "pending",
      ...(body.manager_approval_id ? { manager_approval_id: body.manager_approval_id } : {}),
    }).select().single();
    if (rErr) throw BadRequest(rErr.message);
    refundCreated = true;
    const provider: string = intent.provider ?? "cash";

    let refundStatus: "processing" | "completed";
    if (provider === "xendit") {
      // Dispatch to Xendit — webhook will flip refund status to completed/failed.
      // A dispatch failure here (network blip, Xendit outage) used to leave
      // the refund row stuck at status="pending" forever AND its Idempotency-
      // Key unresolved for up to 7 days (idem.release() below is skipped once
      // refundCreated=true, which was set right after the insert, before this
      // call) — a retry with the same key got "still in progress" instead of
      // ever completing, and refundedSoFar (above) counted the stuck row
      // against this payment's remaining refundable balance regardless.
      try {
        await createRefund({
          invoiceId: intent.provider_intent_id,
          amount:    body.amount,
          currency:  intent.currency ?? "PHP",
          reason:    body.reason,
          idempotencyKey: refund.id,
        });
      } catch (dispatchErr) {
        await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
        await idem.release().catch(() => {});
        throw dispatchErr instanceof Error
          ? BadRequest(`Refund could not be dispatched to the payment provider: ${dispatchErr.message}. Please retry.`)
          : BadRequest("Refund could not be dispatched to the payment provider. Please retry.");
      }
      refundStatus = "processing";
    } else {
      // Cash / other non-Xendit: mark completed immediately.
      refundStatus = "completed";
    }

    await admin.from("refunds").update({ status: refundStatus }).eq("id", refund.id);

    if (isFull) {
      await admin.from("payment_intents").update({ status: "refunded" }).eq("id", payment.intent_id);
      if (intent.order_id) {
        const orderId = intent.order_id;
        await admin.from("orders").update({ payment_status: "refunded" }).eq("id", orderId);
        // Cancel any active prep tickets (new/accepted/preparing/ready).
        // Tickets already served or completed represent delivered food — keep history intact.
        await admin.from("kitchen_tickets")
          .update({ kitchen_status: "completed", status: "completed" })
          .eq("order_id", orderId)
          .in("kitchen_status", ["new", "accepted", "preparing", "ready"]);

        // Restore stock/ingredients only for items that were never served —
        // served/completed items represent consumed food and are left alone.
        // (Partial refunds are a raw dollar amount with no item linkage, so
        // there's nothing safe to restore there — full refunds only.)
        EdgeRuntime.waitUntil(
          getUnservedOrderItemIds(admin, orderId)
            .then((unservedIds) => unservedIds.length
              ? reverseOrderStock(admin, orderId, "refund", unservedIds).then(() => {})
              : undefined)
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[refunds-create] stock reversal failed:", msg);
              admin.from("audit_logs").insert({
                workspace_id: body.workspace_id,
                actor_id:     ctx.userId,
                action:       "refund.stock_reversal_failed",
                entity_type:  "order",
                entity_id:    orderId,
                after:        { error: msg },
              }).then(() => {}).catch(() => {});
            }),
        );
      }
    }

    const { data: tx, error: tErr } = await admin.from("transactions").insert({
      workspace_id: body.workspace_id, branch_id: body.branch_id,
      type: "refund", reference_table: "refunds", reference_id: refund.id,
      amount: -Math.abs(body.amount), status: refundStatus, created_by: ctx.userId,
    }).select().single();
    if (tErr) throw BadRequest(tErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "refund.create", entityType: "refund", entityId: refund.id,
      after: { refund, transaction: tx, full_refund: isFull, provider, refund_status: refundStatus },
    }));
    const result = { refund, transaction: tx, full_refund: isFull };
    await idem.commit(201, result);
    return json(result, 201);
  } catch (err) {
    if (idem && !refundCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});
