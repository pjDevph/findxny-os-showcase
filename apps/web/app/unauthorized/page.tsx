import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { landingPath, type WorkspaceRole } from "@/lib/auth-routing";

export const metadata = { title: "Access restricted — Mugthemug" };

export default async function UnauthorizedPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: WorkspaceRole | null = null;
  if (user) {
    // auth-context read — documented exception, see admin-api.ts
    const { data: memberships } = await supabase
      .from("workspace_members").select("role").eq("user_id", user.id).limit(20);
    const roles = ((memberships ?? []) as Array<{ role: WorkspaceRole }>).map((m) => m.role);
    const ranked: WorkspaceRole[] = ["owner", "admin", "manager", "kitchen", "cashier"];
    role = ranked.find((r) => roles.includes(r)) ?? null;
  }

  return (
    <main style={{
      minHeight: "100dvh", display: "grid", placeItems: "center",
      padding: 24, background: "var(--bg-0, #0e0a06)", color: "var(--text-0, #f4ede2)",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 460, display: "grid", gap: 18 }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>🔒</div>
        <h1 style={{ fontSize: 28, margin: 0, letterSpacing: "0.02em" }}>Access restricted</h1>
        <p style={{ color: "var(--text-3, #9a8f7e)", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          You don&apos;t have permission to view that page. If you think this is a
          mistake, ask a workspace owner to update your role.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
          <Link href="/" className="btn btn-ghost">Go to homepage</Link>
          {role && (
            <Link href={landingPath(role) as any} className="btn btn-primary">
              Go to my dashboard
            </Link>
          )}
          {!user && (
            <Link href="/login" className="btn btn-primary">Sign in</Link>
          )}
        </div>
      </div>
    </main>
  );
}
