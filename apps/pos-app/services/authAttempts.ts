// POS-side brute-force lockout, wraps the /auth-attempt edge function.
// Mirrors apps/web/lib/authAttempts.ts.
type Result = "check" | "success" | "failure";

export interface LockoutState {
  locked: boolean;
  retryAfter?: number;
  failures: number;
}

const url     = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export async function authAttempt(email: string, result: Result): Promise<LockoutState> {
  if (!url || !anonKey) return { locked: false, failures: 0 };
  try {
    const res = await fetch(`${url}/functions/v1/auth-attempt`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
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
