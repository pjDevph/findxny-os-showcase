import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * Resilient auth-session storage.
 *
 * Prefer SecureStore (hardware-encrypted via the Android Keystore) where it
 * works, but transparently fall back to AsyncStorage when SecureStore throws.
 * Some Android/POS hardware has a broken or absent keystore — SecureStore then
 * fails with "Could not retrieve the newly generated secret key entry" and
 * login can't persist the session. SecureStore also caps values at ~2KB, which
 * Supabase tokens can exceed. The fallback keeps sign-in working everywhere.
 *
 * Writes clear the other backend so only one ever holds the current value,
 * preventing a stale read on devices whose keystore state changes.
 */
const HybridSecureStorage = {
  getItem: async (k: string): Promise<string | null> => {
    try {
      const v = await SecureStore.getItemAsync(k);
      if (v != null) return v;
    } catch { /* keystore unavailable — fall through */ }
    return AsyncStorage.getItem(k);
  },
  setItem: async (k: string, v: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(k, v);
      await AsyncStorage.removeItem(k);
      return;
    } catch { /* keystore/size failure — fall back */ }
    await AsyncStorage.setItem(k, v);
    try { await SecureStore.deleteItemAsync(k); } catch { /* ignore */ }
  },
  removeItem: async (k: string): Promise<void> => {
    try { await SecureStore.deleteItemAsync(k); } catch { /* ignore */ }
    await AsyncStorage.removeItem(k);
  },
};

const url     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check apps/pos-app/.env",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: HybridSecureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-js's default storage key when none is explicitly configured above
// (see @supabase/supabase-js SupabaseClient.ts) — namespaced by project ref
// so multiple projects never collide in the same device storage.
const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

/** Force-clears the persisted session without going through supabase-js's
 *  own signOut(): that call always tries to revoke the session server-side
 *  first (even with `{ scope: "local" }` — see GoTrueClient#_signOut), and
 *  only clears local storage once that call comes back (including a 401/403/
 *  404, which it treats as "already signed out server-side"). A genuine
 *  network failure is none of those — it returns early and never clears
 *  local storage, so a cashier tapping "Sign out" with no connection stays
 *  signed in. Used by AuthContext.signOut() as the offline fallback. */
export async function clearPersistedAuthSession(): Promise<void> {
  await HybridSecureStorage.removeItem(AUTH_STORAGE_KEY);
  await HybridSecureStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
}

// Supabase's JS timer-driven auto-refresh doesn't run reliably while a React
// Native app is backgrounded/screen-locked, so a session can go stale between
// screens (e.g. Order History left open while cashiers browse). Per Supabase's
// RN guidance, tie refresh scheduling to app foreground/background instead:
// https://supabase.com/docs/guides/auth/quickstarts/react-native
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// Backend error codes (see supabase/functions/_shared/errors.ts) whose raw
// message is written for logs/debugging, not for staff to read — e.g.
// "Role 'cashier' not allowed; needs one of [owner, admin, manager, kitchen]".
// Swap those for plain, user-facing copy; anything else passes through as-is.
const FRIENDLY_ERROR_BY_CODE: Record<string, string> = {
  forbidden: "You don't have permission to do this. Ask a manager if you need access.",
};

// A flaky (not fully dead) connection can otherwise leave the checkout fetch
// hanging for however long the OS/TCP stack takes to give up — tens of
// seconds to minutes — before it ever rejects, during which the cashier just
// sees a stuck spinner. Aborting after 8s turns that into a fast, clean
// failure invokeFn can classify and callers can react to (e.g. fall back to
// the offline queue) instead of leaving the checkout hung.
const DEFAULT_FN_TIMEOUT_MS = 8000;

// supabase.functions.invoke throws FunctionsFetchError specifically when the
// request never got an HTTP response back (dropped connection, DNS failure,
// or our own timeout abort above) — as opposed to FunctionsHttpError (server
// responded, just with a non-2xx status) or a plain validation Error. That
// distinction is what separates "flaky/no network — safe to retry via the
// offline queue" from "the server rejected this request — retrying won't help".
// invokeFn's wrapped Error preserves `.name` below so this still works after
// unwrapping; some call sites also re-wrap the message (e.g. "Payment
// failed: <original message>"), so this also matches on the SDK's fixed
// fetch-failure string as a fallback.
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "FunctionsFetchError"
    || error.message.includes("Failed to send a request to the Edge Function");
}

// Wraps supabase.functions.invoke and extracts the real error message from the
// response body when the edge function returns a non-2xx status, instead of
// showing the SDK's generic "Edge Function returned a non-2xx status code".
export async function invokeFn<T>(
  name: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
  opts?: { timeoutMs?: number },
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body,
    headers,
    timeout: opts?.timeoutMs ?? DEFAULT_FN_TIMEOUT_MS,
  });
  if (error) {
    let message: string = error.message ?? "Unknown error";
    try {
      const ctx = error.context;
      if (ctx?.json) {
        const parsed = await ctx.json();
        const code = parsed?.error?.code as string | undefined;
        const raw = parsed?.error?.message ?? parsed?.error;
        if (code && FRIENDLY_ERROR_BY_CODE[code]) message = FRIENDLY_ERROR_BY_CODE[code];
        else if (raw !== undefined && raw !== null) message = String(raw);
      } else if (ctx?.text) {
        message = (await ctx.text()) || message;
      }
    } catch { /* ignore parse errors */ }
    // Preserve the SDK's error classification (FunctionsFetchError vs.
    // FunctionsHttpError/FunctionsRelayError) on the rewrapped Error so
    // isNetworkError() still works for callers — a plain `new Error(message)`
    // would otherwise silently discard it.
    const wrapped = new Error(message);
    wrapped.name = error.name ?? "Error";
    return { data: null, error: wrapped };
  }
  return { data, error: null };
}
