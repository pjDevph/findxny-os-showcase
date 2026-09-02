import { json } from "./response.ts";
import { reportError } from "./errorReporter.ts";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export class RateLimitError extends ApiError {
  constructor(public retryAfter: number, message = "Too many requests") {
    super(429, "rate_limited", message);
  }
}

export const Unauthorized   = (msg = "Unauthorized")            => new ApiError(401, "unauthorized", msg);
export const Forbidden      = (msg = "Forbidden")               => new ApiError(403, "forbidden", msg);
export const NotFound       = (msg = "Not found")               => new ApiError(404, "not_found", msg);
export const BadRequest     = (msg = "Bad request")             => new ApiError(400, "bad_request", msg);
export const Conflict       = (msg = "Conflict")                => new ApiError(409, "conflict", msg);
export const InternalError  = (msg = "Internal server error")   => new ApiError(500, "internal", msg);

const IS_DEV = (Deno.env.get("APP_ENV") ?? "production") !== "production";

export function handleError(err: unknown): Response {
  if (err instanceof ApiError) {
    const extra: Record<string, string> = {};
    if (err instanceof RateLimitError) extra["Retry-After"] = String(err.retryAfter);
    // Don't ship expected 4xx errors to Sentry — they're not bugs.
    return json({ error: { code: err.code, message: err.message } }, err.status, extra);
  }
  console.error("unhandled", err);
  // Fire-and-forget; reporter swallows its own errors.
  reportError(err).catch(() => {});
  const detail = err instanceof Error ? err.message : String(err);
  const message = IS_DEV ? detail : "Internal server error";
  return json({ error: { code: "internal", message } }, 500);
}
