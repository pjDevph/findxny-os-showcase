// POST /bookings-refund
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  booking_id:   z.string().uuid(),
  amount:       z.number().positive(),
  method:       z.enum(["cash", "gcash", "maya", "xendit", "bank_transfer", "other"]),
  reason:       z.string().min(3),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let refundCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    idem = await idempotencyGuard(req, "bookings-refund", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);

    const admin = adminClient();

    const { data: booking, error: fetchErr } = await admin.from("bookings")
      .select("id, workspace_id, branch_id, status, total, amount_paid, payment_status, voucher_id")
      .eq("id", body.booking_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (fetchErr) throw BadRequest(fetchErr.message);
    if (!booking) throw NotFound("Booking not found");

    if (["hold", "expired"].includes(booking.status)) {
      throw Conflict("Cannot refund a booking with no recorded payment");
    }
    if (["checked_in", "checked_out", "completed"].includes(booking.status)) {
      throw Conflict("Cannot refund a booking that is in progress or already completed. Check out the guest first.");
    }
    if (booking.status === "rescheduled") {
      throw Conflict("This booking was rescheduled. Issue the refund on the replacement booking instead.");
    }

    if (body.amount > (booking.amount_paid ?? 0)) {
      throw Conflict("Refund amount exceeds amount paid");
    }

    const new_amount_paid = Math.max(0, (booking.amount_paid ?? 0) - body.amount);
    let payment_status: string;
    let new_status = booking.status;
    if (new_amount_paid <= 0) {
      payment_status = "refunded";
      new_status = "cancelled";
    } else if (new_amount_paid < booking.total) {
      payment_status = "partial";
    } else {
      payment_status = "paid";
    }

    // Guarded update FIRST, ledger insert only after it actually applies.
    // Optimistic concurrency: only apply if amount_paid still matches what we
    // read above. Two concurrent refund requests would otherwise both read
    // the same stale amount_paid, both pass the "refund <= amount_paid" guard
    // above, and — if the ledger insert ran first, as it used to — both would
    // insert their own booking_payment_transactions row even though only one
    // could ever win this update, leaving an orphaned ledger row for a refund
    // that was actually rejected.
    const { data: updated, error: updateErr } = await admin.from("bookings")
      .update({ amount_paid: new_amount_paid, payment_status, status: new_status })
      .eq("id", body.booking_id)
      .eq("amount_paid", booking.amount_paid ?? 0)
      .select()
      .single();
    if (updateErr) {
      if (updateErr.code === "PGRST116") throw Conflict("Booking was modified by another request — please retry");
      throw BadRequest(updateErr.message);
    }
    refundCreated = true;

    const { data: txn, error: txnErr } = await admin.from("booking_payment_transactions")
      .insert({
        booking_id:   body.booking_id,
        workspace_id: body.workspace_id,
        amount:       body.amount,
        method:       body.method,
        type:         "refund",
        reference:    null,
        actor_id:     ctx.userId,
      })
      .select()
      .single();
    if (txnErr) throw BadRequest(txnErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "booking.refund", entityType: "booking", entityId: body.booking_id,
      before: booking,
      after: { ...updated, _refund: { amount: body.amount, method: body.method, reason: body.reason } },
    }));

    // Sync refund to transactions table so the Transactions page shows it.
    const { error: txSyncErr } = await admin.from("transactions").insert({
      workspace_id:    body.workspace_id,
      branch_id:       booking.branch_id ?? null,
      type:            "refund",
      status:          "completed",
      reference_table: "bookings",
      reference_id:    body.booking_id,
      amount:          body.amount,
      created_by:      ctx.userId,
    });
    if (txSyncErr) console.error("[bookings-refund] transactions insert failed:", txSyncErr.message);

    // Full refund: mark payment_intent(s) as refunded so dashboard and reports
    // stop counting this booking's revenue.
    if (new_amount_paid <= 0) {
      const { error: piErr } = await admin.from("payment_intents")
        .update({ status: "refunded" })
        .eq("booking_id", body.booking_id)
        .eq("status", "succeeded");
      if (piErr) console.error("[bookings-refund] payment_intents update failed:", piErr.message);
    }

    // Roll back voucher usage on full refund.
    if (new_amount_paid <= 0 && booking.voucher_id) {
      const { error: vrdErr } = await admin.from("voucher_redemptions")
        .delete().eq("booking_id", body.booking_id);
      if (vrdErr) console.error("[bookings-refund] voucher_redemptions delete failed:", vrdErr.message);
      const { error: vUsageErr } = await admin.rpc("decrement_voucher_usage", {
        p_voucher_id:   booking.voucher_id,
        p_workspace_id: body.workspace_id,
      });
      if (vUsageErr) console.error("[bookings-refund] voucher usage decrement failed:", vUsageErr.message);
    }

    const result = { booking: updated, transaction: txn };
    await idem.commit(200, result);
    return json(result);
  } catch (err) {
    if (idem && !refundCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});
