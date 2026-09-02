// POST /auth-attempt — record or check brute-force lockout state for login.
// FE calls { email, result: "check" } before sign-in; "failure" after a
// rejected sign-in; "success" after the auth.signInWithPassword succeeds.
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit, clientIp } from "../_shared/rateLimit.ts";
import { checkLockout, recordAttempt } from "../_shared/authAttempts.ts";

const Body = z.object({
  email:  z.string().email().max(254),
  result: z.enum(["check", "success", "failure"]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    // Outer rate limit: prevent abuse of the endpoint itself.
    await rateLimit(req, { scope: "auth-attempt", max: 30, windowSec: 60 });

    const body = await parseBody(req, Body);
    const ip = clientIp(req);

    if (body.result !== "check") {
      await recordAttempt(body.email, ip, body.result === "success");
    }
    const state = await checkLockout(body.email, ip);
    return json(state);
  } catch (err) { return handleError(err); }
});
