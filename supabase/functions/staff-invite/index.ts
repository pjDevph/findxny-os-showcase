// POST /staff-invite — invite an existing or new user by email and assign a
// workspace role. Legacy endpoint; new flows use `employees-invite`.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, Forbidden } from "../_shared/errors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  email:        z.string().email(),
  role:         z.enum(["admin", "manager", "cashier", "kitchen"]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    if (!["owner", "admin"].includes(ctx.role)) throw Forbidden();

    const admin = adminClient();

    const { data: existingId } = await admin.rpc("get_auth_user_id_by_email", { p_email: body.email });

    let targetId: string;
    let invited = false;
    if (existingId) {
      targetId = existingId;
    } else {
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(body.email);
      if (invErr || !inv?.user) throw BadRequest(invErr?.message ?? "Invite failed");
      targetId = inv.user.id;
      invited  = true;
    }

    if (targetId === ctx.userId) throw BadRequest("Cannot change your own membership via this endpoint");

    const { error: upsertErr } = await admin
      .from("workspace_members")
      .upsert(
        { workspace_id: body.workspace_id, user_id: targetId, role: body.role },
        { onConflict: "workspace_id,user_id" },
      );
    if (upsertErr) throw BadRequest(upsertErr.message);

    return json({ success: true, invited });
  } catch (err) { return handleError(err); }
});
