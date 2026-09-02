// POST /me — returns the authenticated user's workspace memberships.
// Used by client components (Nav, login routing, post-auth callback) so the
// frontend never queries `workspace_members` directly.
import { adminClient, userClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, Unauthorized } from "../_shared/errors.ts";

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw Unauthorized("Missing Authorization header");
    const supabase = userClient(authHeader);
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) throw Unauthorized("Invalid session");

    const admin = adminClient();
    const { data } = await admin
      .from("workspace_members")
      .select("workspace_id, role, branch_id, workspaces(name, slug)")
      .eq("user_id", userData.user.id);

    return json({
      user_id: userData.user.id,
      memberships: (data ?? []).map((m: any) => ({
        workspace_id: m.workspace_id,
        role:         m.role,
        branch_id:    m.branch_id ?? null,
        workspace:    m.workspaces ? { name: m.workspaces.name, slug: m.workspaces.slug } : null,
      })),
    });
  } catch (err) { return handleError(err); }
});
