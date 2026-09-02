"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { supabaseBrowser } from "@/lib/supabase/client";
import { adminClient } from "@/lib/admin-client";
import { landingPath, type WorkspaceRole } from "@/lib/auth-routing";
import { authAttempt, formatLockoutMessage } from "@/lib/authAttempts";

function IconMug() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

function IconEmail() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconEye({ hidden }: Readonly<{ hidden: boolean }>) {
  if (hidden) return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginForm() {
  const router = useRouter();
  const nextParam = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    // Server-side brute-force lockout check (5 fails / 15 min per email+ip).
    const pre = await authAttempt(email, "check");
    if (pre.locked) {
      setLoading(false);
      return setErr(formatLockoutMessage(pre));
    }

    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const post = await authAttempt(email, "failure");
      setLoading(false);
      if (post.locked) return setErr(formatLockoutMessage(post));
      return setErr(error?.message ?? "Sign-in failed");
    }
    await authAttempt(email, "success");
    let dest = nextParam;
    if (!dest) {
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
    }
    setLoading(false);
    router.replace(dest as any);
    router.refresh();
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <div className="auth-mug">
          <IconMug />
        </div>
        <span className="auth-wordmark">Mugthemug</span>
      </div>

      <h1 className="auth-heading">WELCOME BACK</h1>
      <p className="auth-sub">Sign in to your account</p>

      <form onSubmit={onSubmit} className="auth-fields">
        <div className="field">
          <label htmlFor="ln-email">Email</label>
          <div className="input-wrap">
            <span className="input-icon"><IconEmail /></span>
            <input
              id="ln-email"
              className="input input-padded"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="ln-password">Password</label>
          <div className="input-wrap">
            <span className="input-icon"><IconLock /></span>
            <input
              id="ln-password"
              className="input input-padded"
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ paddingRight: 42 }}
            />
            <button
              type="button"
              className="input-eye"
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              <IconEye hidden={showPw} />
            </button>
          </div>
        </div>

        <div className="auth-forgot">
          <Link href={"/forgot-password" as Route}>Forgot password?</Link>
        </div>

        {err && <div className="auth-err">{err}</div>}

        <div className="auth-cta">
          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading || !EMAIL_RE.test(email.trim()) || !password.trim()}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-card" style={{ color: "var(--text-3)", textAlign: "center" }}>Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
