"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../env";

// Store on window so it survives Fast Refresh module re-evaluations.
// A module-level variable resets on every hot reload, causing 12+ components
// to each spin up a competing client and fight for the navigator auth lock.
declare global {
  interface Window { __supabase_client?: ReturnType<typeof createBrowserClient> }
}

// In-memory queue. Replaces the default cross-tab navigatorLock so HMR / Fast
// Refresh don't leave stale lock holders racing each other and spamming
// NavigatorLockAcquireTimeoutError. We don't need cross-tab auth serialization.
let inMemoryLockChain: Promise<unknown> = Promise.resolve();
const inMemoryLock = <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  const next = inMemoryLockChain.then(() => fn(), () => fn());
  inMemoryLockChain = next.catch(() => {});
  return next;
};

const make = () => createBrowserClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  { auth: { lock: inMemoryLock as any } },
);

export const supabaseBrowser = () => {
  if (typeof window === "undefined") return make();
  if (!window.__supabase_client) window.__supabase_client = make();
  return window.__supabase_client;
};
