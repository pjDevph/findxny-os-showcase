// POST /public-bookings-create
// No auth required — guest table reservation from the public site.
// Resolves workspace by slug, picks first active resource if not specified,
// upserts customer by phone, then inserts a booking with a hold expiry.
// Replaces the client-side workspace lookup + customer insert + bookings-hold
// flow in apps/web/app/(customer)/booking/page.tsx.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { createBookingInvoice } from "../_shared/xenditClient.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";
import { normalizePhone, isValidPHMobile } from "../_shared/phone.ts";

const DIGITAL_METHODS = ["gcash", "maya", "card", "qrph"] as const;

function sanitizePlainText(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, "")  // strip control characters
    .replace(/<[^>]*>/g, "")           // strip HTML tags
    .replace(/\s{3,}/g, "  ")         // collapse excessive whitespace
    .trim()
    .slice(0, 300);
}

const Body = z.object({
  workspace_slug:  z.string().min(1).max(100),
  branch_id:       z.string().uuid().optional(),
  resource_id:     z.string().uuid().optional(),
  customer: z.object({
    name:  z.string().min(3).max(80).regex(/^[A-Za-zÀ-ÿÑñ\s'\-.]+$/, "Name can only contain letters, spaces, hyphens, apostrophes, and periods"),
    phone: z.string().min(7).max(20)
      .transform(normalizePhone)
      .refine(isValidPHMobile, "Invalid Philippine mobile number — expected format: 09XXXXXXXXX or +639XXXXXXXXX"),
    email: z.string().email().max(120).optional(),
  }),
  start_time:      z.string().datetime(),
  end_time:        z.string().datetime().optional(),
  party_size:      z.number().int().positive().max(500).optional(),
  notes:           z.string().max(300).optional().transform((v) => v ? sanitizePlainText(v) : v),
  payment_method:  z.enum(["gcash", "maya", "card", "qrph", "counter"]).optional().default("counter"),
  voucher_code:    z.string().min(1).max(50).optional(),
});

// Hourly amenities are single-session (≤24h). Rooms are multi-night staycations,
// so they're capped by nights instead — see MAX_BOOKING_NIGHTS below.
const MAX_BOOKING_HOURS = 24;
const MAX_BOOKING_NIGHTS = 30;

type AdminClient = ReturnType<typeof adminClient>;
type ParsedBody = z.infer<typeof Body>;

interface WorkspaceRow {
  id: string;
  slot_minutes: number | null;
  hold_minutes: number | null;
  currency: string | null;
}

interface ResourceResolution {
  resourceId: string;
  hourlyRate: number;
  nightlyRate: number | null;
  resourceType: string;
  maxPax: number | null;
}

async function resolveWorkspace(admin: AdminClient, slug: string): Promise<WorkspaceRow> {
  const { data: ws } = await admin.from("workspaces")
    .select("id, slot_minutes, hold_minutes, currency")
    .eq("slug", slug).maybeSingle();
  if (!ws) throw NotFound("Workspace not found");
  return ws;
}

async function resolveBranch(admin: AdminClient, wsId: string, branchId: string | undefined): Promise<string> {
  if (branchId) return branchId;
  const { data: br } = await admin.from("branches")
    .select("id").eq("workspace_id", wsId).limit(1).maybeSingle();
  if (!br) throw BadRequest("Workspace has no branches");
  return br.id;
}

async function resolveResource(admin: AdminClient, wsId: string, resourceId: string | undefined): Promise<ResourceResolution> {
  if (resourceId) {
    const { data: r } = await admin.from("bookable_resources")
      .select("id, hourly_rate, nightly_rate, type, workspace_id, active, max_pax, capacity")
      .eq("id", resourceId).maybeSingle();
    if (!r || r.workspace_id !== wsId) throw NotFound("Resource not found");
    if (!r.active) throw BadRequest("Resource inactive");
    return {
      resourceId,
      hourlyRate:   Number(r.hourly_rate),
      nightlyRate:  r.nightly_rate != null ? Number(r.nightly_rate) : null,
      resourceType: r.type ?? "amenity",
      maxPax:       r.max_pax ?? r.capacity ?? null,
    };
  }
  const { data: r } = await admin.from("bookable_resources")
    .select("id, hourly_rate, nightly_rate, type, max_pax, capacity")
    .eq("workspace_id", wsId).eq("active", true).limit(1).maybeSingle();
  if (!r) throw BadRequest("No bookable resources available");
  return {
    resourceId:   r.id,
    hourlyRate:   Number(r.hourly_rate),
    nightlyRate:  r.nightly_rate != null ? Number(r.nightly_rate) : null,
    resourceType: r.type ?? "amenity",
    maxPax:       r.max_pax ?? r.capacity ?? null,
  };
}

function validateBookingTimes(body: ParsedBody, ws: WorkspaceRow, resourceType: string): { start: Date; end: Date } {
  const start = new Date(body.start_time);
  const end = body.end_time
    ? new Date(body.end_time)
    : new Date(start.getTime() + (ws.slot_minutes ?? 120) * 60_000);
  if (end <= start) throw BadRequest("end_time must be after start_time");
  if (start.getTime() < Date.now() - 60_000) throw BadRequest("start_time cannot be in the past");
  const spanMs = end.getTime() - start.getTime();
  if (resourceType === "room") {
    if (Math.round(spanMs / 3_600_000 / 24) > MAX_BOOKING_NIGHTS) {
      throw BadRequest(`Stay cannot exceed ${MAX_BOOKING_NIGHTS} nights`);
    }
  } else if (spanMs > MAX_BOOKING_HOURS * 3_600_000) {
    throw BadRequest(`Booking cannot exceed ${MAX_BOOKING_HOURS} hours`);
  }
  return { start, end };
}

async function upsertCustomer(admin: AdminClient, wsId: string, customer: ParsedBody["customer"]): Promise<string> {
  const { data: existingCust } = await admin.from("customers")
    .select("id").eq("workspace_id", wsId).eq("phone", customer.phone).maybeSingle();
  if (existingCust?.id) return existingCust.id;
  const { data: created, error: cErr } = await admin.from("customers").insert({
    workspace_id: wsId,
    name:  customer.name,
    phone: customer.phone,
    email: customer.email ?? null,
  }).select("id").single();
  if (cErr) throw BadRequest(cErr.message);
  return created.id;
}

async function handleDigitalPayment(
  admin: AdminClient,
  wsId: string,
  booking: any,
  total: number,
  currency: string | null,
  body: ParsedBody,
): Promise<string | undefined> {
  const isDigital = (DIGITAL_METHODS as readonly string[]).includes(body.payment_method);
  if (!isDigital) return undefined;

  const { data: intent } = await admin.from("payment_intents").insert({
    workspace_id: wsId,
    booking_id:   booking.id,
    provider:     "xendit",
    amount:       total,
    currency:     currency ?? "PHP",
    status:       "pending",
  }).select().single();

  const bookingRef = booking.id.slice(0, 8).toUpperCase();
  const invoice = await createBookingInvoice({
    bookingId:     booking.id,
    bookingRef,
    amount:        total,
    currency:      currency ?? "PHP",
    paymentMethod: body.payment_method,
    customer: {
      name:  body.customer.name,
      phone: body.customer.phone,
      email: body.customer.email,
    },
  });

  await admin.from("payment_intents")
    .update({ provider_intent_id: invoice.id }).eq("id", intent!.id);

  return invoice.invoice_url;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let bookingCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-bookings-create", max: 10, windowSec: 300 });
    const body = await parseBody(req, Body);
    await rateLimit(req, {
      scope: "public-bookings-create:phone",
      key: `${body.workspace_slug}:${body.customer.phone}`,
      max: 5, windowSec: 300,
    });
    idem = await idempotencyGuard(req, "public-bookings-create", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);
    const admin = adminClient();

    // Release any expired holds first so a stale lock can't block this booking.
    // Belt-and-suspenders alongside the pg_cron job (which may not be enabled).
    try { await admin.rpc("cancel_expired_holds"); } catch { /* best-effort */ }

    const ws         = await resolveWorkspace(admin, body.workspace_slug);
    const branchId   = await resolveBranch(admin, ws.id, body.branch_id);
    const { resourceId, hourlyRate, nightlyRate, resourceType, maxPax } = await resolveResource(admin, ws.id, body.resource_id);
    if (maxPax && body.party_size && body.party_size > maxPax) {
      throw BadRequest(`CAPACITY_EXCEEDED: This room allows up to ${maxPax} guest${maxPax === 1 ? "" : "s"} only.`);
    }
    const { start, end } = validateBookingTimes(body, ws, resourceType);
    const customerId = await upsertCustomer(admin, ws.id, body.customer);

    const hours  = (end.getTime() - start.getTime()) / 3_600_000;
    const nights = Math.max(1, Math.round(hours / 24));
    const subtotal = resourceType === "room" && nightlyRate != null
      ? +(nights * nightlyRate).toFixed(2)
      : +(hours * hourlyRate).toFixed(2);

    // Voucher discount — validate and apply if a code was provided.
    let voucherDiscount = 0;
    let voucherId: string | null = null;
    let voucherCodeApplied: string | null = null;
    if (body.voucher_code) {
      const code = body.voucher_code.trim().toUpperCase();
      const { data: voucher } = await admin.from("vouchers")
        .select("id,code,name,discount_type,discount_value,max_cap,min_spend,usage_limit,usage_count,status,valid_from,valid_until")
        .eq("workspace_id", ws.id)
        .eq("code", code)
        .maybeSingle();
      const now = new Date();
      const validFrom  = voucher?.valid_from  ? new Date(voucher.valid_from  + "T00:00:00+08:00") : null;
      const validUntil = voucher?.valid_until ? new Date(voucher.valid_until + "T23:59:59+08:00") : null;
      if (voucher && voucher.status === "active" &&
          (!voucher.usage_limit || voucher.usage_count < voucher.usage_limit) &&
          Number(voucher.min_spend ?? 0) <= subtotal &&
          (validFrom  === null || now >= validFrom) &&
          (validUntil === null || now <= validUntil)) {
        let disc: number;
        if (voucher.discount_type === "percentage") {
          const raw = subtotal * (Number(voucher.discount_value) / 100);
          disc = voucher.max_cap ? Math.min(raw, Number(voucher.max_cap)) : raw;
        } else {
          disc = Math.min(Number(voucher.discount_value), subtotal);
        }
        voucherDiscount = +disc.toFixed(2);
        voucherId = voucher.id;
        voucherCodeApplied = voucher.code;
      }
    }

    const total = +Math.max(0, subtotal - voucherDiscount).toFixed(2);
    const holdExpiresAt = new Date(Date.now() + (ws.hold_minutes ?? 10) * 60_000).toISOString();

    const noteParts = [];
    if (body.party_size) noteParts.push(`Party of ${body.party_size}.`);
    if (body.notes) noteParts.push(body.notes);

    const { data: booking, error } = await admin.from("bookings").insert({
      workspace_id: ws.id,
      branch_id: branchId,
      resource_id: resourceId,
      customer_id: customerId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "hold",
      hold_expires_at: holdExpiresAt,
      total,
      discount:        voucherDiscount,
      discount_source: voucherDiscount > 0 ? "voucher" : null,
      voucher_id:      voucherId,
      voucher_code:    voucherCodeApplied,
      notes: noteParts.join(" ") || null,
      guest_name:  body.customer.name,
      guest_phone: body.customer.phone,
      guest_email: body.customer.email ?? null,
      created_by: null,
    }).select().single();

    if (error) {
      if (error.message.toLowerCase().includes("bookings_no_overlap")) {
        throw Conflict("Time slot already booked");
      }
      throw BadRequest(error.message);
    }
    bookingCreated = true;

    await admin.from("audit_logs").insert({
      workspace_id: ws.id, actor_id: null,
      action: "booking.public_create", entity_type: "booking", entity_id: booking.id,
      after: { id: booking.id, start: booking.start_time, party: body.party_size ?? null },
    });

    // Atomically claim voucher usage and record redemption.
    // Non-fatal: a race-lost claim is logged but must not abort the booking.
    if (voucherId) {
      try {
        const { data: claim } = await admin.rpc("claim_voucher_usage", {
          p_voucher_id:   voucherId,
          p_workspace_id: ws.id,
        }).single();
        if (claim?.success) {
          await admin.from("voucher_redemptions").insert({
            workspace_id:    ws.id,
            voucher_id:      voucherId,
            booking_id:      booking.id,
            customer_id:     customerId,
            code_snapshot:   voucherCodeApplied,
            discount_amount: voucherDiscount,
            order_total:     subtotal,
            redeemed_by:     null,
          });
        } else {
          console.error("[public-bookings-create] claim_voucher_usage rejected:", claim?.reason);
        }
      } catch (e) {
        console.error("[public-bookings-create] voucher claim error:", e);
      }
    }

    const checkoutUrl = await handleDigitalPayment(admin, ws.id, booking, total, ws.currency, body);

    const result = { booking, hold_expires_at: holdExpiresAt, checkout_url: checkoutUrl };
    await idem.commit(201, result);
    return json(result, 201);
  } catch (err) {
    if (idem && !bookingCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});
