// POST /public-track-booking { booking_ref, phone }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Forbidden } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const Body = z.object({
  booking_ref: z.string().min(6).max(25).regex(/^[A-Za-z0-9-]+$/, "Invalid booking reference format"),
  phone:       z.string().regex(/^\+639\d{9}$/, "Invalid Philippine mobile number — expected format: +639XXXXXXXXX").optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    // Throttle ref enumeration (8-hex refs are guessable).
    await rateLimit(req, { scope: "public-track-booking", max: 60, windowSec: 60 });
    const { booking_ref, phone } = await parseBody(req, Body);
    const admin = adminClient();

    // booking_ref is the first 8 hex chars of the booking uuid. ILIKE can't be
    // used on a uuid column, so match via a prefix range on the uuid value.
    const ref = booking_ref.trim().toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 8);
    if (ref.length !== 8) throw NotFound("Booking not found");
    const { data: booking } = await admin.from("bookings")
      .select("id, status, start_time, end_time, total, customer_id, resource_id, workspace_id, hold_expires_at, notes, created_at, rescheduled_to_booking_id")
      .gte("id", `${ref}-0000-0000-0000-000000000000`)
      .lte("id", `${ref}-ffff-ffff-ffff-ffffffffffff`)
      .limit(1)
      .maybeSingle();
    if (!booking) throw NotFound("Booking not found");

    const [{ data: customer }, { data: resource }] = await Promise.all([
      admin.from("customers").select("name, phone, email").eq("id", booking.customer_id).maybeSingle(),
      booking.resource_id
        ? admin.from("bookable_resources").select("name, type").eq("id", booking.resource_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // PII (guest contact + notes) is only returned when the caller proves
    // ownership with the matching phone. Without it, only non-PII booking
    // status/dates/room are returned — so a leaked/guessed ref can't harvest
    // contact details.
    const verified = !!phone && !!customer && normalizePhone(customer.phone) === normalizePhone(phone);
    if (phone && !verified) throw Forbidden("Phone does not match this booking");

    return json({
      booking: {
        id: booking.id,
        ref: booking.id.slice(0, 8).toUpperCase(),
        status: booking.status,
        start_time: booking.start_time,
        end_time: booking.end_time,
        total: booking.total,
        resource_id: booking.resource_id,
        workspace_id: booking.workspace_id,
        hold_expires_at: booking.hold_expires_at,
        created_at: booking.created_at,
        notes: verified ? booking.notes : null,
        // Populated when this booking was replaced by a reschedule.
        rescheduled_to_ref: booking.rescheduled_to_booking_id
          ? (booking.rescheduled_to_booking_id as string).slice(0, 8).toUpperCase()
          : null,
      },
      resource: resource ?? null,
      customer: verified ? customer : null,
    });
  } catch (err) { return handleError(err); }
});
