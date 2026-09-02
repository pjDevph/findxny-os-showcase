// Brute-force lockout for password auth. Stored in public.auth_attempts.
// FE calls /auth-attempt before & after each sign-in attempt.
import { adminClient } from "./supabaseClient.ts";

export const MAX_FAILURES   = 5;
export const WINDOW_MINUTES = 15;
export const LOCKOUT_MINUTES = 15;

export interface LockoutState {
  locked: boolean;
  retryAfter?: number; // seconds
  failures: number;
}

export async function checkLockout(email: string, ip: string | null): Promise<LockoutState> {
  const admin = adminClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("auth_attempts")
    .select("created_at, success")
    .or(`email.eq.${email.toLowerCase()},ip.eq.${ip ?? "__none__"}`)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { locked: false, failures: 0 };

  // Failures since the most-recent success.
  let failures = 0;
  for (const row of data ?? []) {
    if (row.success) break;
    failures++;
  }
  if (failures < MAX_FAILURES) return { locked: false, failures };

  const newest = data!.find((r) => !r.success);
  const newestTime = newest ? new Date(newest.created_at).getTime() : Date.now();
  const unlockAt = newestTime + LOCKOUT_MINUTES * 60_000;
  const retryAfter = Math.max(1, Math.ceil((unlockAt - Date.now()) / 1000));
  return { locked: retryAfter > 0, retryAfter, failures };
}

export async function recordAttempt(email: string, ip: string | null, success: boolean): Promise<void> {
  const admin = adminClient();
  await admin.from("auth_attempts").insert({
    email: email.toLowerCase(),
    ip,
    success,
  });
}
