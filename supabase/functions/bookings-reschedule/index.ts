// POST /bookings-reschedule
// Creates a replacement booking at the new dates/resource, marks the original
// as 'rescheduled' (historical, read-only), and moves payment_intents so that
// revenue is attributed to the replacement booking.
//
// Booking status and payment status remain independent:
//   original → status: 'rescheduled'  (no payment_status change)
//   new      → status: 'confirmed'    payment_status: inherited from original
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

type Admin = ReturnType<typeof adminClient>;

const Body = z.object({
  workspace_id:    z.string().uuid(),
  booking_id:      z.string().uuid(),
  new_resource_id: z.string().uuid().optional(),
  new_start_time:  z.string().datetime(),
  new_end_time:    z.string().datetime(),
  reason:          z.string().optional(),
});

async function fetchBooking(admin: Admin, bookingId: string, workspaceId: string) {
  const { data, error } = await admin
    .from("bookings").select("*")
    .eq("id", bookingId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!data)  throw NotFound("Booking not found");
  if (!["confirmed", "checked_in"].includes(data.status)) {
    throw Conflict(
      `Only confirmed or checked_in bookings can be rescheduled. Current status: ${data.status}`
    );
  }
  return data;
}

async function fetchResource(admin: Admin, resourceId: string, workspaceId: string) {
  const { data, error } = await admin
    .from("bookable_resources")
    .select("id, type, hourly_rate, nightly_rate, workspace_id, active, turnaround_minutes")
    .eq("id", resourceId).maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!data || data.workspace_id !== workspaceId) throw NotFound("Resource not found");
  if (!data.active) throw BadRequest("Resource is inactive");
  return data;
}

async function assertNoBookingConflict(
  admin: Admin,
  resourceId: string,
  newStartTime: string,
  newEndTime: string,
  excludeBookingId: string,
) {
  const { data, error } = await admin
    .from("bookings").select("id")
    .eq("resource_id", resourceId)
    .in("status", ["confirmed", "hold", "checked_in"])
    .neq("id", excludeBookingId)
    .lt("start_time", newEndTime)
    .gt("end_time", newStartTime)
    .limit(1);
  if (error) throw BadRequest(error.message);
  if (data && data.length > 0) throw Conflict("The target time slot is already booked for this resource");
}

async function assertNoResourceBlock(
  admin: Admin,
  resourceId: string,
  newStartDate: string,
  newEndDate: string,
) {
  const { data, error } = await admin
    .from("resource_blocks").select("id")
    .eq("resource_id", resourceId)
    .eq("is_active", true)
    .lte("start_date", newEndDate)
    .gte("end_date", newStartDate)
    .limit(1);
  if (error) throw BadRequest(error.message);
  if (data && data.length > 0) throw Conflict("The target date range is blocked for this resource");
}

function computeNewTotal(
  resource: { type: string; nightly_rate: number | null; hourly_rate: number },
  newStart: Date,
  newEnd: Date,
) {
  const hours  = (newEnd.getTime() - newStart.getTime()) / 3_600_000;
  const nights = Math.max(1, Math.round(hours / 24));
  return resource.type === "room" && resource.nightly_rate != null
    ? +(nights * Number(resource.nightly_rate)).toFixed(2)
    : +(hours  * Number(resource.hourly_rate)).toFixed(2);
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE); // manager+ required

    const newStart = new Date(body.new_start_time);
    const newEnd   = new Date(body.new_end_time);
    if (newEnd <= newStart) throw BadRequest("new_end_time must be after new_start_time");
    if (newStart < new Date()) throw BadRequest("new_start_time cannot be in the past");

    const admin   = adminClient();
    const booking = await fetchBooking(admin, body.booking_id, body.workspace_id);

    const targetId = body.new_resource_id ?? booking.resource_id;
    const resource = await fetchResource(admin, targetId, body.workspace_id);

    // Conflict check excludes the original booking (its slot is being freed).
    await assertNoBookingConflict(admin, targetId, body.new_start_time, body.new_end_time, booking.id);
    await assertNoResourceBlock(admin, targetId, body.new_start_time.slice(0, 10), body.new_end_time.slice(0, 10));

    if (resource.turnaround_minutes > 0) {
      const bufferMs          = resource.turnaround_minutes * 60_000;
      const bufferWindowStart = new Date(newStart.getTime() - bufferMs).toISOString();
      const { data: tooClose } = await admin.from("bookings")
        .select("id")
        .eq("resource_id", targetId)
        .in("status", ["hold", "confirmed", "checked_in", "checked_out"])
        .gt("end_time", bufferWindowStart)
        .lte("end_time", body.new_start_time)
        .neq("id", booking.id);
      if (tooClose?.length) {
        throw Conflict(`Time slot unavailable — ${resource.turnaround_minutes} min turnaround required after previous booking`);
      }
    }

    // ── Financials ────────────────────────────────────────────────────────────
    const newTotal   = computeNewTotal(resource, newStart, newEnd);
    const amountPaid = Number(booking.amount_paid ?? 0);
    const priceDiff  = +(newTotal - Number(booking.total ?? 0)).toFixed(2);
    const balanceDue = +(Math.max(0, newTotal - amountPaid)).toFixed(2);
    const refundDue  = amountPaid > newTotal ? +(amountPaid - newTotal).toFixed(2) : 0;

    const newPaymentStatus: string = (() => {
      if (amountPaid <= 0) return "unpaid";
      if (amountPaid >= newTotal) return "paid";
      return "partial";
    })();

    // Carry original guest notes; append reschedule reason if provided.
    const newNotes = [
      booking.notes,
      body.reason ? `Reschedule reason: ${body.reason}` : null,
    ].filter(Boolean).join(" | ") || null;

    // ── Step 1: Create replacement booking ───────────────────────────────────
    // Voucher is intentionally NOT transferred — new total is computed from
    // live room rate with no discount. Refund/balance due handles the diff.
    const { data: newBooking, error: insertErr } = await admin.from("bookings").insert({
      workspace_id:                booking.workspace_id,
      branch_id:                   booking.branch_id,
      resource_id:                 targetId,
      customer_id:                 booking.customer_id,
      start_time:                  body.new_start_time,
      end_time:                    body.new_end_time,
      total:                       newTotal,
      discount:                    0,
      status:                      "confirmed",
      payment_status:              newPaymentStatus,
      amount_paid:                 amountPaid > 0 ? amountPaid : null,
      hold_expires_at:             null,
      notes:                       newNotes,
      rescheduled_from_booking_id: booking.id,
      reschedule_count:            Number(booking.reschedule_count ?? 0) + 1,
    }).select().single();
    if (insertErr) throw BadRequest(`Could not create replacement booking: ${insertErr.message}`);

    // ── Step 2: Mark original as rescheduled (historical, read-only) ─────────
    const { error: updateErr } = await admin.from("bookings")
      .update({ status: "rescheduled", rescheduled_to_booking_id: newBooking.id })
      .eq("id", booking.id);
    if (updateErr) {
      const { error: rollbackErr } = await admin.from("bookings").delete().eq("id", newBooking.id);
      if (rollbackErr) {
        console.error("[bookings-reschedule] rollback delete failed — both bookings may exist:", rollbackErr.message, "new_booking_id:", newBooking.id);
      }
      throw BadRequest(`Could not update original booking: ${updateErr.message}`);
    }

    // ── Step 3: Move payment_intents to replacement booking ──────────────────
    // Revenue is attributed to the replacement booking's dates.
    // Non-fatal: a manual correction is always possible and must not abort.
    const { error: piErr } = await admin.from("payment_intents")
      .update({ booking_id: newBooking.id })
      .eq("booking_id", booking.id);
    if (piErr) {
      console.error("[bookings-reschedule] payment_intents reassign failed:", piErr.message);
    }

    // ── Audit ─────────────────────────────────────────────────────────────────
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "booking.reschedule",
      entityType:  "booking",
      entityId:    booking.id,
      before:      booking,
      after:       { status: "rescheduled", rescheduled_to_booking_id: newBooking.id },
    }));

    return json({
      booking:             newBooking,
      original_booking_id: booking.id,
      price_difference:    priceDiff,
      balance_due:         balanceDue,
      refund_due:          refundDue,
    });
  } catch (err) { return handleError(err); }
});
