// POST /bookings-hold — temporary 10-minute hold to prevent double-booking during checkout.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, Conflict, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";

const HOLD_MINUTES = 10;

const Body = z.object({
  workspace_id:    z.string().uuid(),
  branch_id:       z.string().uuid(),
  resource_id:     z.string().uuid(),
  customer_id:     z.string().uuid().optional(),
  start_time:      z.string().datetime(),
  end_time:        z.string().datetime(),
  notes:           z.string().max(300).optional(),
  guest_name:      z.string().min(2).max(80).regex(/^[A-Za-zÀ-ÿÑñ\s'\-.]+$/, "Name can only contain letters, spaces, hyphens, apostrophes, and periods").optional(),
  guest_phone:     z.string().regex(/^\+639\d{9}$/, "Invalid Philippine mobile — expected +639XXXXXXXXX").optional(),
  guest_email:     z.string().email().max(254).optional(),
  // Optional client-supplied key for idempotency. When provided a duplicate
  // request (same key + same body) returns the original booking instead of
  // creating a second hold — safe for POS double-tap retries.
  idempotency_key: z.string().min(8).max(128).regex(/^[A-Za-z0-9_\-:.]+$/).optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let holdCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    // If the caller supplied an idempotency_key in the body, wire it into the
    // guard via the standard Idempotency-Key header so the helper can use the
    // existing idempotency_keys table transparently.
    const { idempotency_key, ...coreBody } = body;
    const guardReq = idempotency_key
      ? new Request(req.url, {
          method: req.method,
          headers: new Headers({ ...Object.fromEntries(req.headers), "idempotency-key": idempotency_key }),
        })
      : req;
    idem = await idempotencyGuard(guardReq, "bookings-hold", JSON.stringify(coreBody));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);

    if (new Date(body.end_time) <= new Date(body.start_time)) throw BadRequest("INVALID_DATE_RANGE: end_time must be after start_time");
    if (new Date(body.start_time).getTime() < Date.now() - 60_000) throw BadRequest("PAST_BOOKING_TIME: start_time cannot be in the past");

    const admin = adminClient();
    const { data: resource, error: rErr } = await admin
      .from("bookable_resources").select("id, type, hourly_rate, nightly_rate, workspace_id, active, turnaround_minutes")
      .eq("id", body.resource_id).maybeSingle();
    if (rErr) throw BadRequest(rErr.message);
    if (!resource || resource.workspace_id !== body.workspace_id) throw NotFound("RESOURCE_NOT_FOUND: Resource not found");
    if (!resource.active) throw BadRequest("RESOURCE_INACTIVE: Resource is no longer available for booking");

    // Turnaround buffer: block new bookings that start within the buffer
    // window of any existing booking's end time for the same resource.
    // Resource blocks: reject bookings that fall within any active maintenance
    // or owner-blocked period for the same resource.
    // Neither check depends on the other's result, so run them concurrently.
    const startDate = body.start_time.slice(0, 10);
    const endDate   = body.end_time.slice(0, 10);

    const [tooCloseRes, activeBlocksRes] = await Promise.all([
      resource.turnaround_minutes > 0
        ? admin.from("bookings")
            .select("id")
            .eq("resource_id", body.resource_id)
            .in("status", ["hold", "confirmed", "checked_in", "checked_out"])
            .gt("end_time", new Date(new Date(body.start_time).getTime() - resource.turnaround_minutes * 60_000).toISOString())
            .lte("end_time", body.start_time)
        : Promise.resolve({ data: null as { id: string }[] | null }),
      admin.from("resource_blocks")
        .select("id")
        .eq("resource_id", body.resource_id)
        .eq("is_active", true)
        .lte("start_date", endDate)
        .gte("end_date", startDate),
    ]);

    if (resource.turnaround_minutes > 0 && tooCloseRes.data?.length) {
      throw Conflict(`TURNAROUND_REQUIRED: Time slot unavailable — ${resource.turnaround_minutes} min turnaround required after previous booking`);
    }
    if (activeBlocksRes.data?.length) {
      throw Conflict("RESOURCE_UNAVAILABLE: Time slot is blocked for this resource (maintenance or owner block)");
    }

    const hours  = (new Date(body.end_time).getTime() - new Date(body.start_time).getTime()) / 3_600_000;
    const nights = Math.max(1, Math.round(hours / 24));
    const total  = resource.type === "room" && resource.nightly_rate != null
      ? +(nights * Number(resource.nightly_rate)).toFixed(2)
      : +(hours  * Number(resource.hourly_rate)).toFixed(2);
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();

    const { data: booking, error } = await admin.from("bookings").insert({
      workspace_id: body.workspace_id,
      branch_id: body.branch_id,
      resource_id: body.resource_id,
      customer_id: body.customer_id ?? null,
      start_time: body.start_time,
      end_time: body.end_time,
      status: "hold",
      hold_expires_at: holdExpiresAt,
      total,
      notes:       body.notes       ?? null,
      guest_name:  body.guest_name  ?? null,
      guest_phone: body.guest_phone ?? null,
      guest_email: body.guest_email ?? null,
      created_by: ctx.userId,
    }).select().single();

    if (error) {
      if (error.message.toLowerCase().includes("bookings_no_overlap")) {
        throw Conflict("BOOKING_OVERLAP: This room is already booked for the selected time");
      }
      throw BadRequest(error.message);
    }
    holdCreated = true;

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "booking.hold", entityType: "booking", entityId: booking.id, after: booking,
    }));

    const result = { booking, hold_expires_at: holdExpiresAt };
    await idem.commit(201, result);
    return json(result, 201);
  } catch (err) {
    if (idem && !holdCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});
