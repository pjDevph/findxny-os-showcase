// POST /bookings-expire-holds
// Expires all holds whose hold_expires_at has passed.
// Deployed with --no-verify-jwt — called by pg_cron via pg_net every 5 minutes,
// and opportunistically (fire-and-forget, no session) by the POS app on
// page load. Since any client may legitimately call this with no auth,
// it's IP rate-limited instead of gated — the effect itself is narrow and
// idempotent (only flips already-past-due holds).
//
// Delegates to the expire_expired_holds() DB function (see migration 0082)
// instead of doing a select-then-update here: that function performs a single
// conditional `UPDATE ... WHERE status = 'hold' AND hold_expires_at < NOW()`,
// so a booking that gets confirmed/paid between our SELECT and UPDATE can't be
// incorrectly flipped to 'expired' out from under a customer who just paid.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError } from "../_shared/errors.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    await rateLimit(req, { scope: "bookings-expire-holds", max: 20, windowSec: 60 });
    const admin = adminClient();

    const { data: expiredCount, error: rpcErr } = await admin.rpc("expire_expired_holds");
    if (rpcErr) throw new Error(rpcErr.message);

    return json({ expired: expiredCount ?? 0 });
  } catch (err) { return handleError(err); }
});
