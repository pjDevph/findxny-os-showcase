"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { adminClient } from "@/lib/admin-client";
import { landingPath, type WorkspaceRole } from "@/lib/auth-routing";

/**
 * Lands here from Supabase magic-link / invite emails.
 * Supabase puts the tokens in the URL hash (#access_token=…&refresh_token=…&type=invite),
 * so this page parses the hash, hands them to setSession(), and routes the user on.
 *
 * For type=invite or type=recovery we ask them to set a password first; for
 * regular sign-in links we go straight to ?next= or /dashboard.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackInner />
    </Suspense>
  );
}

function AuthCallbackInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "set-password" | "done">("loading");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = supabaseBrowser();

    // Three flows we need to handle:
    //  (A) PKCE flow:    ?code=xxx                — exchangeCodeForSession
    //  (B) Implicit:     #access_token=...        — setSession from hash
    //  (C) Already set:  no code, no hash, but
    //                    a valid session is in storage already (e.g. user
    //                    just refreshed or arrived via a fresh hop).
    const hash   = window.location.hash.slice(1);
    const hashParams  = new URLSearchParams(hash);
    const access      = hashParams.get("access_token");
    const refresh     = hashParams.get("refresh_token");
    const hashType    = hashParams.get("type");
    const hashErr     = hashParams.get("error_description") ?? hashParams.get("error");
    const code        = search.get("code");
    const queryType   = search.get("type"); // some flows surface type in query
    const queryErr    = search.get("error_description") ?? search.get("error");

    const errDesc = hashErr || queryErr;
    if (errDesc) {
      setError(decodeURIComponent(errDesc));
      setPhase("done");
      return;
    }

    const cleanUrl = () => history.replaceState(null, "", window.location.pathname);

    const proceed = (type: string | null) => {
      cleanUrl();
      if (type === "invite" || type === "recovery") {
        setPhase("set-password");
      } else {
        const next = search.get("next") || "/dashboard";
        router.replace(next as any);
      }
    };

    // (A) PKCE
    if (code) {
      supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
        if (error) { setError(error.message); setPhase("done"); return; }
        proceed(queryType);
      });
      return;
    }

    // (B) Implicit
    if (access && refresh) {
      supabase.auth.setSession({ access_token: access, refresh_token: refresh })
        .then(({ error }) => {
          if (error) { setError(error.message); setPhase("done"); return; }
          proceed(hashType);
        });
      return;
    }

    // (C) Already-signed-in fallback. If a session exists from earlier,
    // treat this as an invite/recovery completion (likely the code was
    // already consumed in a prior tab/refresh).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        // Default to set-password since this URL is only used for invite/recovery.
        setPhase("set-password");
      } else {
        setError("Missing auth tokens — open the invite link directly from your email.");
        setPhase("done");
      }
    });
  }, [router, search]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw1 !== pw2)    { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      // Route by role unless caller explicitly specified ?next=…
      let dest = search.get("next");
      if (!dest || dest === "/dashboard") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { memberships } = await adminClient.me();
          const roles = memberships.map((m) => m.role as WorkspaceRole);
          const role: WorkspaceRole | null =
            roles.find((r) => r === "owner") ??
            roles.find((r) => r === "admin") ??
            roles.find((r) => r === "manager") ??
            roles.find((r) => r === "kitchen") ??
            roles.find((r) => r === "cashier") ??
            null;
          dest = landingPath(role);
        } else {
          dest = "/login";
        }
      }
      router.replace(dest as any);
    } catch (e: any) {
      setError(e?.message ?? "Failed to set password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: 380, maxWidth: "100%", padding: 28, borderRadius: 12, border: "1px solid var(--line)", background: "var(--bg-1)" }}>
        {phase === "loading" && (
          <>
            <h1 style={{ marginTop: 0 }}>Signing you in…</h1>
            <p style={{ color: "var(--text-3)" }}>Verifying your invite link.</p>
          </>
        )}
        {phase === "set-password" && (
          <form onSubmit={submitPassword} style={{ display: "grid", gap: 14 }}>
            <h1 style={{ margin: "0 0 4px" }}>Set your password</h1>
            <p style={{ color: "var(--text-3)", margin: 0 }}>
              You&apos;re signed in. Pick a password to use next time.
            </p>
            <div className="admin-field">
              <label htmlFor="cb-pw1">New password</label>
              <input id="cb-pw1" className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required minLength={8} autoFocus />
            </div>
            <div className="admin-field">
              <label htmlFor="cb-pw2">Confirm password</label>
              <input id="cb-pw2" className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} />
            </div>
            {error && <div style={{ color: "var(--err)", fontSize: 13 }}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save password & continue"}
            </button>
          </form>
        )}
        {phase === "done" && error && (
          <>
            <h1 style={{ marginTop: 0 }}>We hit a snag</h1>
            <p style={{ color: "var(--err)" }}>{error}</p>
            <a href="/login" className="btn btn-primary" style={{ display: "inline-block", marginTop: 12 }}>Go to sign in</a>
          </>
        )}
      </div>
    </div>
  );
}
