/**
 * Tiny in-memory TTL cache for `invokeFn` reads.
 *
 * POS screens (home + dashboard) each fire a burst of parallel `invokeFn`
 * calls against the read-only `pos-data` edge function on every mount. Staff
 * bounce between these screens constantly, so re-mounting within a few
 * seconds of the last visit re-fetches numbers that haven't meaningfully
 * changed. This cache dedupes those calls per (workspace, resource) key for
 * a short TTL — long enough to skip redundant re-fetches on rapid
 * re-navigation, short enough that stale POS numbers are never a real
 * problem.
 *
 * Only wrap read-only "fetch stats" calls with this — never mutations.
 *
 * The cache stores the in-flight *promise*, not just the resolved value, so
 * concurrent callers (e.g. two effects racing on the same key) also collapse
 * into a single network call. Failed calls (network error) are evicted
 * immediately so the next call retries fresh instead of caching a failure.
 */

type InvokeResult<T> = { data: T | null; error: Error | null };

interface CacheEntry {
  expiresAt: number;
  promise: Promise<InvokeResult<unknown>>;
}

const cache = new Map<string, CacheEntry>();

export interface CachedInvokeFnOptions {
  /** Bypass any cached value and force a fresh call (e.g. manual "Refresh"). */
  force?: boolean;
}

export async function cachedInvokeFn<T>(
  cacheKey: string,
  ttlMs: number,
  fn: () => Promise<InvokeResult<T>>,
  opts?: CachedInvokeFnOptions,
): Promise<InvokeResult<T>> {
  const now = Date.now();

  if (!opts?.force) {
    const existing = cache.get(cacheKey);
    if (existing && existing.expiresAt > now) {
      return existing.promise as Promise<InvokeResult<T>>;
    }
  }

  const promise = fn().then((result) => {
    if (result.error) {
      // Don't let a failed call poison the cache — next call retries fresh.
      cache.delete(cacheKey);
    }
    return result;
  });

  cache.set(cacheKey, { expiresAt: now + ttlMs, promise });
  return promise as Promise<InvokeResult<T>>;
}

/** Drop everything (e.g. on sign-out / workspace switch), if ever needed. */
export function clearInvokeFnCache(): void {
  cache.clear();
}
