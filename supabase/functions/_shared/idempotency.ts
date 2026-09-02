// Idempotency-Key handling for unsafe mutations.
// Clients send an `Idempotency-Key` header with a stable random value; the
// server caches the response for replays and rejects collisions with a
// different request body. See migration 0026.
import { adminClient } from "./supabaseClient.ts";
import { BadRequest, Conflict } from "./errors.ts";

const KEY_RE = /^[A-Za-z0-9_\-:.]{8,128}$/;

export interface IdempotencyHandle {
  /** Previously-stored response, if this is a replay. */
  cached: { status: number; response: unknown } | null;
  /** Save the final response so future replays return the same thing. */
  commit: (status: number, response: unknown) => Promise<void>;
  /**
   * Release a reserved-but-uncommitted key on handler failure, so the caller
   * can retry with the same Idempotency-Key right away instead of getting
   * "still in progress" until the 7-day idempotency_cleanup() job runs it.
   * No-op for a cache hit or a request with no key — there's nothing reserved
   * to release. Only deletes rows still `status IS NULL` (unresolved), so it
   * can never touch a row a concurrent request already resolved.
   */
  release: () => Promise<void>;
}

/**
 * @param req         the incoming request (we read the `Idempotency-Key` header)
 * @param endpoint    logical name to namespace keys (so the same key across
 *                    endpoints is independent)
 * @param canonical   the canonical request body (e.g. JSON.stringify(parsedBody))
 *                    — used to hash and detect collisions
 */
export async function idempotencyGuard(
  req: Request,
  endpoint: string,
  canonical: string,
): Promise<IdempotencyHandle> {
  const key = req.headers.get("idempotency-key");
  if (!key) return { cached: null, commit: async () => {}, release: async () => {} };
  if (!KEY_RE.test(key)) throw BadRequest("Invalid Idempotency-Key header");

  const admin = adminClient();
  const hash = await sha256(canonical);
  const fullKey = `${endpoint}:${key}`;

  const { data: existing } = await admin
    .from("idempotency_keys")
    .select("request_hash, response, status")
    .eq("key", fullKey)
    .maybeSingle();

  if (existing) {
    if (existing.request_hash !== hash) {
      throw Conflict("Idempotency-Key was reused with a different request body");
    }
    if (existing.status != null) {
      return {
        cached: { status: existing.status, response: existing.response },
        commit: async () => {},
        release: async () => {},
      };
    }
    throw Conflict("Idempotent request is still in progress");
  }

  // Reserve the key. If a concurrent request beats us, treat as "in progress".
  const { error: insertErr } = await admin
    .from("idempotency_keys")
    .insert({ key: fullKey, endpoint, request_hash: hash });

  if (insertErr) {
    const { data: race } = await admin
      .from("idempotency_keys")
      .select("request_hash, response, status")
      .eq("key", fullKey)
      .maybeSingle();
    if (race && race.status != null && race.request_hash === hash) {
      return { cached: { status: race.status, response: race.response }, commit: async () => {}, release: async () => {} };
    }
    throw Conflict("Idempotent request is still in progress");
  }

  return {
    cached: null,
    commit: async (status, response) => {
      await admin
        .from("idempotency_keys")
        .update({ status, response })
        .eq("key", fullKey);
    },
    release: async () => {
      await admin
        .from("idempotency_keys")
        .delete()
        .eq("key", fullKey)
        .is("status", null);
    },
  };
}

async function sha256(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
