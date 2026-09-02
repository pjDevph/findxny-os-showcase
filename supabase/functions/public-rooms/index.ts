// POST /public-rooms — list active room resources for a public workspace.
// Used by the staycation booking-cart page so the client doesn't read
// `bookable_resources` directly.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const Body = z.object({
  slug: z.string().min(1),
  type: z.string().optional().default("room"),
  resource_id: z.string().uuid().optional(), // when provided, also return booked ranges
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-rooms", max: 60, windowSec: 60 });
    const { slug, type, resource_id } = await parseBody(req, Body);
    const admin = adminClient();

    // One server-side call: workspace + rooms + (optional) booked ranges, with
    // expired-hold filtering done in SQL — see public_rooms_v1.
    const { data, error } = await admin.rpc("public_rooms_v1", {
      p_slug: slug, p_type: type, p_resource_id: resource_id ?? null,
    });
    if (error) throw BadRequest(error.message);
    if (!data) throw NotFound("Workspace not found");

    // Rooms list caches longer; per-resource availability is short-lived.
    const cache = resource_id
      ? { "Cache-Control": "public, max-age=10, s-maxage=10, stale-while-revalidate=30" }
      : { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" };
    return json({ workspace: data.workspace, rooms: data.rooms ?? [], booked: data.booked ?? [] }, 200, cache);
  } catch (err) { return handleError(err); }
});
