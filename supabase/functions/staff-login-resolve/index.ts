// POST /staff-login-resolve — pre-login helpers (no auth required — anon key only).
//
//  List mode   (username omitted): returns all POS-capable staff for a workspace.
//  Resolve mode (username present): resolves a username to its auth email.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  username:     z.string().min(1).max(50).optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    // No auth by design (pre-login), but rate-limit hard: this endpoint
    // discloses staff rosters/emails and workspace_id is not itself secret.
    await rateLimit(req, { scope: "staff-login-resolve", max: 10, windowSec: 60 });
    const body = await parseBody(req, Body);
    const admin = adminClient();

    // ── List mode ──────────────────────────────────────────────────────────────
    if (!body.username) {
      const { data } = await admin
        .from("workspace_members")
        .select("role, profiles(username, full_name, is_pos_staff)")
        .eq("workspace_id", body.workspace_id);

      const staff = (data ?? [])
        .filter((m: any) => m.profiles?.is_pos_staff && m.profiles?.username)
        .map((m: any) => ({
          username:  m.profiles.username  as string,
          full_name: (m.profiles.full_name as string) ?? "",
          role:      m.role               as string,
        }));

      return json({ staff });
    }

    // ── Resolve mode ───────────────────────────────────────────────────────────
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", body.username.toLowerCase().trim())
      .maybeSingle();

    if (!profile) return json({ email: null });

    // Verify they belong to this workspace
    const { data: member } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", body.workspace_id)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!member) return json({ email: null });

    // Resolve auth email via admin API
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
    if (!authUser?.user?.email) return json({ email: null });

    return json({ email: authUser.user.email });
  } catch (err) { return handleError(err); }
});
