"use client";
export const dynamic = "force-dynamic";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { authAttempt, formatLockoutMessage } from "@/lib/authAttempts";

function IconUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const n = params.get("name");
    const e = params.get("email");
    if (n) setFullName(n);
    if (e) setEmail(e);
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const pre = await authAttempt(email, "check");
    if (pre.locked) {
      setLoading(false);
      return setErr(formatLockoutMessage(pre));
    }

    const { error } = await supabaseBrowser().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      const post = await authAttempt(email, "failure");
      setLoading(false);
      if (post.locked) return setErr(formatLockoutMessage(post));
      return setErr(error.message);
    }
    await authAttempt(email, "success");
    setLoading(false);
    router.replace("/login");
  }

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <div className="auth-mug">
          <IconMug />
        </div>
        <span className="auth-wordmark">Mugthemug</span>
      </div>

      <h1 className="auth-heading">CREATE ACCOUNT</h1>
      <p className="auth-sub">Join the team</p>

      <form onSubmit={onSubmit} className="auth-fields">
        <div className="field">
          <label htmlFor="su-name">Full name</label>
          <div className="input-wrap">
            <span className="input-icon"><IconUser /></span>
            <input
              id="su-name"
              className="input input-padded"
              type="text"
              required
              autoComplete="name"
              placeholder="Juan dela Cruz"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="su-email">Email</label>
          <div className="input-wrap">
            <span className="input-icon"><IconEmail /></span>
            <input
              id="su-email"
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
          <label htmlFor="su-password">Password</label>
          <div className="input-wrap">
            <span className="input-icon"><IconLock /></span>
            <input
              id="su-password"
              className="input input-padded"
              type={showPw ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
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

        {err && <div className="auth-err">{err}</div>}

        <div className="auth-cta">
          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading || !fullName.trim() || !EMAIL_RE.test(email.trim()) || password.length < 8}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </div>
      </form>

      <p className="auth-footer">
        Already have one? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
