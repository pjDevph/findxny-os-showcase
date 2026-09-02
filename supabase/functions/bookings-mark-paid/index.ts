// POST /bookings-mark-paid — record a manual (counter/cash) payment for a
// booking and promote it to confirmed. Makes the admin "Paid" pill and the
// customer-facing "confirmed" state agree.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  booking_id:   z.string().uuid(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    const { data: booking } = await admin.from("bookings")
      .select("*").eq("id", body.booking_id).eq("workspace_id", body.workspace_id).maybeSingle();
    if (!booking) throw NotFound("Booking not found");
    if (booking.status === "cancelled")   throw Conflict("Booking is cancelled");
    if (booking.status === "expired")     throw Conflict("Hold has expired — please create a new booking");
    if (booking.status === "completed")   throw Conflict("Booking is already completed");
    if (booking.status === "checked_out") throw Conflict("Booking is already checked out");
    if (booking.status === "no_show")     throw Conflict("Booking is marked as no-show");
    if (booking.status === "checked_in")  throw Conflict("Booking is currently checked in — check out the guest first");

    if (booking.payment_status === "paid") {
      // Already fully paid — idempotent no-op for a retry/double-tap rather
      // than recording a second payment.
      return json({ booking });
    }

    const { data: ws } = await admin.from("workspaces").select("currency").eq("id", body.workspace_id).maybeSingle();

    // Determine how much has already been collected (deposit or prior payment).
    const alreadyPaid  = Number(booking.amount_paid ?? 0);
    const balanceDue   = +(Number(booking.total) - alreadyPaid).toFixed(2);
    const chargeAmount = balanceDue > 0 ? balanceDue : Number(booking.total);

    // Atomically claim this booking for payment recording, guarded on the
    // exact payment_status we just read above. Two concurrent "Mark Paid"
    // calls (double-tap) both start from the same read, but only one's
    // update can match a row — the loser sees 0 rows affected instead of
    // both proceeding to insert a payment_intents + transactions row for
    // what's really a single payment.
    let updateQuery = admin.from("bookings")
      .update({ status: "confirmed", hold_expires_at: null, payment_status: "paid", amount_paid: Number(booking.total) })
      .eq("id", booking.id);
    updateQuery = booking.payment_status == null
      ? updateQuery.is("payment_status", null)
      : updateQuery.eq("payment_status", booking.payment_status);
    const { data: updated, error: uErr } = await updateQuery.select().single();

    if (uErr) {
      if (uErr.code === "PGRST116") {
        const { data: latest } = await admin.from("bookings").select("*").eq("id", booking.id).maybeSingle();
        if (latest?.payment_status === "paid") return json({ booking: latest });
        throw Conflict("Booking was modified by another request — please retry");
      }
      throw BadRequest(uErr.message);
    }

    // We won the race — safe to record the payment exactly once.
    const { error: pErr } = await admin.from("payment_intents").insert({
      workspace_id: body.workspace_id,
      booking_id:   booking.id,
      provider:     "cash",
      amount:       chargeAmount,
      currency:     ws?.currency ?? "PHP",
      status:       "succeeded",
      metadata:     { manual: true, by: ctx.userId },
    });
    if (pErr) throw BadRequest(pErr.message);

    // Record in the main transactions table so cash bookings appear in the
    // Transactions page (which reads transactions, not payment_intents).
    // Xendit bookings get this row from the webhook — cash bookings must do it here.
    await admin.from("transactions").insert({
      workspace_id:    body.workspace_id,
      branch_id:       booking.branch_id,
      type:            "sale",
      status:          "completed",
      reference_table: "bookings",
      reference_id:    booking.id,
      amount:          chargeAmount,
      created_by:      ctx.userId,
      payment_method:  "cash",
    }).then(() => {}).catch((e: unknown) => {
      console.error("[bookings-mark-paid] transactions insert failed:", e);
    });

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "booking.mark_paid", entityType: "booking", entityId: booking.id,
      before: booking, after: updated,
    }));
    return json({ booking: updated });
  } catch (err) { return handleError(err); }
});
