"use client";
import { useCallback, useMemo, useRef, useState } from "react";

/**
 * UX-level guard against rapid double-clicks on submit-style buttons.
 * Pair with server-side dedup/idempotency — this is a nicety, not a
 * security boundary.
 *
 * Usage:
 *   const { cooling, run } = useButtonCooldown(1500);
 *   <button disabled={cooling || submitting} onClick={() => run(handleSubmit)} />
 */
export function useButtonCooldown(ms = 1500) {
  const [cooling, setCooling] = useState(false);
  const last = useRef(0);

  const run = useCallback(
    async <T>(fn: () => Promise<T> | T): Promise<T | undefined> => {
      const now = Date.now();
      if (cooling || now - last.current < ms) return undefined;
      last.current = now;
      setCooling(true);
      try {
        return await fn();
      } finally {
        setTimeout(() => setCooling(false), ms);
      }
    },
    [cooling, ms],
  );

  return { cooling, run };
}

/** Generate a stable random idempotency key for a single in-flight request. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; // NOSONAR - non-security randomness
}

// Cheap 2-lane string hash (not cryptographic — just needs to be stable and
// low-collision for keying sessionStorage, not to resist tampering).
function hashContent(content: unknown): string {
  const s = typeof content === "string" ? content : JSON.stringify(content);
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

/**
 * An idempotency key derived from the request content itself, persisted in
 * sessionStorage. Same content → same key, even across a refresh (so a retry
 * after a lost response reuses it instead of minting a fresh one and placing
 * a duplicate order/booking). Different content (e.g. the cart changed after
 * a failed attempt) → a different key automatically, since the server
 * rejects a reused key whose request body no longer matches.
 */
export function useContentIdempotencyKey(content: unknown): string {
  const hash = hashContent(content);
  return useMemo(() => {
    if (typeof sessionStorage === "undefined") return newIdempotencyKey();
    const storageKey = `mtm.idem.${hash}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const fresh = newIdempotencyKey();
    sessionStorage.setItem(storageKey, fresh);
    return fresh;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
}
