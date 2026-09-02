// Server-side rate limiting via Postgres (see migration 0026).
// Default behavior: per-IP fixed window. Pass `key` to scope by something else
// (user id, email, ticket id, etc.) for finer-grained dedup or auth gating.
import { adminClient } from "./supabaseClient.ts";
import { RateLimitError } from "./errors.ts";

export interface RateLimitOpts {
  /** Logical bucket name (endpoint or action). */
  scope: string;
  /** Max requests allowed in the window. */
  max: number;
  /** Window size in seconds. */
  windowSec: number;
  /** Identifier to scope the bucket. Defaults to client IP. */
  key?: string;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-real-ip")
      ?? "unknown";
}

/**
 * Increment a fixed-window counter. Throws RateLimitError if exceeded.
 * Fails open on DB errors so an outage doesn't take the whole API down.
 */
export async function rateLimit(req: Request, opts: RateLimitOpts): Promise<void> {
  const ident = opts.key ?? clientIp(req);
  const bucketKey = `${opts.scope}:${ident}`;
  const admin = adminClient();
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: bucketKey,
    p_max: opts.max,
    p_window_sec: opts.windowSec,
  });
  if (error) {
    console.error("rate_limit_hit rpc failed", error);
    return; // fail-open
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    const resetAt = row.reset_at ? new Date(row.reset_at).getTime() : Date.now() + opts.windowSec * 1000;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    throw new RateLimitError(retryAfter);
  }
}
