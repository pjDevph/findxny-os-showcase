"use client";
// Thin wrapper around the /auth-attempt edge function. Used by the login and
// signup pages to gate brute-force attempts in addition to whatever Supabase
// Auth does on its own.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

type Result = "check" | "success" | "failure";
export interface LockoutState {
  locked: boolean;
  retryAfter?: number;
  failures: number;
}

export async function authAttempt(email: string, result: Result): Promise<LockoutState> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-attempt`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, result }),
    });
    if (!res.ok) return { locked: false, failures: 0 };
    return (await res.json()) as LockoutState;
  } catch {
    return { locked: false, failures: 0 };
  }
}

export function formatLockoutMessage(state: LockoutState): string {
  const mins = Math.ceil((state.retryAfter ?? 0) / 60);
  return `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}
