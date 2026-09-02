// POST /bookings-cleanup — cancel all expired holds.
// Called from POS on page load (fire-and-forget) and by pg_cron every 5 min.
// No user auth required — uses service role via adminClient. Since any
// client may legitimately call this with no auth, it's IP rate-limited
// instead of gated — the effect is narrow and idempotent (only cancels
// already-past-due holds via cancel_expired_holds()).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError } from "../_shared/errors.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;

  try {
    await rateLimit(req, { scope: "bookings-cleanup", max: 20, windowSec: 60 });
  } catch (err) { return handleError(err); }

  const admin = adminClient();
  const { data, error } = await admin.rpc("cancel_expired_holds");

  if (error) {
    console.error("bookings-cleanup error:", error.message);
    return json({ error: error.message }, 500);
  }

  return json({ cancelled: data ?? 0 });
});
