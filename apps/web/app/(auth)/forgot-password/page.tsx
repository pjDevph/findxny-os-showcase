"use client";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo2.png" alt="Mugthemug" style={{ height: 36, width: "auto" }} />
      </div>

      <h1 className="auth-heading">RESET PASSWORD</h1>
      <p className="auth-sub">
        {sent ? "Check your inbox." : "Enter your email and we'll send a reset link."}
      </p>

      {sent ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{
            padding: "16px 18px", borderRadius: 10,
            background: "rgba(var(--tint-rgb), 0.08)", border: "1px solid rgba(var(--tint-rgb), 0.25)",
            fontSize: 14, color: "var(--text-1)", lineHeight: 1.6,
          }}>
            We sent a password reset link to <strong>{email}</strong>.
            Open the email and click the link to set a new password.
          </div>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0, textAlign: "center" }}>
            Didn&apos;t get it?{" "}
            <button
              className="btn-link"
              style={{ color: "var(--amber-bright)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
              onClick={() => setSent(false)}
            >
              Send again
            </button>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="auth-fields">
          <div className="field">
            <label htmlFor="fp-email">Email</label>
            <div className="input-wrap">
              <input
                id="fp-email"
                className="input"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {err && <div className="auth-err">{err}</div>}

          <div className="auth-cta">
            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading || !EMAIL_RE.test(email.trim())}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </div>
        </form>
      )}

      <p className="auth-footer">
        Remember it? <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
